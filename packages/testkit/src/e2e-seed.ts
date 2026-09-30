/**
 * Seed for the Playwright e2e suite. Run with Bun against a database that
 * is NOT the development one:
 *
 *   E2E_DATABASE_URL=postgres://molo:molo@localhost:55432/molo_e2e bun packages/testkit/src/e2e-seed.ts
 *
 * It creates the database if missing, migrates, wipes content, and builds a
 * small published unit through the real editor repository and the real
 * transitions (four eyes, gates), a second published unit that depends on
 * the first (so the prerequisite lock has something to lock), plus a draft
 * unit and a draft lexeme that must never reach a learner. Names are `zz-`
 * so they can never be mistaken for content.
 */

import type { Actor } from "@molo/core";
import {
  listWebPurchases,
  recordWebConsent,
  createDb,
  editorRepo,
  schema,
  tutorRepo,
  type Db,
  type MorphPort,
} from "@molo/db";
import { runMigrations } from "@molo/db/migrate";
import { applyRevenueCatEvent } from "@molo/gamification";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import {
  FIXTURE_SPEAKER_ID,
  FIXTURE_USERS,
  seedFixtureReference,
  seedFixtureUsers,
  truncateContent,
} from "./fixtures.ts";

export const E2E = {
  unitSlug: "zz-e2e-unit",
  draftUnitSlug: "zz-e2e-draft-unit",
  /** Published, but behind `unitSlug`: the path must lock it until that one is finished. */
  lockedUnitSlug: "zz-e2e-locked-unit",
  /** i18n keys the fixture units borrow, so a spec can name them. */
  unitTitleKey: "units.unit1.title",
  lockedUnitTitleKey: "units.unit1.skills.numbers.title",
  lexemes: {
    a: { lemma: "zz-lex-a", en: "fixture gloss alpha", nb: "fikstur glosse alfa" },
    b: { lemma: "zz-lex-b", en: "fixture gloss beta", nb: "fikstur glosse beta" },
    c: { lemma: "zz-lex-c", en: "fixture gloss gamma", nb: "fikstur glosse gamma" },
    draft: {
      lemma: "zz-lex-draft",
      en: "fixture gloss NEVER-SHOWN",
      nb: "fikstur glosse ALDRI-VIST",
    },
  },
  /** Two listen_select exercises, prompt a then prompt b; the correct gloss is the prompt's own. */
  exerciseCount: 2,
  /**
   * A published grammar note on the seeded skill, so a browser can watch the
   * rule appear in front of the drill and be skipped past. Every string is
   * `zz-` or plainly fixture English: a spec must never assert against a
   * claim about isiXhosa (docs/GRAMMAR.md).
   */
  grammar: {
    slug: "zz-e2e-note",
    en: {
      title: "zz fixture rule",
      rule: "zz fixture explanation of a fixture pattern.",
      correction: "zz fixture correction naming the pattern.",
    },
    nb: {
      title: "zz fikstur-regel",
      rule: "zz fikstur-forklaring av et fikstur-mønster.",
      correction: "zz fikstur-retting som navngir mønsteret.",
    },
    /** The worked example, and one paradigm row whose second cell is empty. */
    example: "zz-lex-a",
    /** A draft note on the same skill: it must never reach a learner. */
    draftSlug: "zz-e2e-note-draft",
    draftTitle: "zz DRAFT NOTE NEVER SHOWN",
  },
  /**
   * The tutor's two pages: one open sentence request on the published skill,
   * and one model-drafted culture card (ai_draft) on the draft skill, so the
   * learner path is untouched. Fixture English only.
   */
  tutor: {
    requestSlug: "zz-e2e-request",
    requestEn: "zz fixture request prompt",
    requestNb: "zz fikstur-forespørsel",
    cardSlug: "zz-e2e-card",
    cardTitle: "zz fixture culture card",
    caveat: "1. zz fixture claim the tutor confirms",
  },
} as const;

const editorA: Actor = { id: FIXTURE_USERS.editorA.id, roles: ["editor"] };
const editorB: Actor = { id: FIXTURE_USERS.editorB.id, roles: ["editor"] };
const yesMorph: MorphPort = {
  generatorFor: () => "xh-morph",
  canGeneratePlural: () => Promise.resolve(true),
};

