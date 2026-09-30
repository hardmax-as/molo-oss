import { editorRepo, publishedShareAlikeExport, shareAlikeExport } from "@molo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { completeLexeme, editorA, editorB, harness, yesMorph, type Harness } from "./helpers.ts";

let h: Harness;
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => h?.close());

async function publish(id: string) {
  const submitted = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "in_review",
  });
  expect(submitted.ok).toBe(true);
  const approved = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "published",
  });
  expect(approved.ok).toBe(true);
}

describe("public lexicon archive", () => {
  it("exports approved rows and glosses, leaving drafts in the internal export", async () => {
    const published = await completeLexeme(h.db, { lemma: "zz-public-export" });
    const draft = await completeLexeme(h.db, { lemma: "zz-draft-export" });
    await publish(published);
    const data = await publishedShareAlikeExport(h.db);
    expect(data.lexemes.map((row) => row.id)).toEqual([published]);
    expect(data.lexemes[0]?.glosses).toHaveLength(2);
    expect(data.lexemes[0]?.glosses.every((gloss) => gloss.status === "published")).toBe(true);
    expect((await shareAlikeExport(h.db)).lexemes.map((row) => row.id)).toContain(draft);
  });

  it("does not leak a revised gloss before it has been approved again", async () => {
    const id = await completeLexeme(h.db, { lemma: "zz-revised-export" });
    await publish(id);
    await editorRepo(h.db, editorA, { morph: yesMorph }).upsertGloss(id, {
      sourceLang: "en",
      gloss: "zz unapproved suggestion",
      origin: "llm",
    });
    const data = await publishedShareAlikeExport(h.db);
    expect(data.lexemes).toHaveLength(1);
    expect(data.lexemes[0]?.glosses.map((gloss) => gloss.sourceLang)).toEqual(["nb"]);
    expect(JSON.stringify(data)).not.toContain("zz unapproved suggestion");
  });

  it("returns an honest empty package when there is no published content", async () => {
    await completeLexeme(h.db, { lemma: "zz-only-draft" });
    expect(await publishedShareAlikeExport(h.db)).toEqual({
      lexemes: [],
      sentences: [],
      sources: [],
    });
  });
});
