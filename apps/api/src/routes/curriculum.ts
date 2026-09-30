/**
 * Curriculum editing (ARCHITECTURE section 7): units, skills, lessons and
 * exercises. Creation and patching only; every status change goes through
 * `/edit/transition`, and deletion is limited to rows that were never
 * published. Learners never read from here.
 */

import { effectValidator } from "@hono/effect-validator";
import {
  CreateExerciseRequest,
  CreateGrammarNoteRequest,
  CreateLessonRequest,
  CreateSkillRequest,
  CreateUnitRequest,
  CurriculumKindSchema,
  EXERCISE_TYPES,
  PatchExerciseRequest,
  PatchGrammarNoteRequest,
  PatchLessonRequest,
  PatchSkillRequest,
  PatchUnitRequest,
  SetGrammarCellsRequest,
  UpsertGrammarNoteBodyRequest,
  decodePayloadForType,
  type ExerciseType,
} from "@molo/core";
import { coursesRepo, editorRepo, schema } from "@molo/db";
import { eq, inArray } from "drizzle-orm";
import { Either, Schema } from "effect";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";
import { requireEditorial } from "../middleware.ts";
import { wasmMorph } from "../morph.ts";

function actorOf(c: { get: (k: "actor") => AppEnv["Variables"]["actor"] }) {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in" });
  return actor;
}

const DeleteParams = Schema.Struct({ kind: CurriculumKindSchema, id: Schema.UUID });

