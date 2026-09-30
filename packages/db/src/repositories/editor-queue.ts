/**
 * The three gap queries behind the editor dashboard's landing page
 * (docs/ARCHITECTURE.md section 7): what is not written, what is not
 * recorded, and what the publish gate would refuse.
 *
 * They live here rather than in a second query layer because they are part
 * of the same report `molo content report` and the Monday cron already
 * gather: `contentReport` in `report.ts` calls all three and returns them on
 * the same object, so the number in Slack and the number on the screen come
 * from one place and cannot drift.
 *
 * Every predicate below is written to mirror the gate in
 * `@molo/core/publish-gate` exactly — the same gloss statuses, the same
 * audio tiers, the same token rules — so that
 * `packages/testkit/integrity/editor-queue.test.ts` can hold the aggregate
 * to what `publishCheck` answers row by row. Change one and change the
 * other, or that test fails, which is the point.
 *
 * Read-only. No Node built-ins, so the Worker can call it.
 */

import {
  morphGeneratorFor,
  type GateBlockerCount,
  type RecordingGaps,
  type SkillSentenceGap,
  type WritingGaps,
} from "@molo/core";
import { sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import type { MorphPort } from "./editor.ts";

/** How many named skills the landing page lists before it stops. */
export const SKILL_GAP_LIMIT = 12;

/**
 * How many nouns the plural check will ask the morphology generator about.
 * The port is a synchronous WebAssembly call per row, so the answer is
 * capped rather than left to grow with the lexicon; past this the count is
 * a floor, which the page says.
 */
export const PLURAL_PROBE_LIMIT = 4_000;

/** The statuses a row is in while an editor is still trying to move it forward. */
const PENDING = sql`('draft','ai_draft','in_review')`;

/** The statuses that make a gloss count for the gate. `ai_draft` deliberately does not. */
const HUMAN_GLOSS = sql`('draft','in_review','published')`;

/** What `isPublishableTier` means, in SQL. */
const TIER_12 = sql`('1_native_studio','2_native_forvo')`;

async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

async function row<T>(db: Db, query: ReturnType<typeof sql>): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}

const n = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// To write
// ---------------------------------------------------------------------------

interface SkillGapRow {
  skill_id: string;
  skill_slug: string;
  skill_title_key: string;
  unit_slug: string;
  unit_title_key: string;
  lessons: number;
  total: number;
}

interface GlossGapRow {
  en_only: number;
  nb_only: number;
  neither: number;
}

/**
 * The writing side of the queue. A sentence belongs to a skill through the
 * exercises of its lessons (`exercises.sentence_ids`), which is the only
 * link the schema has: there is no `skill_id` on a sentence, because a
 * sentence belongs to the language and a skill only chooses to teach it.
 */
