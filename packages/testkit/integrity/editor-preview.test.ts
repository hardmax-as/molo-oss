import type { Actor, PreviewUnitResponse } from "@molo/core";
import { editorPreviewRepo, schema, type Db } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  defaultCourse,
  editorA,
  editorRepo,
  harness,
  learner,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
// Keep the Worker's globals in the API typecheck and Node/Bun globals here.
// The harness itself is checked by apps/api; only its HTTP boundary crosses.
const apiHarnessModule = "../../../apps/api/src/test/preview-harness.ts";
const {
  previewTestApp,
}: {
  previewTestApp: (
    db: Db,
    actor: Actor,
  ) => { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
} = await import(apiHarnessModule);
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => h?.close());

function appFor(actor: Actor) {
  return previewTestApp(h.db, actor);
}

async function fixture() {
  const course = await defaultCourse(h.db);
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const unitId = await repo.createUnit({
    courseId: course.id,
    slug: "zz-preview",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-preview-skill",
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1 });
  const ids: string[] = [];
  for (const lemma of ["zz-preview-one", "zz-preview-two"]) {
    const id = await repo.createLexeme({
      lemma,
      pos: "noun",
      nounClassLabel: "13",
      source: "fixture",
      licence: "CC-BY-SA-4.0",
      origin: "llm",
    });
    await repo.upsertGloss(id, { sourceLang: "en", gloss: "fixture draft gloss", origin: "llm" });
    ids.push(id);
  }
  const exerciseId = await repo.createExercise({
    lessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: ids[0]! },
      options: [
        { lexemeId: ids[0]!, correct: true },
        { lexemeId: ids[1]!, correct: false },
      ],
    },
  });
  return { unitId, skillId, lessonId, exerciseId, ids };
}

describe("editor preview is never a learner surface", () => {
  it.each(["/path", "/units", "/units/zz-preview"])(
    "every preview endpoint refuses a learner: %s",
    async (path) => {
      await fixture();
      const response = await appFor(learner).request(`/edit/preview${path}`, {
        headers: { "X-Molo-Preview": "1" },
      });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("zz-preview-one");
    },
  );

  it("the repository independently refuses a learner", () => {
    expect(() => editorPreviewRepo(h.db, learner)).toThrow(/no editorial role/);
  });

  it("hydrates editor drafts with statuses and honest missing audio", async () => {
    const ids = await fixture();
    const response = await appFor(editorA).request("/edit/preview/units/zz-preview", {});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as PreviewUnitResponse;
    expect(body.unit.status).toBe("draft");
    expect(body.unit.skills[0]?.lessons[0]?.status).toBe("draft");
    expect(body.unit.skills[0]?.lessons[0]?.exercises[0]?.status).toBe("draft");
    expect(body.lexemes[ids.ids[0]!]?.gloss?.gloss).toBe("fixture draft gloss");
    expect(body.lexemes[ids.ids[0]!]?.audio).toBeNull();
    expect(body.audioAssets).toEqual({});
    for (const path of ["/edit/preview/path", "/edit/preview/units"]) {
      const result = await appFor(editorA).request(path, {});
      expect(result.status).toBe(200);
      expect(await result.text()).toContain(ids.unitId);
    }
  });

  it("never exposes a draft through learner endpoints even with a fabricated opt-in", async () => {
    const ids = await fixture();
    for (const path of ["/path", "/units", "/units/zz-preview"]) {
      const response = await appFor(learner).request(`${path}?preview=1`, {
        headers: { "X-Molo-Preview": "1" },
      });
      expect(response.status).toBe(path.endsWith("zz-preview") ? 404 : 200);
      const text = await response.text();
      expect(text).not.toContain(ids.unitId);
      expect(text).not.toContain("zz-preview-one");
      expect(text).not.toContain("fixture draft gloss");
    }
  });

  it("retired rows and children of retired parents stay out of preview", async () => {
    const ids = await fixture();
    await h.db
      .update(schema.exercises)
      .set({ status: "retired" })
      .where(eq(schema.exercises.id, ids.exerciseId));
    const before = await editorPreviewRepo(h.db, editorA).unit(
      "zz-preview",
      (await defaultCourse(h.db)).id,
      "en",
    );
    expect(before?.unit.skills[0]?.lessons[0]?.exercises).toEqual([]);
    await h.db
      .update(schema.units)
      .set({ status: "retired" })
      .where(eq(schema.units.id, ids.unitId));
    expect(await editorPreviewRepo(h.db, editorA).tree((await defaultCourse(h.db)).id)).toEqual([]);
  });

  it.each([
    "/me/lessons/id/complete",
    "/me/review",
    "/me/hearts/consume",
    "/me/progress/import",
    "/me/skills/id/chest",
  ])("refuses flagged progress writes before any handler: %s", async (path) => {
    const ordinary = await appFor(editorA).request(path, { method: "POST" });
    expect(await ordinary.json()).toEqual({ reachedWriteHandler: true });
    for (const flag of ["header", "query", "body"]) {
      const response = await appFor(editorA).request(
        `${path}${flag === "query" ? "?preview=1" : ""}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(flag === "header" ? { "X-Molo-Preview": "1" } : {}),
          },
          body: JSON.stringify(flag === "body" ? { preview: true } : {}),
        },
      );
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("preview is read-only");
    }
    expect(await h.db.select().from(schema.xpEvents)).toEqual([]);
    expect(await h.db.select().from(schema.reviewCards)).toEqual([]);
    expect(await h.db.select().from(schema.streaks)).toEqual([]);
    expect(await h.db.select().from(schema.hearts)).toEqual([]);
  });
});
