/**
 * The curation planner: everything `molo content curate` would do, computed
 * without touching a database.
 *
 * It is one pure function so that the dry run and the live run are provably
 * the same decision, and so the whole thing can be tested on a handful of
 * fixture rows instead of a corpus.
 *
 * What it never does, and cannot:
 *
 *   - **Invent isiXhosa.** Every isiXhosa string in the plan is a lemma from
 *     the lexicon or a token from the corpus, verbatim, carrying the source,
 *     source_ref and licence it came with.
 *   - **Publish.** The plan has no status field to set: the writer inserts
 *     `draft` and only `draft`.
 *   - **Ask a model anything.** Word choice is `curriculum/themes.json` and
 *     the frequency rank; sentence choice is a filter an editor can read.
 */

import { optionLabelKey } from "@molo/core";

import {
  sentenceText,
  sourceRefFor,
  teachableSentences,
  words as sentenceWords,
  type CorpusSentence,
  type CorpusToken,
  type RejectReason,
} from "./adapters/spoken-xhosa-gu.ts";
import { spineOrder, type Spine, type SpineSkill, type SpineUnit } from "./curriculum/spine.ts";
import type { ThemeMap } from "./curriculum/spine.ts";
import { assignTheme, type ThemeMatch } from "./curriculum/themes.ts";
import { buildLexiconIndex, fold, matchToken, type MatchableLexeme } from "./lexicon-match.ts";

export interface CurationLexeme extends MatchableLexeme {
  readonly frequencyRank: number | null;
  readonly cefrBand: string | null;
}

export interface ChosenWord {
  readonly lexemeId: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClassLabel: string | null;
  readonly gloss: string;
  readonly frequencyRank: number | null;
  /** Which line of themes.json put it here, so a report can justify it. */
  readonly why: ThemeMatch;
}

export interface ChosenSentence {
  readonly corpusId: string;
  readonly textXh: string;
  readonly translation: string;
  readonly sourceRef: string;
  /** Word count, for the report. */
  readonly length: number;
  /** Content words in the sentence that this skill has not taught. At most `maxUnknown`. */
  readonly unknownWords: readonly string[];
  /** position -> lexeme, for `sentence_lexemes`. Surface forms are the corpus's. */
  readonly tokens: readonly {
    readonly position: number;
    readonly lexemeId: string;
    readonly surfaceForm: string;
  }[];
}

export type PlannedExercise =
  | { readonly type: "match_pairs"; readonly lexemeIds: readonly string[] }
  | {
      readonly type: "listen_select";
      readonly promptLexemeId: string;
      readonly optionLexemeIds: readonly string[];
    }
  | {
      readonly type: "class_sort";
      readonly buckets: readonly string[];
      readonly lexemeIds: readonly string[];
    }
  | {
      readonly type: "translate_tap";
      readonly corpusId: string;
      readonly distractorLexemeIds: readonly string[];
    }
  | { readonly type: "translate_type"; readonly corpusId: string }
  /** A bare-click set (`CLICK_IDENTIFY_SETS`); no word, no isiXhosa, only letters. */
  | { readonly type: "click_identify"; readonly set: "A" | "B" | "C" | "D" | "E" };

export interface PlannedLesson {
  readonly order: number;
  readonly exercises: readonly PlannedExercise[];
}

export interface SkillPlan {
  readonly unitSlug: string;
  readonly skillSlug: string;
  readonly theme: string;
  readonly words: readonly ChosenWord[];
  readonly targetNewWords: number;
  /** How many words short of the target this skill's theme could supply. */
  readonly wordGap: number;
  readonly sentences: readonly ChosenSentence[];
  readonly sentenceTarget: number;
  readonly sentenceGap: number;
  readonly lessons: readonly PlannedLesson[];
  readonly exerciseCounts: Readonly<Record<string, number>>;
}

