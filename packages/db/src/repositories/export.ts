/**
 * The share-alike export: everything we derived from a CC-BY-SA source, in
 * a shape someone else can actually use.
 *
 * isixhosa.click publishes its dictionary under CC BY-SA 4.0. Our glosses,
 * usage notes and sentences built on those entries are adaptations, so the
 * licence obliges us to offer them back under the same terms. This is the
 * query behind `molo content export`; nothing else in the product reads it.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import * as schema from "../schema/index.ts";

/** Licences that carry a share-alike obligation. Matched case-insensitively on the row's value. */
export const SHARE_ALIKE_LICENCES = ["cc-by-sa-4.0"] as const;

export interface ExportedGloss {
  readonly sourceLang: string;
  readonly gloss: string;
  readonly usageNote: string | null;
  readonly contrastiveNote: string | null;
  readonly status: string;
}

export interface ExportedLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClass: string | null;
  readonly isPlural: boolean;
  readonly infinitive: string | null;
  readonly register: string;
  readonly cefrBand: string | null;
  readonly status: string;
  readonly source: string;
  readonly sourceRef: string | null;
  readonly licence: string;
  readonly attribution: readonly string[];
  readonly glosses: readonly ExportedGloss[];
}

export interface ExportedSentence {
  readonly id: string;
  readonly textXh: string;
  readonly status: string;
  readonly source: string;
  readonly sourceRef: string | null;
  readonly licence: string;
  readonly glosses: readonly { sourceLang: string; text: string; status: string }[];
}

export interface ShareAlikeExport {
  readonly lexemes: readonly ExportedLexeme[];
  readonly sentences: readonly ExportedSentence[];
  readonly sources: readonly { source: string; licence: string; lexemes: number }[];
}

const lower = (col: unknown) => sql`lower(${col})`;

/**
 * Every lexeme and sentence under a share-alike licence, with the glosses we
 * wrote for it. Audio is deliberately absent: recordings are ours or Forvo's,
 * under their own terms, and are not adaptations of the dictionary text.
 */
export function shareAlikeExport(db: Db): Promise<ShareAlikeExport> {
  return readShareAlikeExport(db, false);
}

/** Public downloads have no option to include unapproved content. */
export function publishedShareAlikeExport(db: Db): Promise<ShareAlikeExport> {
  return readShareAlikeExport(db, true);
}

async function readShareAlikeExport(db: Db, publishedOnly: boolean): Promise<ShareAlikeExport> {
  const licences = [...SHARE_ALIKE_LICENCES];

  const lexemeRows = await db
    .select({
      id: schema.lexemes.id,
      lemma: schema.lexemes.lemma,
      pos: schema.lexemes.pos,
      nounClass: schema.nounClasses.label,
      isPlural: schema.lexemes.isPlural,
      infinitive: schema.lexemes.infinitive,
      register: schema.lexemes.register,
      cefrBand: schema.lexemes.cefrBand,
      status: schema.lexemes.status,
      source: schema.lexemes.source,
      sourceRef: schema.lexemes.sourceRef,
      licence: schema.lexemes.licence,
      attribution: schema.lexemes.attribution,
    })
    .from(schema.lexemes)
    .leftJoin(schema.nounClasses, eq(schema.nounClasses.id, schema.lexemes.nounClassId))
    .where(
      and(
        inArray(lower(schema.lexemes.licence), licences),
        publishedOnly ? eq(schema.lexemes.status, "published") : undefined,
      ),
    )
    .orderBy(schema.lexemes.lemma);

  const ids = lexemeRows.map((r) => r.id);
  const glossRows =
    ids.length === 0
      ? []
      : await db
          .select({
            lexemeId: schema.glosses.lexemeId,
            sourceLang: schema.glosses.sourceLang,
            gloss: schema.glosses.gloss,
            usageNote: schema.glosses.usageNote,
            contrastiveNote: schema.glosses.contrastiveNote,
            status: schema.glosses.status,
          })
          .from(schema.glosses)
          .where(
            and(
              inArray(schema.glosses.lexemeId, ids),
              publishedOnly ? eq(schema.glosses.status, "published") : undefined,
            ),
          );

  const byLexeme = new Map<string, ExportedGloss[]>();
  for (const g of glossRows) {
    const list = byLexeme.get(g.lexemeId) ?? [];
    list.push({
      sourceLang: g.sourceLang,
      gloss: g.gloss,
      usageNote: g.usageNote,
      contrastiveNote: g.contrastiveNote,
      status: g.status,
    });
    byLexeme.set(g.lexemeId, list);
  }

  const sentenceRows = await db
    .select({
      id: schema.sentences.id,
      textXh: schema.sentences.textXh,
      status: schema.sentences.status,
      source: schema.sentences.source,
      sourceRef: schema.sentences.sourceRef,
      licence: schema.sentences.licence,
    })
    .from(schema.sentences)
    .where(
      and(
        inArray(lower(schema.sentences.licence), licences),
        publishedOnly ? eq(schema.sentences.status, "published") : undefined,
      ),
    )
    .orderBy(schema.sentences.textXh);

  const sentenceIds = sentenceRows.map((r) => r.id);
  const sentenceGlosses =
    sentenceIds.length === 0
      ? []
      : await db
          .select({
            sentenceId: schema.sentenceGlosses.sentenceId,
            sourceLang: schema.sentenceGlosses.sourceLang,
            text: schema.sentenceGlosses.gloss,
            status: schema.sentenceGlosses.status,
          })
          .from(schema.sentenceGlosses)
          .where(
            and(
              inArray(schema.sentenceGlosses.sentenceId, sentenceIds),
              publishedOnly ? eq(schema.sentenceGlosses.status, "published") : undefined,
            ),
          );

  const bySentence = new Map<string, { sourceLang: string; text: string; status: string }[]>();
  for (const g of sentenceGlosses) {
    const list = bySentence.get(g.sentenceId) ?? [];
    list.push({ sourceLang: g.sourceLang, text: g.text, status: g.status });
    bySentence.set(g.sentenceId, list);
  }

  const sources = new Map<string, { source: string; licence: string; lexemes: number }>();
  for (const r of lexemeRows) {
    const key = `${r.source}|${r.licence}`;
    const seen = sources.get(key) ?? { source: r.source, licence: r.licence, lexemes: 0 };
    seen.lexemes += 1;
    sources.set(key, seen);
  }

  return {
    lexemes: lexemeRows.map((r) => ({ ...r, glosses: byLexeme.get(r.id) ?? [] })),
    sentences: sentenceRows.map((r) => ({ ...r, glosses: bySentence.get(r.id) ?? [] })),
    sources: [...sources.values()].sort((a, b) => b.lexemes - a.lexemes),
  };
}
