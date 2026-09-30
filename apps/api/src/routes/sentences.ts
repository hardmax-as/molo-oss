/**
 * Sentence builder (ARCHITECTURE section 7), mounted under /edit.
 *
 * A sentence is assembled from lexemes the lexicon already has. The text is
 * stored exactly as the editor typed it and every token's surface form is
 * checked against xh-morph on every write and read; `morph_verified` is
 * computed here, never accepted from a client. Publishing goes through the
 * generic /edit/transition route and the sentence gate in @molo/core.
 */

import { effectValidator } from "@hono/effect-validator";
import {
  CreateSentenceRequest,
  PENDING_STATUSES,
  PatchSentenceRequest,
  SOURCE_LANGUAGES,
  SentenceTokensRequest,
  UpsertSentenceGlossRequest,
  morphGeneratorFor,
  type SourceLang,
  type TokenVerification,
} from "@molo/core";
import { editorRepo, schema, type Db } from "@molo/db";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";
import { requireEditorial } from "../middleware.ts";
import { previewForms, wasmMorph } from "../morph.ts";
import { signAudioUrl } from "../signing.ts";
import { checkToken, isVerified } from "../verify.ts";

function actorOf(c: { get: (k: "actor") => AppEnv["Variables"]["actor"] }) {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  return actor;
}

interface TokenDraft {
  readonly lexemeId: string;
  readonly surfaceForm: string;
}

/**
 * Runs the token's language generator over each lexeme and compares;
 * unknown lexeme ids are a client error. isiXhosa maps to xh-morph; a
 * language with no generator gets no generated form to compare against, so
 * every token comes back `unverified` and the editor has to mark it
 * irregular with a note (ARCHITECTURE section 2.6).
 */
