import { expect, test } from "@playwright/test";

import { grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

/**
 * A deploy while the tutor has an editor page open: once /build.json names a
 * build other than the one the page runs, /edit/* says so and offers a
 * refresh. The dev server writes no /build.json, so the test serves one.
 */
test("an editor page offers a refresh once a newer build is served, and not before", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);

  let served: string | null = null;
  await page.route("**/build.json", (route) =>
    served === null
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ contentType: "application/json", body: JSON.stringify({ build: served }) }),
  );

  await page.goto("/edit/goldens");
  await expect(page.getByRole("heading", { name: t.edit.goldens.title })).toBeVisible();
  const banner = page.getByTestId("new-version");
  await expect(banner).toHaveCount(0);

  // A deploy lands; the check runs again when the tab comes back into view.
  served = "zz-a-newer-build";
  const checked = page.waitForRequest("**/build.json");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await checked;
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(t.edit.newVersion.text);

  // Refresh reloads the page (the served build is still "newer" in this test).
  const reloaded = page.waitForEvent("load");
  await banner.getByRole("button", { name: t.edit.newVersion.refresh }).click();
  await reloaded;
  await expect(page.getByRole("heading", { name: t.edit.goldens.title })).toBeVisible();

  // Learner pages never poll.
  served = null;
  const polls: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/build.json")) polls.push(r.url());
  });
  await page.goto("/");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(500);
  expect(polls).toEqual([]);
});
