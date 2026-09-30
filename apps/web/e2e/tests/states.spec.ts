import { expect, test } from "@playwright/test";

import { signUpLearner, t } from "./helpers.ts";

/** W14: the not-found and role-denied states speak the UI language and offer a way back. */

test("an unknown address says so in the UI language, with a link back to the start", async ({
  page,
}) => {
  await page.goto("/zz-no-such-page");
  const card = page.getByTestId("not-found");
  await expect(card.getByRole("heading", { name: t.common.notFoundTitle })).toBeVisible();
  await expect(card.getByRole("link", { name: t.common.backHome })).toHaveAttribute("href", "/");
});

test("a visitor on /edit is asked to sign in, and a learner is sent back to learning", async ({
  page,
}) => {
  await page.goto("/edit");
  const denied = page.getByTestId("editor-denied");
  await expect(denied.getByText(t.edit.deniedSignIn)).toBeVisible();
  await expect(denied.getByRole("link", { name: t.nav.signIn })).toHaveAttribute("href", "/auth");

  await signUpLearner(page);
  await page.goto("/edit");
  await expect(denied.getByRole("heading", { name: t.edit.deniedTitle })).toBeVisible();
  await expect(denied.getByText(t.edit.deniedBody)).toBeVisible();
  await expect(denied.getByRole("link", { name: t.edit.backToLearning })).toHaveAttribute(
    "href",
    "/",
  );
});