export async function writingGaps(db: Db): Promise<WritingGaps> {
  const [skillRows, gloss, exercisesRef, sentencesRef] = await Promise.all([
    rows<SkillGapRow>(
      db,
      sql`
        select s.id as skill_id, s.slug as skill_slug, s.title_key as skill_title_key,
               u.slug as unit_slug, u.title_key as unit_title_key,
               (select count(*)::int from lessons l
                  where l.skill_id = s.id and l.status <> 'retired') as lessons,
               count(*) over ()::int as total
        from skills s
        join units u on u.id = s.unit_id
        where s.status <> 'retired' and u.status <> 'retired'
          and not exists (
            select 1 from lessons l
            join exercises e on e.lesson_id = l.id
            where l.skill_id = s.id and l.status <> 'retired' and e.status <> 'retired'
              and cardinality(e.sentence_ids) > 0)
        order by u."order", s."order"
        limit ${SKILL_GAP_LIMIT}`,
    ),
    // Over the pending rows only, so each figure links to exactly the rows
    // it counted: `/edit/content?status=pending&missingGloss=nb`. A
    // published word already has every gloss — the gate insisted — so
    // nothing an editor could act on is lost by leaving them out.
    row<GlossGapRow>(
      db,
      sql`
        select
          count(*) filter (where has_en and not has_nb)::int as en_only,
          count(*) filter (where has_nb and not has_en)::int as nb_only,
          count(*) filter (where not has_en and not has_nb)::int as neither
        from (
          select
            exists (select 1 from glosses g where g.lexeme_id = l.id
                      and g.source_lang = 'en' and g.status in ${HUMAN_GLOSS}) as has_en,
            exists (select 1 from glosses g where g.lexeme_id = l.id
                      and g.source_lang = 'nb' and g.status in ${HUMAN_GLOSS}) as has_nb
          from lexemes l
          where l.status in ${PENDING}) t`,
    ),
    // The content an exercise teaches, not the audio it plays: a missing
    // recording is the other column's work, and counting it here would say
    // the same thing twice.
    row<{ n: number }>(
      db,
      sql`
        select count(*)::int as n from exercises e
        where e.status <> 'retired'
          and (exists (select 1 from lexemes lx
                        where lx.id = any(e.lexeme_ids) and lx.status <> 'published')
            or exists (select 1 from sentences s
                        where s.id = any(e.sentence_ids) and s.status <> 'published'))`,
    ),
    // Driven by `languages.is_source`, exactly as the gate's context is.
    row<{ n: number }>(
      db,
      sql`
        select count(*)::int as n from sentences s
        where s.status in ${PENDING}
          and exists (
            select 1 from languages lang
            where lang.is_source and not exists (
              select 1 from sentence_glosses g
              where g.sentence_id = s.id and g.source_lang::text = lang.code
                and g.status in ${HUMAN_GLOSS}))`,
    ),
  ]);

  const skills: SkillSentenceGap[] = skillRows.map((r) => ({
    skillId: r.skill_id,
    skillSlug: r.skill_slug,
    skillTitleKey: r.skill_title_key,
    unitSlug: r.unit_slug,
    unitTitleKey: r.unit_title_key,
    lessons: n(r.lessons),
  }));

  return {
    skillsWithoutSentences: skills,
    skillsWithoutSentencesTotal: n(skillRows[0]?.total),
    lexemesMissingNbGloss: n(gloss?.en_only),
    lexemesMissingEnGloss: n(gloss?.nb_only),
    lexemesMissingBothGlosses: n(gloss?.neither),
    exercisesReferencingUnpublished: n(exercisesRef?.n),
    sentencesMissingTranslation: n(sentencesRef?.n),
  };
}

// ---------------------------------------------------------------------------
// To record
// ---------------------------------------------------------------------------

/**
 * "No native recording" here means what the studio queue means by it: no
 * tier-1 or tier-2 asset that has not been retired. A take waiting for
 * approval already covers the word, so re-recording it is not work — it is
 * counted separately as `takesAwaitingApproval`, which is the second figure
 * a session needs.
 */
const NO_NATIVE_AUDIO = sql`not exists (
  select 1 from audio_assets a
  where a.target_kind = 'lexeme' and a.target_id = lx.id
    and a.tier in ${TIER_12} and a.status <> 'retired')`;

export async function recordingGaps(db: Db, takesAwaitingApproval: number): Promise<RecordingGaps> {
  const [byUnit, orphan, speakers] = await Promise.all([
    rows<{ unit_slug: string; unit_title_key: string; missing: number }>(
      db,
      sql`
        select u.slug as unit_slug, u.title_key as unit_title_key,
               count(distinct lx.id)::int as missing
        from units u
        join skills s on s.unit_id = u.id
        join lessons l on l.skill_id = s.id
        join exercises e on e.lesson_id = l.id
        join lexemes lx on lx.id = any(e.lexeme_ids)
        where u.status <> 'retired' and e.status <> 'retired' and lx.status <> 'retired'
          and ${NO_NATIVE_AUDIO}
        group by u.slug, u.title_key, u."order"
        having count(distinct lx.id) > 0
        order by count(distinct lx.id) desc, u."order"`,
    ),
    row<{ n: number }>(
      db,
      sql`
        select count(*)::int as n from lexemes lx
        where lx.status <> 'retired' and ${NO_NATIVE_AUDIO}
          and not exists (
            select 1 from exercises e
            where e.status <> 'retired' and lx.id = any(e.lexeme_ids))`,
    ),
    row<{ total: number; with_consent: number }>(
      db,
      sql`
        select count(*)::int as total,
               count(*) filter (where consent_recorded_at is not null
                                  and consent_scope is not null)::int as with_consent
        from speakers`,
    ),
  ]);

  return {
    byUnit: byUnit.map((r) => ({
      unitSlug: r.unit_slug,
      unitTitleKey: r.unit_title_key,
      missing: n(r.missing),
    })),
    notInAnyUnit: n(orphan?.n),
    takesAwaitingApproval,
    speakersWithConsent: n(speakers?.with_consent),
    speakersTotal: n(speakers?.total),
  };
}

