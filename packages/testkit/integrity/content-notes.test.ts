/**
 * Notes on words and sentences against Postgres: a speaker says why they
 * skipped something in the studio. A note is history only. It never moves a
 * row's status, a learner cannot write one, and the editor landing page reads
 * them back newest first with the word as it reads now.
 */

import { CLICK_SOUNDS } from "@molo/core";
import { editorRepo, schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  editorA,
  editorB,
  harness,
  learner,
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

describe("content notes", () => {
  it("records a note on a draft word without touching its status, and lists it newest first", async () => {
    const id = await completeLexeme(h.db, { creator: editorA, lemma: "zz-bhota" });
    const [before] = await h.db
      .select({ status: schema.lexemes.status })
      .from(schema.lexemes)
      .where(eq(schema.lexemes.id, id));

    const repo = editorRepo(h.db, editorB, { morph: yesMorph });
    await repo.addNote({ kind: "lexeme", id, note: "  Same gloss as bhotani; missing prefix?  " });
    await repo.addNote({ kind: "lexeme", id, note: "Second thought" });

    const [after] = await h.db
      .select({ status: schema.lexemes.status })
      .from(schema.lexemes)
      .where(eq(schema.lexemes.id, id));
    expect(after?.status).toBe(before?.status);

    const notes = await repo.recentNotes();
    expect(notes.map((n) => n.note)).toEqual([
      "Second thought",
      "Same gloss as bhotani; missing prefix?",
    ]);
    expect(notes[0]).toMatchObject({ kind: "lexeme", id, text: "zz-bhota" });
  });

  it("refuses a learner, an empty note and an unknown row", async () => {
    const id = await completeLexeme(h.db, { creator: editorA, lemma: "zz-cela" });
    // Refused wherever the check runs, when the repository is built or at the call.
    await expect(
      (async () =>
        editorRepo(h.db, learner, { morph: yesMorph }).addNote({
          kind: "lexeme",
          id,
          note: "hi",
        }))(),
    ).rejects.toThrow(/editorial role/);
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    await expect(repo.addNote({ kind: "lexeme", id, note: "   " })).rejects.toThrow();
    await expect(
      repo.addNote({ kind: "sentence", id: crypto.randomUUID(), note: "gone" }),
    ).rejects.toThrow();
    expect(await repo.recentNotes()).toEqual([]);
  });

  it("records a note on a bare click by its studio id and lists it by its letter", async () => {
    const click = CLICK_SOUNDS.find((c) => c.letter === "xh")!;
    const repo = editorRepo(h.db, editorB, { morph: yesMorph });
    await repo.addNote({ kind: "click", id: click.id, note: "Sounds like a plain x on my take" });
    const [note] = await repo.recentNotes();
    expect(note).toMatchObject({
      kind: "click",
      id: click.id,
      text: "xh",
      note: "Sounds like a plain x on my take",
    });
    // An id that is not one of the fifteen clicks has nothing to be noted on.
    await expect(
      repo.addNote({ kind: "click", id: crypto.randomUUID(), note: "gone" }),
    ).rejects.toThrow();
    // A click has no row and no status: it can be noted, never moved.
    await expect(
      repo.transitionEntity({ kind: "click", id: click.id, to: "in_review" }),
    ).rejects.toThrow(/no row and no status/);
  });

  it("does not list status changes that carry a note, only notes", async () => {
    const id = await completeLexeme(h.db, { creator: editorA, lemma: "zz-coca" });
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
    await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "draft",
      note: "rejected: wrong gloss",
    });
    expect(await repo.recentNotes()).toEqual([]);
  });
});
