import { expect, test } from "@playwright/test";

import { E2E, grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

/**
 * The editor landing page's promise, end to end: it opens on work rather
 * than on the grid, and a figure hands over the rows it counted.
 *
 * The seed leaves exactly one word short of a recording — `zz-lex-draft`
 * has both glosses and no audio — so "words need a native recording" must
 * be there, and following it must land on a grid holding that word and not
 * the published ones.
 */
test("the editor landing page counts work, and a figure links to its rows", async ({ page }) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  // The role is read from `/me`, which the client caches; a reload is the
  // honest way to pick it up, exactly as it would be after an admin grant.
  await page.reload();

  await page.goto("/edit");
  await expect(page.getByRole("heading", { name: t.edit.overview.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("editor-queue")).toBeVisible();

  // Both columns and the blocked block are headings, not decorated divs.
  await expect(
    page.getByRole("heading", { name: t.edit.overview.write.title, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: t.edit.overview.record.title, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: t.edit.overview.blocked.title, level: 2 }),
  ).toBeVisible();

  // The grid is a tab of its own now, and the queue is what `/edit` opens on.
  // `exact`, because the skip link reads "Skip to content".
  await expect(page.getByRole("link", { name: t.edit.tabs.content, exact: true })).toBeVisible();

  // Follow the publish gate's own refusal into the rows behind it.
  const missingAudio = page.getByTestId("blocker-lexeme-audio_missing");
  await expect(missingAudio).toBeVisible();
  await missingAudio.click();

  await expect(page).toHaveURL(/\/edit\/content\?.*missingAudio=true/);
  await expect(page).toHaveURL(/status=pending/);
  // The word the seed left without audio is here; the published ones are not.
  await expect(page.getByRole("link", { name: E2E.lexemes.draft.lemma })).toBeVisible();
  await expect(page.getByRole("link", { name: E2E.lexemes.a.lemma })).toHaveCount(0);
});
