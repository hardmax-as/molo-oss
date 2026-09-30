/**
 * `molo content rank` and `molo content curate`.
 *
 * Two commands rather than one, because they answer different questions and
 * an editor will want to re-run them at different times:
 *
 *   - **rank** is a fact about the *language*: how often is this word said?
 *     It reads the two corpora and writes `lexemes.frequency_rank`.
 *   - **curate** is a proposal about the *course*: which skill teaches this
 *     word, and which corpus sentences can that skill carry? It reads
 *     `curriculum/spine.json`, `curriculum/themes.json` and the ranks, and
 *     writes draft units, skills, lessons, exercises and sentences.
 *
 * Both are dry runs without `--live`, both take `--json`, and both are
 * idempotent: the second run reports what the first one already did and
 * changes nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Command, Options } from "@effect/cli";
import {
  loadCurriculum,
  matchForm,
  matchToken,
  buildLexiconIndex,
  nchltFrequency,
  planCuration,
  rankLexemes,
  spokenXhosaGu,
  validateSpine,
  type CurationPlan,
  type CorpusSentence,
} from "@molo/content";
import { clickIdsForSet, type CefrBand, type ExerciseType } from "@molo/core";
import {
  actorForRef,
  applyCuration,
  applyFrequencyRanks,
  coursesRepo,
  curationLexicon,
  validatedNounClasses,
  type CurationLexemeRow,
  type CurationUnitWrite,
  type CurationSentenceWrite,
} from "@molo/db";
import { Effect } from "effect";

import { fail, gate, kv, out, table, withDb } from "../context.ts";
import { molo } from "../root.ts";
import { repoRoot } from "../services/repo-paths.ts";

export const CORPUS_XML = ["corpora", "spoken-isixhosa-gu", "xhosa.xml"];
const FREQ_LEX = ["corpora", "nchlt-text", "xh", "3.Lexica", "FREQ.LEX.NCHLT.xh.txt"];

export function corpusPath(parts: readonly string[]): string {
  return join(repoRoot(), ...parts);
}

const asActor = Options.text("as").pipe(
  Options.withDefault("dev_editor"),
  Options.withDescription("User id acting as editor; every row is attributed to them"),
);

// ---------------------------------------------------------------------------
// molo content rank
// ---------------------------------------------------------------------------

const rank = Command.make("rank", { as: asActor }, ({ as }) =>
  Effect.gen(function* () {
    const g = yield* molo;
    const xmlPath = corpusPath(CORPUS_XML);
    const freqPath = corpusPath(FREQ_LEX);
    for (const [p, what] of [
      [xmlPath, "the Gothenburg spoken corpus"],
      [freqPath, "the NCHLT frequency list"],
    ] as const) {
      if (!existsSync(p)) return yield* fail(`${what} is missing at ${p}; run corpora/fetch.sh`);
    }

    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const lexicon = yield* Effect.promise(() => curationLexicon(db));
        const index = buildLexiconIndex(lexicon);

        // Spoken evidence: token by token, with the corpus's own analysis.
        const corpus = spokenXhosaGu.parseCorpus(readFileSync(xmlPath, "utf8"));
        const spoken = new Map<string, number>();
        let spokenTokens = 0;
        for (const s of corpus) {
          for (const t of s.tokens) {
            if (t.normalized === "" || t.pos === "PUNC") continue;
            spokenTokens++;
            for (const id of matchToken(index, t)) spoken.set(id, (spoken.get(id) ?? 0) + 1);
          }
        }

        // Written evidence: exact surface forms only, because that is all the
        // list carries.
        const list = nchltFrequency.parseFrequencyList(readFileSync(freqPath, "utf8"));
        const written = new Map<string, number>();
        for (const [form, n] of list.counts) {
          for (const id of matchForm(index, form)) written.set(id, (written.get(id) ?? 0) + n);
        }

        const ranked = rankLexemes(
          lexicon.map((l) => ({
            id: l.id,
            lemma: l.lemma,
            spoken: spoken.get(l.id) ?? 0,
            written: written.get(l.id) ?? 0,
          })),
          { spokenTokens, writtenTokens: list.total },
        );

        const summary = {
          lexemes: lexicon.length,
          ranked: ranked.length,
          unranked: lexicon.length - ranked.length,
          spoken_attested: spoken.size,
          written_attested: written.size,
          spoken_tokens: spokenTokens,
          written_tokens: list.total,
          unparsed_frequency_lines: list.unparsed,
        };
        const top = ranked.slice(0, 20).map((r) => ({
          rank: r.rank,
          lemma: r.lemma,
          spoken: r.spoken,
          written: r.written,
          score: r.score.toFixed(2),
        }));

        yield* out(g, { summary, top }, () => {
          console.log("frequency blend: 9 x ln(1 + spoken/M) + 1 x ln(1 + written/M)");
          kv(summary);
          console.log("\ntop 20:");
          table(top);
        });

        const apply = yield* gate(
          g,
          `set frequency_rank on ${ranked.length} lexemes and clear it on ${summary.unranked}`,
        );
        if (!apply) return;
        const actor = yield* Effect.promise(() => actorForRef(db, as));
        if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
        if (!actor.roles.some((r) => r === "editor" || r === "admin"))
          return yield* fail(`user ${as} has no editorial role`);
        const result = yield* Effect.promise(() =>
          applyFrequencyRanks(
            db,
            actor,
            ranked.map((r) => ({ lexemeId: r.id, rank: r.rank })),
          ),
        );
        yield* out(g, result, () => kv({ ...result }));
      }),
    );
  }),
).pipe(
  Command.withDescription(
    "Blend the spoken and written corpora into lexemes.frequency_rank (--live writes)",
  ),
);

// ---------------------------------------------------------------------------
// molo content curate
// ---------------------------------------------------------------------------

const curate = Command.make(
  "curate",
  {
    as: asActor,
    maxUnknown: Options.integer("max-unknown").pipe(
      Options.withDefault(1),
      Options.withDescription("Content words a sentence may use that the skill has not taught"),
    ),
    sentences: Options.integer("sentences").pipe(
      Options.withDefault(6),
      Options.withDescription("Sentences to look for per skill"),
    ),
    gapsOnly: Options.boolean("gaps").pipe(
      Options.withDescription("Print only the skills that fell short of their target"),
    ),
    unlock: Options.integer("unlock").pipe(
      Options.withDefault(25),
      Options.withDescription(
        "How many of the words that would unlock leftover corpus sentences to list",
      ),
    ),
  },
  ({ as, maxUnknown, sentences, gapsOnly, unlock }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const xmlPath = corpusPath(CORPUS_XML);
      if (!existsSync(xmlPath))
        return yield* fail(`the Gothenburg spoken corpus is missing at ${xmlPath}`);

      const { spine, themes, dir } = loadCurriculum();
      const problems = validateSpine(spine, themes);
      if (problems.length > 0)
        return yield* fail(`${dir} is inconsistent:\n  - ${problems.join("\n  - ")}`);

      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const lexicon = yield* Effect.promise(() => curationLexicon(db));
          const validated = yield* Effect.promise(() => validatedNounClasses(db));
          const corpus = spokenXhosaGu.parseCorpus(readFileSync(xmlPath, "utf8"));

          const plan = planCuration(spine, themes, lexicon as CurationLexemeRow[], corpus, {
            maxUnknown,
            sentencesPerSkill: sentences,
            validatedNounClasses: validated,
          });

          yield* out(g, { plan: summarise(plan), validatedNounClasses: validated }, () =>
            render(plan, validated, gapsOnly, unlock),
          );

          // The plan is computed from the spine and the corpora without asking
          // the database, so a dry run cannot know how much of it is already
          // there. Say so, the way the lexeme ingest above does, rather than
          // claiming a re-run would write everything again.
          const apply = yield* gate(
            g,
            `write up to ${plan.units.length} units, ${plan.skills.length} skills, ` +
              `${plan.totals.lessons} lessons, ${plan.totals.exercises} exercises and ` +
              `${plan.totals.sentences} sentences as draft ` +
              `(rows that already exist are left alone; the live run reports which)`,
          );
          if (!apply) return;

          const actor = yield* Effect.promise(() => actorForRef(db, as));
          if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
          if (!actor.roles.some((r) => r === "editor" || r === "admin"))
            return yield* fail(`user ${as} has no editorial role`);
          const course = yield* Effect.promise(() => coursesRepo(db).defaultCourse());
          if (!course) return yield* fail("no default course; run migrations first");

          const write = toWrite(plan, corpus);
          const result = yield* Effect.promise(() =>
            applyCuration(db, actor, { courseId: course.id, ...write }),
          );
          yield* out(g, result, () => {
            console.log("\nwritten as draft:");
            kv({ ...result.created });
            console.log("already there, left alone:");
            kv({ ...result.reused });
            kv({ cefr_bands_set: result.bandsSet, prerequisites_set: result.prerequisitesSet });
            if (result.refused.length > 0) {
              console.log("\nrefused by the payload schema:");
              table(result.refused.map((r) => ({ where: r.where, reason: r.reason.slice(0, 90) })));
            }
          });
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Fill curriculum/spine.json with words, sentences and exercises as draft (--live writes)",
  ),
);

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function summarise(plan: CurationPlan) {
  return {
    totals: plan.totals,
    sentencesConsidered: plan.sentencesConsidered,
    sentenceRejects: plan.sentenceRejects,
    sentencesUnplaced: plan.sentencesUnplaced,
    notGenerated: plan.notGenerated,
    units: plan.units,
    skills: plan.skills.map((s) => ({
      unit: s.unitSlug,
      skill: s.skillSlug,
      theme: s.theme,
      words: s.words.map((w) => ({
        lemma: w.lemma,
        pos: w.pos,
        gloss: w.gloss,
        rank: w.frequencyRank,
        why: `${w.why.rule}:${w.why.matched}`,
      })),
      wordGap: s.wordGap,
      sentences: s.sentences.map((x) => ({
        xh: x.textXh,
        en: x.translation,
        ref: x.sourceRef,
        unknown: x.unknownWords,
      })),
      sentenceGap: s.sentenceGap,
      exercises: s.exerciseCounts,
    })),
  };
}

function render(
  plan: CurationPlan,
  validated: readonly string[],
  gapsOnly: boolean,
  unlock: number,
): void {
  console.log("curation plan (nothing here is published; every row waits for an editor)\n");
  const rows = plan.skills
    .filter((s) => !gapsOnly || s.wordGap > 0 || s.sentenceGap > 0)
    .map((s) => ({
      unit: s.unitSlug,
      skill: s.skillSlug,
      words: `${s.words.length}/${s.targetNewWords}`,
      word_gap: s.wordGap === 0 ? "" : `-${s.wordGap}`,
      sentences: `${s.sentences.length}/${s.sentenceTarget}`,
      sentence_gap: s.sentenceGap === 0 ? "" : `-${s.sentenceGap}`,
      lessons: s.lessons.length,
      exercises: Object.values(s.exerciseCounts).reduce((a, b) => a + b, 0),
    }));
  table(rows);

  console.log("\ntotals");
  kv({
    words_assigned: `${plan.totals.words} of ${plan.totals.targetWords} targeted`,
    sentences: plan.totals.sentences,
    lessons: plan.totals.lessons,
    exercises: plan.totals.exercises,
    lexemes_with_no_theme: plan.totals.lexemesWithNoTheme,
    lexemes_with_no_frequency_rank: plan.totals.lexemesWithNoRank,
  });

  console.log("\nsentences: why the corpus was thrown away");
  table(
    Object.entries(plan.sentenceRejects)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count })),
  );
  kv({
    considered: plan.sentencesConsidered,
    survived_the_filter: plan.sentencesConsidered - total(plan.sentenceRejects),
    used_by_a_skill: plan.totals.sentences,
    survived_but_unplaced: plan.sentencesUnplaced,
    unplaced_but_one_word_short: plan.sentencesOneWordShort,
  });

  // The curation loop asks which sentences fit the words. This asks which
  // words would fit the sentences, which is the question an editor planning a
  // tutor session actually has.
  if (plan.unlock.length > 0) {
    console.log(
      `\nwords that would unlock the leftovers (top ${Math.min(unlock, plan.unlock.length)})`,
    );
    table(
      plan.unlock.slice(0, unlock).map((u) => ({
        form: u.form,
        in_lexicon: u.lexemeId ? (u.lemma ?? "yes") : "",
        gloss: u.gloss ?? "",
        rank: u.frequencyRank ?? "",
        unlocks_alone: u.blocks,
        appears_in: u.appearsIn,
      })),
    );
    const haveIt = plan.unlock.filter((u) => u.lexemeId !== null && u.blocks > 0).length;
    kv({
      distinct_missing_words: plan.unlock.length,
      already_in_the_lexicon: plan.unlock.filter((u) => u.lexemeId !== null).length,
      unlock_a_sentence_on_their_own: plan.unlock.filter((u) => u.blocks > 0).length,
      of_those_already_ours: haveIt,
    });
  }

  console.log("\nnot generated, and why");
  table(plan.notGenerated.map((n) => ({ type: n.type, reason: n.reason })));
  kv({ tutor_validated_noun_classes: validated.length === 0 ? "(none)" : validated.join(", ") });
}

const total = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// plan -> write
// ---------------------------------------------------------------------------

/**
 * Turns the plan into rows. The only thing this does that the planner could
 * not is resolve a sentence's corpus id to the row it will become, which is
 * why exercise payloads are built here.
 */
