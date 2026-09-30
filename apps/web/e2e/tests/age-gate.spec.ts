import { expect, test } from "@playwright/test";

import { findE2eUser } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL, E2E_WEB } from "../playwright.config.ts";
import { t } from "./helpers.ts";

test("the API rejects missing, forged, underage and unconfirmed age declarations", async ({
  request,
}) => {
  const year = new Date().getUTCFullYear();
  for (const age of [
    {},
    { ageOk: true },
    { birthYear: year - 12, country: "NO", ageReached: true },
    { birthYear: year - 17, country: "ZA", ageReached: true },
    { birthYear: year - 13, country: "NO" },
    { birthYear: year - 18, country: "ZA" },
    { birthYear: 1990, country: "" },
  ]) {
    const email = `zz-age-${crypto.randomUUID()}@molo.local`;
    const response = await request.post(`${E2E_API}/api/auth/sign-up/email`, {
      data: { name: "ZZ Age", email, password: "zz-e2e-password-1234", ...age },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe("AGE_REQUIREMENT");
    expect(await findE2eUser(E2E_DATABASE_URL, email)).toBeNull();
  }
});

test("an eligible account stores age_ok and country but cannot overwrite either through update-user", async ({
  request,
}) => {
  const email = `zz-age-${crypto.randomUUID()}@molo.local`;
  const signup = await request.post(`${E2E_API}/api/auth/sign-up/email`, {
    data: {
      name: "ZZ Age",
      email,
      password: "zz-e2e-password-1234",
      birthYear: new Date().getUTCFullYear() - 13,
      country: "NO",
      ageReached: true,
    },
  });
  expect(signup.ok()).toBe(true);
  await request.post(`${E2E_API}/api/auth/update-user`, {
    headers: { Origin: E2E_WEB },
    data: { ageOk: false, birthYear: 2000, country: "ZA" },
  });
  const user = await findE2eUser(E2E_DATABASE_URL, email);
  expect(user?.ageOk).toBe(true);
  expect(user).not.toHaveProperty("birthYear");
  expect(user?.country).toBe("NO");
  expect(user).not.toHaveProperty("ageReached");
});

test("the sign-up form explains the country-specific age refusal", async ({ page }) => {
  await page.goto("/auth");
  await expect(async () => {
    await page.getByRole("button", { name: t.auth.signUp, exact: true }).click();
    await expect(page.getByRole("heading", { name: t.auth.signUp })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel(t.auth.name).fill("ZZ Age");
  await page.getByLabel(t.auth.email).fill(`zz-age-${crypto.randomUUID()}@molo.local`);
  await page.getByLabel(t.auth.password).fill("zz-e2e-password-1234");
  await page.getByLabel(t.age.birthYear).fill(String(new Date().getUTCFullYear() - 17));
  await page.getByLabel(t.age.country).selectOption("ZA");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText(t.age.errors.under18ZA)).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});
