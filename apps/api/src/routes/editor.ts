import { effectValidator } from "@hono/effect-validator";
import { planAssist, runAssist } from "@molo/content/assist";
import {
  AssignReviewRequest,
  AudioUploadFields,
  AudioUploadResponse,
  BulkTransitionRequest,
  ContentNoteRequest,
  REVIEW_APPROVE_ORDER,
  ReviewApproveRequest,
  type ReviewApproveOutcome,
  type ReviewApproveResponse,
  BulkTransitionResponse,
  CLICK_SOUNDS,
  clickSoundById,
  CreateLexemeRequest,
  ExerciseReportsResponse,
  PENDING_STATUSES,
  PatchLexemeRequest,
  ResolveExerciseReportRequest,
  SOURCE_LANGUAGES,
  TransitionRequest,
  TransitionResponse,
  UpsertGlossRequest,
  CreateSpeakerRequest,
  morphGeneratorFor,
  type SourceLang,
} from "@molo/core";
import {
  contentReport,
  editorRepo,
  glossSuggestionsRepo,
  exerciseReportsRepo,
  schema,
  type EntityKind,
  type ReviewFilter,
  type Db,
} from "@molo/db";
import { and, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { Either, Schema } from "effect";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { audioBacklog } from "../audio-backlog.ts";
import type { AppEnv } from "../env.ts";
import { requireAdmin, requireEditorial } from "../middleware.ts";
import { previewForms, wasmMorph } from "../morph.ts";
import { publicAudioUrl, signAudioUrl } from "../signing.ts";

const encodeTransition = Schema.encodeSync(TransitionResponse);
const encodeBulkTransition = Schema.encodeSync(BulkTransitionResponse);
const encodeUpload = Schema.encodeSync(AudioUploadResponse);
const encodeReports = Schema.encodeSync(ExerciseReportsResponse);
const decodeUploadFields = Schema.decodeUnknownEither(AudioUploadFields);

function actorOf(c: { get: (k: "actor") => AppEnv["Variables"]["actor"] }) {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  return actor;
}

/**
 * Editorial routes, mounted at /edit. `requireEditorial` checks the role
 * here; `editorRepo` checks it again. Publishing goes through
 * `transitionEntity()` and nothing else.
 */
export const editorRoutes = new Hono<AppEnv>()
  .use("*", requireEditorial)

  // ---- content grid ---------------------------------------------------------
  .get("/lexemes", async (c) => {
    const db = c.get("db");
    const q = c.req.query("q")?.trim() ?? "";
    const status = c.req.query("status");
    const pos = c.req.query("pos");
    const cls = c.req.query("class");
    const missingGloss = c.req.query("missingGloss") as SourceLang | "all" | undefined;
    const missingAudio = c.req.query("missingAudio") === "1";
    /** The lexicon is per language, not per course: a course selector narrows to its language. */
    const targetLang = c.req.query("targetLang");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
    const conds = [];
    if (targetLang) conds.push(eq(schema.lexemes.targetLang, targetLang));
    if (q) conds.push(ilike(schema.lexemes.lemma, `%${q}%`));
    // `pending` is the landing page's word for the three statuses an editor
    // is still moving forward, so a figure there can link to exactly the
    // rows it counted (ARCHITECTURE section 7).
    if (status === "pending") conds.push(inArray(schema.lexemes.status, [...PENDING_STATUSES]));
    else if (status)
      conds.push(
        eq(schema.lexemes.status, status as (typeof schema.lexemes.$inferSelect)["status"]),
      );
    if (pos) conds.push(eq(schema.lexemes.pos, pos));
    if (cls) conds.push(eq(schema.nounClasses.label, cls));
    // Both filters mean what the publish gate means, so a count on the
    // landing page and the list it links to hold the same rows: a published
    // tier-1/2 asset, and a gloss a human owns (`ai_draft` is a suggestion,
    // not a gloss).
    if (missingAudio) {
      conds.push(
        sql`not exists (select 1 from audio_assets a where a.target_kind = 'lexeme' and a.target_id = ${schema.lexemes.id} and a.status = 'published' and a.tier in ('1_native_studio','2_native_forvo'))`,
      );
    }
    if (missingGloss === "all") {
      conds.push(
        sql`not exists (select 1 from glosses g where g.lexeme_id = ${schema.lexemes.id} and g.status in ('draft','in_review','published'))`,
      );
    } else if (missingGloss && (SOURCE_LANGUAGES as readonly string[]).includes(missingGloss)) {
      conds.push(
        sql`not exists (select 1 from glosses g where g.lexeme_id = ${schema.lexemes.id} and g.source_lang = ${missingGloss} and g.status in ('draft','in_review','published'))`,
      );
    }
    const rows = await db
      .select({
        id: schema.lexemes.id,
        lemma: schema.lexemes.lemma,
        pos: schema.lexemes.pos,
        nounClass: schema.nounClasses.label,
        isPlural: schema.lexemes.isPlural,
        status: schema.lexemes.status,
        register: schema.lexemes.register,
        cefrBand: schema.lexemes.cefrBand,
        frequencyRank: schema.lexemes.frequencyRank,
        source: schema.lexemes.source,
        licence: schema.lexemes.licence,
        updatedAt: schema.lexemes.updatedAt,
        glossLangs: sql<
          string[]
        >`coalesce(array_agg(distinct ${schema.glosses.sourceLang}) filter (where ${schema.glosses.id} is not null), '{}')`,
        audioCount: sql<number>`(select count(*)::int from audio_assets a where a.target_kind = 'lexeme' and a.target_id = ${schema.lexemes.id})`,
      })
      .from(schema.lexemes)
      .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
      .leftJoin(schema.glosses, eq(schema.glosses.lexemeId, schema.lexemes.id))
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(schema.lexemes.id, schema.nounClasses.label)
      .orderBy(sql`${schema.lexemes.frequencyRank} nulls last`, schema.lexemes.lemma)
      .limit(limit)
      .offset(offset);
    return c.json({ lexemes: rows, limit, offset });
  })

  .get("/lexemes/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const [lx] = await db
      .select({
        id: schema.lexemes.id,
        lemma: schema.lexemes.lemma,
        stem: schema.lexemes.stem,
        pos: schema.lexemes.pos,
        nounClass: schema.nounClasses.label,
        isPlural: schema.lexemes.isPlural,
        infinitive: schema.lexemes.infinitive,
        tonePattern: schema.lexemes.tonePattern,
        register: schema.lexemes.register,
        cefrBand: schema.lexemes.cefrBand,
        frequencyRank: schema.lexemes.frequencyRank,
        attribution: schema.lexemes.attribution,
        status: schema.lexemes.status,
        source: schema.lexemes.source,
        sourceRef: schema.lexemes.sourceRef,
        licence: schema.lexemes.licence,
        createdBy: schema.lexemes.createdBy,
        approvedBy: schema.lexemes.approvedBy,
        approvedAt: schema.lexemes.approvedAt,
        updatedAt: schema.lexemes.updatedAt,
      })
      .from(schema.lexemes)
      .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
      .where(eq(schema.lexemes.id, id))
      .limit(1);
    if (!lx) throw new HTTPException(404, { message: "lexeme not found" });
    const [glosses, links, audio, revisions, glossSuggestions] = await Promise.all([
      editorRepo(db, actorOf(c), { morph: wasmMorph }).reviewGlosses(id),
      db
        .select({
          kind: schema.lexemeLinks.kind,
          sourceKind: schema.lexemeLinks.sourceKind,
          toId: schema.lexemeLinks.toId,
          toLemma: schema.lexemes.lemma,
        })
        .from(schema.lexemeLinks)
        .innerJoin(schema.lexemes, eq(schema.lexemeLinks.toId, schema.lexemes.id))
        .where(eq(schema.lexemeLinks.fromId, id)),
      db
        .select()
        .from(schema.audioAssets)
        .where(
          and(eq(schema.audioAssets.targetKind, "lexeme"), eq(schema.audioAssets.targetId, id)),
        ),
      db
        .select()
        .from(schema.contentRevisions)
        .where(
          and(
            eq(schema.contentRevisions.entityKind, "lexeme"),
            eq(schema.contentRevisions.entityId, id),
          ),
        )
        .orderBy(desc(schema.contentRevisions.createdAt))
        .limit(50),
      glossSuggestionsRepo(db, actorOf(c)).forLexeme(id),
    ]);
    const audioWithUrls = await Promise.all(
      audio.map(async (a) => ({
        ...a,
        manifest: undefined,
        url:
          a.status === "published"
            ? publicAudioUrl(c.env.PUBLIC_AUDIO_BASE_URL, a.r2Key)
            : await signAudioUrl(
                c.env.AUDIO_SIGNING_SECRET,
                c.env.PUBLIC_AUDIO_BASE_URL,
                "private",
                a.r2Key,
              ),
      })),
    );
    return c.json({
      lexeme: lx,
      glosses,
      links,
      audio: audioWithUrls,
      revisions,
      glossSuggestions,
    });
  })

  // ---- lexeme writes --------------------------------------------------------
  .post("/lexemes", effectValidator("json", CreateLexemeRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createLexeme(c.req.valid("json"));
    return c.json({ id }, 201);
  })

  .patch("/lexemes/:id", effectValidator("json", PatchLexemeRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateLexeme(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })

  .put("/lexemes/:id/glosses/:lang", effectValidator("json", UpsertGlossRequest), async (c) => {
    const lang = c.req.param("lang");
    if (!(SOURCE_LANGUAGES as readonly string[]).includes(lang)) {
      throw new HTTPException(400, { message: `unknown source language ${lang}` });
    }
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.upsertGloss(c.req.param("id"), {
      ...c.req.valid("json"),
      sourceLang: lang as SourceLang,
    });
    return c.json({ id });
  })

  // ---- audio upload -> private R2 -> queue -----------------------------------
  .post("/audio", async (c) => {
    const actor = actorOf(c);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new HTTPException(400, { message: "multipart field `file` is required" });
    if (file.size > 100 * 1024 * 1024)
      throw new HTTPException(413, { message: "file larger than 100 MB" });
    const fields = decodeUploadFields({
      targetKind: form.get("targetKind"),
      targetId: form.get("targetId"),
      ...(form.get("speakerId") ? { speakerId: form.get("speakerId") } : {}),
      tier: form.get("tier"),
      licence: form.get("licence"),
    });
    if (Either.isLeft(fields)) throw new HTTPException(400, { message: String(fields.left) });
    const f = fields.right;
    if (f.tier === "1_native_studio" && !f.speakerId) {
      throw new HTTPException(400, {
        message: "tier-1 audio needs a speaker with consent on file",
      });
    }
    // A bare click has no row to point at: the id must be one of CLICK_SOUNDS,
    // and only a studio recording (tier 1) can stand for it.
    if (f.targetKind === "click") {
      if (!clickSoundById(f.targetId))
        throw new HTTPException(400, { message: "unknown click id" });
      if (f.tier !== "1_native_studio")
        throw new HTTPException(400, { message: "a bare click is recorded in the studio only" });
    }
    const jobId = crypto.randomUUID();
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "upload";
    const uploadKey = `incoming/${jobId}/${safeName}`;
    await c.env.R2_PRIVATE.put(uploadKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { uploadedBy: actor.id, targetKind: f.targetKind, targetId: f.targetId },
    });
    const message = {
      kind: "audio.process" as const,
      uploadKey,
      originalFilename: file.name,
      targetKind: f.targetKind,
      targetId: f.targetId,
      speakerId: f.speakerId ?? null,
      tier: f.tier,
      licence: f.licence,
      uploadedBy: actor.id,
      uploadedAt: new Date().toISOString(),
    };
    await c.env.AUDIO_QUEUE.send(message);
    return c.json(encodeUpload({ jobId, uploadKey, queued: true }), 202);
  })

  /**
   * Uploads still waiting for the audio worker, so the studio and the review
   * queue can say "3 recordings waiting to be processed" instead of looking
   * empty. Read from the queue's own metrics: no table, no bookkeeping.
   */
  .get("/audio/backlog", async (c) => c.json(await audioBacklog(c.env.AUDIO_QUEUE)))

  // ---- recording studio queue -----------------------------------------------
  /**
   * Everything a speaker could record next: lexemes and sentences that are
   * not retired and have no tier-1/2 audio yet, most-used first (rows that
   * appear in exercises before the rest, then by frequency). Items that do
   * have audio are included only with `missing=0`, so the studio can also
   * be used to re-record.
   */
  .get("/audio/queue", async (c) => {
    const db = c.get("db");
    const kind = c.req.query("kind") ?? "all";
    const onlyMissing = c.req.query("missing") !== "0";
    const limit = Math.min(Number(c.req.query("limit") ?? 500), 2000);
    const unitSlug = c.req.query("unit") ?? null;
    // With `speaker`, "missing" means "this speaker has not recorded it yet", so a
    // second voice can be collected for words that already have one.
    const speakerId = c.req.query("speaker") ?? null;
    const bySpeaker = speakerId ? sql` and a.speaker_id = ${speakerId}` : sql``;
    const tier12 = sql`(select count(*) from audio_assets a where a.target_kind = ${sql.raw("'lexeme'")} and a.target_id = ${schema.lexemes}.id and a.tier in ('1_native_studio','2_native_forvo') and a.status <> 'retired'${bySpeaker})`;
    const usage = sql<number>`(select count(*)::int from exercises e where e.status <> 'retired' and ${schema.lexemes}.id = any(e.lexeme_ids))`;
    const lexemeRows =
      kind === "sentence" || kind === "click"
        ? []
        : await db
            .select({
              id: schema.lexemes.id,
              text: schema.lexemes.lemma,
              status: schema.lexemes.status,
              frequencyRank: schema.lexemes.frequencyRank,
              usage,
              audioCount: sql<number>`${tier12}::int`,
              unitSlugs: sql<
                string[]
              >`array(select distinct u.slug from exercises e join lessons l on l.id = e.lesson_id join skills s on s.id = l.skill_id join units u on u.id = s.unit_id where e.status <> 'retired' and ${schema.lexemes}.id = any(e.lexeme_ids))`,
            })
            .from(schema.lexemes)
            .where(
              and(
                ne(schema.lexemes.status, "retired"),
                ...(onlyMissing ? [sql`${tier12} = 0`] : []),
                ...(unitSlug
                  ? [
                      sql`exists (select 1 from exercises e join lessons l on l.id = e.lesson_id join skills s on s.id = l.skill_id join units u on u.id = s.unit_id where u.slug = ${unitSlug} and ${schema.lexemes}.id = any(e.lexeme_ids))`,
                    ]
                  : []),
              ),
            )
            .orderBy(
              sql`${usage} desc`,
              sql`${schema.lexemes.frequencyRank} nulls last`,
              schema.lexemes.lemma,
            )
            .limit(limit);
    // A sentence a tutor wrote for a request belongs to that request's unit
    // before any exercise uses it (grammar_tags.skill is "unit/skill"), so a
    // Unit 1 session can record the sentences written for Unit 1.
    const requestUnit = sql`nullif(split_part(${schema.sentences.grammarTags}->>'skill', '/', 1), '')`;
    const sTier12 = sql`(select count(*) from audio_assets a where a.target_kind = ${sql.raw("'sentence'")} and a.target_id = ${schema.sentences}.id and a.tier in ('1_native_studio','2_native_forvo') and a.status <> 'retired'${bySpeaker})`;
    const sUsage = sql<number>`(select count(*)::int from exercises e where e.status <> 'retired' and ${schema.sentences}.id = any(e.sentence_ids))`;
    const sentenceRows =
      kind === "lexeme" || kind === "click"
        ? []
        : await db
            .select({
              id: schema.sentences.id,
              text: schema.sentences.textXh,
              status: schema.sentences.status,
              usage: sUsage,
              audioCount: sql<number>`${sTier12}::int`,
              unitSlugs: sql<
                string[]
              >`array(select distinct u.slug from exercises e join lessons l on l.id = e.lesson_id join skills s on s.id = l.skill_id join units u on u.id = s.unit_id where e.status <> 'retired' and ${schema.sentences}.id = any(e.sentence_ids) union select ${requestUnit} where ${requestUnit} is not null)`,
            })
            .from(schema.sentences)
            .where(
              and(
                ne(schema.sentences.status, "retired"),
                ...(onlyMissing ? [sql`${sTier12} = 0`] : []),
                ...(unitSlug
                  ? [
                      sql`(exists (select 1 from exercises e join lessons l on l.id = e.lesson_id join skills s on s.id = l.skill_id join units u on u.id = s.unit_id where u.slug = ${unitSlug} and ${schema.sentences}.id = any(e.sentence_ids)) or ${requestUnit} = ${unitSlug})`,
                    ]
                  : []),
              ),
            )
            .orderBy(sql`${sUsage} desc`, schema.sentences.textXh)
            .limit(limit);
    // Bare clicks are their own filter: `all` stays the words and phrases a
    // unit needs, so a Unit 1 session is not padded with fifteen clicks.
    const clickCounts =
      kind === "click"
        ? await db
            .select({
              id: schema.audioAssets.targetId,
              n: sql<number>`count(*)::int`,
            })
            .from(schema.audioAssets)
            .where(
              and(
                eq(schema.audioAssets.targetKind, "click"),
                eq(schema.audioAssets.tier, "1_native_studio"),
                ne(schema.audioAssets.status, "retired"),
                ...(speakerId ? [eq(schema.audioAssets.speakerId, speakerId)] : []),
              ),
            )
            .groupBy(schema.audioAssets.targetId)
        : [];
    const clickRows =
      kind === "click"
        ? CLICK_SOUNDS.filter(
            (s) => !onlyMissing || !clickCounts.some((r) => r.id === s.id && r.n > 0),
          )
        : [];
    const lexemeIds = lexemeRows.map((r) => r.id);
    const sentenceIds = sentenceRows.map((r) => r.id);
    const clickIds = clickRows.map((r) => r.id);
    const [lexGlosses, senGlosses, audio] = await Promise.all([
      lexemeIds.length
        ? db
            .select({
              id: schema.glosses.lexemeId,
              lang: schema.glosses.sourceLang,
              gloss: schema.glosses.gloss,
            })
            .from(schema.glosses)
            .where(inArray(schema.glosses.lexemeId, lexemeIds))
        : [],
      sentenceIds.length
        ? db
            .select({
              id: schema.sentenceGlosses.sentenceId,
              lang: schema.sentenceGlosses.sourceLang,
              gloss: schema.sentenceGlosses.gloss,
            })
            .from(schema.sentenceGlosses)
            .where(inArray(schema.sentenceGlosses.sentenceId, sentenceIds))
        : [],
      lexemeIds.length + sentenceIds.length + clickIds.length
        ? db
            .select({
              id: schema.audioAssets.id,
              targetId: schema.audioAssets.targetId,
              tier: schema.audioAssets.tier,
              status: schema.audioAssets.status,
              r2Key: schema.audioAssets.r2Key,
              speakerId: schema.audioAssets.speakerId,
              speakerName: schema.speakers.displayName,
              createdBy: schema.audioAssets.createdBy,
            })
            .from(schema.audioAssets)
            .leftJoin(schema.speakers, eq(schema.speakers.id, schema.audioAssets.speakerId))
            .where(
              and(
                inArray(schema.audioAssets.targetId, [...lexemeIds, ...sentenceIds, ...clickIds]),
                ne(schema.audioAssets.status, "retired"),
              ),
            )
        : [],
    ]);
    const glossOf = (rows: { id: string; lang: string; gloss: string }[], id: string) => ({
      en: rows.find((g) => g.id === id && g.lang === "en")?.gloss ?? null,
      nb: rows.find((g) => g.id === id && g.lang === "nb")?.gloss ?? null,
    });
    const audioFor = (id: string) =>
      Promise.all(
        audio
          .filter((a) => a.targetId === id)
          .map(async (a) => ({
            id: a.id,
            tier: a.tier,
            status: a.status,
            speakerId: a.speakerId,
            speakerName: a.speakerName,
            createdBy: a.createdBy,
            url:
              a.status === "published"
                ? publicAudioUrl(c.env.PUBLIC_AUDIO_BASE_URL, a.r2Key)
                : await signAudioUrl(
                    c.env.AUDIO_SIGNING_SECRET,
                    c.env.PUBLIC_AUDIO_BASE_URL,
                    "private",
                    a.r2Key,
                  ),
          })),
      );
    const items = [
      ...(await Promise.all(
        lexemeRows.map(async (r) => ({
          kind: "lexeme" as const,
          id: r.id,
          text: r.text,
          gloss: glossOf(lexGlosses, r.id),
          status: r.status,
          usage: r.usage,
          unitSlugs: r.unitSlugs,
          audio: await audioFor(r.id),
        })),
      )),
      ...(await Promise.all(
        sentenceRows.map(async (r) => ({
          kind: "sentence" as const,
          id: r.id,
          text: r.text,
          gloss: glossOf(senGlosses, r.id),
          status: r.status,
          usage: r.usage,
          unitSlugs: r.unitSlugs,
          audio: await audioFor(r.id),
        })),
      )),
    ].sort((a, b) => b.usage - a.usage);
    // Clicks keep the drills' fixed order (plain, aspirated, nasal, voiced, voiced nasal).
    const clickItems = await Promise.all(
      clickRows.map(async (s) => ({
        kind: "click" as const,
        id: s.id,
        text: s.letter,
        click: { base: s.base, variant: s.variant },
        gloss: { en: null, nb: null },
        status: "draft",
        usage: 0,
        unitSlugs: [] as string[],
        audio: await audioFor(s.id),
      })),
    );
    const all = [...items, ...clickItems];
    // The units the items name, with their title keys, so the studios' unit
    // menus can show "Say hello and say who you are" rather than a slug (MOL-67).
    // Every unit of their course comes back, with its order, so a menu numbers
    // a unit as the path does even when an earlier one has nothing left.
    const slugs = [...new Set(all.flatMap((i) => i.unitSlugs))];
    const units = slugs.length
      ? await db
          .select({
            slug: schema.units.slug,
            titleKey: schema.units.titleKey,
            order: schema.units.order,
            status: schema.units.status,
          })
          .from(schema.units)
          .where(
            inArray(
              schema.units.courseId,
              db
                .select({ id: schema.units.courseId })
                .from(schema.units)
                .where(inArray(schema.units.slug, slugs)),
            ),
          )
          .orderBy(schema.units.order, schema.units.slug)
      : [];
    return c.json({ items: all, total: all.length, units });
  })

  /**
   * Deletes a take that never reached a learner (a test, a false start), and
   * its file. Published audio is retired, never deleted; the repository
   * refuses it, and anyone but the uploader or an admin.
   */
  .delete("/audio/:id", async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const { r2Key } = await repo.discardAudio(c.req.param("id"));
    // The row is gone either way; a file that lingers is private and orphaned.
    await c.env.R2_PRIVATE.delete(r2Key).catch(() => undefined);
    return c.json({ ok: true });
  })

  // ---- notes on words and sentences -----------------------------------------
  /** A note on a word or sentence at any status; it lands in the row's history. */
  .post("/notes", effectValidator("json", ContentNoteRequest), async (c) => {
    const req = c.req.valid("json");
    await editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph }).addNote(req);
    return c.json({ ok: true }, 201);
  })
  /** The latest notes, newest first, for the editor landing page. */
  .get("/notes", async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    const notes = await editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph }).recentNotes(
      Number.isFinite(limit) ? limit : 20,
    );
    return c.json({ notes });
  })

  // ---- the status spine ----------------------------------------------------
  .post("/transition", effectValidator("json", TransitionRequest), async (c) => {
    const req = c.req.valid("json");
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const note = req.note;
    const result = await repo.transitionEntity({
      kind: req.kind as EntityKind,
      id: req.id,
      to: req.to,
      ...(note !== undefined ? { note } : {}),
    });
    if (result.ok && req.kind === "audio_asset" && req.to === "published")
      await copyPublishedAudio(c.get("db"), c.env, req.id);
    return c.json(encodeTransition(result), result.ok ? 200 : 409);
  })

  /**
   * The review queue's "Approve and publish selected". Rows are ordered so
   * what a row depends on goes first (REVIEW_APPROVE_ORDER), then each goes
   * through `transitionEntity()` exactly as a single approval does: the edge,
   * the publish gate and the four-eyes rule (with its admin exception) apply
   * per row, and a blocked row never carries the others through. One at a
   * time, so a large batch is a steady trickle on the database, not a burst.
   */
  .post("/review-queue/approve", effectValidator("json", ReviewApproveRequest), async (c) => {
    const { items } = c.req.valid("json");
    const rank = new Map<string, number>(REVIEW_APPROVE_ORDER.map((k, i) => [k, i]));
    const ordered = [...items].sort((a, b) => (rank.get(a.kind) ?? 99) - (rank.get(b.kind) ?? 99));
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const results: ReviewApproveOutcome[] = [];
    const seen = new Set<string>();
    for (const item of ordered) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const r = await repo.transitionEntity({
          kind: item.kind as EntityKind,
          id: item.id,
          to: "published",
        });
        if (r.ok && item.kind === "audio_asset")
          await copyPublishedAudio(c.get("db"), c.env, item.id);
        results.push(
          r.ok
            ? { kind: item.kind, id: item.id, ok: true }
            : { kind: item.kind, id: item.id, ok: false, reason: r.reason },
        );
      } catch (e) {
        results.push({
          kind: item.kind,
          id: item.id,
          ok: false,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const published = results.filter((r) => r.ok).length;
    return c.json({
      results,
      published,
      blocked: results.length - published,
    } satisfies ReviewApproveResponse);
  })

  /**
   * The grid's bulk action. Each id goes through `transitionEntity()`, the
   * same function a single row uses, so the edges, the four-eyes rule, the
   * note requirement and the publish gate all apply per row and one blocked
   * row never carries the others through. `ai_draft → published` is refused
   * here exactly as it is refused per row.
   */
  .post("/lexemes/transition", effectValidator("json", BulkTransitionRequest), async (c) => {
    const body = c.req.valid("json");
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const results = await repo.transitionMany({
      kind: "lexeme",
      ids: body.ids,
      to: body.to,
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    const applied = results.filter((r) => r.ok).length;
    // Always 200: a batch is a report, not one outcome. `blocked` and each
    // row's reason carry the failures, so none of them can be lost to a
    // status code the client turns into a single error.
    return c.json(encodeBulkTransition({ results, applied, blocked: results.length - applied }));
  })

  .get("/publish-check/:kind/:id", async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const gate = await repo.publishCheck(c.req.param("kind") as EntityKind, c.req.param("id"));
    return c.json(gate);
  })

  // ---- LLM assist: ai_draft glosses (ARCHITECTURE section 7) ----------------
  /**
   * Drafts en/nb glosses and notes for one lexeme. Saves only languages with
   * no gloss yet, always as ai_draft. `?dryRun=1` returns the request that
   * would be sent. Without ANTHROPIC_API_KEY the endpoint answers 503.
   */
  .post("/lexemes/:id/assist", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const [lx] = await db
      .select({
        lemma: schema.lexemes.lemma,
        pos: schema.lexemes.pos,
        infinitive: schema.lexemes.infinitive,
        register: schema.lexemes.register,
        nounClass: schema.nounClasses.label,
      })
      .from(schema.lexemes)
      .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
      .where(eq(schema.lexemes.id, id))
      .limit(1);
    if (!lx) throw new HTTPException(404, { message: "lexeme not found" });
    const existingGlosses = await db
      .select()
      .from(schema.glosses)
      .where(eq(schema.glosses.lexemeId, id));
    const humanLangs = existingGlosses
      .filter((g) => g.status !== "ai_draft")
      .map((g) => g.sourceLang);
    const sourceEn = existingGlosses.find((g) => g.sourceLang === "en" && g.status !== "ai_draft");
    const req = planAssist({
      lemma: lx.lemma,
      pos: lx.pos,
      nounClass: lx.nounClass,
      infinitive: lx.infinitive,
      register: lx.register,
      sourceGlossEn: sourceEn?.gloss ?? null,
      sourceNote: sourceEn?.usageNote ?? null,
      examples: [],
      existing: humanLangs,
    });
    if (c.req.query("dryRun") === "1") return c.json({ dryRun: true, request: req });
    if (!c.env.ANTHROPIC_API_KEY) {
      throw new HTTPException(503, {
        message: "LLM assist is not configured (ANTHROPIC_API_KEY); dryRun=1 shows the request",
      });
    }
    const result = await runAssist(c.env.ANTHROPIC_API_KEY, req);
    if (!result.ok) throw new HTTPException(502, { message: result.reason });
    const repo = editorRepo(db, actorOf(c), { morph: wasmMorph });
    const saved: string[] = [];
    for (const lang of ["en", "nb"] as const) {
      if (humanLangs.includes(lang)) continue;
      const d = result.draft[lang];
      if (!d.gloss.trim()) continue;
      await repo.upsertGloss(id, {
        sourceLang: lang,
        gloss: d.gloss,
        usageNote: d.usage_note || null,
        contrastiveNote: d.contrastive_note || null,
        origin: "llm",
      });
      saved.push(lang);
    }
    return c.json({ draft: result.draft, saved, usage: result.usage, model: req.model });
  })

  // ---- xh-morph live preview (ARCHITECTURE section 7) ------------------------
  .get("/lexemes/:id/morph", async (c) => {
    const [lx] = await c
      .get("db")
      .select({
        targetLang: schema.lexemes.targetLang,
        lemma: schema.lexemes.lemma,
        pos: schema.lexemes.pos,
        nounClass: schema.nounClasses.label,
      })
      .from(schema.lexemes)
      .leftJoin(schema.nounClasses, eq(schema.lexemes.nounClassId, schema.nounClasses.id))
      .where(eq(schema.lexemes.id, c.req.param("id")))
      .limit(1);
    if (!lx) throw new HTTPException(404, { message: "lexeme not found" });
    // xh-morph is isiXhosa's generator; it is never run over another language.
    if (morphGeneratorFor(lx.targetLang) === null)
      return c.json({ applicable: false, reason: `no generator for ${lx.targetLang}` });
    if (lx.pos !== "noun" || !lx.nounClass)
      return c.json({ applicable: false, reason: "not a noun with a class" });
    return c.json({ applicable: true, ...previewForms(lx.lemma, lx.nounClass) });
  })

  // ---- the landing page's one round trip ------------------------------------
  /**
   * Everything `/edit` shows when an editor sits down: the same
   * `contentReport` the Monday Slack post and `molo content report` use,
   * with the writing, recording and publish-gate gaps on it
   * (ARCHITECTURE section 7). One request, so the page opens as fast as it
   * is worth opening every morning.
   *
   * `wasmMorph` is handed in so the `plural_not_generable` figure is the
   * generator's real answer rather than a proxy, exactly as
   * `transitionEntity` would answer for the same rows.
   */
  .get("/overview", async (c) => {
    const report = await contentReport(c.get("db"), new Date(), { morph: wasmMorph });
    return c.json(report);
  })

  // ---- speakers (consent records: admin creates, editors read) --------------
  .get("/speakers", async (c) => {
    const rows = await c
      .get("db")
      .select({
        id: schema.speakers.id,
        displayName: schema.speakers.displayName,
        region: schema.speakers.region,
        dialectNote: schema.speakers.dialectNote,
        gender: schema.speakers.gender,
        ageGroup: schema.speakers.ageGroup,
        consentRecordedAt: schema.speakers.consentRecordedAt,
        consentScope: schema.speakers.consentScope,
      })
      .from(schema.speakers)
      .orderBy(schema.speakers.displayName);
    return c.json({ speakers: rows });
  })

  .post("/speakers", requireAdmin, effectValidator("json", CreateSpeakerRequest), async (c) => {
    const body = c.req.valid("json");
    const [row] = await c
      .get("db")
      .insert(schema.speakers)
      .values({
        displayName: body.displayName,
        region: body.region ?? null,
        dialectNote: body.dialectNote ?? null,
        gender: body.gender ?? null,
        ageGroup: body.ageGroup ?? null,
        consentScope: body.consentScope,
        consentRecordedAt: new Date(),
        consentDocumentKey: body.consentDocumentKey ?? null,
      })
      .returning({ id: schema.speakers.id });
    if (!row) throw new HTTPException(500, { message: "insert failed" });
    return c.json({ id: row.id }, 201);
  })

  /** `?filter=mine|unassigned|all` (default `all`). Never widens past `in_review`. */
  .get("/review-queue", async (c) => {
    const raw = c.req.query("filter");
    const filter: ReviewFilter =
      raw === "mine" || raw === "unassigned" || raw === "all" ? raw : "all";
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const rows = await repo.reviewQueue({ filter });
    // A take in review is played from the private bucket, through a signed link.
    const items = await Promise.all(
      rows.map(async ({ audio, ...r }) => {
        if (!audio) return { ...r, audio: null };
        const { r2Key, ...rest } = audio;
        const url = await signAudioUrl(
          c.env.AUDIO_SIGNING_SECRET,
          c.env.PUBLIC_AUDIO_BASE_URL,
          "private",
          r2Key,
        );
        return { ...r, audio: { ...rest, url } };
      }),
    );
    return c.json({ items, filter });
  })

  /** Claim, release (`assignedTo: null`) or — admin only — hand an item over. */
  .post("/review-queue/assign", effectValidator("json", AssignReviewRequest), async (c) => {
    const body = c.req.valid("json");
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const state = await repo.assignReview({
      kind: body.kind as EntityKind,
      id: body.id,
      assignedTo: body.assignedTo,
    });
    return c.json(state);
  })

  /**
   * What learners have reported from inside a lesson. Reads only; acting on
   * a report is an ordinary edit and an ordinary transition, with the same
   * four eyes. `?open=false` includes the ones already looked at.
   */
  .get("/reports", async (c) => {
    const repo = exerciseReportsRepo(c.get("db"));
    const open = c.req.query("open") !== "false";
    const [reports, openCount] = await Promise.all([repo.list({ open }), repo.openCount()]);
    return c.json(
      encodeReports({
        reports: reports.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        })),
        openCount,
      }),
    );
  })

  /** Mark a report looked at, or put it back. Never touches the exercise. */
  .post(
    "/reports/:id/resolve",
    effectValidator("json", ResolveExerciseReportRequest),
    async (c) => {
      const actor = actorOf(c);
      await exerciseReportsRepo(c.get("db")).resolve(
        actor.id,
        c.req.param("id"),
        c.req.valid("json").resolved,
      );
      return c.json({ ok: true });
    },
  )

  /** Who an item can be handed to. Editors read it to see names; admins to assign. */
  .get("/editors", async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    return c.json({ editors: await repo.editorialUsers() });
  });

/** Published audio is served from the public bucket (ARCHITECTURE section 5). */
async function copyPublishedAudio(
  db: Db,
  env: { R2_PRIVATE: R2Bucket; R2_PUBLIC: R2Bucket },
  id: string,
): Promise<void> {
  const [asset] = await db
    .select({ r2Key: schema.audioAssets.r2Key })
    .from(schema.audioAssets)
    .where(eq(schema.audioAssets.id, id))
    .limit(1);
  if (!asset) return;
  const obj = await env.R2_PRIVATE.get(asset.r2Key);
  if (obj)
    await env.R2_PUBLIC.put(
      asset.r2Key,
      obj.body,
      obj.httpMetadata ? { httpMetadata: obj.httpMetadata } : {},
    );
}