function toWrite(
  plan: CurationPlan,
  corpus: readonly CorpusSentence[],
): { units: readonly CurationUnitWrite[]; sentences: readonly CurationSentenceWrite[] } {
  const bySkill = new Map(plan.skills.map((s) => [`${s.unitSlug}/${s.skillSlug}`, s]));
  const bandOf = new Map(plan.units.map((u) => [u.slug, u.cefrBand as CefrBand]));
  const corpusById = new Map(corpus.map((s) => [s.id, s]));

  const sentences: CurationSentenceWrite[] = [];
  for (const skill of plan.skills) {
    for (const s of skill.sentences) {
      const src = corpusById.get(s.corpusId);
      sentences.push({
        key: s.corpusId,
        textXh: s.textXh,
        translationEn: s.translation,
        source: spokenXhosaGu.SOURCE,
        sourceRef: s.sourceRef,
        licence: spokenXhosaGu.LICENCE,
        cefrBand: bandOf.get(skill.unitSlug) ?? null,
        grammarTags: {
          corpus: "spoken-isixhosa-gu",
          citation: spokenXhosaGu.CITATION,
          recording: src?.file ?? null,
          speaker: src?.speaker ?? null,
          register: "spontaneous-conversation",
          unknownWords: s.unknownWords,
        },
        // Surface forms are the corpus's own normalised tokens. Nothing is
        // morph-verified: xh-morph generates no verb forms and no class is
        // validated, so the sentence cannot pass its publish gate until an
        // editor marks each token, which is the correct outcome.
        tokens: s.tokens.map((t) => ({
          position: t.position,
          lexemeId: t.lexemeId,
          surfaceForm: t.surfaceForm,
          morphVerified: false,
        })),
      });
    }
  }

  const units: CurationUnitWrite[] = plan.units.map((u) => ({
    slug: u.slug,
    order: u.order,
    cefrBand: u.cefrBand as CefrBand,
    titleKey: u.titleKey,
    prerequisiteSlug: u.prerequisiteSlug,
    skills: u.skills.map((sk) => {
      const detail = bySkill.get(`${u.slug}/${sk.slug}`);
      return {
        slug: sk.slug,
        order: sk.order,
        kind: sk.kind as CurationUnitWrite["skills"][number]["kind"],
        titleKey: sk.titleKey,
        lexemeIds: detail?.words.map((w) => w.lexemeId) ?? [],
        lessons: (detail?.lessons ?? []).map((ls) => ({
          order: ls.order,
          estimatedMinutes: 5,
          exercises: ls.exercises.map((ex) => buildPayload(ex, u.slug, sk.slug)),
        })),
      };
    }),
  }));

  return { units, sentences };
}

