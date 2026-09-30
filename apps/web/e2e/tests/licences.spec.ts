import { expect, test } from "@playwright/test";

import nb from "../../../../packages/i18n/src/locales/nb.json" with { type: "json" };
import { signUpLearner, t } from "./helpers.ts";

test("attributions and library notices are linked from the footer and settings", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: t.legal.licences }).click();
  await expect(page.getByRole("heading", { name: t.legal.licences })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pronunciation by Forvo" })).toHaveAttribute(
    "href",
    "https://forvo.com/",
  );
  await expect(page.getByRole("link", { name: "Corpus of Spoken isiXhosa" })).toHaveAttribute(
    "href",
    "https://doi.org/10.23695/xrsg-mp07",
  );
  await page.getByRole("searchbox", { name: t.licences.search }).fill("react");
  const reactVersions = page
    .locator("details")
    .filter({ has: page.locator("strong", { hasText: /^react$/ }) });
  expect(await reactVersions.count()).toBeGreaterThan(0);
  for (const react of await reactVersions.all()) {
    await react.locator("summary").click();
    await expect(react).toContainText("Permission is hereby granted");
  }
  await signUpLearner(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: t.legal.licences }).click();
  await expect(page.getByRole("heading", { name: t.legal.licences })).toBeVisible();
});

test("Norwegian attribution and headings are bundled too", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("molo.lang", "nb"));
  await page.goto("/licences");
  await expect(page.getByRole("heading", { name: nb.legal.licences })).toBeVisible();
  await expect(page.getByRole("heading", { name: nb.licences.libraries })).toBeVisible();
  await expect(page.getByText(/Vi har tilpasset ordforklaringene for elever/)).toBeVisible();
});
