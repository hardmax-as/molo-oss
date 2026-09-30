import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { seedE2eWebPurchase } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("checkout requires express start before payment and exposes the standard form", async ({
  page,
}) => {
  await signUpLearner(page, "NO");
  await page.goto("/plus");
  const buy = page.getByRole("button", { name: t.plus.cta, exact: true });
  await expect(buy.first()).toBeDisabled();
  await page.getByRole("checkbox", { name: t.withdrawal.expressStart }).check();
  await expect(buy.first()).toBeEnabled();
  // Do not invoke the payment SDK. The server also refuses a missing/false consent.
  const rejected = await page.request.post(`${E2E_API}/me/web-checkout`, {
    data: { productId: "molo_plus_monthly", expressStart: false },
  });
  expect(rejected.status()).toBe(400);
  const accepted = await page.request.post(`${E2E_API}/me/web-checkout`, {
    data: { productId: "molo_plus_monthly", expressStart: true },
  });
  expect(accepted.ok()).toBe(true);
  await page.goto("/terms");
  // The terms link to the form. SSR paints the link before the router hydrates,
  // and a click in that window can be swallowed; click again until it navigates,
  // and never fall back to typing the URL, so a missing or dead link still fails.
  const toForm = page.locator('a[href="/withdrawal-form"]').first();
  await expect(toForm).toBeVisible();
  await expect(async () => {
    if (new URL(page.url()).pathname !== "/withdrawal-form") await toForm.click({ timeout: 2_000 });
    await expect(page).toHaveURL((url) => url.pathname === "/withdrawal-form", { timeout: 2_000 });
  }).toPass({ timeout: 20_000, intervals: [250, 500, 1_000] });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Molo Plus");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: t.withdrawal.downloadForm }).click();
  const form = await download;
  expect(form.suggestedFilename()).toBe("molo-withdrawal-form-en.txt");
  expect(await readFile((await form.path())!, "utf8")).toContain("support@hellomolo.com");
});

test("withdrawal stops Plus and keeps a confirmation after reload and duplicate requests", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  const purchase = await seedE2eWebPurchase(E2E_DATABASE_URL, email);
  await page.goto("/settings");
  await page.getByRole("button", { name: t.withdrawal.start, exact: true }).click();
  await page.getByRole("button", { name: t.withdrawal.confirm, exact: true }).click();
  await expect(page.getByText(t.withdrawal.pending, { exact: true })).toBeVisible();
  expect((await (await page.request.get(`${E2E_API}/me`)).json()).plan).toMatchObject({
    plan: "free",
    withdrawn: true,
  });
  const retry = await page.request.post(`${E2E_API}/me/withdrawal`, {
    data: { purchaseId: purchase.id },
  });
  expect(retry.ok()).toBe(true);
  expect((await retry.json()).requestedAt).not.toBeNull();
  await page.reload();
  await expect(page.getByText(t.withdrawal.pending, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: t.withdrawal.receipt }).click();
  expect((await download).suggestedFilename()).toBe(`molo-withdrawal-${purchase.id}.txt`);
});
