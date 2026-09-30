/**
 * The integrity suite (PLAN.md Phase 1, workstream B). These are the
 * assertions behind the sentence that governs the project: no learner ever
 * sees content a human editor has not approved. Run with
 * `bun run test:integrity` against Docker Postgres.
 */

import { ADMIN_SELF_APPROVAL_NOTE, EDGES, transition } from "@molo/core";
import { schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID, fxId } from "../src/fixtures.ts";
import {
  LICENCE,
  SOURCE,
  admin,
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
  learner,
  learnerRepo,
  statusOf,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});

afterAll(async () => {
  await h?.close();
});

describe("1. no function other than transition() can set published", () => {
  it("createLexeme ignores any status a caller smuggles in", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createLexeme({
      lemma: "zz-smuggle",
      pos: "noun",
      nounClassLabel: "13",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
      // A caller lying about status must have no effect.
      ...({ status: "published", approvedBy: editorB.id } as object),
    });
    expect(await statusOf(h.db, "lexemes", id)).toBe("draft");
  });

  it("updateLexeme strips status, approvedBy and approvedAt even from untyped callers", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createLexeme({
      lemma: "zz-patch",
      pos: "verb",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    });
    await repo.updateLexeme(id, {
      status: "published",
      approvedBy: editorB.id,
      register: "urban",
    } as object);
    const [row] = await h.db.select().from(schema.lexemes).where(eq(schema.lexemes.id, id));
    expect(row?.status).toBe("draft");
    expect(row?.approvedBy).toBeNull();
    expect(row?.register).toBe("urban");
  });

  it("an LLM-origin row starts as ai_draft and stays there until an editor promotes it", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createLexeme({
      lemma: "zz-llm",
      pos: "verb",
      source: "llm",
      licence: LICENCE,
      origin: "llm",
    });
    expect(await statusOf(h.db, "lexemes", id)).toBe("ai_draft");
    const direct = await repo.transitionEntity({ kind: "lexeme", id, to: "published" });
    expect(direct.ok).toBe(false);
    expect(await statusOf(h.db, "lexemes", id)).toBe("ai_draft");
  });
});

describe("2. ai_draft cannot reach published without a human review step", () => {
  it("the only edge out of ai_draft is to in_review, and only in_review reaches published", () => {
    expect(EDGES.filter(([f]) => f === "ai_draft").map(([, t]) => t)).toEqual(["in_review"]);
    expect(EDGES.filter(([, t]) => t === "published").map(([f]) => f)).toEqual(["in_review"]);
  });

  it("a learner actor can never move anything, and an editor cannot publish without a gate", () => {
    const entity = {
      status: "in_review" as const,
      createdBy: "x",
      approvedBy: null,
      approvedAt: null,
    };
    expect(
      transition({ entity, to: "published", actor: learner, gate: { ok: true, failures: [] } }).ok,
    ).toBe(false);
    expect(transition({ entity, to: "published", actor: editorA }).ok).toBe(false);
  });

  it("the editor repository refuses to exist for a learner", () => {
    expect(() => editorRepo(h.db, learner, { morph: yesMorph })).toThrow(/editorial/);
  });
});

