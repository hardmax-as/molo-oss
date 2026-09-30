import { expect, test } from "@playwright/test";

import { signUpLearner, t } from "./helpers.ts";

test("sign-up reaches home when account creation exceeds the UI assertion timeout", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/auth/sign-up/email", async (route) => {
    submissions += 1;
    const response = await route.fetch();
    // Model a slow CI worker without replacing the real account or session.
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    await route.fulfill({ response });
  });

  await signUpLearner(page);

  expect(submissions).toBe(1);
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible();
  await expect(page.getByRole("button", { name: t.nav.signOut })).toBeVisible();
});
