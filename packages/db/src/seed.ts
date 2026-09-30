#!/usr/bin/env bun
/**
 * Seeds a database with reference data, Phase 0's lexicon as `draft`, and
 * Unit 1 as `draft`. No *content* is ever written `published`; nothing here
 * can. The one exception is the isiXhosa course row, which is reference
 * data: its status says the course is offered, not that any isiXhosa was
 * approved, and every unit, lexeme and recording inside it still runs its
 * own gate (docs/ARCHITECTURE.md section 2.6).
 *
 *   bun run db:seed              # local (localhost) database, applies
 *   bun run db:seed -- --live    # required for any non-local host
 *   bun run db:seed -- --dry-run # print the plan only
 *
 * Sources:
 *   crates/xh-morph/rules/noun_classes.toml   noun classes (the generator's table)
 *   spike/lexicon.draft.jsonl                 isixhosa.click lexicon, CC-BY-SA-4.0 (optional)
 *   spike/unit1.exercises.json                Unit 1 static exercises (optional)
 *
 * The two spike files are not in the open-source snapshot. Without them the
 * seed writes reference data only; load the lexicon as `draft` with
 * `bun run molo content ingest isixhosa-click --live` instead.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  XHOSA_COURSE_SLUG,
  decodePayloadForType,
  referencedIds,
  type ExerciseType,
} from "@molo/core";
import { and, eq, sql } from "drizzle-orm";
import { Either } from "effect";

import { createDb, databaseUrlFromEnv, type Db } from "./client.ts";
import { existingLexemeIds, loadLexicon, type NormalisedLexeme } from "./ingest/load-lexicon.ts";
import * as schema from "./schema/index.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const LEXICON = `${ROOT}spike/lexicon.draft.jsonl`;
const UNIT1 = `${ROOT}spike/unit1.exercises.json`;
const RULES = `${ROOT}crates/xh-morph/rules/noun_classes.toml`;

// ---- input shapes (as written by the Phase 0 scripts) ----------------------

interface RuleClass {
  label: string;
  description: string;
  prefix: string;
  plural?: string;
  singular?: string;
  subject_concord: string;
  object_concord: string;
  possessive_concord: string;
  validated: boolean;
  notes?: string;
}

interface SpikeRef {
  lemma: string;
  pos: string;
  noun_class: string | null;
}
interface SpikeGloss {
  en: string;
  nb: string;
}
interface SpikeSentence {
  xh: string;
  en: string;
  source: string;
  status: string;
  example_id?: number;
  needs?: string;
}
interface SpikeExercise {
  id: string;
  type: string;
  status: string;
  lexemes: string[];
  payload: Record<string, unknown>;
}
export interface SpikeUnit {
  unit: { slug: string; title_key: string; order: number; cefr_band: "A1" | "A2" | "B1" };
  skills: {
    slug: string;
    kind: "vocab" | "grammar" | "pronunciation" | "culture";
    order: number;
    lessons: { order: number; estimated_minutes: number; exercises: SpikeExercise[] }[];
  }[];
}

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const dryRun = args.has("--dry-run");

async function seedLanguages(db: Db) {
  await db
    .insert(schema.languages)
    .values([
      { code: "xh", name: "isiXhosa", isSource: false, isTarget: true },
      { code: "en", name: "English", isSource: true, isTarget: false },
      { code: "nb", name: "Norsk bokmål", isSource: true, isTarget: false },
    ])
    .onConflictDoNothing();
}

/**
 * The isiXhosa course, so a database that was created before migration
 * `0012_multi_course` (or truncated below it) still has one to hang units
 * from. `ON CONFLICT DO NOTHING` without a target, because either the slug
 * or the single-default index may be the one that already holds.
 */
async function seedCourses(db: Db): Promise<void> {
  await db
    .insert(schema.courses)
    .values({
      slug: XHOSA_COURSE_SLUG,
      targetLang: "xh",
      titleKey: "courses.xhosa.title",
      order: 1,
      isDefault: true,
      status: "published",
    })
    .onConflictDoNothing();
}