type PlannedExercise = CurationPlan["skills"][number]["lessons"][number]["exercises"][number];

const NOTE =
  "Generated by `molo content curate` from curriculum/spine.json. Draft: an editor chooses the words, the wording and whether this exercise is worth keeping.";

function buildPayload(
  ex: PlannedExercise,
  unitSlug: string,
  skillSlug: string,
): { type: ExerciseType; payload: unknown; note: string } {
  const note = `${NOTE} (${unitSlug}/${skillSlug})`;
  switch (ex.type) {
    case "match_pairs":
      return {
        type: "match_pairs",
        note,
        payload: {
          type: "match_pairs",
          pairs: ex.lexemeIds.map((lexemeId) => ({ lexemeId })),
        },
      };
    case "listen_select":
      return {
        type: "listen_select",
        note: `${note} Cannot publish until the prompt word has tier-1 or tier-2 audio.`,
        payload: {
          type: "listen_select",
          prompt: { lexemeId: ex.promptLexemeId },
          options: ex.optionLexemeIds.map((lexemeId) => ({
            lexemeId,
            correct: lexemeId === ex.promptLexemeId,
          })),
        },
      };
    case "class_sort":
      return {
        type: "class_sort",
        note,
        payload: {
          type: "class_sort",
          buckets: ex.buckets,
          items: ex.lexemeIds.map((lexemeId) => ({ lexemeId })),
        },
      };
    case "translate_tap":
      return {
        type: "translate_tap",
        note,
        payload: {
          type: "translate_tap",
          sentenceId: `@sentence:${ex.corpusId}`,
          distractorLexemeIds: ex.distractorLexemeIds,
        },
      };
    case "translate_type":
      return {
        type: "translate_type",
        note,
        payload: { type: "translate_type", sentenceId: `@sentence:${ex.corpusId}` },
      };
    case "click_identify":
      return {
        type: "click_identify",
        note: `${note} Cannot publish until every click in set ${ex.set} has a published tier-1 studio recording.`,
        payload: { type: "click_identify", set: ex.set, clicks: clickIdsForSet(ex.set) },
      };
  }
}

export const curationCommands = [rank, curate] as const;
