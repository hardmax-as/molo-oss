/**
 * Writing a curation plan.
 *
 * `@molo/content` decides what the course should contain; this is the only
 * place that puts it in the database, and it does so through `editorRepo`,
 * so every row carries a `created_by`, a `content_revisions` entry and the
 * status the repository chooses. There is no path here that writes
 * `published` — `editorRepo` will not take a status argument at all.
 *
 * **Idempotency is the contract.** Every write is guarded by a lookup on the
 * natural key the table already has a unique index for: unit slug, skill
 * slug within a unit, lesson order within a skill, exercise order within a
 * lesson, sentence text plus source. A second run inserts nothing, and a run
 * interrupted halfway is finished by running it again.
 *
 * **Nothing an editor has touched is refreshed.** If a row is already there,
 * it is left exactly as it was found — including its glosses and its tokens.
 * The seed makes the same promise for the same reason.
 */

import type { Actor, CefrBand, ExerciseType, SkillKind } from "@molo/core";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import * as schema from "../schema/index.ts";
import { editorRepo, type SentenceToken } from "./editor.ts";

// ---------------------------------------------------------------------------
// reading the lexicon the planner needs
// ---------------------------------------------------------------------------

export interface CurationLexemeRow {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClassLabel: string | null;
  readonly infinitive: string | null;
  readonly frequencyRank: number | null;
  readonly cefrBand: string | null;
  readonly glosses: readonly string[];
}

/**
 * Every lexeme of a language with its English glosses, which is what both
 * the frequency pass and the curation planner take as input. Status is not
 * filtered: curation works on `draft` rows, that being the entire point.
 */