describe("3. publishGate rejects", () => {
  async function promote(id: string) {
    const r = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "in_review",
    });
    expect(r.ok).toBe(true);
  }

  it("a complete lexeme publishes through the real gate (control)", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await promote(id);
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r).toEqual({ ok: true, status: "published" });
    expect(await statusOf(h.db, "lexemes", id)).toBe("published");
  });

  it("missing nb gloss", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await h.db.delete(schema.glosses).where(eq(schema.glosses.sourceLang, "nb"));
    await promote(id);
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.gate?.failures).toContainEqual({ code: "gloss_missing", detail: "nb" });
    expect(await statusOf(h.db, "lexemes", id)).toBe("in_review");
  });

  it("an ai_draft gloss does not count as a gloss", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await editorRepo(h.db, editorA, { morph: yesMorph }).upsertGloss(id, {
      sourceLang: "nb",
      gloss: "machine draft",
      origin: "llm",
    });
    await promote(id);
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.gate?.failures).toContainEqual({ code: "gloss_missing", detail: "nb" });
  });

  it("missing tier-1/2 audio (tier-3 TTS does not count)", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await h.db
      .update(schema.audioAssets)
      .set({ tier: "3_tts" })
      .where(eq(schema.audioAssets.targetId, id));
    await promote(id);
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.gate?.failures.map((f) => f.code)).toContain("audio_missing");
  });

  it("a noun whose plural xh-morph cannot generate and that has no plural_of link", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await promote(id);
    const r = await editorRepo(h.db, editorB).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    }); // default morph says no
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.gate?.failures.map((f) => f.code)).toContain("plural_not_generable");
  });

  it("approver == creator (four eyes)", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await promote(id);
    const r = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/four-eyes/);
  });

  it("an admin may approve their own row, and the history says so", async () => {
    const id = await completeLexeme(h.db, { creator: admin });
    await editorRepo(h.db, admin, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "in_review",
    });
    const r = await editorRepo(h.db, admin, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r.ok).toBe(true);
    const notes = await h.db
      .select({ note: schema.contentRevisions.note })
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityId, id));
    expect(notes.map((n) => n.note)).toContain(ADMIN_SELF_APPROVAL_NOTE);
  });

  it("approver without an editorial role, even an admin-less learner with a forged actor", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await promote(id);
    expect(() =>
      editorRepo(h.db, { id: "forged", roles: ["learner"] }, { morph: yesMorph }),
    ).toThrow();
    const r = transition({
      entity: { status: "in_review", createdBy: editorA.id, approvedBy: null, approvedAt: null },
      to: "published",
      actor: { id: "forged", roles: ["learner"] },
      gate: { ok: true, failures: [] },
    });
    expect(r.ok).toBe(false);
  });

  it("tier-1 audio without a consenting speaker is refused at creation", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createLexeme({
      lemma: "zz-noconsent",
      pos: "verb",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    });
    await h.db
      .update(schema.speakers)
      .set({ consentRecordedAt: null, consentScope: null })
      .where(eq(schema.speakers.id, FIXTURE_SPEAKER_ID));
    await expect(
      repo.createAudioAsset({
        targetKind: "lexeme",
        targetId: id,
        speakerId: FIXTURE_SPEAKER_ID,
        tier: "1_native_studio",
        r2Key: "audio/x.opus",
        sha256: "b".repeat(64),
        durationMs: 500,
        lufs: -16,
        peakDbfs: -1,
        codec: "opus",
        sampleRate: 48_000,
        licence: "proprietary-molo",
      }),
    ).rejects.toThrow(/consent/);
  });
});

describe("4. learner repository functions never return non-published rows", () => {
  it("returns only the published lexeme out of one per status", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const ids: Record<string, string> = {};
    for (const status of ["draft", "ai_draft", "in_review", "retired"] as const) {
      const id = await repo.createLexeme({
        lemma: `zz-${status}`,
        pos: "verb",
        source: SOURCE,
        licence: LICENCE,
        origin: "human",
      });
      // Force the row into the target status directly: this is the sabotage
      // the learner filter must survive, not a supported write path.
      await h.db.update(schema.lexemes).set({ status }).where(eq(schema.lexemes.id, id));
      ids[status] = id;
    }
    const published = await completeLexeme(h.db, { creator: editorA });
    await repo.transitionEntity({ kind: "lexeme", id: published, to: "in_review" });
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id: published,
      to: "published",
    });
    expect(r.ok).toBe(true);

    const seen = await learnerRepo(h.db).getLexemes([...Object.values(ids), published], "en");
    expect(seen.map((l) => l.id)).toEqual([published]);
    expect(seen[0]?.gloss?.gloss).toBe("fixture gloss en");
    expect(seen[0]?.audio?.tier).toBe("1_native_studio");
  });

  it("never serves tier-3 audio even if a row was published by hand", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    await h.db.update(schema.lexemes).set({ status: "published" }).where(eq(schema.lexemes.id, id));
    await h.db
      .update(schema.audioAssets)
      .set({ tier: "3_tts" })
      .where(eq(schema.audioAssets.targetId, id));
    const [lx] = await learnerRepo(h.db).getLexemes([id], "nb");
    expect(lx?.audio).toBeNull();
  });

  it("lists only published units and hides unpublished skills inside a published unit", async () => {
    const repo = editorRepo(h.db, admin, { morph: yesMorph });
    const unitId = await repo.createUnit({
      slug: "zz-unit",
      titleKey: "units.zz.title",
      order: 1,
      cefrBand: "A1",
    });
    const draftUnit = await repo.createUnit({
      slug: "zz-unit-draft",
      titleKey: "units.zz2.title",
      order: 2,
      cefrBand: "A1",
    });
    const skillId = await repo.createSkill({
      unitId,
      slug: "zz-skill",
      titleKey: "skills.zz.title",
      order: 1,
      kind: "vocab",
    });
    await h.db.update(schema.units).set({ status: "published" }).where(eq(schema.units.id, unitId));
    void draftUnit;
    const learnerView = learnerRepo(h.db);
    const course = await defaultCourse(h.db);
    expect((await learnerView.listUnits(course.id)).map((u) => u.slug)).toEqual(["zz-unit"]);
    const unit = await learnerView.getUnitBySlug("zz-unit", course.id);
    expect(unit?.skills).toEqual([]);
    await h.db
      .update(schema.skills)
      .set({ status: "published" })
      .where(eq(schema.skills.id, skillId));
    expect(
      (await learnerView.getUnitBySlug("zz-unit", course.id))?.skills.map((s) => s.slug),
    ).toEqual(["zz-skill"]);
    expect(await learnerView.getUnitBySlug("zz-unit-draft", course.id)).toBeNull();
  });
});

