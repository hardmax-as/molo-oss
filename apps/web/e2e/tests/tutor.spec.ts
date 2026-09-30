import { expect, test } from "@playwright/test";

import { E2E, grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";
import { fill, signUpLearner, t } from "./helpers.ts";

/**
 * The tutor's two pages (docs/EDITOR-GUIDE.md): answer a sentence request,
 * and check a model-drafted culture card. Every string is `zz-` fixture text;
 * nothing here claims anything about isiXhosa.
 */
test("a tutor answers a sentence request and it becomes a draft sentence", async ({ page }) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.reload();

  await page.goto("/edit");
  await page.getByRole("link", { name: t.edit.tabs.write, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.edit.write.title, level: 1 })).toBeVisible();

  const card = page.getByTestId("sentence-request").filter({ hasText: E2E.tutor.requestEn });
  await expect(card).toBeVisible();
  // The words it should be built around, with their glosses.
  await expect(card.getByText(E2E.lexemes.a.lemma, { exact: true })).toBeVisible();
  await expect(card.getByText(E2E.lexemes.a.en, { exact: false })).toBeVisible();

  const typed = `zz-tutor-typed-${Date.now()}`;
  // On a cold CI worker the list can mount twice (hydration, then the first
  // fetch) and drop what was typed. Let the page settle, then retry fill and
  // save together; a click that lands only counts once the toast says so.
  await page.waitForLoadState("networkidle");
  const save = card.getByRole("button", { name: t.edit.write.save });
  const saved = page.getByText(t.edit.write.saved);
  await expect(async () => {
    if ((await saved.isVisible()) || (await card.count()) === 0) return;
    await card.getByLabel(t.edit.write.xhosa).fill(typed, { timeout: 2_000 });
    await save.click({ timeout: 2_000 });
    await expect(saved).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // It leaves the "to write" list and waits under "written" as a draft.
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(t.edit.write.filter.fulfilled) }).click();
  const done = page.getByTestId("sentence-request").filter({ hasText: typed });
  await expect(done).toBeVisible();
  await expect(done.getByText(t.edit.status.draft, { exact: true })).toBeVisible();
  await done.getByRole("link", { name: t.edit.write.openSentence }).click();
  await expect(page).toHaveURL(/\/edit\/sentences\//);

  // "Record it" opens the studio on phrases, on the sentence she just wrote,
  // counted in its request's unit before any exercise uses it.
  await page.goBack();
  await page.getByRole("button", { name: new RegExp(t.edit.write.filter.fulfilled) }).click();
  await page
    .getByTestId("sentence-request")
    .filter({ hasText: typed })
    .getByRole("link", { name: t.edit.write.recordIt })
    .click();
  await expect(page).toHaveURL(/\/edit\/studio\?.*kind=sentence/);
  await expect(page.getByLabel(t.edit.studio.queue)).toHaveValue("sentence");
  await expect(
    page.getByTestId("studio-panel").getByRole("heading", { level: 2, name: typed }),
  ).toBeVisible();
});

test("a culture card arrives as an AI draft with the claims to confirm", async ({ page }) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.reload();

  await page.goto("/edit/culture");
  await expect(page.getByRole("heading", { name: t.edit.culture.title, level: 1 })).toBeVisible();
  const card = page.getByTestId("culture-card").filter({ hasText: E2E.tutor.cardTitle });
  await expect(card.getByText(t.edit.status.ai_draft, { exact: true })).toBeVisible();
  await expect(card.getByTestId("culture-caveat")).toHaveText(E2E.tutor.caveat);
  // There is no way from here straight to published: only to review.
  await expect(card.getByRole("button", { name: t.edit.status.published })).toHaveCount(0);
  await card.getByRole("button", { name: t.edit.status.in_review }).click();
  await expect(card.getByText(t.edit.status.in_review, { exact: true }).first()).toBeVisible();
});

