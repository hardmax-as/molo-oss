import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { dismissGrammarNote, fill, meetNewWords, signUpLearner, t } from "./helpers.ts";

/**
 * The lesson's header and its way out. Hearts sit on the right and a wrong
 * answer costs one there, at once; a lesson with an answer given asks before
 * it is left, by the ✕ or by any other link, and "Keep going" is the
 * default. The motion itself is off here (the config asks for reduced
 * motion), so these are the states, not the animation.
 */
test("the header counts hearts down, and leaving halfway asks first", async ({ page }) => {
  await signUpLearner(page);
  await page.getByRole("link", { name: /min · 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}/[0-9a-f-]{36}$`));
  await dismissGrammarNote(page);

  // Five hearts to start, on the right of the header.
  const hearts = page.getByTestId("lesson-hearts");
  await expect(hearts).toHaveAttribute("aria-label", fill(t.hearts.count, { hearts: 5, max: 5 }));

  // A wrong answer costs a heart in the header, and the page says so in words.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await expect(hearts).toHaveAttribute("aria-label", fill(t.hearts.count, { hearts: 4, max: 5 }));
  await expect(page.getByText(fill(t.hearts.lost, { hearts: 4, max: 5 }))).toBeAttached();

  // One answer given: the ✕ asks, and "Keep going" keeps the lesson.
  const dialog = page.getByRole("alertdialog", { name: t.lesson.leaveTitle });
  await page.getByRole("link", { name: t.lesson.exit }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(t.lesson.leaveBody);
  await expect(page.getByTestId("leave-lesson-stay")).toBeFocused();
  await page.getByTestId("leave-lesson-stay").click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}/[0-9a-f-]{36}$`));
  await expect(hearts).toHaveAttribute("aria-label", fill(t.hearts.count, { hearts: 4, max: 5 }));

  // Escape is "Keep going" too; "Leave" goes.
  await page.getByRole("link", { name: t.lesson.exit }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: t.lesson.exit }).click();
  await page.getByTestId("leave-lesson-confirm").click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));
});

test("a fresh lesson's ✕ leaves at once: there is nothing to lose yet", async ({ page }) => {
  await signUpLearner(page);
  await page.getByRole("link", { name: /min · 2/ }).click();
  await dismissGrammarNote(page);
  await meetNewWords(page);
  await page.getByRole("link", { name: t.lesson.exit }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