describe("5. an exercise cannot publish while any referenced entity is unpublished", () => {
  it("walks lexemes and audio, then passes once everything is published", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const unitId = await repo.createUnit({
      slug: "zz-u",
      titleKey: "units.zz.title",
      order: 1,
      cefrBand: "A1",
    });
    const skillId = await repo.createSkill({
      unitId,
      slug: "zz-s",
      titleKey: "skills.zz.title",
      order: 1,
      kind: "vocab",
    });
    const lessonId = await repo.createLesson({ skillId, order: 1 });
    const a = await completeLexeme(h.db, { creator: editorA, lemma: "zz-a" });
    const b = await completeLexeme(h.db, { creator: editorA, lemma: "zz-b" });
    const exerciseId = await repo.createExercise({
      lessonId,
      order: 1,
      type: "listen_select",
      payload: {
        type: "listen_select",
        prompt: { lexemeId: a },
        options: [
          { lexemeId: a, correct: true },
          { lexemeId: b, correct: false },
        ],
      },
    });
    await repo.transitionEntity({ kind: "exercise", id: exerciseId, to: "in_review" });
    const approver = editorRepo(h.db, editorB, { morph: yesMorph });

    const blocked = await approver.transitionEntity({
      kind: "exercise",
      id: exerciseId,
      to: "published",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.gate?.failures).toContainEqual({
        code: "referenced_entity_not_published",
        detail: `lexeme:${a}`,
      });
      expect(blocked.gate?.failures).toContainEqual({
        code: "referenced_entity_not_published",
        detail: `lexeme:${b}`,
      });
    }
    expect(await statusOf(h.db, "exercises", exerciseId)).toBe("in_review");

    for (const id of [a, b]) {
      await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
      const r = await approver.transitionEntity({ kind: "lexeme", id, to: "published" });
      expect(r.ok).toBe(true);
    }
    const ok = await approver.transitionEntity({
      kind: "exercise",
      id: exerciseId,
      to: "published",
    });
    expect(ok).toEqual({ ok: true, status: "published" });
  });

  it("a click drill with a missing recording cannot publish", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const unitId = await repo.createUnit({
      slug: "zz-u2",
      titleKey: "units.zz.title",
      order: 1,
      cefrBand: "A1",
    });
    const skillId = await repo.createSkill({
      unitId,
      slug: "zz-s2",
      titleKey: "skills.zz.title",
      order: 1,
      kind: "pronunciation",
    });
    const lessonId = await repo.createLesson({ skillId, order: 1 });
    const a = await completeLexeme(h.db, { creator: editorA, lemma: "zz-ca" });
    const exerciseId = await repo.createExercise({
      lessonId,
      order: 1,
      type: "click_drill",
      payload: {
        type: "click_drill",
        set: "A",
        contrast: ["c", "x"],
        steps: ["listen_identify"],
        pairs: [],
        contrastWords: [{ lexemeId: a, click: "c" }],
      },
    });
    await repo.transitionEntity({ kind: "lexeme", id: a, to: "in_review" });
    const approver = editorRepo(h.db, editorB, { morph: yesMorph });
    await approver.transitionEntity({ kind: "lexeme", id: a, to: "published" });
    await repo.transitionEntity({ kind: "exercise", id: exerciseId, to: "in_review" });
    const r = await approver.transitionEntity({
      kind: "exercise",
      id: exerciseId,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.gate?.failures.map((f) => f.detail)).toEqual(
        expect.arrayContaining(["audio_asset:missing:speaker", `audio_asset:missing:${a}`]),
      );
  });

  it("units, skills and lessons gate on their children", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const unitId = await repo.createUnit({
      slug: "zz-u3",
      titleKey: "units.zz.title",
      order: 1,
      cefrBand: "A1",
    });
    const skillId = await repo.createSkill({
      unitId,
      slug: "zz-s3",
      titleKey: "skills.zz.title",
      order: 1,
      kind: "vocab",
    });
    await repo.transitionEntity({ kind: "unit", id: unitId, to: "in_review" });
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "unit",
      id: unitId,
      to: "published",
    });
    // Its only skill is a draft: a draft does not hold a container back, but a
    // unit with nothing published in it cannot go out either.
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.gate?.failures).toContainEqual({ code: "no_published_children" });
      expect(r.gate?.failures).not.toContainEqual({
        code: "referenced_entity_not_published",
        detail: `skill:${skillId}`,
      });
    }

    // Once the skill is sent to review it holds the unit back until decided.
    await repo.transitionEntity({ kind: "skill", id: skillId, to: "in_review" });
    const held = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "unit",
      id: unitId,
      to: "published",
    });
    expect(held.ok).toBe(false);
    if (!held.ok)
      expect(held.gate?.failures).toContainEqual({
        code: "referenced_entity_not_published",
        detail: `skill:${skillId}`,
      });
    expect(fxId(1)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
