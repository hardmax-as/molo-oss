/**
 * Loads normalised lexemes (the shape `@molo/content`'s adapters and
 * `spike/lexicon.draft.jsonl` share) as `draft` rows with their source
 * glosses and links, and records an `ingest_runs` row. Never writes any
 * other status; the seed and `molo content ingest` both call this.
 */

import type { LinkKind, Status } from "@molo/core";
import { eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import * as schema from "../schema/index.ts";

export interface NormalisedLexeme {
  lemma: string;
  pos: string;
  noun_class: string | null;
  is_plural: boolean;
  infinitive: string | null;
  senses: { word_id: number; en: string; note?: string; informal?: true }[];
  linked: {
    kind: string;
    direction: string;
    source_kind: string;
    lemma: string;
    pos: string;
    noun_class: string | null;
  }[];
  attribution: string[];
  source: string;
  source_ref: string;
  snapshot: { repo: string; commit: string | null; commit_date: string | null };
  licence: string;
  status: string;
}

export interface LoadPlan {
  readonly adapter: string;
  readonly rowsIn: number;
  readonly nouns: number;
  readonly nounsWithoutKnownClass: number;
  readonly links: number;
  readonly licence: string;
}

export interface LoadResult extends LoadPlan {
  readonly created: number;
  readonly skipped: number;
  readonly linksCreated: number;
  readonly ingestRunId: string | null;
  /** Ids by `lemma|pos|class|plural` key, for callers that go on to reference them. */
  readonly idByKey: Map<string, string>;
}

export function lexemeKey(lemma: string, pos: string, cls: string | null, plural: boolean): string {
  return `${lemma}|${pos}|${cls ?? ""}|${plural ? 1 : 0}`;
}

function assertNeverPublished(status: string): Status {
  if (status !== "draft" && status !== "ai_draft") {
    throw new Error(`refusing to load status ${status}; only draft and ai_draft may be ingested`);
  }
  return status;
}

/** What `loadLexicon` would do, without touching the database. */
export function planLexicon(
  adapter: string,
  rows: readonly NormalisedLexeme[],
  knownClasses: ReadonlySet<string>,
): LoadPlan {
  const nouns = rows.filter((r) => r.pos === "noun");
  return {
    adapter,
    rowsIn: rows.length,
    nouns: nouns.length,
    nounsWithoutKnownClass: nouns.filter((r) => !r.noun_class || !knownClasses.has(r.noun_class))
      .length,
    links: rows.reduce((n, r) => n + r.linked.length, 0),
    licence: rows[0]?.licence ?? "?",
  };
}

export async function loadLexicon(
  db: Db,
  adapter: string,
  rows: readonly NormalisedLexeme[],
): Promise<LoadResult> {
  const classRows = await db
    .select({ id: schema.nounClasses.id, label: schema.nounClasses.label })
    .from(schema.nounClasses);
  const classIds = new Map(classRows.map((c) => [c.label, c.id]));
  const plan = planLexicon(adapter, rows, new Set(classIds.keys()));
  const idByKey = new Map<string, string>();
  const first = rows[0];
  const snapshot = first ? first.snapshot : { repo: "?", commit: null, commit_date: null };
  const [run] = await db
    .insert(schema.ingestRuns)
    .values({ adapter, rowsIn: rows.length, licence: plan.licence, snapshot })
    .returning({ id: schema.ingestRuns.id });

  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const status = assertNeverPublished(r.status);
    const nounClassId = r.noun_class ? (classIds.get(r.noun_class) ?? null) : null;
    if (r.pos === "noun" && !nounClassId) {
      skipped++;
      continue;
    }
    const [row] = await db
      .insert(schema.lexemes)
      .values({
        lemma: r.lemma,
        pos: r.pos,
        nounClassId,
        isPlural: r.is_plural,
        infinitive: r.infinitive,
        register: r.senses.some((s) => s.informal) ? "urban" : "standard",
        attribution: r.attribution,
        status,
        source: r.source,
        sourceRef: r.source_ref,
        licence: r.licence,
      })
      .onConflictDoNothing()
      .returning({ id: schema.lexemes.id });
    if (!row) {
      skipped++;
      continue;
    }
    created++;
    idByKey.set(lexemeKey(r.lemma, r.pos, r.noun_class, r.is_plural), row.id);
    // The upstream English gloss is human-written source data: draft, not ai_draft.
    const en = r.senses.map((s) => s.en).join("; ");
    const note =
      r.senses
        .map((s) => s.note)
        .filter((n): n is string => !!n)
        .join(" | ") || null;
    await db
      .insert(schema.glosses)
      .values({ lexemeId: row.id, sourceLang: "en", gloss: en, usageNote: note, status: "draft" })
      .onConflictDoNothing();
  }

  let linksCreated = 0;
  const kinds = new Set<string>(["plural_of", "antonym", "see_also"]);
  for (const r of rows) {
    const fromId = idByKey.get(lexemeKey(r.lemma, r.pos, r.noun_class, r.is_plural));
    if (!fromId) continue;
    for (const l of r.linked) {
      if (!kinds.has(l.kind)) continue;
      // plural_of is directional: stored once, from the plural lexeme to the singular one.
      if (l.kind === "plural_of" && l.direction !== "out") continue;
      const toKeyPlural = l.kind === "plural_of" ? false : undefined;
      const toId = [true, false]
        .filter((p) => toKeyPlural === undefined || p === toKeyPlural)
        .map((p) => idByKey.get(lexemeKey(l.lemma, l.pos, l.noun_class, p)))
        .find((id): id is string => !!id);
      if (!toId || toId === fromId) continue;
      await db
        .insert(schema.lexemeLinks)
        .values({ fromId, toId, kind: l.kind as LinkKind, sourceKind: l.source_kind })
        .onConflictDoNothing();
      linksCreated++;
    }
  }
  if (run) {
    await db
      .update(schema.ingestRuns)
      .set({
        finishedAt: new Date(),
        rowsCreated: created,
        rowsSkipped: skipped,
        notes: `${linksCreated} links`,
      })
      .where(eq(schema.ingestRuns.id, run.id));
  }
  return { ...plan, created, skipped, linksCreated, ingestRunId: run?.id ?? null, idByKey };
}

/** Ids of every lexeme already in the database, keyed like `loadLexicon`'s result. */
export async function existingLexemeIds(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: schema.lexemes.id,
      lemma: schema.lexemes.lemma,
      pos: schema.lexemes.pos,
      isPlural: schema.lexemes.isPlural,
      label: schema.nounClasses.label,
    })
    .from(schema.lexemes)
    .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id));
  return new Map(rows.map((r) => [lexemeKey(r.lemma, r.pos, r.label, r.isPlural), r.id]));
}