export async function curationLexicon(
  db: Db,
  targetLang = "xh",
  options: { readonly excludeRetired?: boolean } = {},
): Promise<readonly CurationLexemeRow[]> {
  const rows = await db
    .select({
      id: schema.lexemes.id,
      lemma: schema.lexemes.lemma,
      pos: schema.lexemes.pos,
      nounClassLabel: schema.nounClasses.label,
      infinitive: schema.lexemes.infinitive,
      frequencyRank: schema.lexemes.frequencyRank,
      cefrBand: schema.lexemes.cefrBand,
    })
    .from(schema.lexemes)
    .leftJoin(schema.nounClasses, eq(schema.nounClasses.id, schema.lexemes.nounClassId))
    .where(
      and(
        eq(schema.lexemes.targetLang, targetLang),
        // Linking a word to a withdrawn lexeme would bring it back by the side door.
        options.excludeRetired ? ne(schema.lexemes.status, "retired") : undefined,
      ),
    )
    .orderBy(schema.lexemes.lemma);

  const glossRows = await db
    .select({
      lexemeId: schema.glosses.lexemeId,
      gloss: schema.glosses.gloss,
    })
    .from(schema.glosses)
    .innerJoin(schema.lexemes, eq(schema.lexemes.id, schema.glosses.lexemeId))
    .where(and(eq(schema.glosses.sourceLang, "en"), eq(schema.lexemes.targetLang, targetLang)));

  const byLexeme = new Map<string, string[]>();
  for (const g of glossRows) {
    const list = byLexeme.get(g.lexemeId) ?? [];
    list.push(g.gloss);
    byLexeme.set(g.lexemeId, list);
  }
  return rows.map((r) => ({ ...r, glosses: byLexeme.get(r.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// frequency ranks
// ---------------------------------------------------------------------------

export interface FrequencyRankWrite {
  readonly lexemeId: string;
  readonly rank: number;
}

export interface FrequencyRankResult {
  readonly updated: number;
  readonly unchanged: number;
  readonly cleared: number;
}

/**
 * Sets `frequency_rank` on the ranked lexemes and clears it on every other
 * lexeme of the language, so the column always means "the current blend"
 * rather than a sediment of old runs.
 *
 * A row already carrying the rank it should carry is left alone, which is
 * what makes a second run free and keeps `updated_at` and the revision log
 * honest about when a rank actually changed.
 */
export async function applyFrequencyRanks(
  db: Db,
  actor: Actor,
  ranks: readonly FrequencyRankWrite[],
  targetLang = "xh",
): Promise<FrequencyRankResult> {
  const repo = editorRepo(db, actor);
  const current = await db
    .select({ id: schema.lexemes.id, rank: schema.lexemes.frequencyRank })
    .from(schema.lexemes)
    .where(eq(schema.lexemes.targetLang, targetLang));
  const currentById = new Map(current.map((r) => [r.id, r.rank]));

  let updated = 0;
  let unchanged = 0;
  const wanted = new Set<string>();
  for (const r of ranks) {
    wanted.add(r.lexemeId);
    if (currentById.get(r.lexemeId) === r.rank) {
      unchanged++;
      continue;
    }
    await repo.updateLexeme(r.lexemeId, { frequencyRank: r.rank });
    updated++;
  }

  const stale = current.filter((r) => r.rank !== null && !wanted.has(r.id)).map((r) => r.id);
  for (const id of stale) await repo.updateLexeme(id, { frequencyRank: null });
  return { updated, unchanged, cleared: stale.length };
}

// ---------------------------------------------------------------------------
// the curriculum
// ---------------------------------------------------------------------------

/** What the writer needs per sentence; the ids are resolved by the caller. */
export interface CurationSentenceWrite {
  readonly key: string;
  readonly textXh: string;
  readonly translationEn: string;
  readonly source: string;
  readonly sourceRef: string;
  readonly licence: string;
  readonly cefrBand: CefrBand | null;
  readonly grammarTags: Record<string, unknown>;
  readonly tokens: readonly SentenceToken[];
}

export type CurationExerciseWrite = {
  readonly type: ExerciseType;
  /** Built by the caller; `sentenceKey` placeholders are already resolved. */
  readonly payload: unknown;
  readonly note: string;
};

export interface CurationLessonWrite {
  readonly order: number;
  readonly estimatedMinutes: number;
  readonly exercises: readonly CurationExerciseWrite[];
}

export interface CurationSkillWrite {
  readonly slug: string;
  readonly order: number;
  readonly kind: SkillKind;
  readonly titleKey: string;
  readonly lessons: readonly CurationLessonWrite[];
  /** Lexemes this skill teaches; their CEFR band is set from the unit's. */
  readonly lexemeIds: readonly string[];
}

export interface CurationUnitWrite {
  readonly slug: string;
  readonly order: number;
  readonly cefrBand: CefrBand;
  readonly titleKey: string;
  readonly prerequisiteSlug: string | null;
  readonly skills: readonly CurationSkillWrite[];
}

export interface CurationWrite {
  readonly courseId?: string | undefined;
  readonly units: readonly CurationUnitWrite[];
  readonly sentences: readonly CurationSentenceWrite[];
}

export interface CurationResult {
  readonly created: {
    units: number;
    skills: number;
    lessons: number;
    exercises: number;
    sentences: number;
    sentenceGlosses: number;
  };
  readonly reused: {
    units: number;
    skills: number;
    lessons: number;
    exercises: number;
    sentences: number;
  };
  readonly bandsSet: number;
  readonly prerequisitesSet: number;
  /** Exercises whose payload the schema refused, with the reason. Never silent. */
  readonly refused: readonly { readonly where: string; readonly reason: string }[];
}

/**
 * A planned payload cannot know the uuid of a sentence that does not exist
 * yet, so it names the sentence by its corpus id as `@sentence:<key>`. This
 * swaps those for the real uuids once the rows are written. A payload that
 * names no sentence passes through untouched, and a key with no row makes
 * the exercise fail its schema check loudly rather than reference nothing.
 */
export const SENTENCE_REF_PREFIX = "@sentence:";

export function resolveSentenceRefs(value: unknown, idByKey: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    if (!value.startsWith(SENTENCE_REF_PREFIX)) return value;
    return idByKey.get(value.slice(SENTENCE_REF_PREFIX.length)) ?? value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveSentenceRefs(v, idByKey));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveSentenceRefs(v, idByKey);
    return out;
  }
  return value;
}

export async function applyCuration(
  db: Db,
  actor: Actor,
  plan: CurationWrite,
): Promise<CurationResult> {
  const repo = editorRepo(db, actor);
  const created = {
    units: 0,
    skills: 0,
    lessons: 0,
    exercises: 0,
    sentences: 0,
    sentenceGlosses: 0,
  };
  const reused = { units: 0, skills: 0, lessons: 0, exercises: 0, sentences: 0 };
  const refused: { where: string; reason: string }[] = [];
  let bandsSet = 0;
  let prerequisitesSet = 0;

  // ---- sentences first: the exercises reference them --------------------
  const sentenceIdByKey = new Map<string, string>();
  for (const s of plan.sentences) {
    const [existing] = await db
      .select({ id: schema.sentences.id })
      .from(schema.sentences)
      .where(
        and(
          eq(schema.sentences.targetLang, "xh"),
          eq(schema.sentences.textXh, s.textXh.trim()),
          eq(schema.sentences.source, s.source),
        ),
      )
      .limit(1);
    if (existing) {
      // Left exactly as an editor left it: no gloss rewrite, no re-tokenising.
      sentenceIdByKey.set(s.key, existing.id);
      reused.sentences++;
      continue;
    }
    const id = await repo.createSentence(
      {
        targetLang: "xh",
        textXh: s.textXh,
        register: "standard",
        cefrBand: s.cefrBand,
        grammarTags: s.grammarTags,
        source: s.source,
        sourceRef: s.sourceRef,
        licence: s.licence,
        origin: "human",
      },
      s.tokens,
    );
    created.sentences++;
    sentenceIdByKey.set(s.key, id);
    // The corpus's own free translation, verbatim. The Norwegian gloss is
    // deliberately absent: nobody has written one, and inventing one here
    // would put unreviewed Norwegian in front of a learner the day the
    // sentence is approved.
    await repo.upsertSentenceGloss(id, {
      sourceLang: "en",
      gloss: s.translationEn,
      origin: "human",
    });
    created.sentenceGlosses++;
  }

  // ---- units, skills, lessons, exercises --------------------------------
  const unitIdBySlug = new Map<string, string>();
  for (const u of plan.units) {
    const [existingUnit] = await db
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(eq(schema.units.slug, u.slug))
      .limit(1);
    let unitId: string;
    if (existingUnit) {
      unitId = existingUnit.id;
      reused.units++;
    } else {
      unitId = await repo.createUnit({
        ...(plan.courseId !== undefined ? { courseId: plan.courseId } : {}),
        slug: u.slug,
        titleKey: u.titleKey,
        order: u.order,
        cefrBand: u.cefrBand,
      });
      created.units++;
    }
    unitIdBySlug.set(u.slug, unitId);

    for (const sk of u.skills) {
      const [existingSkill] = await db
        .select({ id: schema.skills.id })
        .from(schema.skills)
        .where(and(eq(schema.skills.unitId, unitId), eq(schema.skills.slug, sk.slug)))
        .limit(1);
      let skillId: string;
      if (existingSkill) {
        skillId = existingSkill.id;
        reused.skills++;
      } else {
        skillId = await repo.createSkill({
          unitId,
          slug: sk.slug,
          titleKey: sk.titleKey,
          order: sk.order,
          kind: sk.kind,
        });
        created.skills++;
      }

      // The CEFR band is the one curriculum fact that belongs on a lexeme:
      // it says how hard the word is, not which course teaches it. Only ever
      // filled in when it is empty, so an editor's judgement stands.
      if (sk.lexemeIds.length > 0) {
        const blank = await db
          .select({ id: schema.lexemes.id })
          .from(schema.lexemes)
          .where(
            and(inArray(schema.lexemes.id, [...sk.lexemeIds]), isNull(schema.lexemes.cefrBand)),
          );
        for (const row of blank) {
          await repo.updateLexeme(row.id, { cefrBand: u.cefrBand });
          bandsSet++;
        }
      }

      for (const ls of sk.lessons) {
        const [existingLesson] = await db
          .select({ id: schema.lessons.id })
          .from(schema.lessons)
          .where(and(eq(schema.lessons.skillId, skillId), eq(schema.lessons.order, ls.order)))
          .limit(1);
        let lessonId: string;
        if (existingLesson) {
          lessonId = existingLesson.id;
          reused.lessons++;
        } else {
          lessonId = await repo.createLesson({
            skillId,
            order: ls.order,
            estimatedMinutes: ls.estimatedMinutes,
          });
          created.lessons++;
        }

        const taken = await db
          .select({ order: schema.exercises.order })
          .from(schema.exercises)
          .where(eq(schema.exercises.lessonId, lessonId));
        const takenOrders = new Set(taken.map((t) => t.order));
        let order = 0;
        for (const ex of ls.exercises) {
          order++;
          if (takenOrders.has(order)) {
            reused.exercises++;
            continue;
          }
          try {
            await repo.createExercise({
              lessonId,
              order,
              type: ex.type,
              payload: resolveSentenceRefs(ex.payload, sentenceIdByKey),
              note: ex.note,
            });
            created.exercises++;
          } catch (e) {
            refused.push({
              where: `${u.slug}/${sk.slug}/lesson ${ls.order}/exercise ${order} (${ex.type})`,
              reason: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    }
  }

  // ---- the prerequisite chain, once every unit exists --------------------
  for (const u of plan.units) {
    const id = unitIdBySlug.get(u.slug);
    if (!id) continue;
    const wanted = u.prerequisiteSlug ? (unitIdBySlug.get(u.prerequisiteSlug) ?? null) : null;
    const [row] = await db
      .select({ prerequisiteUnitId: schema.units.prerequisiteUnitId })
      .from(schema.units)
      .where(eq(schema.units.id, id))
      .limit(1);
    if (!row || row.prerequisiteUnitId === wanted) continue;
    await repo.updateUnit(id, { prerequisiteUnitId: wanted });
    prerequisitesSet++;
  }

  return { created, reused, bandsSet, prerequisitesSet, refused };
}

/** Sentences already in the database from a given source, by their `source_ref`. */
export async function sentenceRefsFromSource(db: Db, source: string): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ sourceRef: schema.sentences.sourceRef })
    .from(schema.sentences)
    .where(eq(schema.sentences.source, source));
  return new Set(rows.map((r) => r.sourceRef).filter((r): r is string => r !== null));
}

/** Noun class labels a tutor has signed off. `concord_fill` is generated for these only. */
export async function validatedNounClasses(db: Db): Promise<readonly string[]> {
  const rows = await db
    .select({ label: schema.nounClasses.label })
    .from(schema.nounClasses)
    .where(sql`${schema.nounClasses.validated}`);
  return rows.map((r) => r.label);
}

// ---------------------------------------------------------------------------
// glosses a language is missing
// ---------------------------------------------------------------------------

export interface MissingGlossRow {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClassLabel: string | null;
  readonly infinitive: string | null;
  readonly register: string;
  /** The human English gloss to translate from, or null if there is none. */
  readonly sourceGlossEn: string | null;
  readonly sourceNoteEn: string | null;
  /** True when a gloss exists in the target language but a model wrote it. */
  readonly hasAiDraft: boolean;
  /** That machine draft's text, so a second source can be compared against it. */
  readonly aiDraftGloss: string | null;
}

/**
 * Lexemes from `lexemeIds` that no human has glossed in `lang`.
 *
 * "No human" is the point: a row an editor wrote is never a candidate for a
 * machine draft, and one a model wrote already is reported so a caller can
 * decide whether to redraft it. The English gloss comes back with each row
 * because it is the source text a translation is made from, and a word with
 * no human English gloss is not a candidate either — there would be nothing
 * to translate but another draft.
 */
/**
 * Every lexeme a unit's exercises use (or every unit's, without a slug). The
 * curriculum plan and the unit's exercises can differ: a reconciled unit
 * keeps words the plan never chose, and those block its publish just the same.
 */
export async function unitExerciseLexemeIds(db: Db, unitSlug?: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    select distinct unnest(e.lexeme_ids) as id
    from ${schema.exercises} e
    join ${schema.lessons} l on l.id = e.lesson_id
    join ${schema.skills} s on s.id = l.skill_id
    join ${schema.units} u on u.id = s.unit_id
    where e.status <> 'retired' ${unitSlug ? sql`and u.slug = ${unitSlug}` : sql``}
  `);
  return [...rows].map((r) => r.id);
}

export async function lexemesMissingGloss(
  db: Db,
  lang: string,
  lexemeIds: readonly string[],
): Promise<readonly MissingGlossRow[]> {
  if (lexemeIds.length === 0) return [];
  const rows = await db
    .select({
      id: schema.lexemes.id,
      lemma: schema.lexemes.lemma,
      pos: schema.lexemes.pos,
      nounClassLabel: schema.nounClasses.label,
      infinitive: schema.lexemes.infinitive,
      register: schema.lexemes.register,
    })
    .from(schema.lexemes)
    .leftJoin(schema.nounClasses, eq(schema.nounClasses.id, schema.lexemes.nounClassId))
    .where(inArray(schema.lexemes.id, [...lexemeIds]))
    .orderBy(schema.lexemes.lemma);

  const glossRows = await db
    .select({
      lexemeId: schema.glosses.lexemeId,
      sourceLang: schema.glosses.sourceLang,
      status: schema.glosses.status,
      gloss: schema.glosses.gloss,
      usageNote: schema.glosses.usageNote,
    })
    .from(schema.glosses)
    .where(inArray(schema.glosses.lexemeId, [...lexemeIds]));

  const byLexeme = new Map<string, typeof glossRows>();
  for (const g of glossRows) {
    const list = byLexeme.get(g.lexemeId) ?? [];
    list.push(g);
    byLexeme.set(g.lexemeId, list);
  }

  const out: MissingGlossRow[] = [];
  for (const r of rows) {
    const mine = byLexeme.get(r.id) ?? [];
    const target = mine.filter((g) => g.sourceLang === lang);
    if (target.some((g) => g.status !== "ai_draft")) continue;
    const en = mine.find((g) => g.sourceLang === "en" && g.status !== "ai_draft");
    if (!en) continue;
    out.push({
      ...r,
      sourceGlossEn: en.gloss,
      sourceNoteEn: en.usageNote,
      hasAiDraft: target.length > 0,
      aiDraftGloss: target[0]?.gloss ?? null,
    });
  }
  return out;
}
