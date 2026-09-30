/**
 * Synthetic fixtures for tests and local development.
 *
 * Nothing here is isiXhosa. Lemmas are `zz-` prefixed nonsense so that a
 * fixture can never be mistaken for content, and so the integrity suite
 * asserts the content model without asserting a single real word.
 */

import { XHOSA_COURSE_SLUG } from "@molo/core";
import type { Db } from "@molo/db";
import { schema } from "@molo/db";
import { eq } from "drizzle-orm";

export const FIXTURE_USERS = {
  admin: { id: "fx_admin", name: "Fixture Admin", email: "admin@fixture.invalid" },
  editorA: { id: "fx_editor_a", name: "Fixture Editor A", email: "editor-a@fixture.invalid" },
  editorB: { id: "fx_editor_b", name: "Fixture Editor B", email: "editor-b@fixture.invalid" },
  learner: { id: "fx_learner", name: "Fixture Learner", email: "learner@fixture.invalid" },
} as const;

export const FIXTURE_SPEAKER_ID = "00000000-0000-4000-8000-00000000f00d";

/** Deterministic fixture uuid from a small integer. */
export function fxId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export async function seedFixtureUsers(db: Db): Promise<void> {
  const rows = Object.values(FIXTURE_USERS).map((u) => ({ ...u, emailVerified: true }));
  await db.insert(schema.users).values(rows).onConflictDoNothing();
  await db
    .insert(schema.userRoles)
    .values([
      { userId: FIXTURE_USERS.admin.id, role: "admin" },
      { userId: FIXTURE_USERS.admin.id, role: "editor" },
      { userId: FIXTURE_USERS.editorA.id, role: "editor" },
      { userId: FIXTURE_USERS.editorB.id, role: "editor" },
      { userId: FIXTURE_USERS.learner.id, role: "learner" },
    ])
    .onConflictDoNothing();
}

export async function seedFixtureReference(db: Db): Promise<void> {
  await db
    .insert(schema.languages)
    .values([
      { code: "xh", name: "isiXhosa", isSource: false, isTarget: true },
      { code: "en", name: "English", isSource: true, isTarget: false },
      { code: "nb", name: "Norsk bokmål", isSource: true, isTarget: false },
    ])
    .onConflictDoNothing();
  // The one course. Migration 0012 creates it; this keeps the fixtures
  // self-sufficient if it was ever removed. No target on the conflict
  // clause: either the slug or the single-default index may be the one held.
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
  // Two fixture classes, clearly not real ones, with a plural pairing.
  await db
    .insert(schema.nounClasses)
    .values([
      {
        id: fxId(901),
        label: "13",
        prefix: "zz-",
        subjectConcord: "zz-",
        objectConcord: "-zz-",
        possessiveConcord: "zza-",
        validated: false,
        notes: "fixture",
      },
      {
        id: fxId(902),
        label: "12",
        prefix: "zzi-",
        subjectConcord: "zzi-",
        objectConcord: "-zzi-",
        possessiveConcord: "zzia-",
        validated: false,
        notes: "fixture",
      },
    ])
    .onConflictDoNothing();
  await db
    .update(schema.nounClasses)
    .set({ pluralOf: fxId(901) })
    .where(eq(schema.nounClasses.id, fxId(902)));
  // Upsert so a test that revokes consent does not leak into the next one.
  const consent = {
    consentRecordedAt: new Date("2026-01-01T00:00:00Z"),
    consentScope: "published" as const,
  };
  await db
    .insert(schema.speakers)
    .values({
      id: FIXTURE_SPEAKER_ID,
      displayName: "Fixture Speaker",
      region: "fixture",
      ...consent,
    })
    .onConflictDoUpdate({ target: schema.speakers.id, set: consent });
}

/** Wipes every content and learner table, keeping reference data and users. */
export async function truncateContent(db: Db): Promise<void> {
  const tables = [
    "push_tokens",
    "hearts",
    "entitlements",
    "web_purchases",
    "league_reports",
    "league_hides",
    "league_members",
    "leagues",
    "review_log",
    "review_cards",
    "learner_mistakes",
    "xp_events",
    "streaks",
    "user_prefs",
    "content_revisions",
    "review_assignments",
    "exercise_reports",
    "ingest_runs",
    "sentence_requests",
    "golden_answers",
    "grammar_note_cells",
    "grammar_note_bodies",
    "grammar_notes",
    "exercises",
    "lessons",
    "skills",
    "units",
    "audio_assets",
    "sentence_lexemes",
    "sentence_glosses",
    "sentences",
    "lexeme_links",
    "glosses",
    "lexemes",
  ];
  const { sql } = await import("drizzle-orm");
  await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} CASCADE`));
  // Courses are reference data like languages and noun classes, so the
  // default one survives; any extra course a test created does not.
  await db.delete(schema.courses).where(eq(schema.courses.isDefault, false));
}
