/**
 * Grammar notes under the sentence that governs the project: no learner ever
 * sees content a human editor has not approved.
 *
 * A grammar note is the sharpest case of that rule, because the notes are
 * written by a model on top of a rule table no native speaker has checked
 * (docs/GRAMMAR.md section 4). So the assertions below are not about a
 * feature working; they are about a note being *invisible* until two people
 * have looked at it. Do not weaken them to make a feature pass.
 */

import { schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  admin,
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  grammarRepo,
  harness,
  learner,
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

/** A published skill in a published unit, so a note has somewhere to live. */
async function publishedSkill(): Promise<{ skillId: string; unitId: string }> {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const b = editorRepo(h.db, editorB, { morph: yesMorph });
  const course = await defaultCourse(h.db);
  const unitId = await a.createUnit({
    courseId: course.id,
    slug: `zz-gram-unit-${crypto.randomUUID().slice(0, 8)}`,
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await a.createSkill({
    unitId,
    slug: "zz-gram-skill",
    titleKey: "units.unit1.skills.classes.title",
    order: 1,
    kind: "grammar",
  });
  const lessonId = await a.createLesson({ skillId, order: 1 });
  const lexemeId = await completeLexeme(h.db, { lemma: "zz-gram-word" });
  const otherId = await completeLexeme(h.db, { lemma: "zz-gram-other" });
  const exerciseId = await a.createExercise({
    lessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId },
      options: [
        { lexemeId, correct: true },
        { lexemeId: otherId, correct: false },
      ],
    },
  });
  for (const [kind, id] of [
    ["lexeme", lexemeId],
    ["lexeme", otherId],
    ["exercise", exerciseId],
    ["lesson", lessonId],
    ["skill", skillId],
    ["unit", unitId],
  ] as const) {
    await a.transitionEntity({ kind, id, to: "in_review" });
    const r = await b.transitionEntity({ kind, id, to: "published" });
    if (!r.ok) throw new Error(`${kind} did not publish: ${r.reason}`);
  }
  return { skillId, unitId };
}

/** A note with both bodies and a worked example, at whatever status its origin gives it. */
async function noteOn(
  skillId: string,
  opts: { origin?: "human" | "llm"; lexemeId?: string; cells?: boolean } = {},
): Promise<string> {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const id = await a.createGrammarNote({
    skillId,
    slug: `zz-note-${crypto.randomUUID().slice(0, 8)}`,
    order: 1,
    caveat: "fixture: the rule table behind this note is unvalidated",
    origin: opts.origin ?? "human",
  });
  for (const lang of ["en", "nb"] as const) {
    await a.upsertGrammarNoteBody(id, {
      sourceLang: lang,
      title: `zz note title ${lang}`,
      rule: `zz rule ${lang}`,
      correction: `zz correction ${lang}`,
      origin: opts.origin ?? "human",
    });
  }
  if (opts.cells !== false) {
    await a.setGrammarNoteCells(id, [
      {
        role: "example",
        order: 1,
        colKey: "word",
        surfaceForm: "zz-example",
        morphemes: ["zz", "example"],
        ...(opts.lexemeId ? { lexemeId: opts.lexemeId } : {}),
      },
    ]);
  }
  return id;
}

/** Pushes a note and both its bodies through the real transitions. */
async function publishNote(id: string): Promise<void> {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const b = editorRepo(h.db, editorB, { morph: yesMorph });
  const bodies = await h.db
    .select({ id: schema.grammarNoteBodies.id })
    .from(schema.grammarNoteBodies)
    .where(eq(schema.grammarNoteBodies.grammarNoteId, id));
  for (const body of bodies) {
    await a.transitionEntity({ kind: "grammar_note_body", id: body.id, to: "in_review" });
    const r = await b.transitionEntity({ kind: "grammar_note_body", id: body.id, to: "published" });
    if (!r.ok) throw new Error(`body did not publish: ${r.reason}`);
  }
  await a.transitionEntity({ kind: "grammar_note", id, to: "in_review" });
  const r = await b.transitionEntity({ kind: "grammar_note", id, to: "published" });
  if (!r.ok) throw new Error(`note did not publish: ${r.reason}`);
}

describe("a grammar note is invisible to a learner until it is published", () => {
  it("a draft note is not served, however complete it is", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("draft");
    const notes = await grammarRepo(h.db).notesForSkills([skillId], "en");
    expect(notes.get(skillId) ?? []).toEqual([]);
  });

  it("an ai_draft note is not served either, and that is the whole point", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId, { origin: "llm" });
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("ai_draft");
    expect((await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? []).toEqual(
      [],
    );
  });

  it("a note in review is still not served", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "grammar_note",
      id,
      to: "in_review",
    });
    expect((await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? []).toEqual(
      [],
    );
  });

  it("serves a note only once it and its body are both published", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    await publishNote(id);
    const notes = (await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? [];
    expect(notes.map((n) => n.id)).toEqual([id]);
    expect(notes[0]?.title).toBe("zz note title en");
    expect(notes[0]?.cells).toHaveLength(1);
  });

  it("hides a published note whose body in that language is still a draft", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    await publishNote(id);
    // An editor reopens the Norwegian body: the note itself is untouched, but
    // a Norwegian learner must stop seeing it rather than fall back to English.
    await editorRepo(h.db, editorA, { morph: yesMorph }).upsertGrammarNoteBody(id, {
      sourceLang: "nb",
      title: "zz revised",
      rule: "zz revised rule",
      origin: "human",
    });
    const nb = (await grammarRepo(h.db).notesForSkills([skillId], "nb")).get(skillId) ?? [];
    const en = (await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? [];
    expect(nb).toEqual([]);
    expect(en.map((n) => n.id)).toEqual([id]);
  });

  it("keeps a published note out of the reference page when its unit is not published", async () => {
    const { skillId, unitId } = await publishedSkill();
    const id = await noteOn(skillId);
    await publishNote(id);
    const course = await defaultCourse(h.db);
    const before = await grammarRepo(h.db).referenceFor(course.id, "en", null);
    expect(before.map((n) => n.id)).toContain(id);
    await editorRepo(h.db, admin, { morph: yesMorph }).transitionEntity({
      kind: "unit",
      id: unitId,
      to: "retired",
      note: "fixture retirement",
    });
    const after = await grammarRepo(h.db).referenceFor(course.id, "en", null);
    expect(after.map((n) => n.id)).not.toContain(id);
  });

  it("drops a cell whose word stops being published rather than leaking it", async () => {
    // The gate refuses to publish a note pointing at an unpublished word, so
    // the way this happens for real is the other order: the note is approved
    // and *then* the word is retired. The reader must not go on showing it.
    const { skillId } = await publishedSkill();
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    const b = editorRepo(h.db, editorB, { morph: yesMorph });
    const lexemeId = await completeLexeme(h.db, { lemma: "zz-later-retired" });
    await a.transitionEntity({ kind: "lexeme", id: lexemeId, to: "in_review" });
    const up = await b.transitionEntity({ kind: "lexeme", id: lexemeId, to: "published" });
    expect(up.ok).toBe(true);

    const id = await noteOn(skillId);
    await a.setGrammarNoteCells(id, [
      { role: "example", order: 1, colKey: "word", surfaceForm: "zz-safe", morphemes: [] },
      {
        role: "paradigm",
        order: 2,
        rowLabel: "1",
        colKey: "word",
        surfaceForm: "zz-later-retired",
        morphemes: [],
        lexemeId,
      },
    ]);
    await publishNote(id);
    const before = (await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? [];
    expect(before[0]?.cells).toHaveLength(2);

    const gone = await b.transitionEntity({
      kind: "lexeme",
      id: lexemeId,
      to: "retired",
      note: "fixture retirement",
    });
    expect(gone.ok).toBe(true);
    const after = (await grammarRepo(h.db).notesForSkills([skillId], "en")).get(skillId) ?? [];
    expect(after[0]?.cells.map((c) => c.surfaceForm)).toEqual(["zz-safe"]);
  });
});

