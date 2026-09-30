/**
 * Content statistics for `molo content stats` and the weekly Slack report.
 * Read-only.
 */

import { sql } from "drizzle-orm";

import type { Db } from "./client.ts";

export interface ContentStats {
  readonly lexemes: {
    readonly byStatus: Record<string, number>;
    readonly byBand: Record<string, number>;
    readonly byLicence: Record<string, number>;
    readonly bySource: Record<string, number>;
  };
  readonly glosses: {
    readonly byLang: Record<string, number>;
    readonly byLangAndStatus: Record<string, number>;
  };
  readonly audio: {
    readonly byTier: Record<string, number>;
    readonly byStatus: Record<string, number>;
  };
  readonly sentences: { readonly byStatus: Record<string, number> };
  readonly exercises: {
    readonly byType: Record<string, number>;
    readonly byStatus: Record<string, number>;
  };
  readonly units: { readonly byStatus: Record<string, number> };
  readonly reviewQueue: number;
  readonly publishedLexemesWithoutTier12Audio: number;
}

type CountRow = { k: string | null; n: number };

async function counts(db: Db, query: ReturnType<typeof sql>): Promise<Record<string, number>> {
  const rows = (await db.execute(query)) as unknown as CountRow[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.k ?? "(none)"] = Number(r.n);
  return out;
}

export async function contentStats(db: Db): Promise<ContentStats> {
  const [
    byStatus,
    byBand,
    byLicence,
    bySource,
    glossLang,
    glossLangStatus,
    audioTier,
    audioStatus,
    sentStatus,
    exType,
    exStatus,
    unitStatus,
    rq,
    missing,
  ] = await Promise.all([
    counts(
      db,
      sql`select status::text as k, count(*)::int as n from lexemes group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select cefr_band::text as k, count(*)::int as n from lexemes group by 1 order by 1`,
    ),
    counts(db, sql`select licence as k, count(*)::int as n from lexemes group by 1 order by 1`),
    counts(db, sql`select source as k, count(*)::int as n from lexemes group by 1 order by 1`),
    counts(
      db,
      sql`select source_lang::text as k, count(*)::int as n from glosses group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select source_lang::text || ':' || status::text as k, count(*)::int as n from glosses group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select tier::text as k, count(*)::int as n from audio_assets group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select status::text as k, count(*)::int as n from audio_assets group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select status::text as k, count(*)::int as n from sentences group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select type::text as k, count(*)::int as n from exercises group by 1 order by 1`,
    ),
    counts(
      db,
      sql`select status::text as k, count(*)::int as n from exercises group by 1 order by 1`,
    ),
    counts(db, sql`select status::text as k, count(*)::int as n from units group by 1 order by 1`),
    counts(db, sql`select 'n' as k, count(*)::int as n from review_queue`),
    counts(
      db,
      sql`select 'n' as k, count(*)::int as n from lexemes l where l.status = 'published' and not exists (
          select 1 from audio_assets a where a.target_kind = 'lexeme' and a.target_id = l.id and a.status = 'published' and a.tier in ('1_native_studio','2_native_forvo'))`,
    ),
  ]);
  return {
    lexemes: { byStatus, byBand, byLicence, bySource },
    glosses: { byLang: glossLang, byLangAndStatus: glossLangStatus },
    audio: { byTier: audioTier, byStatus: audioStatus },
    sentences: { byStatus: sentStatus },
    exercises: { byType: exType, byStatus: exStatus },
    units: { byStatus: unitStatus },
    reviewQueue: rq["n"] ?? 0,
    publishedLexemesWithoutTier12Audio: missing["n"] ?? 0,
  };
}

export interface MissingAudioRow {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClass: string | null;
  readonly frequencyRank: number | null;
}

/** Published lexemes with no published tier-1/2 audio, most frequent first. */
export async function lexemesMissingAudio(db: Db, limit = 500): Promise<MissingAudioRow[]> {
  const rows = (await db.execute(sql`
    select l.id, l.lemma, l.pos, c.label as "nounClass", l.frequency_rank as "frequencyRank"
    from lexemes l left join noun_classes c on c.id = l.noun_class_id
    where l.status = 'published' and not exists (
      select 1 from audio_assets a where a.target_kind = 'lexeme' and a.target_id = l.id
        and a.status = 'published' and a.tier in ('1_native_studio','2_native_forvo'))
    order by l.frequency_rank nulls last, l.lemma
    limit ${limit}`)) as unknown as MissingAudioRow[];
  return rows;
}