type Kind =
  | "lexeme"
  | "audio_asset"
  | "exercise"
  | "lesson"
  | "skill"
  | "unit"
  | "grammar_note"
  | "grammar_note_body";

async function publish(db: Db, kind: Kind, id: string): Promise<void> {
  const a = await editorRepo(db, editorA, { morph: yesMorph }).transitionEntity({
    kind,
    id,
    to: "in_review",
  });
  if (!a.ok) throw new Error(`${kind} ${id} -> in_review: ${a.reason}`);
  const b = await editorRepo(db, editorB, { morph: yesMorph }).transitionEntity({
    kind,
    id,
    to: "published",
  });
  if (!b.ok) throw new Error(`${kind} ${id} -> published: ${b.reason}`);
}

async function lexeme(
  db: Db,
  spec: { lemma: string; en: string; nb: string },
  publishIt: boolean,
): Promise<string> {
  const repo = editorRepo(db, editorA, { morph: yesMorph });
  const id = await repo.createLexeme({
    lemma: spec.lemma,
    pos: "noun",
    nounClassLabel: "13",
    source: "fixture",
    licence: "CC-BY-SA-4.0",
    origin: "human",
  });
  await repo.upsertGloss(id, { sourceLang: "en", gloss: spec.en, origin: "human" });
  await repo.upsertGloss(id, { sourceLang: "nb", gloss: spec.nb, origin: "human" });
  if (!publishIt) return id;
  const audioId = await repo.createAudioAsset({
    targetKind: "lexeme",
    targetId: id,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio",
    r2Key: `audio/${"e".repeat(64)}.opus`,
    sha256: "e".repeat(64),
    durationMs: 800,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  });
  const r = await editorRepo(db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "audio_asset",
    id: audioId,
    to: "published",
  });
  if (!r.ok) throw new Error(`audio: ${r.reason}`);
  await publish(db, "lexeme", id);
  return id;
}

/**
 * One published note on the seeded skill and one draft one beside it. The
 * published note carries a worked example, a two-column paradigm and a cell
 * with no recording, so a spec can check the honest empty state too.
 */
async function grammarNote(db: Db, skillId: string, lexemeA: string): Promise<void> {
  const repo = editorRepo(db, editorA, { morph: yesMorph });
  // The recording the word already has: GRAMMAR.md says the audio is part of
  // the rule, so the worked example carries one and the second paradigm cell
  // deliberately does not.
  const [audio] = await db
    .select({ id: schema.audioAssets.id })
    .from(schema.audioAssets)
    .where(
      and(
        eq(schema.audioAssets.targetKind, "lexeme"),
        eq(schema.audioAssets.targetId, lexemeA),
        eq(schema.audioAssets.status, "published"),
      ),
    )
    .limit(1);
  if (!audio) throw new Error("fixture lexeme a has no published audio");
  const id = await repo.createGrammarNote({
    skillId,
    slug: E2E.grammar.slug,
    order: 1,
    caveat: "fixture note: nothing here describes isiXhosa",
    origin: "human",
  });
  for (const lang of ["en", "nb"] as const) {
    const body = E2E.grammar[lang];
    const bodyId = await repo.upsertGrammarNoteBody(id, {
      sourceLang: lang,
      title: body.title,
      rule: body.rule,
      correction: body.correction,
      origin: "human",
    });
    await publish(db, "grammar_note_body", bodyId);
  }
  await repo.setGrammarNoteCells(id, [
    {
      role: "example",
      order: 1,
      colKey: "word",
      surfaceForm: E2E.grammar.example,
      morphemes: ["zz", "lex", "a"],
      lexemeId: lexemeA,
      audioAssetId: audio.id,
    },
    {
      role: "paradigm",
      order: 2,
      rowLabel: "9",
      colKey: "singular",
      surfaceForm: E2E.grammar.example,
      morphemes: ["zz", "lex", "a"],
      lexemeId: lexemeA,
      audioAssetId: audio.id,
    },
    // No lexeme and no recording: the cell must say so rather than pretend.
    { role: "paradigm", order: 3, rowLabel: "9", colKey: "plural", surfaceForm: "zz-lex-aa" },
  ]);
  await publish(db, "grammar_note", id);

  const draftId = await repo.createGrammarNote({
    skillId,
    slug: E2E.grammar.draftSlug,
    order: 2,
    caveat: "fixture draft: must never reach a learner",
    origin: "llm",
  });
  for (const lang of ["en", "nb"] as const) {
    await repo.upsertGrammarNoteBody(draftId, {
      sourceLang: lang,
      title: E2E.grammar.draftTitle,
      rule: "zz DRAFT rule NEVER SHOWN",
      origin: "llm",
    });
  }
}