describe("nothing but transition() can publish a grammar note", () => {
  it("createGrammarNote ignores any status a caller smuggles in", async () => {
    const { skillId } = await publishedSkill();
    const id = await editorRepo(h.db, editorA, { morph: yesMorph }).createGrammarNote({
      skillId,
      slug: "zz-smuggled",
      caveat: "fixture",
      origin: "human",
      ...({ status: "published", approvedBy: editorB.id } as object),
    });
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("draft");
  });

  it("updateGrammarNote strips status and approval even from untyped callers", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    await editorRepo(h.db, editorA, { morph: yesMorph }).updateGrammarNote(id, {
      slug: "zz-renamed",
      ...({ status: "published", approvedBy: editorB.id, approvedAt: new Date() } as object),
    });
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("draft");
  });

  it("has no edge from ai_draft straight to published", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId, { origin: "llm" });
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "grammar_note",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("ai_draft");
  });

  it("refuses a learner, whatever they ask for", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    // The role check fires before the request is even read.
    expect(() =>
      editorRepo(h.db, learner, { morph: yesMorph }).createGrammarNote({
        skillId,
        slug: "zz-learner-wrote-this",
        origin: "human",
      }),
    ).toThrow();
    await expect(
      editorRepo(h.db, admin, { morph: yesMorph }).transitionEntity({
        kind: "grammar_note",
        id,
        to: "published",
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("draft");
  });

  it("refuses the creator approving their own note", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId);
    await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "grammar_note",
      id,
      to: "in_review",
    });
    const r = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "grammar_note",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    expect(await statusOf(h.db, "grammarNotes", id)).toBe("in_review");
  });
});