export interface UnitPlan {
  readonly slug: string;
  readonly order: number;
  readonly cefrBand: string;
  readonly titleKey: string;
  readonly prerequisiteSlug: string | null;
  readonly skills: readonly {
    readonly slug: string;
    readonly order: number;
    readonly kind: string;
    readonly titleKey: string;
  }[];
}

/**
 * A word that stands between the course and a corpus sentence it could
 * otherwise teach.
 *
 * The curation loop asks "which sentences fit the words this skill teaches".
 * This asks the question the other way round, because that is the one an
 * editor planning a tutor session actually has: **which words would pay for
 * themselves.** A word that is the single thing missing from thirty
 * otherwise-usable sentences is worth an hour of a speaker's time; a word
 * that unblocks one is not.
 *
 * `inLexicon` is the good case: we already hold the row, and adding it to a
 * skill costs nothing but a line in `curriculum/themes.json`. `lexemeId` is
 * null when the corpus wants a word the lexicon does not have at all, which
 * is a different and more expensive decision.
 */
export interface UnlockCandidate {
  /** The corpus token, normalised, exactly as the corpus wrote it. */
  readonly form: string;
  readonly lexemeId: string | null;
  readonly lemma: string | null;
  readonly gloss: string | null;
  readonly frequencyRank: number | null;
  /** Sentences where this is the ONLY content word the course has not taught. */
  readonly blocks: number;
  /** Sentences where it is one of several missing words. */
  readonly appearsIn: number;
}

export interface CurationPlan {
  readonly units: readonly UnitPlan[];
  readonly skills: readonly SkillPlan[];
  readonly totals: {
    readonly words: number;
    readonly targetWords: number;
    readonly sentences: number;
    readonly exercises: number;
    readonly lessons: number;
    readonly lexemesWithNoTheme: number;
    readonly lexemesWithNoRank: number;
  };
  /** Why corpus sentences were thrown away, by reason. */
  readonly sentenceRejects: Readonly<Record<RejectReason, number>>;
  readonly sentencesConsidered: number;
  /** Sentences that survived the filter but no skill could use. */
  readonly sentencesUnplaced: number;
  /**
   * Of the unplaced sentences, how many are held up by exactly one word the
   * course does not teach. These are the cheapest to recover.
   */
  readonly sentencesOneWordShort: number;
  /** Words ranked by how many unplaced sentences they would unlock. */
  readonly unlock: readonly UnlockCandidate[];
  /** Exercise types deliberately not generated, and why. */
  readonly notGenerated: readonly { readonly type: string; readonly reason: string }[];
}

export interface CurateOptions {
  /** Content words a sentence may use that the skill has not taught. */
  readonly maxUnknown?: number;
  readonly sentencesPerSkill?: number;
  readonly exercisesPerLesson?: number;
  /**
   * Noun class labels a tutor has validated. `concord_fill` is generated for
   * these and no others; today the set is empty and that is the honest answer
   * (crates/xh-morph/rules/noun_classes.toml, every class `validated = false`).
   */
  readonly validatedNounClasses?: readonly string[];
}

/**
 * Open-class parts of speech. A token is a *content* word if the corpus tags
 * it as one of these, or if the corpus gave it a `sense` at all — the corpus
 * leaves `pos` off about two thirds of its tokens, and a sense is its own
 * statement that the token carries lexical meaning. Everything else
 * (conjunctions, demonstratives, concords, punctuation) is grammar and is
 * taught by the skill's grammar point, not by its word list.
 */
const OPEN_CLASS = new Set(["N", "V", "ADJ", "ADV", "NUM", "IDEO"]);

function isContentToken(t: CorpusToken): boolean {
  return OPEN_CLASS.has(t.pos ?? "") || t.sense !== null;
}

