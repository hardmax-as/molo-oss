import { expect, test } from "@playwright/test";

import { fill, signUpLearner, t } from "./helpers.ts";

/** A `/me` answer for an account that is (or is no longer) waiting for the age step. */
function meFixture(ageRequired: boolean) {
  return {
    user: { id: "fixture-user", name: "Fixture Learner", email: "fixture@molo.local" },
    roles: ["learner"],
    ageRequired,
    sourceLang: "en",
    course: {
      id: "fixture-course",
      slug: "xhosa",
      targetLang: "xh",
      titleKey: "course.xh",
      order: 0,
      isDefault: true,
    },
    prefs: {
      sourceLang: "en",
      courseId: null,
      dailyGoalXp: 20,
      reminderOptIn: false,
      listeningEnabled: true,
      speakingEnabled: true,
      onboardedAt: "2026-09-01T00:00:00.000Z",
      preferredVoice: "any",
    },
    plan: { plan: "free", expiresAt: null, source: null },
  };
}

/** No provider account or network call: replay Better Auth's redirect back to the app. */
test("a new Google user on the sign-in tab gets an account in one tap, then only the age step", async ({
  page,
}) => {
  await page.route("**/auth/providers", (route) =>
    route.fulfill({ json: { apple: false, google: true } }),
  );
  // A guest until the tap; then the new account, which owes the age step until it is confirmed.
  let signedIn = false;
  let confirmed = false;
  let signInBody: Record<string, unknown> | undefined;
  await page.route("**/api/auth/sign-in/social", async (route) => {
    signInBody = route.request().postDataJSON();
    // Better Auth creates the account and redirects to the success callback.
    signedIn = true;
    await route.fulfill({ json: { redirect: true, url: String(signInBody?.callbackURL) } });
  });
  await page.route("**/me", (route) =>
    route.fulfill({ json: signedIn ? meFixture(!confirmed) : null }),
  );
  let ageBody: Record<string, unknown> | undefined;
  await page.route("**/me/age", async (route) => {
    ageBody = route.request().postDataJSON();
    confirmed = true;
    await route.fulfill({ json: { ageRequired: false } });
  });
  await page.goto("/auth");
  // Retry only the tap, until React has attached and the request went out;
  // the redirect then loads the app, which must show the age step and nothing else.
  await expect(async () => {
    await page.getByRole("button", { name: t.auth.withGoogle }).click({ timeout: 2_000 });
    await expect.poll(() => signedIn, { timeout: 2_000 }).toBe(true);
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: t.age.stepTitle })).toBeVisible();
  expect(signInBody).toMatchObject({ provider: "google", requestSignUp: true });
  expect(signInBody).not.toHaveProperty("additionalData");
  // Nothing else is asked: no name, no e-mail.
  await expect(page.getByLabel(t.auth.name)).toHaveCount(0);
  await expect(page.getByLabel(t.auth.email)).toHaveCount(0);
  await page.getByLabel(t.age.birthYear).fill("1990");
  await page.getByLabel(t.age.country).selectOption("NO");
  await page.getByRole("button", { name: t.age.stepContinue }).click();
  await expect(page.getByRole("heading", { name: t.age.stepTitle })).toHaveCount(0);
  expect(ageBody).toEqual({ birthYear: 1990, country: "NO", ageReached: false });
});

test("the age step sends an under-age learner back to sign-in with the under-age message", async ({
  page,
}) => {
  // After the server deletes the account, the session is gone and /me answers null.
  let deleted = false;
  await page.route("**/me", (route) => route.fulfill({ json: deleted ? null : meFixture(true) }));
  await page.route("**/me/age", (route) => {
    deleted = true;
    return route.fulfill({
      status: 403,
      json: { error: { code: "age_under_minimum", message: "x", details: { reason: "under13" } } },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: t.age.stepTitle })).toBeVisible();
  await expect(async () => {
    await page.getByLabel(t.age.birthYear).fill(String(new Date().getUTCFullYear() - 10));
    await page.getByRole("button", { name: t.age.stepContinue }).click();
    await expect(page).toHaveURL(/\/auth\?age=under13/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("alert")).toContainText(t.age.errors.under13);
  await expect(page.getByRole("alert")).toContainText(t.age.deleted);
});

test("social registration explicitly requests sign-up and keeps birth year typed", async ({
  page,
}) => {
  await page.route("**/auth/providers", (route) =>
    route.fulfill({ json: { apple: true, google: true } }),
  );
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/auth/sign-in/social", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      json: { code: "PROVIDER_UNAVAILABLE", message: "fixture" },
    });
  });
  await page.goto("/auth");
  // A mode change proves React attached before typing into the SSR form.
  await expect(async () => {
    await page.getByRole("button", { name: t.auth.signUp, exact: true }).click();
    await expect(page.getByRole("heading", { name: t.auth.signUp })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel(t.age.birthYear).fill("1990");
  await page.getByLabel(t.age.country).selectOption("ZA");
  await page.getByRole("button", { name: t.auth.withGoogle }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    provider: "google",
    requestSignUp: true,
    additionalData: { ageDeclaration: { birthYear: 1990, country: "ZA", ageReached: false } },
  });
});

for (const [locale, country] of [
  ["nb-NO", "NO"],
  ["en-ZA", "ZA"],
  ["nb", "OTHER"],
]) {
  test(`registration suggests ${country} from ${locale}`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    try {
      await page.goto("/auth?mode=signup");
      await expect(
        page.locator("select").filter({ has: page.locator(`option[value="${country}"]`) }),
      ).toHaveValue(country!);
      await expect(page.locator('input[autocomplete="bday-year"]')).toHaveValue("");
    } finally {
      await context.close();
    }
  });
}

test("a native-style Apple refusal shows under the buttons without leaving the page", async ({
  page,
}) => {
  await page.route("**/auth/providers", (route) =>
    route.fulfill({ json: { apple: true, google: true } }),
  );
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "OAUTH_LINK_ERROR", message: "account not linked" },
    }),
  );
  await page.goto("/auth");
  await expect(async () => {
    await page.getByRole("button", { name: t.auth.withApple }).click();
    await expect(page.getByRole("alert")).toContainText(
      fill(t.auth.errors.notLinked, { provider: "Apple" }),
      { timeout: 1_000 },
    );
  }).toPass({ timeout: 15_000 });
});

test("settings lists the email sign-in and connects Google through Better Auth", async ({
  page,
}) => {
  await page.route("**/auth/providers", (route) =>
    route.fulfill({ json: { apple: false, google: true } }),
  );
  await signUpLearner(page);
  let linkBody: Record<string, unknown> | undefined;
  await page.route("**/api/auth/link-social", async (route) => {
    linkBody = route.request().postDataJSON();
    const back = new URL(String(linkBody?.errorCallbackURL));
    back.searchParams.set("error", "account_already_linked_to_different_user");
    await route.fulfill({ json: { redirect: true, url: back.toString() } });
  });
  await page.goto("/settings");
  const card = page.getByRole("heading", { name: t.settings.connected.title });
  await expect(card).toBeVisible();
  await expect(page.getByTestId("connected-credential")).toContainText(t.settings.connected.email);
  // The only sign-in method has no Disconnect.
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: fill(t.settings.connected.connect, { provider: "Google" }) })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    fill(t.settings.connected.errors.taken, { provider: "Google" }),
  );
  expect(linkBody).toMatchObject({ provider: "google" });
  expect(String(linkBody?.callbackURL)).toMatch(/\/settings$/);
});