describe("the publish gate on a grammar note", () => {
  it("refuses a note with no body in one of the source languages", async () => {
    const { skillId } = await publishedSkill();
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await a.createGrammarNote({
      skillId,
      slug: "zz-one-language",
      caveat: "fixture",
      origin: "human",
    });
    await a.upsertGrammarNoteBody(id, {
      sourceLang: "en",
      title: "zz",
      rule: "zz",
      origin: "human",
    });
    await a.setGrammarNoteCells(id, [
      { role: "example", order: 1, colKey: "word", surfaceForm: "zz-x", morphemes: [] },
    ]);
    const gate = await a.publishCheck("grammar_note", id);
    expect(gate.ok).toBe(false);
    expect(gate.failures).toContainEqual({ code: "body_missing", detail: "nb" });
  });

  it("refuses a rule stated with no worked example", async () => {
    const { skillId } = await publishedSkill();
    const id = await noteOn(skillId, { cells: false });
    const gate = await editorRepo(h.db, editorA, { morph: yesMorph }).publishCheck(
      "grammar_note",
      id,
    );
    expect(gate.failures.map((f) => f.code)).toContain("worked_example_missing");
  });

  it("refuses a note that points at a word a learner may not see", async () => {
    const { skillId } = await publishedSkill();
    const draftLexeme = await editorRepo(h.db, editorA, { morph: yesMorph }).createLexeme({
      lemma: "zz-unpublished-word",
      pos: "noun",
      nounClassLabel: "13",
      source: "fixture",
      licence: "CC-BY-SA-4.0",
      origin: "human",
    });
    const id = await noteOn(skillId, { lexemeId: draftLexeme });
    const gate = await editorRepo(h.db, editorA, { morph: yesMorph }).publishCheck(
      "grammar_note",
      id,
    );
    expect(gate.failures).toContainEqual({
      code: "referenced_entity_not_published",
      detail: `lexeme:${draftLexeme}`,
    });
  });

  it("passes a note that is complete and points at published content", async () => {
    const { skillId } = await publishedSkill();
    const lexemeId = await completeLexeme(h.db, { lemma: "zz-gate-word" });
    const b = editorRepo(h.db, editorB, { morph: yesMorph });
    await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id: lexemeId,
      to: "in_review",
    });
    const published = await b.transitionEntity({ kind: "lexeme", id: lexemeId, to: "published" });
    expect(published.ok).toBe(true);
    const id = await noteOn(skillId, { lexemeId });
    expect((await b.publishCheck("grammar_note", id)).ok).toBe(true);
  });
});