export async function seedE2E(
  db: Db,
): Promise<{ unitId: string; lessonId: string; lockedUnitId: string; lockedLessonId: string }> {
  await seedFixtureUsers(db);
  await seedFixtureReference(db);
  await truncateContent(db);

  const a = await lexeme(db, E2E.lexemes.a, true);
  const b = await lexeme(db, E2E.lexemes.b, true);
  const c = await lexeme(db, E2E.lexemes.c, true);
  await lexeme(db, E2E.lexemes.draft, false);

  const repo = editorRepo(db, editorA, { morph: yesMorph });
  const unitId = await repo.createUnit({
    slug: E2E.unitSlug,
    titleKey: E2E.unitTitleKey,
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-e2e-skill",
    titleKey: "units.unit1.skills.greetings.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1, estimatedMinutes: 2 });
  const ex1 = await repo.createExercise({
    lessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: a },
      options: [
        { lexemeId: a, correct: true },
        { lexemeId: b, correct: false },
        { lexemeId: c, correct: false },
      ],
    },
  });
  const ex2 = await repo.createExercise({
    lessonId,
    order: 2,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: b },
      options: [
        { lexemeId: c, correct: false },
        { lexemeId: b, correct: true },
      ],
    },
  });
  await publish(db, "exercise", ex1);
  await publish(db, "exercise", ex2);
  await publish(db, "lesson", lessonId);
  await publish(db, "skill", skillId);
  await publish(db, "unit", unitId);

  // The rule a learner meets before the drill (docs/GRAMMAR.md). Published,
  // so a browser can watch it appear and be skipped; the second note on the
  // same skill stays a draft and must never be served.
  await grammarNote(db, skillId, a);

  // A second published unit that depends on the first: the path must lock it
  // until every lesson of `unitSlug` is finished, and the API must refuse to
  // credit a lesson inside it while it is locked.
  const lockedUnitId = await repo.createUnit({
    slug: E2E.lockedUnitSlug,
    titleKey: E2E.lockedUnitTitleKey,
    order: 3,
    cefrBand: "A1",
    prerequisiteUnitId: unitId,
  });
  const lockedSkillId = await repo.createSkill({
    unitId: lockedUnitId,
    slug: "zz-e2e-locked-skill",
    titleKey: "units.unit1.skills.numbers.title",
    order: 1,
    kind: "vocab",
  });
  const lockedLessonId = await repo.createLesson({
    skillId: lockedSkillId,
    order: 1,
    estimatedMinutes: 3,
  });
  const lockedExercise = await repo.createExercise({
    lessonId: lockedLessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: c },
      options: [
        { lexemeId: c, correct: true },
        { lexemeId: a, correct: false },
      ],
    },
  });
  await publish(db, "exercise", lockedExercise);
  await publish(db, "lesson", lockedLessonId);
  await publish(db, "skill", lockedSkillId);
  await publish(db, "unit", lockedUnitId);

  // A whole draft unit: must be invisible to learners.
  const draftUnit = await repo.createUnit({
    slug: E2E.draftUnitSlug,
    titleKey: "units.unit1.title",
    order: 2,
    cefrBand: "A1",
  });
  const draftSkill = await repo.createSkill({
    unitId: draftUnit,
    slug: "zz-e2e-draft-skill",
    titleKey: "units.unit1.skills.clicks.title",
    order: 1,
    kind: "vocab",
  });
  await repo.createLesson({ skillId: draftSkill, order: 1 });

  // What the tutor is asked for (docs/EDITOR-GUIDE.md, "Write the sentences").
  const tutor = tutorRepo(db, editorA);
  await tutor.createRequest({
    skillId,
    slug: E2E.tutor.requestSlug,
    order: 1,
    promptEn: E2E.tutor.requestEn,
    promptNb: E2E.tutor.requestNb,
    note: null,
    targetLexemeIds: [a],
  });
  await tutor.addCultureCard({
    skillId: draftSkill,
    slug: E2E.tutor.cardSlug,
    payload: {
      type: "culture_card",
      title: { en: E2E.tutor.cardTitle, nb: "zz fikstur-kulturkort" },
      body: { en: "zz fixture body", nb: "zz fikstur-tekst" },
      lexemeIds: [a],
    },
    caveat: E2E.tutor.caveat,
  });

  return { unitId, lessonId, lockedUnitId, lockedLessonId };
}

