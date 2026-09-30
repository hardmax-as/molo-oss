import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { meetNewWords, signUpLearner, skipCelebration, t } from "./helpers.ts";

/**
 * The rule reaches a learner the way docs/GRAMMAR.md decided: before the
 * drill, skippable, remembered, and named again when an answer is wrong.
 *
 * Every string asserted here is fixture text (`zz-`). Nothing in this file
 * claims anything about isiXhosa, and the draft note beside the published
 * one is the assertion that matters most: it must never appear.
 */
test("the rule appears before the drill, is skippable, and is remembered", async ({ page }) => {
  await signUpLearner(page);
  await page.getByRole("link", { name: /min · 2/ }).click();

  // The note stands in front of the first exercise: the worked example, the
  // rule, and the paradigm — not the drill.
  const note = page.getByTestId("grammar-note");
  await expect(note).toBeVisible();
  await expect(note.getByRole("heading", { name: E2E.grammar.en.title })).toBeVisible();
  await expect(note).toContainText(E2E.grammar.en.rule);
  await expect(page.getByRole("button", { name: t.lesson.check })).toHaveCount(0);

  // A real table: a caption, a column header row and a row header.
  const table = note.getByRole("table");
  await expect(table).toHaveCount(1);
  await expect(table.getByRole("columnheader", { name: t.grammar.columns.singular })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "9" })).toBeVisible();

  // The audio is part of the rule: every cell has a control, and the cell
  // with no recording says so rather than pretending.
  await expect(note.getByRole("button", { name: t.lesson.listen })).not.toHaveCount(0);
  await expect(note.getByRole("img", { name: t.lesson.noAudio }).first()).toBeVisible();

  // Nothing that is not published gets in.
  await expect(page.getByText(E2E.grammar.draftTitle)).toHaveCount(0);

  // Skipping opens the drill, once the first new word has been met.
  await page.getByTestId("grammar-note-skip").click();
  await expect(note).toBeHidden();
  await meetNewWords(page);
  await expect(page.getByRole("button", { name: t.lesson.check })).toBeVisible();

  // A wrong answer names the pattern, inside the verdict's own live region.
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  const verdict = page.getByRole("status", { name: t.a11y.answerFeedback });
  await expect(verdict).toContainText(t.lesson.incorrect);
  await expect(verdict).toContainText(E2E.grammar.en.title);
  await expect(verdict).toContainText(E2E.grammar.en.correction);
  await page.getByRole("button", { name: t.lesson.continue }).click();

  // Finish, and come back: a rule that has been dismissed does not stop the
  // learner a second time, and nor do words already met.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await skipCelebration(page);
  await page.getByRole("link", { name: /min · 2/ }).click();
  await expect(page.getByRole("button", { name: t.lesson.check })).toBeVisible();
  await expect(page.getByTestId("grammar-note")).toHaveCount(0);
});

test("the reference page lists the rules a learner has unlocked, and nothing else", async ({
  page,
}) => {
  await signUpLearner(page);

  // Before any lesson, the rule is there but not unlocked, so it is counted
  // rather than shown.
  await page.getByRole("link", { name: t.nav.grammar }).click();
  await expect(page.getByRole("heading", { level: 1, name: t.grammar.title })).toBeVisible();
  await expect(page.getByText(E2E.grammar.en.rule)).toHaveCount(0);
  await page.getByRole("button", { name: t.grammar.reference.showLocked }).click();
  await expect(page.getByText(E2E.grammar.en.title)).toBeVisible();
  await expect(page.getByText(E2E.grammar.draftTitle)).toHaveCount(0);

  // Finish a lesson in the note's skill and it opens, with its example and
  // its paradigm.
  await page.goto("/");
  await page.getByRole("link", { name: /min · 2/ }).click();
  await page.getByRole("button", { name: t.grammar.gotIt }).click();
  for (const lexeme of [E2E.lexemes.a, E2E.lexemes.b]) {
    await meetNewWords(page);
    await page.getByRole("button", { name: lexeme.en, exact: true }).click();
    await page.getByRole("button", { name: t.lesson.check }).click();
    await page.getByRole("button", { name: t.lesson.continue }).click();
  }
  await skipCelebration(page);

  await page.getByRole("link", { name: t.nav.grammar }).click();
  const entry = page.getByTestId("grammar-note");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText(E2E.grammar.en.rule);
  await expect(entry.getByRole("table")).toHaveCount(1);
  // The reference page is a place to read, not a lesson: no way onward.
  await expect(entry.getByRole("button", { name: t.grammar.gotIt })).toHaveCount(0);
  await expect(page.getByText(E2E.grammar.draftTitle)).toHaveCount(0);
});
