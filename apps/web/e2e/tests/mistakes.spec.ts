import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { dismissGrammarNote, meetNewWords, signUpLearner, skipCelebration, t } from "./helpers.ts";

test("a word answered wrong in a lesson turns up in the mistakes session and clears when it is answered right", async ({
  page,
}) => {
  await signUpLearner(page);

  // Nothing has gone wrong yet, so the entry is not offered.
  await expect(page.getByTestId("mistakes-link")).toHaveCount(0);

  await page.getByRole("link", { name: /min · 2/ }).click();
  await dismissGrammarNote(page);

  // Exercise 1 prompts lexeme a (met on its card first); pick b's gloss on purpose.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  // The verdict has its own live region; the tiles also carry the words
  // for screen readers, so target the region rather than the text.
  await expect(page.getByRole("status", { name: t.a11y.answerFeedback })).toContainText(
    t.lesson.incorrect,
  );
  await page.getByRole("button", { name: t.lesson.continue }).click();

  // Exercise 2 prompts lexeme b; answer it right.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await expect(page.getByRole("status", { name: t.a11y.answerFeedback })).toContainText(
    t.lesson.correct,
  );
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await skipCelebration(page);
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));

  // The path now offers the mistakes session with one word waiting.
  await page.goto("/");
  const entry = page.getByTestId("mistakes-link");
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(t.mistakes.title);
  await entry.click();
  await expect(page).toHaveURL(/\/mistakes$/);

  // The word that was missed is the one on the card; the review UI runs it.
  await expect(page.getByRole("heading", { name: E2E.lexemes.a.lemma })).toBeVisible();
  await page.getByRole("button", { name: t.review.reveal }).click();
  await expect(page.getByText(E2E.lexemes.a.en)).toBeVisible();
  await page.getByRole("button", { name: t.mistakes.knewIt }).click();

  // Cleared: the session is done and the entry is gone from the path.
  await expect(page.getByTestId("mistakes-done")).toHaveText(t.mistakes.sessionDone);
  await page.goto("/");
  await expect(page.getByTestId("mistakes-link")).toHaveCount(0);
});