/** Read the account created by an HTTP sign-up test using testkit's DB dependencies. */
export async function findE2eUser(url: string, email: string) {
  const { db, close } = createDb(url);
  try {
    return (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0] ?? null;
  } finally {
    await close();
  }
}

/** Model an account registered before country retention, in an isolated e2e database only. */
export async function seedE2eUnknownCountry(url: string, email: string) {
  if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("refusing non-e2e database");
  const { db, close } = createDb(url);
  try {
    await db.update(schema.users).set({ country: null }).where(eq(schema.users.email, email));
  } finally {
    await close();
  }
}

/** Local payment fixture only; no RevenueCat/Stripe call or real payment. */
export async function seedE2eWebPurchase(url: string, email: string) {
  if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("refusing non-e2e database");
  const { db, close } = createDb(url);
  try {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (!user) throw new Error("e2e account missing");
    const start = Date.now() - 86_400_000;
    await recordWebConsent(db, user.id, "molo_plus_monthly", new Date(start - 60_000));
    await applyRevenueCatEvent(db, {
      id: `fixture-${user.id}`,
      type: "INITIAL_PURCHASE",
      app_user_id: user.id,
      entitlement_ids: ["plus"],
      product_id: "molo_plus_monthly",
      store: "RC_BILLING",
      original_transaction_id: `fixture-transaction-${user.id}`,
      purchased_at_ms: start,
      expiration_at_ms: start + 30 * 86_400_000,
      event_timestamp_ms: start,
      currency: "NOK",
      price_in_purchased_currency: 79,
    });
    return (await listWebPurchases(db, user.id))[0]!;
  } finally {
    await close();
  }
}

/**
 * Gives an account signed up through the real form the `editor` role, so a
 * browser spec can walk the editor dashboard with a genuine Better Auth
 * session. The fixture editors have no credentials — they exist as rows,
 * not as logins — and there is deliberately no API that hands out a role,
 * so the only honest way in is to write the row the way an admin would.
 *
 * Refuses any database whose name does not end in `_e2e`.
 */
export async function grantEditorRole(
  url: string,
  email: string,
  role: "editor" | "admin" = "editor",
): Promise<string> {
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_e2e")) throw new Error(`refusing to grant a role in ${dbName}`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [user] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
    if (!user) throw new Error(`no account for ${email}`);
    await sql`insert into user_roles (user_id, role) values (${user.id}, 'editor')
              on conflict do nothing`;
    if (role === "admin")
      await sql`insert into user_roles (user_id, role) values (${user.id}, 'admin')
                on conflict do nothing`;
    return user.id;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName) || !dbName.endsWith("_e2e")) {
    throw new Error(`refusing to seed e2e fixtures into ${dbName}: name must end in _e2e`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) await sql.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.main) {
  const url = process.env["E2E_DATABASE_URL"] ?? "postgres://molo:molo@localhost:55432/molo_e2e";
  await ensureDatabase(url);
  await runMigrations(url);
  const { db, close } = createDb(url, { max: 2 });
  const out = await seedE2E(db);
  await close();
  console.log(JSON.stringify({ seeded: true, ...out }));
  process.exit(0);
}
