/**
 * The numbers behind the weekly content report. Read-only, no Node
 * built-ins and no adapters, so both `molo content report` and the Worker
 * cron (apps/api/src/scheduled.ts) can call it. The text lives in
 * `@molo/core` (`formatContentReport`).
 *
 * The editor dashboard's landing page reads the same object over
 * `GET /edit/overview`, which is why the gap queries in `editor-queue.ts`
 * are gathered here rather than in a second query layer: Slack on Monday
 * and the screen on Tuesday cannot then disagree.
 *
 * Learner figures are counts over a window; no user id, name or email ever
 * leaves this function.
 */

import type { ContentReport, StatusCounts } from "@molo/core";
import { sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import { gateBlockers, recordingGaps, writingGaps } from "./editor-queue.ts";
import { noMorph, type MorphPort } from "./editor.ts";

type CountRow = { k: string | null; n: number };

async function counts(db: Db, query: ReturnType<typeof sql>): Promise<StatusCounts> {
  const rows = (await db.execute(query)) as unknown as CountRow[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.k ?? "(none)"] = Number(r.n);
  return out;
}

async function one(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(query)) as unknown as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

/** Days the learner half of the report looks back over. */
export const REPORT_WINDOW_DAYS = 7;

export interface ContentReportDeps {
  /**
   * The morphology generator the publish-gate figures are asked against.
   * The Worker hands in `wasmMorph`; the CLI and the cron have no
   * WebAssembly to hand and get `noMorph`, which answers "cannot generate"
   * for every plural — the same answer `transitionEntity` gives with the
   * same port, so the two never disagree about what they are counting.
   */
  readonly morph?: MorphPort;
}

export async function contentReport(
  db: Db,
  now = new Date(),
  deps: ContentReportDeps = {},
): Promise<ContentReport> {
  // postgres.js with `prepare: false` (Hyperdrive) refuses Date parameters in
  // a sql fragment, so the window is an ISO string with an explicit cast.
  const since = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [
    lexemes,
    sentences,
    exercises,
    units,
    glossesPublished,
    audioPublishedByTier,
    audioUnpublished,
    reviewQueue,
    publishedWithoutAudio,
    inReviewWithoutAudio,
    lexemesInUnvalidatedClass,
    unvalidatedNounClasses,
    active,
    lessonsCompleted,
    signups,
    plus,
    writing,
    gate,
  ] = await Promise.all([
    counts(db, sql`select status::text as k, count(*)::int as n from lexemes group by 1`),
    counts(db, sql`select status::text as k, count(*)::int as n from sentences group by 1`),
    counts(db, sql`select status::text as k, count(*)::int as n from exercises group by 1`),
    counts(db, sql`select status::text as k, count(*)::int as n from units group by 1`),
    counts(
      db,
      sql`select source_lang::text as k, count(*)::int as n from glosses where status = 'published' group by 1`,
    ),
    counts(
      db,
      sql`select tier::text as k, count(*)::int as n from audio_assets where status = 'published' group by 1`,
    ),
    counts(
      db,
      sql`select status::text as k, count(*)::int as n from audio_assets where status in ('draft','ai_draft','in_review') group by 1`,
    ),
    one(db, sql`select count(*)::int as n from review_queue`),
    one(
      db,
      sql`select count(*)::int as n from lexemes l where l.status = 'published' and not exists (
        select 1 from audio_assets a where a.target_kind = 'lexeme' and a.target_id = l.id
          and a.status = 'published' and a.tier in ('1_native_studio','2_native_forvo'))`,
    ),
    one(
      db,
      sql`select count(*)::int as n from lexemes l where l.status = 'in_review' and not exists (
        select 1 from audio_assets a where a.target_kind = 'lexeme' and a.target_id = l.id
          and a.status = 'published' and a.tier in ('1_native_studio','2_native_forvo'))`,
    ),
    one(
      db,
      sql`select count(*)::int as n from lexemes l join noun_classes c on c.id = l.noun_class_id
        where c.validated = false and l.status <> 'retired'`,
    ),
    one(db, sql`select count(*)::int as n from noun_classes where validated = false`),
    one(
      db,
      sql`select count(distinct user_id)::int as n from xp_events where created_at >= ${since}::timestamptz`,
    ),
    one(
      db,
      sql`select count(*)::int as n from xp_events where ref_kind = 'lesson' and created_at >= ${since}::timestamptz`,
    ),
    one(db, sql`select count(*)::int as n from "user" where created_at >= ${since}::timestamptz`),
    one(
      db,
      sql`select count(*)::int as n from entitlements where entitlement = 'plus' and active = true
        and (expires_at is null or expires_at > ${nowIso}::timestamptz)`,
    ),
    writingGaps(db),
    gateBlockers(db, deps.morph ?? noMorph),
  ]);

  const pending =
    (audioUnpublished["draft"] ?? 0) +
    (audioUnpublished["ai_draft"] ?? 0) +
    (audioUnpublished["in_review"] ?? 0);
  // The one query that needs a figure from another: a take waiting for
  // approval already covers its word, so it is a second number a session
  // needs, not a third recording to make.
  const recording = await recordingGaps(db, pending);

  return {
    date: nowIso.slice(0, 10),
    windowDays: REPORT_WINDOW_DAYS,
    lexemes,
    sentences,
    exercises,
    units,
    glossesPublished,
    audio: {
      tier1: audioPublishedByTier["1_native_studio"] ?? 0,
      tier2: audioPublishedByTier["2_native_forvo"] ?? 0,
      tier3: audioPublishedByTier["3_tts"] ?? 0,
      pending,
      inReview: audioUnpublished["in_review"] ?? 0,
    },
    blockers: {
      reviewQueue,
      publishedLexemesWithoutTier12Audio: publishedWithoutAudio,
      inReviewLexemesWithoutTier12Audio: inReviewWithoutAudio,
      lexemesInUnvalidatedClass,
      unvalidatedNounClasses,
      gate: gate.counts,
      gateConsidered: gate.considered,
    },
    writing,
    recording,
    learners: { active, lessonsCompleted, signups, plus },
  };
}
