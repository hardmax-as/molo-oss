import type { Actor } from "@molo/core";
import {
  coursesRepo,
  createDb,
  editorRepo,
  grammarRepo,
  learnerRepo,
  schema,
  type Db,
  type MorphPort,
} from "@molo/db";
import { eq } from "drizzle-orm";

import {
  FIXTURE_SPEAKER_ID,
  FIXTURE_USERS,
  seedFixtureReference,
  seedFixtureUsers,
  truncateContent,
} from "../src/fixtures.ts";

export const editorA: Actor = { id: FIXTURE_USERS.editorA.id, roles: ["editor"] };
export const editorB: Actor = { id: FIXTURE_USERS.editorB.id, roles: ["editor"] };
export const admin: Actor = { id: FIXTURE_USERS.admin.id, roles: ["admin", "editor"] };
export const learner: Actor = { id: FIXTURE_USERS.learner.id, roles: ["learner"] };

/** A morph port that says yes to everything, so gate tests can isolate other failures. */
export const yesMorph: MorphPort = {
  generatorFor: () => "xh-morph",
  canGeneratePlural: () => Promise.resolve(true),
};

/** The default course every fixture writes into, and the language it teaches. */
export async function defaultCourse(db: Db): Promise<{ id: string; targetLang: string }> {
  const course = await coursesRepo(db).defaultCourse();
  if (!course) throw new Error("no default course: run migrations");
  return course;
}

export interface Harness {
  db: Db;
  close: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * The integrity suite truncates content tables, so it never runs against the
 * development database: it derives a sibling `molo_test` database from
 * DATABASE_URL (or uses TEST_DATABASE_URL verbatim).
 */
export function testDatabaseUrl(): string {
  const explicit = process.env["TEST_DATABASE_URL"];
  if (explicit) return explicit;
  const base = process.env["DATABASE_URL"];
  if (!base) throw new Error("DATABASE_URL (or TEST_DATABASE_URL) is not set");
  const u = new URL(base);
  u.pathname = "/molo_test";
  return u.toString();
}

export async function harness(): Promise<Harness> {
  const { db, close } = createDb(testDatabaseUrl(), { max: 2 });
  const reset = async () => {
    await truncateContent(db);
    await seedFixtureUsers(db);
    await seedFixtureReference(db);
  };
  await reset();
  return { db, close, reset };
}

export const LICENCE = "CC-BY-SA-4.0";
export const SOURCE = "fixture";

/**
 * Creates a lexeme that satisfies every publish-gate rule except the ones
 * a test removes: both glosses, published tier-1 audio, licence, source.
 * The audio is published by pushing it through the real transition.
 */
export async function completeLexeme(
  db: Db,
  opts: { creator?: Actor; lemma?: string } = {},
): Promise<string> {
  const creator = opts.creator ?? editorA;
  const repo = editorRepo(db, creator, { morph: yesMorph });
  const id = await repo.createLexeme({
    lemma: opts.lemma ?? `zz-lex-${crypto.randomUUID().slice(0, 8)}`,
    pos: "noun",
    nounClassLabel: "13",
    source: SOURCE,
    licence: LICENCE,
    origin: "human",
  });
  // A named fixture word gets glosses that name it, so two of them never
  // read the same on an option tile (the option-collision gate, audit M02).
  const suffix = opts.lemma ? ` (${opts.lemma})` : "";
  await repo.upsertGloss(id, {
    sourceLang: "en",
    gloss: `fixture gloss en${suffix}`,
    origin: "human",
  });
  await repo.upsertGloss(id, {
    sourceLang: "nb",
    gloss: `fixture gloss nb${suffix}`,
    origin: "human",
  });
  const audioId = await repo.createAudioAsset({
    targetKind: "lexeme",
    targetId: id,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio",
    r2Key: `audio/${"a".repeat(64)}.opus`,
    sha256: "a".repeat(64),
    durationMs: 800,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  });
  const approver = creator.id === editorB.id ? editorA : editorB;
  const r = await editorRepo(db, approver, { morph: yesMorph }).transitionEntity({
    kind: "audio_asset",
    id: audioId,
    to: "published",
  });
  if (!r.ok) throw new Error(`fixture audio did not publish: ${r.reason}`);
  return id;
}

const STATUS_TABLES = {
  lexemes: schema.lexemes,
  exercises: schema.exercises,
  audioAssets: schema.audioAssets,
  units: schema.units,
  grammarNotes: schema.grammarNotes,
  grammarNoteBodies: schema.grammarNoteBodies,
} as const;

export async function statusOf(
  db: Db,
  table: keyof typeof STATUS_TABLES,
  id: string,
): Promise<string> {
  const t = STATUS_TABLES[table];
  const [row] = await db.select({ status: t.status }).from(t).where(eq(t.id, id)).limit(1);
  if (!row) throw new Error(`${table} ${id} not found`);
  return row.status;
}

export { learnerRepo, editorRepo, grammarRepo };