async function seedNounClasses(db: Db): Promise<Map<string, string>> {
  const rules = (await import(RULES)) as { default: { class: RuleClass[] } };
  const classes = rules.default.class;
  const ids = new Map<string, string>();
  for (const c of classes) {
    const [row] = await db
      .insert(schema.nounClasses)
      .values({
        label: c.label,
        prefix: c.prefix,
        subjectConcord: c.subject_concord,
        objectConcord: c.object_concord,
        possessiveConcord: c.possessive_concord,
        validated: c.validated,
        notes: `${c.description}${c.notes ? " " + c.notes : ""}`,
      })
      .onConflictDoUpdate({
        target: schema.nounClasses.label,
        set: {
          prefix: c.prefix,
          subjectConcord: c.subject_concord,
          objectConcord: c.object_concord,
          possessiveConcord: c.possessive_concord,
          validated: c.validated,
        },
      })
      .returning({ id: schema.nounClasses.id });
    if (row) ids.set(c.label, row.id);
  }
  for (const c of classes) {
    if (c.singular) {
      const singularId = ids.get(c.singular);
      const id = ids.get(c.label);
      if (singularId && id)
        await db
          .update(schema.nounClasses)
          .set({ pluralOf: singularId })
          .where(eq(schema.nounClasses.id, id));
    }
  }
  // Classes the lexicon uses that xh-morph does not model yet. No prefix or
  // concord is claimed for them; the tutor fills these rows.
  for (const label of ["11", "12", "13", "14", "15"]) {
    if (ids.has(label)) continue;
    const [row] = await db
      .insert(schema.nounClasses)
      .values({
        label,
        prefix: "TODO",
        subjectConcord: "TODO",
        objectConcord: "TODO",
        possessiveConcord: "TODO",
        validated: false,
        notes:
          "Outside xh-morph's first rule set (classes 1 to 10). Prefix and concords to be filled from the tutor; nothing generated for this class until then.",
      })
      .onConflictDoNothing()
      .returning({ id: schema.nounClasses.id });
    if (row) ids.set(label, row.id);
    else {
      const [existing] = await db
        .select({ id: schema.nounClasses.id })
        .from(schema.nounClasses)
        .where(eq(schema.nounClasses.label, label));
      if (existing) ids.set(label, existing.id);
    }
  }
  return ids;
}

/** Resolves a spike lexeme reference (lemma + pos + class) to a seeded id. */
function resolver(idByKey: Map<string, string>) {
  const byLoose = new Map<string, string[]>();
  for (const [k, id] of idByKey) {
    const [lemma, pos, cls] = k.split("|");
    const loose = `${lemma}|${pos}|${cls}`;
    byLoose.set(loose, [...(byLoose.get(loose) ?? []), id]);
  }
  return (ref: SpikeRef): string | null => {
    const ids = byLoose.get(`${ref.lemma}|${ref.pos}|${ref.noun_class ?? ""}`);
    return ids?.[0] ?? null;
  };
}

export interface Unit1Summary {
  readonly unitId: string;
  /** Rows this run actually inserted; all zeros on a second run. */
  readonly created: { skills: number; lessons: number; exercises: number; sentences: number };
  readonly skipped: readonly string[];
}

/** Inserts the unit into the isiXhosa course, or returns the id of the one already there. */
async function upsertUnit(db: Db, spike: SpikeUnit): Promise<string> {
  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, XHOSA_COURSE_SLUG))
    .limit(1);
  if (!course) throw new Error(`course ${XHOSA_COURSE_SLUG} is missing; run migrations first`);
  const [row] = await db
    .insert(schema.units)
    .values({
      courseId: course.id,
      slug: spike.unit.slug,
      titleKey: spike.unit.title_key,
      order: spike.unit.order,
      cefrBand: spike.unit.cefr_band,
      status: "draft",
    })
    .onConflictDoNothing({ target: schema.units.slug })
    .returning({ id: schema.units.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: schema.units.id })
    .from(schema.units)
    .where(eq(schema.units.slug, spike.unit.slug));
  if (!existing) throw new Error(`unit ${spike.unit.slug} neither inserted nor found`);
  return existing.id;
}

/**
 * Unit 1 as `draft`, idempotent on the natural key every table already has
 * a unique index for: unit slug, skill slug within the unit, lesson order
 * within the skill, exercise order within the lesson, sentence text plus
 * source, gloss language within the sentence. Seeding twice inserts nothing
 * the second time, and a run interrupted halfway can be finished by running
 * it again. Nothing here writes `published`; nothing here can.
 */
