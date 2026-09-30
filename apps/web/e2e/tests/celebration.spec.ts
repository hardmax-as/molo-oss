import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { fill, playFixtureLesson, signUpLearner, t } from "./helpers.ts";

/**
 * The end-of-lesson sequence (docs/DESIGN.md "After a lesson"). The seeded
 * unit has one lesson, so finishing it perfectly on a fresh account earns
 * three beats: the lesson, the first day of a streak, and the unit itself.
 */

const path = new RegExp(`/learn/${E2E.unitSlug}$`);

test("a lesson ends in the celebration sequence, one earned beat at a time", async ({ page }) => {
  await signUpLearner(page);
  await playFixtureLesson(page);

  // Beat one: the lesson. A perfect run, the XP and the accuracy line.
  await expect(page.getByTestId("celebration-lesson")).toBeVisible();
  await expect(page.getByText(t.celebration.lesson.perfect)).toBeVisible();
  await expect(
    page.getByText(fill(t.celebration.lesson.accuracy, { correct: 2, total: 2, percent: 100 })),
  ).toBeVisible();

  // The server's answer adds the beats it knows about, which is what turns
  // the button from "back to the path" into "continue".
  const next = page.getByTestId("celebration-continue");
  await expect(next).toHaveText(t.celebration.continue);
  await next.click();

  // Beat two: the streak this lesson started, with the week strip.
  await expect(page.getByTestId("celebration-streak")).toBeVisible();
  await expect(page.getByText(t.celebration.streak.title)).toBeVisible();
  await expect(page.getByRole("img", { name: t.celebration.a11y.week })).toBeVisible();
  await expect(page.getByText(t.celebration.streak.dayLabel_one)).toBeVisible();
  await next.click();

  // Beat three: the unit, finished without a wrong answer.
  await expect(page.getByTestId("celebration-unit")).toBeVisible();
  await expect(page.getByText(t.celebration.unit.titleFlawless)).toBeVisible();
  await expect(next).toHaveText(t.celebration.back);

  // Nothing the learner did not earn: no milestone medal after two words.
  await expect(page.getByTestId("celebration-milestone")).toHaveCount(0);

  await next.click();
  await expect(page).toHaveURL(path);
  await expect(page.getByTestId("celebration")).toHaveCount(0);
});

test("skipping the sequence goes straight back to the path", async ({ page }) => {
  await signUpLearner(page);
  await playFixtureLesson(page);
  await expect(page.getByTestId("celebration-lesson")).toBeVisible();
  // Wait until the sequence has all three beats, so this really is a skip.
  await expect(page.getByTestId("celebration-continue")).toHaveText(t.celebration.continue);
  await page.getByRole("button", { name: t.celebration.skipAll }).click();
  await expect(page).toHaveURL(path);
  await expect(page.getByTestId("celebration")).toHaveCount(0);
  // The lesson still counted: the server had the completion before the skip.
  await expect(page.getByText(/40 \/ \d+ XP today/)).toBeVisible();
});
