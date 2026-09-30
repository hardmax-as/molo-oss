import { expect, test } from "@playwright/test";

import { E2E_API } from "../playwright.config.ts";
import { fill, signUpLearner, t } from "./helpers.ts";

/**
 * A signed-in learner is never offered Sign in, and Settings opens with an
 * Account section: name, e-mail, password, league name and the ways to sign
 * in. The server's own refusals (name filter, wrong current password) reach
 * the learner as words, not a generic error.
 */

// Each test signs up through the form first, and the first spec of a run also
// meets a cold dev server: one local run took 40 s of the default 45 s.
test.describe.configure({ timeout: 90_000 });

test("a signed-in learner lands on the path with no Sign in anywhere", async ({ page }) => {
  await signUpLearner(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible();
  await expect(page.getByRole("link", { name: t.landing.hero.cta })).toHaveCount(0);
  for (const name of [t.auth.signIn, t.nav.signIn]) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByTestId("header-sign-in")).toHaveCount(0);
  // A bookmark to the sign-in page goes back to the path.
  await page.goto("/auth");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible();
});

test("the header's Account entry opens the Account section, and its edits stick", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  // From 640 px the header carries Account as an icon beside the gear (below
  // that it is in the menu, covered by header-phone.spec.ts).
  await page.setViewportSize({ width: 1280, height: 900 });
  const entry = page.getByTestId("header-account");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("href", "/settings#account");
  await expect(async () => {
    if (new URL(page.url()).pathname !== "/settings") await entry.click({ timeout: 2_000 });
    await expect(page).toHaveURL((url) => url.pathname === "/settings", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page).toHaveURL((url) => url.pathname === "/settings" && url.hash === "#account");
  const account = page.locator("#account");
  await expect(
    account.getByRole("heading", { name: t.settings.profile.title, exact: true }),
  ).toBeVisible();
  await expect(account.getByTestId("account-email")).toHaveText(email);
  // The ways to sign in live in the same section.
  await expect(account.getByRole("heading", { name: t.settings.connected.title })).toBeVisible();

  // Let the section finish loading: the password card waits for the list of
  // sign-in methods and pushes the cards above it around when it arrives.
  await expect(account.getByTestId("password-change")).toBeVisible();

  // Name. SSR paints the form before React hydrates it, and a value typed in
  // that window is reset: fill, save and check the server until the save lands.
  const saveName = account.getByRole("button", { name: t.settings.profile.nameSave });
  const savedName = async () =>
    (await (await page.request.get(`${E2E_API}/me`)).json()).user.name as string;
  await expect(async () => {
    if ((await savedName()) !== "Nomsa Dube") {
      await account.getByTestId("account-name").fill("  Nomsa Dube ");
      await saveName.click({ timeout: 2_000 });
    }
    await expect.poll(savedName, { timeout: 3_000 }).toBe("Nomsa Dube");
  }).toPass({ timeout: 30_000 });

  // League display name: the name filter's refusal is shown, and the save is held back.
  const display = account.getByLabel(t.leagueSettings.displayName, { exact: true });
  await display.fill("Molo Team");
  await expect(account.getByText(t.leagueSettings.nameNotAllowed)).toBeVisible();
  await expect(account.getByRole("button", { name: t.leagueSettings.save })).toBeDisabled();

  // Password: a wrong current password is named as such; the right one changes it.
  await account.getByTestId("current-password").fill("not-the-password");
  await account.getByTestId("new-password").fill("zz-e2e-new-password-99");
  await account.getByRole("button", { name: t.settings.profile.passwordSave }).click();
  await expect(account.getByText(t.settings.profile.passwordWrong)).toBeVisible();
  await account.getByTestId("current-password").fill("zz-e2e-password-1234");
  await account.getByRole("button", { name: t.settings.profile.passwordSave }).click();
  await expect(page.getByText(t.settings.profile.passwordChanged)).toBeVisible();
  // Still signed in on this device after other sessions were ended.
  await expect
    .poll(async () => (await (await page.request.get(`${E2E_API}/me`)).json())?.user?.email)
    .toBe(email);

  // E-mail: a link goes to the new address; the account keeps the old one until it is opened.
  const next = `zz-new-${Date.now()}@molo.local`;
  await account.getByTestId("account-new-email").fill(next);
  await account.getByRole("button", { name: t.settings.profile.emailSend }).click();
  await expect(
    account.getByText(fill(t.settings.profile.emailSent, { email: next })),
  ).toBeVisible();
  expect((await (await page.request.get(`${E2E_API}/me`)).json()).user.email).toBe(email);
});