/** Senses the corpus attached to each lexeme, best evidence for the theme matcher. */
export function corpusSensesByLexeme(
  lexemes: readonly MatchableLexeme[],
  corpus: readonly CorpusSentence[],
): ReadonlyMap<string, readonly string[]> {
  const index = buildLexiconIndex(lexemes);
  const out = new Map<string, Set<string>>();
  for (const s of corpus) {
    for (const t of s.tokens) {
      if (t.sense === null) continue;
      for (const id of matchToken(index, t)) {
        const set = out.get(id) ?? new Set<string>();
        set.add(t.sense);
        out.set(id, set);
      }
    }
  }
  const frozen = new Map<string, readonly string[]>();
  for (const [id, set] of out) frozen.set(id, [...set].sort());
  return frozen;
}

const byRankThenLemma = (a: ChosenWord, b: ChosenWord): number =>
  (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER) ||
  a.lemma.localeCompare(b.lemma, "en");

export function planCuration(
  spine: Spine,
  themes: ThemeMap,
  lexemes: readonly CurationLexeme[],
  corpus: readonly CorpusSentence[],
  opts: CurateOptions = {},
): CurationPlan {
  const maxUnknown = opts.maxUnknown ?? 1;
  const sentencesPerSkill = opts.sentencesPerSkill ?? 6;
  const exercisesPerLesson = opts.exercisesPerLesson ?? 6;
  const validatedClasses = new Set(opts.validatedNounClasses ?? []);

  const positions = spineOrder(spine);
  const themeOrder = positions.map((p) => p.skill.theme);
  const senses = corpusSensesByLexeme(lexemes, corpus);
  const index = buildLexiconIndex(lexemes);

  // ---- 1. every word to at most one theme --------------------------------
  const byTheme = new Map<string, ChosenWord[]>();
  let noTheme = 0;
  let noRank = 0;
  for (const l of lexemes) {
    if (l.frequencyRank === null) noRank++;
    const match = assignTheme(
      {
        id: l.id,
        lemma: l.lemma,
        pos: l.pos,
        glosses: l.glosses,
        corpusSenses: senses.get(l.id) ?? [],
      },
      themes,
      themeOrder,
    );
    if (!match) {
      noTheme++;
      continue;
    }
    const list = byTheme.get(match.theme) ?? [];
    list.push({
      lexemeId: l.id,
      lemma: l.lemma,
      pos: l.pos,
      nounClassLabel: l.nounClassLabel,
      gloss: l.glosses[0] ?? "",
      frequencyRank: l.frequencyRank,
      why: match,
    });
    byTheme.set(match.theme, list);
  }
  for (const list of byTheme.values()) list.sort(byRankThenLemma);

  // ---- 2. the teachable sentence pool ------------------------------------
  const filtered = teachableSentences(corpus);
  const usedSentences = new Set<string>();

  // ---- 3. skill by skill, in teaching order ------------------------------
  const taught = new Set<string>();
  const takenWords = new Set<string>();
  const skills: SkillPlan[] = [];

  for (const { unit, skill } of positions) {
    const pool = byTheme.get(skill.theme) ?? [];
    const chosen = pool.filter((w) => !takenWords.has(w.lexemeId)).slice(0, skill.targetNewWords);
    for (const w of chosen) {
      takenWords.add(w.lexemeId);
      taught.add(w.lexemeId);
    }

    const sentences: ChosenSentence[] = [];
    for (const s of filtered.accepted) {
      if (sentences.length >= sentencesPerSkill) break;
      if (usedSentences.has(s.id)) continue;
      const evaluated = evaluateSentence(s, index, taught, maxUnknown);
      if (!evaluated) continue;
      usedSentences.add(s.id);
      sentences.push(evaluated);
    }

    const exercises = buildExercises(chosen, sentences, validatedClasses);
    const lessons: PlannedLesson[] = [];
    // A pronunciation skill opens on the sounds themselves: the bare-click
    // sets get a lesson of their own, first, before any word is taught. A
    // lesson of their own rather than the front of the word lesson, so a unit
    // written before the sets existed reaches the same shape by gaining one
    // lesson in front (`molo content reconcile-unit-1`), not by renumbering
    // every exercise the writer's slot-by-slot idempotency keys on.
    const identify: PlannedExercise[] = (skill.clickIdentifySets ?? []).map((set) => ({
      type: "click_identify",
      set,
    }));
    if (identify.length > 0) lessons.push({ order: 1, exercises: identify });
    for (let i = 0; i < exercises.length; i += exercisesPerLesson) {
      lessons.push({
        order: lessons.length + 1,
        exercises: exercises.slice(i, i + exercisesPerLesson),
      });
    }
    const counts: Record<string, number> = {};
    for (const e of [...identify, ...exercises]) counts[e.type] = (counts[e.type] ?? 0) + 1;

    skills.push({
      unitSlug: unit.slug,
      skillSlug: skill.slug,
      theme: skill.theme,
      words: chosen,
      targetNewWords: skill.targetNewWords,
      wordGap: Math.max(0, skill.targetNewWords - chosen.length),
      sentences,
      sentenceTarget: sentencesPerSkill,
      sentenceGap: Math.max(0, sentencesPerSkill - sentences.length),
      lessons,
      exerciseCounts: counts,
    });
  }

  const units: UnitPlan[] = [];
  const ordered = [...spine.units].sort((a, b) => a.order - b.order);
  ordered.forEach((u: SpineUnit, i: number) => {
    units.push({
      slug: u.slug,
      order: u.order,
      cefrBand: u.cefrBand,
      titleKey: u.titleKey,
      prerequisiteSlug: i === 0 ? null : (ordered[i - 1]?.slug ?? null),
      skills: [...u.skills]
        .sort((a: SpineSkill, b: SpineSkill) => a.order - b.order)
        .map((s: SpineSkill) => ({
          slug: s.slug,
          order: s.order,
          kind: s.kind,
          titleKey: s.titleKey,
        })),
    });
  });

  const totalExercises = skills.reduce(
    (n, s) => n + s.lessons.reduce((m, l) => m + l.exercises.length, 0),
    0,
  );

  // ---- 4. what the leftovers are waiting for ------------------------------
  //
  // `taught` now holds the whole course vocabulary, so a sentence nobody took
  // can be asked a sharper question than "did it fit somewhere": which content
  // words does the course not teach at all? Those are the words that would pay
  // for themselves in a curation session.
  const unlock = new Map<string, { blocks: number; appearsIn: number; ids: readonly string[] }>();
  let oneWordShort = 0;
  for (const s of filtered.accepted) {
    if (usedSentences.has(s.id)) continue;
    const missing = new Map<string, readonly string[]>();
    let carries = false;
    for (const t of sentenceWords(s)) {
      const ids = matchToken(index, t);
      if (ids.some((id) => taught.has(id))) {
        carries = true;
        continue;
      }
      // Group on the folded form: the corpus writes `Xa` at the start of a
      // sentence and `xa` inside one, and counting those as two different
      // missing words halves the evidence for both.
      if (isContentToken(t)) missing.set(fold(t.normalized), ids);
    }
    // A sentence of nothing but grammar words teaches no vocabulary, with or
    // without the missing word, so it is not evidence for adding one.
    if (!carries) continue;
    if (missing.size === 1) oneWordShort++;
    for (const [form, ids] of missing) {
      const entry = unlock.get(form) ?? { blocks: 0, appearsIn: 0, ids };
      entry.appearsIn++;
      if (missing.size === 1) entry.blocks++;
      unlock.set(form, entry);
    }
  }
  const byId = new Map(lexemes.map((l) => [l.id, l]));
  const unlockRanked: UnlockCandidate[] = [...unlock.entries()]
    .map(([form, e]) => {
      const l = e.ids.map((id) => byId.get(id)).find((x) => x !== undefined) ?? null;
      return {
        form,
        lexemeId: l?.id ?? null,
        lemma: l?.lemma ?? null,
        gloss: l?.glosses[0] ?? null,
        frequencyRank: l?.frequencyRank ?? null,
        blocks: e.blocks,
        appearsIn: e.appearsIn,
      };
    })
    .sort(
      (a, b) => b.blocks - a.blocks || b.appearsIn - a.appearsIn || a.form.localeCompare(b.form),
    );

  return {
    units,
    skills,
    totals: {
      words: skills.reduce((n, s) => n + s.words.length, 0),
      targetWords: skills.reduce((n, s) => n + s.targetNewWords, 0),
      sentences: skills.reduce((n, s) => n + s.sentences.length, 0),
      exercises: totalExercises,
      lessons: skills.reduce((n, s) => n + s.lessons.length, 0),
      lexemesWithNoTheme: noTheme,
      lexemesWithNoRank: noRank,
    },
    sentenceRejects: filtered.rejected,
    sentencesConsidered: filtered.considered,
    sentencesUnplaced: filtered.accepted.length - usedSentences.size,
    sentencesOneWordShort: oneWordShort,
    unlock: unlockRanked,
    notGenerated: [
      {
        type: "concord_fill",
        reason:
          validatedClasses.size === 0
            ? "no noun class is tutor-validated, so xh-morph output may not be shown to a learner (crates/xh-morph/rules/noun_classes.toml)"
            : `only classes ${[...validatedClasses].join(", ")} are validated and no sentence in the plan uses one`,
      },
      {
        type: "click_drill",
        reason: "minimal-pair sets need tier-1 audio from one speaker; nothing is recorded yet",
      },
      {
        type: "speak",
        reason: "the payload requires a reference recording (referenceAudioAssetId)",
      },
      {
        type: "select_listen",
        reason: "the options are recordings; there is nothing to choose between",
      },
      {
        type: "culture_card",
        reason: "the body is editor-written prose; an agent writing it would be inventing content",
      },
    ],
  };
}

