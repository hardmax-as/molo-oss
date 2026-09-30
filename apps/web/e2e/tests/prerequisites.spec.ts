import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("a unit stays locked until its prerequisite is finished, and the API refuses a lesson inside it", async ({
  page,
}) => {
  await signUpLearner(page);

  // The path shows the locked unit's stretch quietly: its header names the
  // unit that opens it, and its node is a shut button rather than a link.
  const banner = page.getByTestId("path-unit-banner").filter({
    hasText: t.units.lockedHint.replace("{{unit}}", t.units.unit1.title),
  });
  await expect(banner).toHaveCount(1);
  await expect(page.getByTestId("path-node-locked")).toHaveCount(1);
  await expect(page.getByTestId("path-node")).toHaveCount(1);

  // The lock is not cosmetic: completing a lesson in the locked unit is refused.
  const lockedUnit = await (
    await page.request.get(`${E2E_API}/units/${E2E.lockedUnitSlug}`)
  ).json();
  const lockedLessonId = lockedUnit.unit.skills[0].lessons[0].id as string;
  const today = new Date().toISOString().slice(0, 10);
  const refused = await page.request.post(`${E2E_API}/lessons/${lockedLessonId}/complete`, {
    data: { correct: 1, total: 1, today },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe("unit_locked");

  // Finish the prerequisite's only lesson; the lock lifts.
  const unit = await (await page.request.get(`${E2E_API}/units/${E2E.unitSlug}`)).json();
  const lessonId = unit.unit.skills[0].lessons[0].id as string;
  const done = await page.request.post(`${E2E_API}/lessons/${lessonId}/complete`, {
    data: { correct: 2, total: 2, today },
  });
  expect(done.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByTestId("path-node-locked")).toHaveCount(0);
  await expect(page.getByTestId("path-node")).toHaveCount(2);

  // And now the lesson inside it is credited.
  const credited = await page.request.post(`${E2E_API}/lessons/${lockedLessonId}/complete`, {
    data: { correct: 1, total: 1, today },
  });
  expect(credited.ok()).toBe(true);
});