// ---------------------------------------------------------------------------
// Blocked from publishing
// ---------------------------------------------------------------------------

interface LexemeGateRow {
  considered: number;
  pos_missing: number;
  noun_class_missing: number;
  audio_missing: number;
  licence_missing: number;
  source_missing: number;
}

interface SentenceGateRow {
  considered: number;
  audio_missing: number;
  licence_missing: number;
  source_missing: number;
  lexeme_not_published: number;
}

interface PluralCandidate {
  lemma: string;
  target_lang: string;
  noun_class: string;
}

export interface GateBlockers {
  readonly counts: readonly GateBlockerCount[];
  readonly considered: { readonly lexemes: number; readonly sentences: number };
}

/**
 * Every gate refusal the pending content would earn, counted by reason.
 *
 * `four_eyes` and `approver_not_editorial` are never counted: they are
 * facts about who is approving, not about the row, and an editor cannot
 * clear them by editing anything.
 *
 * `plural_not_generable` is the one verdict SQL cannot reach, because it is
 * the morphology generator's answer. The candidate rows are selected in SQL
 * — a noun, in a class, with no `plural_of` link either way — and each is
 * then put to the same `MorphPort` the publish gate uses. With no port the
 * default is the repository's `noMorph`, which answers "cannot generate"
 * for everything, exactly as `transitionEntity` would with the same port.
 */