/**
 * Does this skill's vocabulary carry this sentence? Every content word must
 * be one the learner has met, bar `maxUnknown` of them.
 */
function evaluateSentence(
  s: CorpusSentence,
  index: ReturnType<typeof buildLexiconIndex>,
  taught: ReadonlySet<string>,
  maxUnknown: number,
): ChosenSentence | null {
  const w = sentenceWords(s);
  const unknown: string[] = [];
  const tokens: { position: number; lexemeId: string; surfaceForm: string }[] = [];
  w.forEach((t, position) => {
    const ids = matchToken(index, t);
    const known = ids.find((id) => taught.has(id));
    if (known) {
      tokens.push({ position, lexemeId: known, surfaceForm: t.normalized });
      return;
    }
    if (isContentToken(t)) unknown.push(t.normalized);
  });
  if (unknown.length > maxUnknown) return null;
  // A sentence made entirely of grammar words teaches no vocabulary.
  if (tokens.length === 0) return null;
  return {
    corpusId: s.id,
    textXh: sentenceText(s),
    translation: s.translation ?? "",
    sourceRef: sourceRefFor(s),
    length: w.length,
    unknownWords: unknown,
    tokens,
  };
}

/**
 * Exercises that need neither a recording nor an invented word.
 *
 * The line drawn here is mechanical rather than a matter of taste: a payload
 * is generated when it can be filled in completely without an audio asset id,
 * and skipped when it cannot. `listen_select` names only lexemes, so it is
 * generated as a draft and the publish gate — not this function — is what
 * stops it reaching a learner before the words are recorded. `select_listen`,
 * `speak` and `click_drill` cannot be written down at all without an asset,
 * so they are not written down.
 */