export async function seedUnit1(
  db: Db,
  spike: SpikeUnit,
  idByKey: Map<string, string>,
): Promise<Unit1Summary> {
  const resolve = resolver(idByKey);
  const unitId = await upsertUnit(db, spike);
  const sentenceIds = new Map<string, string>();
  const created = { skills: 0, lessons: 0, exercises: 0, sentences: 0 };
  const skippedExercises: string[] = [];

  async function sentenceFor(s: SpikeSentence, nb: string): Promise<string> {
    const fromCorpus = s.example_id !== undefined;
    const source = fromCorpus ? "isixhosa.click" : "operator-brief";
    const key = `${source}|${s.xh}`;
    const cached = sentenceIds.get(key);
    if (cached) return cached;
    const [inserted] = await db
      .insert(schema.sentences)
      .values({
        // Unit 1 is isiXhosa; the column exists so a second language can
        // have its own sentence bank, not so this one has to say it twice.
        targetLang: "xh",
        textXh: s.xh,
        register: "standard",
        cefrBand: "A1",
        status: "draft",
        source,
        sourceRef: fromCorpus ? `examples.csv:example_id=${s.example_id}` : s.source,
        licence: fromCorpus ? "CC-BY-SA-4.0" : "proprietary-molo",
        grammarTags: s.needs ? { needs: s.needs } : {},
      })
      // sentences_text_source_uq: the same text from the same source is the
      // same sentence, so a re-seed reuses the row instead of duplicating it.
      .onConflictDoNothing({
        target: [schema.sentences.targetLang, schema.sentences.textXh, schema.sentences.source],
      })
      .returning({ id: schema.sentences.id });
    let id = inserted?.id;
    if (id) created.sentences++;
    else {
      const [existing] = await db
        .select({ id: schema.sentences.id })
        .from(schema.sentences)
        .where(
          and(
            eq(schema.sentences.targetLang, "xh"),
            eq(schema.sentences.textXh, s.xh),
            eq(schema.sentences.source, source),
          ),
        );
      id = existing?.id;
    }
    if (!id) throw new Error("sentence neither inserted nor found");
    await db
      .insert(schema.sentenceGlosses)
      .values([
        {
          sentenceId: id,
          sourceLang: "en",
          gloss: s.en.replace(/ \(ai_draft\)$/, ""),
          status: fromCorpus ? "draft" : "ai_draft",
        },
        {
          sentenceId: id,
          sourceLang: "nb",
          gloss: nb.replace(/ \(ai_draft\)$/, ""),
          status: "ai_draft",
        },
      ])
      .onConflictDoNothing({
        target: [schema.sentenceGlosses.sentenceId, schema.sentenceGlosses.sourceLang],
      });
    sentenceIds.set(key, id);
    return id;
  }

  async function convert(
    ex: SpikeExercise,
  ): Promise<{ type: ExerciseType; payload: unknown } | null> {
    const p = ex.payload;
    switch (ex.type) {
      case "listen_select":
      case "select_listen": {
        const options = (p["options"] as { lemma: string; correct: boolean }[]).map((o) => ({
          lexemeId: resolveAny(o.lemma),
          correct: o.correct,
        }));
        // listen_select prompts name a lemma; select_listen prompts carry a gloss,
        // so the prompt lexeme is the correct option.
        const promptLemma = (p["prompt"] as { lemma?: string }).lemma;
        const prompt = promptLemma
          ? resolveAny(promptLemma)
          : (options.find((o) => o.correct)?.lexemeId ?? null);
        if (!prompt || options.some((o) => !o.lexemeId)) return null;
        return {
          type: ex.type,
          payload: {
            type: ex.type,
            prompt: { lexemeId: prompt },
            options,
            ...(p["note"] ? { note: p["note"] } : {}),
          },
        };
      }
      case "match_pairs": {
        const pairs = (p["pairs"] as { lemma: string }[]).map((o) => ({
          lexemeId: resolveAny(o.lemma),
        }));
        if (pairs.length < 2 || pairs.some((o) => !o.lexemeId)) return null;
        return { type: "match_pairs", payload: { type: "match_pairs", pairs } };
      }
      case "class_sort": {
        const buckets = (p["buckets"] as { noun_class: string }[]).map((b) => b.noun_class);
        const items = (p["items"] as { lemma: string; noun_class: string }[]).map((i) => ({
          lexemeId: resolve({ lemma: i.lemma, pos: "noun", noun_class: i.noun_class }),
        }));
        if (items.some((i) => !i.lexemeId)) return null;
        return { type: "class_sort", payload: { type: "class_sort", buckets, items } };
      }
      case "culture_card": {
        const body = p["body"] as { en: string; nb: string };
        return {
          type: "culture_card",
          payload: {
            type: "culture_card",
            title: { en: "Molo and Molweni", nb: "Molo og Molweni" },
            body,
            lexemeIds: ex.lexemes.map((l) => resolveAny(l)).filter((x): x is string => !!x),
          },
        };
      }
      case "translate_tap": {
        const s = p["sentence"] as SpikeSentence;
        const gloss = p["gloss"] as SpikeGloss;
        const sentenceId = await sentenceFor(s, gloss.nb);
        const distractors = (p["distractor_tiles"] as string[])
          .map((l) => resolveAny(l))
          .filter((x): x is string => !!x);
        return {
          type: "translate_tap",
          payload: { type: "translate_tap", sentenceId, distractorLexemeIds: distractors },
        };
      }
      case "click_drill": {
        const item = (i: { lemma: string; click: string }) => ({
          lexemeId: resolveAny(i.lemma),
          click: i.click,
        });
        const pairs = (
          p["pairs"] as {
            a: { lemma: string; click: string };
            b: { lemma: string; click: string };
          }[]
        ).map((pr) => ({ a: item(pr.a), b: item(pr.b) }));
        const contrastWords = Object.values(
          p["contrast_words"] as Record<string, { lemma: string; click: string }[]>,
        )
          .flat()
          .map(item);
        if ([...pairs.flatMap((pr) => [pr.a, pr.b]), ...contrastWords].some((i) => !i.lexemeId))
          return null;
        const missing = p["missing_pairs"] as string[];
        return {
          type: "click_drill",
          payload: {
            type: "click_drill",
            set: p["set"],
            contrast: p["contrast"],
            steps: p["steps"],
            pairs,
            contrastWords,
            note: `Audio pending recording. ${missing.join(" ")}`.trim(),
          },
        };
      }
      default:
        return null;
    }
  }

  function resolveAny(lemma: string): string | null {
    for (const [k, id] of idByKey) if (k.startsWith(`${lemma}|`)) return id;
    return null;
  }

  for (const sk of spike.skills) {
    const [insertedSkill] = await db
      .insert(schema.skills)
      .values({
        unitId,
        slug: sk.slug,
        titleKey: `units.unit1.skills.${sk.slug}.title`,
        order: sk.order,
        kind: sk.kind,
        status: "draft",
      })
      .onConflictDoNothing({ target: [schema.skills.unitId, schema.skills.slug] })
      .returning({ id: schema.skills.id });
    if (insertedSkill) created.skills++;
    const skillId =
      insertedSkill?.id ??
      (
        await db
          .select({ id: schema.skills.id })
          .from(schema.skills)
          .where(and(eq(schema.skills.unitId, unitId), eq(schema.skills.slug, sk.slug)))
      )[0]?.id;
    if (!skillId) continue;
    for (const ls of sk.lessons) {
      const [insertedLesson] = await db
        .insert(schema.lessons)
        .values({
          skillId,
          order: ls.order,
          estimatedMinutes: ls.estimated_minutes,
          status: "draft",
        })
        .onConflictDoNothing({ target: [schema.lessons.skillId, schema.lessons.order] })
        .returning({ id: schema.lessons.id });
      if (insertedLesson) created.lessons++;
      const lessonId =
        insertedLesson?.id ??
        (
          await db
            .select({ id: schema.lessons.id })
            .from(schema.lessons)
            .where(and(eq(schema.lessons.skillId, skillId), eq(schema.lessons.order, ls.order)))
        )[0]?.id;
      if (!lessonId) continue;
      let order = 0;
      for (const ex of ls.exercises) {
        const converted = await convert(ex);
        if (!converted) {
          skippedExercises.push(`${ex.id} (${ex.type})`);
          continue;
        }
        const decoded = decodePayloadForType(converted.type, converted.payload);
        if (Either.isLeft(decoded)) {
          skippedExercises.push(`${ex.id} (${ex.type}): ${decoded.left.slice(0, 80)}`);
          continue;
        }
        const ids = referencedIds(decoded.right);
        order++;
        const [insertedExercise] = await db
          .insert(schema.exercises)
          .values({
            lessonId,
            order,
            type: converted.type,
            payload: converted.payload as (typeof schema.exercises.$inferInsert)["payload"],
            lexemeIds: [...ids.lexemeIds],
            sentenceIds: [...ids.sentenceIds],
            audioAssetIds: [...ids.audioAssetIds],
            note: `spike:${ex.id}`,
            status: "draft",
          })
          // An existing exercise is left exactly as the editors left it; the
          // seed refreshes nothing it did not create.
          .onConflictDoNothing({ target: [schema.exercises.lessonId, schema.exercises.order] })
          .returning({ id: schema.exercises.id });
        if (insertedExercise) created.exercises++;
      }
    }
  }
  return { unitId, created, skipped: skippedExercises };
}

