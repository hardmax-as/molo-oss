import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("a learner out of hearts sees the pause card with practice and Plus; hearts come back with practice", async ({
  page,
}) => {
  await signUpLearner(page);
  // Completing the lesson once (through the API) creates the review cards practice needs.
  const unit = await (await page.request.get(`${E2E_API}/units/${E2E.unitSlug}`)).json();
  const lessonId = unit.unit.skills[0].lessons[0].id as string;
  const today = new Date().toISOString().slice(0, 10);
  await page.request.post(`${E2E_API}/lessons/${lessonId}/complete`, {
    data: { correct: 2, total: 2, today },
  });

  // Five hearts to start; drain them through the API the lesson runner uses.
  const before = await (await page.request.get(`${E2E_API}/me/hearts`)).json();
  expect(before).toMatchObject({ hearts: 5, max: 5, unlimited: false });
  for (let i = 0; i < 5; i++) await page.request.post(`${E2E_API}/me/hearts/lose`);
  const empty = await (await page.request.get(`${E2E_API}/me/hearts`)).json();
  expect(empty.hearts).toBe(0);

  // The lesson page pauses instead of starting.
  await page.goto(`/learn/${E2E.unitSlug}`);
  await page.getByRole("link", { name: /min · 2/ }).click();
  await expect(page.getByRole("heading", { name: t.hearts.outTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: t.hearts.getPlus })).toBeVisible();

  // Practice: rating cards gives a heart back after five ratings.
  await page.getByRole("link", { name: /^Practise/ }).click();
  await expect(page).toHaveURL(/\/review$/);
  const session = await (await page.request.get(`${E2E_API}/review/session?lang=en`)).json();
  const cards = [...session.due, ...session.fresh];
  expect(cards.length).toBeGreaterThan(0);
  let earned = false;
  for (let i = 0; i < 5; i++) {
    const card = cards[i % cards.length];
    const r = await (
      await page.request.post(`${E2E_API}/review/${card.cardId}`, { data: { rating: 3, today } })
    ).json();
    if (r.heartEarned) earned = true;
  }
  expect(earned).toBe(true);
  expect((await (await page.request.get(`${E2E_API}/me/hearts`)).json()).hearts).toBe(1);
});