function buildExercises(
  words: readonly ChosenWord[],
  sentences: readonly ChosenSentence[],
  _validatedClasses: ReadonlySet<string>,
): readonly PlannedExercise[] {
  const out: PlannedExercise[] = [];

  // match_pairs: the whole word list, in groups the payload allows (2 to 6).
  // A word that reads like one already in a group (same lemma or gloss) goes
  // to a later group, so no grid shows two identical tiles (audit M02).
  const groups: ChosenWord[][] = [];
  for (const w of words) {
    const group = groups.find((g) => g.length < 6 && !g.some((o) => tilesCollide(o, w)));
    if (group) group.push(w);
    else groups.push([w]);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    out.push({ type: "match_pairs", lexemeIds: group.map((w) => w.lexemeId) });
  }

  // listen_select: three options, distractors from the same skill and, for
  // nouns, preferring a different class — class is the pedagogical target.
  // A distractor never reads like the answer or another distractor.
  for (const w of words.slice(0, 4)) {
    const distractors: ChosenWord[] = [];
    const ranked = words
      .filter((o) => o.lexemeId !== w.lexemeId)
      .sort((a, b) => score(b, w) - score(a, w) || a.lemma.localeCompare(b.lemma, "en"));
    for (const o of ranked) {
      if (distractors.length === 2) break;
      if ([w, ...distractors].some((taken) => tilesCollide(taken, o))) continue;
      distractors.push(o);
    }
    if (distractors.length < 1) continue;
    out.push({
      type: "listen_select",
      promptLexemeId: w.lexemeId,
      optionLexemeIds: [w.lexemeId, ...distractors.map((d) => d.lexemeId)],
    });
  }

  // class_sort: only when there is a real contrast to sort into.
  const nouns = words.filter((w) => w.pos === "noun" && w.nounClassLabel !== null);
  const buckets = [...new Set(nouns.map((n) => n.nounClassLabel as string))].sort();
  if (buckets.length >= 2 && nouns.length >= 4) {
    out.push({
      type: "class_sort",
      buckets,
      lexemeIds: nouns.slice(0, 8).map((n) => n.lexemeId),
    });
  }

  // One tap and one type per sentence; tiles come from sentence_lexemes, and
  // the distractors are words from this skill that are not in the sentence.
  for (const s of sentences) {
    const distractors = tapDistractors(
      words.map((w) => w.lexemeId),
      s.tokens.map((t) => t.lexemeId),
    );
    out.push({ type: "translate_tap", corpusId: s.corpusId, distractorLexemeIds: distractors });
    out.push({ type: "translate_type", corpusId: s.corpusId });
  }
  return out;
}

