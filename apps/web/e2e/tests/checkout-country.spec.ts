import { expect, test } from "@playwright/test";

import { seedE2eUnknownCountry } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API, E2E_DATABASE_URL, E2E_WEB } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("Norwegian registration enables express-start checkout and exports the retained country", async ({
  page,
}) => {
  await signUpLearner(page, "NO");
  await page.goto("/plus");
  await expect(page.getByText(t.plus.appStoresOnly)).toHaveCount(0);
  await page.getByRole("checkbox", { name: t.withdrawal.expressStart }).check();
  await expect(page.getByRole("button", { name: t.plus.cta, exact: true }).first()).toBeEnabled();
  const accepted = await page.request.post(`${E2E_API}/me/web-checkout`, {
    data: { productId: "molo_plus_monthly", expressStart: true },
  });
  expect(accepted.status()).toBe(200);
  const exported = await (await page.request.get(`${E2E_API}/me/export`)).json();
  expect(exported.user.country).toBe("NO");
  expect(exported.user).not.toHaveProperty("birthYear");
});

for (const country of ["ZA", "OTHER", null] as const) {
  test(`${country ?? "unknown"} country gets app stores and cannot bypass the server gate`, async ({
    page,
  }) => {
    const email = await signUpLearner(page, country ?? "NO");
    if (country === null) await seedE2eUnknownCountry(E2E_DATABASE_URL, email);
    await page.goto("/plus");
    // A known country outside Norway and an account with no recorded country
    // are told different things (W13); neither can check out on the web.
    await expect(
      page.getByText(country === null ? t.plus.noCountry : t.plus.appStoresOnly),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: t.withdrawal.expressStart })).toHaveCount(0);
    await expect(page.getByRole("button", { name: t.plus.cta, exact: true })).toHaveCount(0);
    const forged = await page.request.post(`${E2E_API}/api/auth/update-user`, {
      headers: { Origin: E2E_WEB },
      data: { country: "NO" },
    });
    expect(forged.status()).toBe(400);
    const refused = await page.request.post(`${E2E_API}/me/web-checkout`, {
      data: { productId: "molo_plus_monthly", expressStart: true, country: "NO" },
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe("web_checkout_country");
    const me = await (await page.request.get(`${E2E_API}/me`)).json();
    expect(me.user.country).toBe(country);
  });
}

test("a guest on /plus is not told to use the stores, and gets a way to sign in (W13)", async ({
  page,
}) => {
  await page.goto("/plus");
  await expect(page.getByTestId("plus-guest")).toHaveText(t.plus.guestNote);
  await expect(page.getByTestId("plus-stores")).toHaveCount(0);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: t.auth.signIn }).first()).toHaveAttribute(
    "href",
    "/auth",
  );
  await expect(page.getByRole("button", { name: t.plus.cta, exact: true })).toHaveCount(0);
});