test("a tutor previews a culture card as a learner sees it, picks its words from the lexicon and saves", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.reload();

  await page.goto("/edit/culture");
  const card = page.getByTestId("culture-card").filter({ hasText: E2E.tutor.cardTitle });
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");

  // The learner's own card, in both languages.
  await card.getByRole("button", { name: t.edit.culture.preview }).click();
  await expect(card.getByTestId("culture-preview-en")).toContainText(E2E.tutor.cardTitle);
  await expect(card.getByTestId("culture-preview-nb")).toContainText("zz fikstur-kulturkort");

  // Words come from the lexicon only: search, pick, remove.
  const words = card.getByTestId("culture-words");
  await expect(words.getByText(E2E.lexemes.a.lemma, { exact: true })).toBeVisible();
  await words.getByRole("button", { name: t.edit.culture.addWord }).click();
  await words.getByLabel(t.edit.culture.searchWords).fill(E2E.lexemes.b.lemma);
  await words
    .getByTestId("culture-word-results")
    .getByRole("button", { name: new RegExp(E2E.lexemes.b.lemma) })
    .click();
  await words
    .getByRole("button", { name: fill(t.edit.culture.removeWord, { lemma: E2E.lexemes.a.lemma }) })
    .click();
  await expect(words.getByText(E2E.lexemes.b.lemma, { exact: true })).toBeVisible();
  await expect(words.getByText(E2E.lexemes.a.lemma, { exact: true })).toHaveCount(0);

  // Save does something visible: the toast, then the saved state after a reload.
  const edited = `${E2E.tutor.cardTitle} zz edited`;
  await card.getByLabel(t.edit.culture.cardTitle).first().fill(edited);
  await expect(card.getByText(t.edit.culture.unsaved)).toBeVisible();
  await card.getByRole("button", { name: t.edit.culture.save, exact: true }).click();
  await expect(page.getByText(t.edit.culture.saved, { exact: true }).first()).toBeVisible();
  await page.reload();
  const again = page.getByTestId("culture-card").filter({ hasText: edited });
  await expect(again.getByTestId("culture-words").getByText(E2E.lexemes.b.lemma)).toBeVisible();
  await expect(again.getByTestId("culture-last-edit")).toHaveText(
    new RegExp(fill(t.edit.culture.lastEdit.edit, { name: "ZZ Learner", time: "" }).trim()),
  );
});

test("a sentence the tutor writes can be sent to review, where it waits with her name on it", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.reload();
  await page.goto("/edit/write");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: new RegExp(t.edit.write.filter.fulfilled) }).click();
  const done = page.getByTestId("sentence-request").filter({ hasText: "zz-tutor-typed-" }).first();
  await expect(done).toBeVisible();
  const text = (await done.locator('[lang="xh"]').first().textContent())!.trim();
  await done.getByRole("button", { name: t.edit.write.sendToReview }).click();
  await expect(page.getByText(t.edit.write.sentToReview)).toBeVisible();
  await expect(done.getByText(t.edit.status.in_review, { exact: true })).toBeVisible();

  await page.goto("/edit/review");
  const row = page.getByTestId("review-row").filter({ hasText: text });
  await expect(row).toBeVisible();
  // Who wrote it, by name, not an id.
  await expect(row.getByTestId("review-by")).toHaveText(
    fill(t.edit.review.by, { name: "ZZ Learner" }),
  );
});

test("an admin bulk-approves from the review queue, and the publish gate still decides", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email, "admin");
  // The sentence the earlier tests wrote and sent: it has no recording yet.
  await page.goto("/edit/review");
  const row = page.getByTestId("review-row").filter({ hasText: "zz-tutor-typed-" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: fill(t.edit.review.bulk.approve, { count: 1 }) }).click();
  // The gate keeps it in review, and the row says why.
  await expect(row.getByTestId("review-blocked")).toBeVisible();
  await expect(row.getByText(t.edit.status.in_review, { exact: true })).toBeVisible();

  // Select all picks every row this admin may approve.
  const all = page.getByTestId("review-bulk").getByRole("checkbox");
  await all.check();
  await expect(row.getByRole("checkbox")).toBeChecked();
});
