import { expect, test } from "@playwright/test";

import { E2E_API } from "../playwright.config.ts";
import { playFixtureLesson, signUpLearner, t } from "./helpers.ts";

test("league settings replace the account surname, remove membership and survive reload", async ({
  page,
}) => {
  await signUpLearner(page);
  await playFixtureLesson(page);
  await expect
    .poll(async () => {
      const league = await (await page.request.get(`${E2E_API}/leagues/current`)).json();
      return league.standings.find((row: { isMe: boolean }) => row.isMe)?.name;
    })
    .toBe("ZZ");
  await page.goto("/settings");
  await page.getByLabel(t.leagueSettings.displayName, { exact: true }).fill("Starling");
  await page.getByRole("button", { name: t.leagueSettings.save }).click();
  await expect
    .poll(
      async () => (await (await page.request.get(`${E2E_API}/me`)).json()).leagueProfile.publicName,
    )
    .toBe("Starling");
  const renamed = await (await page.request.get(`${E2E_API}/leagues/current`)).json();
  expect(renamed.standings.find((row: { isMe: boolean }) => row.isMe).name).toBe("Starling");
  await page.getByLabel(t.leagueSettings.optOut, { exact: true }).check();
  await page.getByRole("button", { name: t.leagueSettings.save }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${E2E_API}/me`)).json()).leagueProfile.leaguesOptOut,
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByLabel(t.leagueSettings.displayName, { exact: true })).toHaveValue(
    "Starling",
  );
  await expect(page.getByLabel(t.leagueSettings.optOut, { exact: true })).toBeChecked();
  await page.goto("/leagues");
  await expect(page.getByText(t.leagueSettings.disabled)).toBeVisible();
  const removed = await (await page.request.get(`${E2E_API}/leagues/current`)).json();
  expect(removed.standings).toEqual([]);
  expect(removed.league).toBeNull();
  const invalid = await page.request.put(`${E2E_API}/me/league-profile`, {
    data: { displayName: "a".repeat(41), leaguesOptOut: false },
  });
  expect(invalid.status()).toBe(400);
});