export async function verifyTokens(
  db: Db,
  tokens: readonly TokenDraft[],
): Promise<TokenVerification[]> {
  const ids = [...new Set(tokens.map((t) => t.lexemeId))];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: schema.lexemes.id,
      targetLang: schema.lexemes.targetLang,
      lemma: schema.lexemes.lemma,
      pos: schema.lexemes.pos,
      nounClass: schema.nounClasses.label,
    })
    .from(schema.lexemes)
    .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
    .where(inArray(schema.lexemes.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return tokens.map((t, position) => {
    const lx = byId.get(t.lexemeId);
    if (!lx) throw new HTTPException(400, { message: `unknown lexeme ${t.lexemeId}` });
    let generatedPlural: string | null = null;
    let classValidated = false;
    if (morphGeneratorFor(lx.targetLang) !== null && lx.pos === "noun" && lx.nounClass) {
      const preview = previewForms(lx.lemma, lx.nounClass);
      classValidated = preview.validated;
      generatedPlural = preview.forms.find((f) => f.form === "plural")?.surface ?? null;
    }
    return checkToken({
      position,
      lexemeId: t.lexemeId,
      surfaceForm: t.surfaceForm,
      lemma: lx.lemma,
      pos: lx.pos,
      nounClass: lx.nounClass,
      generatedPlural,
      classValidated,
    });
  });
}

export const sentenceRoutes = new Hono<AppEnv>()
  .use("*", requireEditorial)

  // ---- list -----------------------------------------------------------------
  .get("/sentences", async (c) => {
    const db = c.get("db");
    const q = c.req.query("q")?.trim() ?? "";
    const status = c.req.query("status");
    const missingGloss = c.req.query("missingGloss") as SourceLang | "any" | undefined;
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
    const conds = [];
    if (q) conds.push(ilike(schema.sentences.textXh, `%${q}%`));
    // `pending`: the three statuses the landing page counts, so a figure
    // there links to exactly the rows behind it.
    if (status === "pending") {
      conds.push(inArray(schema.sentences.status, [...PENDING_STATUSES]));
    } else if (status) {
      conds.push(
        eq(schema.sentences.status, status as (typeof schema.sentences.$inferSelect)["status"]),
      );
    }
    // The gate's definition of a translation: one a human owns, in every
    // source language. `any` is "short of at least one of them".
    if (missingGloss === "any") {
      conds.push(
        sql`exists (select 1 from languages lang where lang.is_source and not exists (
          select 1 from sentence_glosses g where g.sentence_id = ${schema.sentences}.id
            and g.source_lang::text = lang.code and g.status in ('draft','in_review','published')))`,
      );
    } else if (missingGloss && (SOURCE_LANGUAGES as readonly string[]).includes(missingGloss)) {
      conds.push(
        sql`not exists (select 1 from sentence_glosses g where g.sentence_id = ${schema.sentences}.id and g.source_lang = ${missingGloss} and g.status in ('draft','in_review','published'))`,
      );
    }
    const rows = await db
      .select({
        id: schema.sentences.id,
        textXh: schema.sentences.textXh,
        status: schema.sentences.status,
        register: schema.sentences.register,
        cefrBand: schema.sentences.cefrBand,
        source: schema.sentences.source,
        licence: schema.sentences.licence,
        updatedAt: schema.sentences.updatedAt,
        tokenCount: sql<number>`(select count(*)::int from sentence_lexemes t where t.sentence_id = ${schema.sentences}.id)`,
        verifiedCount: sql<number>`(select count(*)::int from sentence_lexemes t where t.sentence_id = ${schema.sentences}.id and (t.morph_verified or (t.irregular and coalesce(t.irregular_note, '') <> '')))`,
        glossLangs: sql<
          string[]
        >`coalesce((select array_agg(g.source_lang order by g.source_lang) from sentence_glosses g where g.sentence_id = ${schema.sentences}.id), '{}')`,
        audioCount: sql<number>`(select count(*)::int from audio_assets a where a.target_kind = 'sentence' and a.target_id = ${schema.sentences}.id)`,
      })
      .from(schema.sentences)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.sentences.updatedAt))
      .limit(limit)
      .offset(offset);
    return c.json({ sentences: rows, limit, offset });
  })

  // ---- verification without saving -----------------------------------------
  .post("/sentences/verify", effectValidator("json", SentenceTokensRequest), async (c) => {
    const { tokens } = c.req.valid("json");
    return c.json({ tokens: await verifyTokens(c.get("db"), tokens) });
  })

  // ---- detail ---------------------------------------------------------------
  .get("/sentences/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const [sentence] = await db
      .select()
      .from(schema.sentences)
      .where(eq(schema.sentences.id, id))
      .limit(1);
    if (!sentence) throw new HTTPException(404, { message: "sentence not found" });
    const [tokenRows, glosses, audio, revisions] = await Promise.all([
      db
        .select({
          id: schema.sentenceLexemes.id,
          position: schema.sentenceLexemes.position,
          lexemeId: schema.sentenceLexemes.lexemeId,
          surfaceForm: schema.sentenceLexemes.surfaceForm,
          morphVerified: schema.sentenceLexemes.morphVerified,
          irregular: schema.sentenceLexemes.irregular,
          irregularNote: schema.sentenceLexemes.irregularNote,
          lemma: schema.lexemes.lemma,
          pos: schema.lexemes.pos,
          nounClass: schema.nounClasses.label,
          lexemeStatus: schema.lexemes.status,
        })
        .from(schema.sentenceLexemes)
        .innerJoin(schema.lexemes, eq(schema.sentenceLexemes.lexemeId, schema.lexemes.id))
        .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
        .where(eq(schema.sentenceLexemes.sentenceId, id))
        .orderBy(asc(schema.sentenceLexemes.position)),
      db.select().from(schema.sentenceGlosses).where(eq(schema.sentenceGlosses.sentenceId, id)),
      db
        .select()
        .from(schema.audioAssets)
        .where(
          and(eq(schema.audioAssets.targetKind, "sentence"), eq(schema.audioAssets.targetId, id)),
        ),
      db
        .select()
        .from(schema.contentRevisions)
        .where(
          and(
            eq(schema.contentRevisions.entityKind, "sentence"),
            eq(schema.contentRevisions.entityId, id),
          ),
        )
        .orderBy(desc(schema.contentRevisions.createdAt))
        .limit(50),
    ]);
    // Re-check on read so a rule-table change shows up without a re-save.
    const verification = await verifyTokens(db, tokenRows);
    const tokens = tokenRows.map((t, i) => ({ ...t, verification: verification[i] ?? null }));
    const audioWithUrls = await Promise.all(
      audio.map(async (a) => ({
        ...a,
        manifest: undefined,
        url: await signAudioUrl(
          c.env.AUDIO_SIGNING_SECRET,
          c.env.PUBLIC_AUDIO_BASE_URL,
          a.status === "published" ? "public" : "private",
          a.r2Key,
        ),
      })),
    );
    return c.json({ sentence, tokens, glosses, audio: audioWithUrls, revisions });
  })

  // ---- writes ---------------------------------------------------------------
  .post("/sentences", effectValidator("json", CreateSentenceRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createSentence(c.req.valid("json"));
    return c.json({ id }, 201);
  })

  .patch("/sentences/:id", effectValidator("json", PatchSentenceRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateSentence(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })

  /** Replaces the token list; `morphVerified` is xh-morph's verdict, computed here. */
  .put("/sentences/:id/tokens", effectValidator("json", SentenceTokensRequest), async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const { tokens } = c.req.valid("json");
    const verification = await verifyTokens(db, tokens);
    const repo = editorRepo(db, actorOf(c), { morph: wasmMorph });
    await repo.setSentenceTokens(
      id,
      tokens.map((t, position) => ({
        position,
        lexemeId: t.lexemeId,
        surfaceForm: t.surfaceForm.trim(),
        morphVerified: isVerified(verification[position]!),
        irregular: t.irregular ?? false,
        irregularNote: t.irregularNote ?? null,
      })),
    );
    return c.json({ tokens: verification });
  })

  .put(
    "/sentences/:id/glosses/:lang",
    effectValidator("json", UpsertSentenceGlossRequest),
    async (c) => {
      const lang = c.req.param("lang");
      if (!(SOURCE_LANGUAGES as readonly string[]).includes(lang)) {
        throw new HTTPException(400, { message: `unknown source language ${lang}` });
      }
      const body = c.req.valid("json");
      const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
      const glossId = await repo.upsertSentenceGloss(c.req.param("id"), {
        sourceLang: lang as SourceLang,
        gloss: body.gloss,
        literalGloss: body.literalGloss ?? null,
        origin: body.origin,
      });
      return c.json({ id: glossId });
    },
  );
