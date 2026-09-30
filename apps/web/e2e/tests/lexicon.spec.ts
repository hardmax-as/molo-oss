import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { t } from "./helpers.ts";

test("the public lexicon page links the published export from the terms", async ({
  page,
  request,
}) => {
  await page.goto("/terms");
  await page.getByRole("link", { name: t.lexicon.title }).click();
  await expect(page.getByRole("heading", { name: t.lexicon.title })).toBeVisible();
  const download = page.getByRole("link", { name: t.lexicon.download });
  await expect(download).toBeVisible();
  const response = await request.get((await download.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  const manifest = await (await request.get("/lexicon-data/manifest.json")).json();
  expect(manifest.publishedOnly).toBe(true);
  expect(manifest.headwords).toBe(3);
  expect(manifest.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  const entries = execFileSync("tar", ["-tzf", "-"], { input: bytes }).toString();
  expect(entries).toContain("README.md");
  expect(entries).toContain("LICENSE.txt");
  const lexemes = execFileSync("tar", ["-xOzf", "-", "lexemes.jsonl"], { input: bytes }).toString();
  expect(lexemes).toContain(E2E.lexemes.a.lemma);
  expect(lexemes).not.toContain(E2E.lexemes.draft.lemma);
  expect(lexemes).not.toContain("ai_draft");
});
