import {
  createDb,
  editorRepo,
  glossSuggestionsRepo,
  learnerRepo,
  publishedShareAlikeExport,
  schema,
} from "@molo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  editorA,
  editorB,
  harness,
  learner,
  testDatabaseUrl,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => h?.close());
const proposal = (lexemeId: string) => ({
  lexemeId,
  sourceLang: "nb" as const,
  provenance: "google-translate-v2",
  gloss: "zz editor-only machine opinion",
});

async function publish(id: string) {
  expect(
    (
      await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
        kind: "lexeme",
        id,
        to: "in_review",
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
        kind: "lexeme",
        id,
        to: "published",
      })
    ).ok,
  ).toBe(true);
}

describe("editor-only gloss suggestions", () => {
  it("never reads the suggestion table on learner or public export queries, even for a published parent", async () => {
    const id = await completeLexeme(h.db, { lemma: "zz-suggestion-isolation", creator: editorA });
    await publish(id);
    const repo = glossSuggestionsRepo(h.db, editorA);
    await repo.record(proposal(id));
    expect((await repo.forLexeme(id))[0]?.gloss).toBe(proposal(id).gloss);
    const queries: string[] = [];
    const observed = createDb(testDatabaseUrl(), { onQuery: (query) => queries.push(query) });
    try {
      const outputs = await Promise.all([
        learnerRepo(observed.db).getLexemes([id], "en"),
        learnerRepo(observed.db).getLexemes([id], "nb"),
        publishedShareAlikeExport(observed.db),
      ]);
      expect(outputs[0]).toHaveLength(1);
      expect(outputs[1]).toHaveLength(1);
      expect(JSON.stringify(outputs)).not.toContain(proposal(id).gloss);
      expect(JSON.stringify(outputs)).not.toContain("glossSuggestions");
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.some((query) => /gloss_suggestions/i.test(query))).toBe(false);
    } finally {
      await observed.close();
    }
  });

  it("refuses a learner and cannot publish a suggestion through the transition API", async () => {
    expect(() => glossSuggestionsRepo(h.db, learner)).toThrow(/editorial/);
    const id = await completeLexeme(h.db);
    const saved = await glossSuggestionsRepo(h.db, editorA).record(proposal(id));
    await expect(
      editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
        kind: "gloss",
        id: saved.id,
        to: "published",
      }),
    ).rejects.toThrow();
  });

  it("is unique per lexeme, language and provenance and leaves the canonical gloss untouched", async () => {
    const id = await completeLexeme(h.db);
    const before = await h.db.select().from(schema.glosses).where(eq(schema.glosses.lexemeId, id));
    const repo = glossSuggestionsRepo(h.db, editorA);
    const first = await repo.record(proposal(id));
    const second = await repo.record({ ...proposal(id), gloss: "zz revised opinion" });
    expect(second.id).toBe(first.id);
    await repo.record({ ...proposal(id), provenance: "another-provider" });
    expect(await repo.forLexeme(id)).toHaveLength(2);
    expect(await h.db.select().from(schema.glosses).where(eq(schema.glosses.lexemeId, id))).toEqual(
      before,
    );
  });

  it("creates only an ai_draft when the canonical gloss is missing, with an audit origin", async () => {
    const id = await completeLexeme(h.db);
    await h.db
      .delete(schema.glosses)
      .where(and(eq(schema.glosses.lexemeId, id), eq(schema.glosses.sourceLang, "nb")));
    const saved = await glossSuggestionsRepo(h.db, editorA).record(
      { ...proposal(id), ...({ status: "published", approvedBy: editorB.id } as object) },
      true,
    );
    expect(saved.draftCreated).toBe(true);
    const [draft] = await h.db
      .select()
      .from(schema.glosses)
      .where(and(eq(schema.glosses.lexemeId, id), eq(schema.glosses.sourceLang, "nb")));
    expect(draft?.status).toBe("ai_draft");
    expect(draft?.approvedBy).toBeNull();
    expect(draft?.id).not.toBe(saved.id);
    const audit = await h.db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityId, draft!.id));
    expect(audit[0]?.diff).toMatchObject({
      upsert: { origin: "llm", provenance: "google-translate-v2" },
    });
    expect(await learnerRepo(h.db).getLexemes([id], "nb")).toEqual([]);
    const submitted = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "in_review",
    });
    expect(submitted.ok).toBe(true);
    const refused = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(refused.ok).toBe(false);
  });

  it("never overwrites an existing human or AI gloss, even when drafting is requested", async () => {
    const id = await completeLexeme(h.db);
    const repo = glossSuggestionsRepo(h.db, editorA);
    for (const origin of ["human", "llm"] as const) {
      await editorRepo(h.db, editorA).upsertGloss(id, {
        sourceLang: "nb",
        gloss: `zz existing ${origin}`,
        origin,
      });
      expect((await repo.record(proposal(id), true)).draftCreated).toBe(false);
      const [row] = await h.db
        .select()
        .from(schema.glosses)
        .where(and(eq(schema.glosses.lexemeId, id), eq(schema.glosses.sourceLang, "nb")));
      expect(row?.gloss).toBe(`zz existing ${origin}`);
    }
  });
});
