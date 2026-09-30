import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { dismissGrammarNote, fill, meetNewWords, signUpLearner, t } from "./helpers.ts";

test("a learner signs up, sees only published units, completes a lesson and earns XP", async ({
  page,
}) => {
  await signUpLearner(page);

  // The path: only the published unit is walkable. The unit behind a
  // prerequisite is a shut node, and the draft unit is not on the path at all.
  await expect(page.getByTestId("path-node")).toHaveCount(1);
  await expect(page.getByTestId("path-node-locked")).toHaveCount(1);
  await expect(page.getByTestId("path-unit-banner")).toHaveCount(2);

  // One skill, one lesson with two exercises; the node opens it straight from home.
  const lessonLink = page.getByRole("link", { name: /min · 2/ });
  await expect(lessonLink).toHaveCount(1);
  await lessonLink.click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}/[0-9a-f-]{36}$`));

  // The skill's rule stands in front of the drill; reading it opens the lesson.
  await dismissGrammarNote(page);

  // A fresh learner meets word a on a card first: the word, its meaning, and
  // nothing scored. The draft word is never among what a card shows.
  const card = page.getByTestId("new-word-card");
  await expect(card).toBeVisible();
  await expect(card.getByText(E2E.lexemes.a.lemma)).toBeVisible();
  await expect(card.getByText(E2E.lexemes.a.en)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: t.a11y.lessonProgress })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await meetNewWords(page);

  // Exercise 1: prompt a, pick a's gloss.
  await page.getByRole("button", { name: E2E.lexemes.a.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await expect(page.getByRole("status", { name: t.a11y.answerFeedback })).toContainText(
    t.lesson.correct,
  );
  await page.getByRole("button", { name: t.lesson.continue }).click();

  // Exercise 2: word b is met first, then prompt b, pick b's gloss.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await expect(page.getByRole("status", { name: t.a11y.answerFeedback })).toContainText(
    t.lesson.correct,
  );
  await page.getByRole("button", { name: t.lesson.continue }).click();

  // The celebration sequence opens on the lesson beat: a perfect run, the
  // XP count-up and the accuracy line. Skipping it lands back on the path.
  await expect(page.getByTestId("celebration-lesson")).toBeVisible();
  await expect(page.getByText(t.celebration.lesson.perfect)).toBeVisible();
  await expect(
    page.getByText(fill(t.celebration.lesson.accuracy, { correct: 2, total: 2, percent: 100 })),
  ).toBeVisible();
  // The server's answer adds the beats it knows about, which is what turns
  // the button from "back to the path" into "continue"; from there, skip.
  await expect(page.getByTestId("celebration-continue")).toHaveText(t.celebration.continue);
  await page.getByRole("button", { name: t.celebration.skipAll }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));
  // 2 correct × 10 XP + 20 XP perfect bonus, computed server-side.
  await expect(page.getByText(/40 \/ \d+ XP today/)).toBeVisible();
  await expect(page.getByRole("img", { name: "1 day streak" })).toBeVisible();

  // The draft lexeme's gloss never appears anywhere a learner can reach.
  await expect(page.getByText(E2E.lexemes.draft.en)).toHaveCount(0);
});