/**
 * The distractor tiles for a translate_tap: words the skill teaches that are
 * not in the sentence, in the skill's own order, at most `max`. Shared by
 * `molo content curate` (corpus sentences) and `molo content
 * sentence-requests` (a tutor's sentences), so both build the same exercise.
 */
export function tapDistractors(
  skillWordIds: readonly string[],
  sentenceLexemeIds: Iterable<string>,
  max = 4,
): string[] {
  const inSentence = new Set(sentenceLexemeIds);
  return [...new Set(skillWordIds)].filter((id) => !inSentence.has(id)).slice(0, max);
}

/** Two words that would read the same on a tile: the same lemma, or the same (non-empty) gloss. */
function tilesCollide(a: ChosenWord, b: ChosenWord): boolean {
  const same = (x: string, y: string) => {
    const k = optionLabelKey(x);
    return k !== "" && k === optionLabelKey(y);
  };
  return same(a.lemma, b.lemma) || same(a.gloss, b.gloss);
}

/** How good a distractor one word is for another: same pos, then a different class. */
function score(candidate: ChosenWord, target: ChosenWord): number {
  let n = 0;
  if (candidate.pos === target.pos) n += 2;
  if (
    candidate.nounClassLabel !== null &&
    target.nounClassLabel !== null &&
    candidate.nounClassLabel !== target.nounClassLabel
  )
    n += 1;
  return n;
}