async function seedDevUsers(db: Db) {
  // Role rows only; credentials are created through Better Auth (apps/api dev bootstrap).
  await db
    .insert(schema.users)
    .values([
      { id: "dev_admin", name: "Dev Admin", email: "admin@molo.local", emailVerified: true },
      { id: "dev_editor", name: "Dev Editor", email: "editor@molo.local", emailVerified: true },
    ])
    .onConflictDoNothing();
  await db
    .insert(schema.userRoles)
    .values([
      { userId: "dev_admin", role: "admin" },
      { userId: "dev_admin", role: "editor" },
      { userId: "dev_editor", role: "editor" },
    ])
    .onConflictDoNothing();
}

async function main() {
  const url = databaseUrlFromEnv();
  const host = new URL(url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const hasLexicon = existsSync(LEXICON);
  const hasUnit1 = existsSync(UNIT1);
  const lexicon = hasLexicon
    ? (await Bun.file(LEXICON).text())
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as NormalisedLexeme)
    : [];

  console.log(`seed plan for ${host}:`);
  console.log(`  languages: 3; the isiXhosa course; noun classes from ${RULES.replace(ROOT, "")}`);
  if (hasLexicon)
    console.log(`  lexemes: ${lexicon.length} as draft (+ en glosses as draft, links)`);
  else
    console.log(
      `  lexemes: none (${LEXICON.replace(ROOT, "")} is absent; run \`molo content ingest isixhosa-click --live\`)`,
    );
  if (hasUnit1) console.log(`  unit-1 from ${UNIT1.replace(ROOT, "")} as draft`);
  else console.log(`  unit-1: none (${UNIT1.replace(ROOT, "")} is absent)`);
  if (isLocal) console.log(`  dev users: dev_admin (admin, editor), dev_editor (editor)`);
  else console.log(`  dev users: none (non-local host; the first admin is granted by hand)`);
  if (dryRun) return;
  if (!isLocal && !live) {
    console.log(`refusing to seed non-local host ${host} without --live`);
    process.exitCode = 2;
    return;
  }
  const { db, close } = createDb(url, { max: 4 });
  try {
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from lexemes`)) as unknown as [
      { n: number },
    ];
    if (n > 0) {
      console.log(`lexemes already present (${n}); seeding reference data and unit only`);
    }
    await seedLanguages(db);
    await seedCourses(db);
    const classIds = await seedNounClasses(db);
    // Role rows with @molo.local addresses belong on a laptop, not in a
    // hosted database; there the first admin is a real sign-up promoted by hand.
    if (isLocal) await seedDevUsers(db);
    void classIds;
    if (!hasLexicon && !hasUnit1) return;
    const idByKey =
      n > 0 || !hasLexicon
        ? await existingLexemeIds(db)
        : (await loadLexicon(db, "isixhosa-click (spike/lexicon.draft.jsonl)", lexicon)).idByKey;
    if (!hasUnit1) return;
    const spike = (await Bun.file(UNIT1).json()) as SpikeUnit;
    const summary = await seedUnit1(db, spike, idByKey);
    const c = summary.created;
    console.log(
      `unit-1: created ${c.exercises} exercises, ${c.sentences} sentences, ${c.skills} skills, ${c.lessons} lessons; skipped ${summary.skipped.length} (a re-seed creates nothing)`,
    );
    for (const s of summary.skipped) console.log(`  skipped ${s}`);
  } finally {
    await close();
  }
}

if (import.meta.main) await main();
