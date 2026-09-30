/**
 * The content version against Postgres (docs/CACHING.md section 3).
 *
 * Every published-content cache key carries this number, so if it does not
 * move when an editor publishes, a learner keeps being served the lesson
 * from before the publish — quietly, for as long as the entry lives. That
 * failure has no symptom in the application code at all, which is why it is
 * asserted here rather than trusted.
 *
 * `versionTokenOf` in apps/api is a pure function of the three fields read
 * here and is unit-tested on its own; a change to these fields is a change
 * to the key.
 */

import { readContentVersion, type Db } from "@molo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
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

/** Pushes a lexeme through the real four-eyes transition to `published`. */
async function publish(db: Db, id: string): Promise<void> {
  const a = await editorRepo(db, editorA, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "in_review",
  });
  if (!a.ok) throw new Error(`in_review refused: ${a.reason}`);
  const b = await editorRepo(db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "published",
  });
  if (!b.ok) throw new Error(`publish refused: ${b.reason}`);
}

describe("the published-content version", () => {
  it("moves when an editor publishes", async () => {
    const id = await completeLexeme(h.db, { lemma: "zz-version-publish" });
    const before = await readContentVersion(h.db);
    await publish(h.db, id);
    const after = await readContentVersion(h.db);
    expect(after.revisions).toBeGreaterThan(before.revisions);
    expect(after).not.toEqual(before);
  });

  it("stands still when nothing is written", async () => {
    await completeLexeme(h.db, { lemma: "zz-version-still" });
    const a = await readContentVersion(h.db);
    const b = await readContentVersion(h.db);
    expect(b).toEqual(a);
  });

  it("moves on a retire as well, because unpublishing changes what a learner sees", async () => {
    const id = await completeLexeme(h.db, { lemma: "zz-version-retire" });
    await publish(h.db, id);
    const before = await readContentVersion(h.db);
    const r = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "retired",
      note: "withdrawn by a speaker",
    });
    if (!r.ok) throw new Error(`retire refused: ${r.reason}`);
    const after = await readContentVersion(h.db);
    expect(after.revisions).toBeGreaterThan(before.revisions);
  });

  it("names the default course, so a key can name the curriculum it answers for", async () => {
    const v = await readContentVersion(h.db);
    expect(v.defaultCourseId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reads an empty history without inventing one", async () => {
    // `reset()` truncates content_revisions; nothing has been written yet.
    const v = await readContentVersion(h.db);
    expect(v.revisions).toBe(0);
    expect(v.latestAt).toBeNull();
  });
});