export const curriculumRoutes = new Hono<AppEnv>()
  .use("*", requireEditorial)

  /**
   * Every course the dashboard may work in, at every status, in curriculum
   * order, plus which one is the default. The selector starts on the
   * default, so no editor ever writes into a curriculum they did not pick.
   */
  .get("/courses", async (c) => {
    actorOf(c);
    const repo = coursesRepo(c.get("db"));
    const [courses, fallback] = await Promise.all([repo.listAll(), repo.defaultCourse()]);
    return c.json({ courses, defaultCourseId: fallback?.id ?? null });
  })

  /** The whole tree of one course, every status. Without `courseId`: every course. */
  .get("/curriculum", async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const courseId = c.req.query("courseId");
    return c.json({
      units: await repo.curriculumTree(courseId),
      exerciseTypes: EXERCISE_TYPES,
    });
  })

  // ---- grammar notes (docs/GRAMMAR.md) -------------------------------------

  /**
   * Every grammar note of one course, at every status, with both language
   * bodies and all its cells. This is the review surface: a note reaching an
   * editor as `ai_draft` carries a `caveat` saying what about the *claim*
   * they are being asked to validate, not only whether the English reads
   * well (docs/GRAMMAR.md section 4).
   */
  .get("/grammar-notes", async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const courseId = c.req.query("courseId");
    return c.json({ notes: await repo.grammarNoteTree(courseId) });
  })
  .post("/grammar-notes", effectValidator("json", CreateGrammarNoteRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const { origin, ...rest } = c.req.valid("json");
    const id = await repo.createGrammarNote({ ...rest, origin: origin ?? "human" });
    return c.json({ id }, 201);
  })
  .patch("/grammar-notes/:id", effectValidator("json", PatchGrammarNoteRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateGrammarNote(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })
  .put(
    "/grammar-notes/:id/body",
    effectValidator("json", UpsertGrammarNoteBodyRequest),
    async (c) => {
      const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
      const { origin, ...rest } = c.req.valid("json");
      const id = await repo.upsertGrammarNoteBody(c.req.param("id"), {
        ...rest,
        origin: origin ?? "human",
      });
      return c.json({ id });
    },
  )
  .put("/grammar-notes/:id/cells", effectValidator("json", SetGrammarCellsRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.setGrammarNoteCells(c.req.param("id"), c.req.valid("json").cells);
    return c.json({ ok: true });
  })

  .post("/units", effectValidator("json", CreateUnitRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createUnit(c.req.valid("json"));
    return c.json({ id }, 201);
  })
  .patch("/units/:id", effectValidator("json", PatchUnitRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateUnit(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })

  .post("/skills", effectValidator("json", CreateSkillRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createSkill(c.req.valid("json"));
    return c.json({ id }, 201);
  })
  .patch("/skills/:id", effectValidator("json", PatchSkillRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateSkill(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })

  .post("/lessons", effectValidator("json", CreateLessonRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createLesson(c.req.valid("json"));
    return c.json({ id }, 201);
  })
  .patch("/lessons/:id", effectValidator("json", PatchLessonRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateLesson(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })

  .post("/exercises", effectValidator("json", CreateExerciseRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    const id = await repo.createExercise(c.req.valid("json"));
    return c.json({ id }, 201);
  })
  /** One exercise with the lemmas its payload references, so the editor can show names, not ids. */
  .get("/exercises/:id", async (c) => {
    const db = c.get("db");
    actorOf(c);
    const [ex] = await db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, c.req.param("id")))
      .limit(1);
    if (!ex) throw new HTTPException(404, { message: "exercise not found" });
    const [lesson] = await db
      .select({
        id: schema.lessons.id,
        skillId: schema.lessons.skillId,
        order: schema.lessons.order,
      })
      .from(schema.lessons)
      .where(eq(schema.lessons.id, ex.lessonId))
      .limit(1);
    const [skill] = lesson
      ? await db
          .select({ id: schema.skills.id, slug: schema.skills.slug, unitId: schema.skills.unitId })
          .from(schema.skills)
          .where(eq(schema.skills.id, lesson.skillId))
          .limit(1)
      : [];
    const [unit] = skill
      ? await db
          .select({ id: schema.units.id, slug: schema.units.slug })
          .from(schema.units)
          .where(eq(schema.units.id, skill.unitId))
          .limit(1)
      : [];
    const lexemeRows =
      ex.lexemeIds.length > 0
        ? await db
            .select({
              id: schema.lexemes.id,
              lemma: schema.lexemes.lemma,
              pos: schema.lexemes.pos,
              status: schema.lexemes.status,
              gloss: schema.glosses.gloss,
            })
            .from(schema.lexemes)
            .leftJoin(schema.glosses, eq(schema.glosses.lexemeId, schema.lexemes.id))
            .where(inArray(schema.lexemes.id, ex.lexemeIds))
        : [];
    const lexemes: Record<
      string,
      { id: string; lemma: string; pos: string; status: string; gloss: string | null }
    > = {};
    for (const r of lexemeRows) {
      lexemes[r.id] ??= { id: r.id, lemma: r.lemma, pos: r.pos, status: r.status, gloss: r.gloss };
    }
    const sentenceRows =
      ex.sentenceIds.length > 0
        ? await db
            .select({
              id: schema.sentences.id,
              text: schema.sentences.textXh,
              status: schema.sentences.status,
            })
            .from(schema.sentences)
            .where(inArray(schema.sentences.id, ex.sentenceIds))
        : [];
    const revisions = await db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityId, ex.id))
      .orderBy(schema.contentRevisions.createdAt);
    return c.json({
      exercise: {
        id: ex.id,
        lessonId: ex.lessonId,
        order: ex.order,
        type: ex.type,
        payload: ex.payload,
        note: ex.note,
        status: ex.status,
        createdBy: ex.createdBy,
        updatedAt: ex.updatedAt.toISOString(),
      },
      context: { unit: unit ?? null, skill: skill ?? null, lesson: lesson ?? null },
      lexemes,
      sentences: Object.fromEntries(sentenceRows.map((s) => [s.id, s])),
      revisions: revisions.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        diff: r.diff,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })
  .patch("/exercises/:id", effectValidator("json", PatchExerciseRequest), async (c) => {
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.updateExercise(c.req.param("id"), c.req.valid("json"));
    return c.json({ ok: true });
  })
  /** Validates a payload without saving; the editor calls this as the form changes. */
  .post("/exercises/validate", async (c) => {
    actorOf(c);
    const body = (await c.req.json()) as { type?: ExerciseType; payload?: unknown };
    if (!body.type || !EXERCISE_TYPES.includes(body.type))
      return c.json({ ok: false, error: "unknown exercise type" });
    const decoded = decodePayloadForType(body.type, body.payload);
    return Either.isLeft(decoded)
      ? c.json({ ok: false, error: String(decoded.left) })
      : c.json({ ok: true });
  })

  .delete("/:kind/:id", async (c) => {
    const params = Schema.decodeUnknownEither(DeleteParams)({
      kind: c.req.param("kind"),
      id: c.req.param("id"),
    });
    if (Either.isLeft(params))
      throw new HTTPException(400, { message: "kind must be unit, skill, lesson or exercise" });
    const repo = editorRepo(c.get("db"), actorOf(c), { morph: wasmMorph });
    await repo.deleteDraft(params.right.kind, params.right.id);
    return c.json({ ok: true });
  });