export async function gateBlockers(db: Db, morph: MorphPort): Promise<GateBlockers> {
  const [lex, sent, lexGloss, sentGloss, unverified, candidates] = await Promise.all([
    row<LexemeGateRow>(
      db,
      sql`
        select
          count(*)::int as considered,
          count(*) filter (where coalesce(l.pos, '') = '')::int as pos_missing,
          count(*) filter (where l.pos = 'noun' and l.noun_class_id is null)::int
            as noun_class_missing,
          count(*) filter (where not exists (
            select 1 from audio_assets a
            where a.target_kind = 'lexeme' and a.target_id = l.id
              and a.status = 'published' and a.tier in ${TIER_12}))::int as audio_missing,
          count(*) filter (where coalesce(l.licence, '') = '')::int as licence_missing,
          count(*) filter (where coalesce(l.source, '') = '')::int as source_missing
        from lexemes l where l.status in ${PENDING}`,
    ),
    row<SentenceGateRow>(
      db,
      sql`
        select
          count(*)::int as considered,
          count(*) filter (where not exists (
            select 1 from audio_assets a
            where a.target_kind = 'sentence' and a.target_id = s.id
              and a.status = 'published' and a.tier in ${TIER_12}))::int as audio_missing,
          count(*) filter (where coalesce(s.licence, '') = '')::int as licence_missing,
          count(*) filter (where coalesce(s.source, '') = '')::int as source_missing,
          count(*) filter (where exists (
            select 1 from sentence_lexemes t
            join lexemes lx on lx.id = t.lexeme_id
            where t.sentence_id = s.id and lx.status <> 'published'))::int
            as lexeme_not_published
        from sentences s where s.status in ${PENDING}`,
    ),
    rows<{ k: string; n: number }>(
      db,
      sql`
        select lang.code as k, count(*)::int as n
        from lexemes l cross join languages lang
        where l.status in ${PENDING} and lang.is_source
          and not exists (
            select 1 from glosses g
            where g.lexeme_id = l.id and g.source_lang::text = lang.code
              and g.status in ${HUMAN_GLOSS})
        group by lang.code order by lang.code`,
    ),
    rows<{ k: string; n: number }>(
      db,
      sql`
        select lang.code as k, count(*)::int as n
        from sentences s cross join languages lang
        where s.status in ${PENDING} and lang.is_source
          and not exists (
            select 1 from sentence_glosses g
            where g.sentence_id = s.id and g.source_lang::text = lang.code
              and g.status in ${HUMAN_GLOSS})
        group by lang.code order by lang.code`,
    ),
    // A token clears only when the generator reproduced it, or an editor
    // marked it irregular *and said why*. Grouped by language so a language
    // with no generator can be reported as such instead of as a bad form.
    rows<{ k: string; n: number }>(
      db,
      sql`
        select s.target_lang as k, count(*)::int as n
        from sentences s
        where s.status in ${PENDING}
          and exists (
            select 1 from sentence_lexemes t
            where t.sentence_id = s.id and t.morph_verified = false
              and not (t.irregular and coalesce(btrim(t.irregular_note), '') <> ''))
        group by s.target_lang`,
    ),
    rows<PluralCandidate>(
      db,
      sql`
        select l.lemma, l.target_lang, nc.label as noun_class
        from lexemes l join noun_classes nc on nc.id = l.noun_class_id
        where l.status in ${PENDING} and l.pos = 'noun'
          and not exists (
            select 1 from lexeme_links k
            where k.kind = 'plural_of' and (k.from_id = l.id or k.to_id = l.id))
        limit ${PLURAL_PROBE_LIMIT}`,
    ),
  ]);

  let pluralNotGenerable = 0;
  let lexemeNoGenerator = 0;
  // One answer per distinct lemma-and-class: the generator is a pure
  // function of the pair, so asking twice cannot say anything new.
  const asked = new Map<string, boolean>();
  for (const c of candidates) {
    if (morphGeneratorFor(c.target_lang) === null) {
      lexemeNoGenerator += 1;
      continue;
    }
    const key = `${c.target_lang} ${c.lemma} ${c.noun_class}`;
    let can = asked.get(key);
    if (can === undefined) {
      can = await morph.canGeneratePlural(c.target_lang, c.lemma, c.noun_class);
      asked.set(key, can);
    }
    if (!can) pluralNotGenerable += 1;
  }

  let sentenceUnverified = 0;
  let sentenceNoGenerator = 0;
  for (const r of unverified) {
    sentenceUnverified += n(r.n);
    if (morphGeneratorFor(r.k) === null) sentenceNoGenerator += n(r.n);
  }

  const counts: GateBlockerCount[] = [];
  const push = (
    kind: "lexeme" | "sentence",
    code: GateBlockerCount["code"],
    detail: string | null,
    value: number,
  ) => {
    if (value > 0) counts.push({ kind, code, detail, rows: value });
  };

  push("lexeme", "pos_missing", null, n(lex?.pos_missing));
  push("lexeme", "noun_class_missing", null, n(lex?.noun_class_missing));
  push("lexeme", "plural_not_generable", null, pluralNotGenerable);
  push("lexeme", "no_morphology_generator", null, lexemeNoGenerator);
  for (const g of lexGloss) push("lexeme", "gloss_missing", g.k, n(g.n));
  push("lexeme", "audio_missing", null, n(lex?.audio_missing));
  push("lexeme", "licence_missing", null, n(lex?.licence_missing));
  push("lexeme", "source_missing", null, n(lex?.source_missing));

  for (const g of sentGloss) push("sentence", "gloss_missing", g.k, n(g.n));
  push("sentence", "audio_missing", null, n(sent?.audio_missing));
  push("sentence", "licence_missing", null, n(sent?.licence_missing));
  push("sentence", "source_missing", null, n(sent?.source_missing));
  push("sentence", "lexeme_not_published", null, n(sent?.lexeme_not_published));
  push("sentence", "surface_form_unverified", null, sentenceUnverified);
  push("sentence", "no_morphology_generator", null, sentenceNoGenerator);

  return {
    counts,
    considered: { lexemes: n(lex?.considered), sentences: n(sent?.considered) },
  };
}
