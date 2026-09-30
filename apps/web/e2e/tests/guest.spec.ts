import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { dismissGrammarNote, meetNewWords, skipCelebration, t } from "./helpers.ts";

test("a guest tries the first lesson, hits the account wall on the second, and keeps the XP after signing up", async ({
  page,
}) => {
  // Landing → get started → skip the intro → the path, all without an account.
  await page.goto("/");
  await page.getByRole("link", { name: t.landing.hero.cta }).first().click();
  const skip = page.getByRole("button", { name: t.onboarding.skip, exact: true });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible();

  // First lesson runs for a guest, opened from its node on the path.
  await page.getByRole("link", { name: /min · 2/ }).click();
  await dismissGrammarNote(page);
  // A guest meets each new word too, from the lessons kept on the device.
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.a.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  // The report action is offered to a guest too, but it asks for an account
  // rather than opening the form: a report needs a name on it, and hiding the
  // action would lose the one report we most want from the free lesson.
  await page.getByTestId("report-exercise").click();
  await expect(page.getByRole("heading", { name: t.lesson.report.guestTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.lesson.report.title })).toBeHidden();
  // Enter inside the dialog belongs to the dialog (W02): it activates the
  // focused Cancel and closes it, and the lesson behind must not advance.
  await page.getByRole("button", { name: t.lesson.report.cancel }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("report-signup")).toBeHidden();
  await expect(page.getByRole("button", { name: t.lesson.continue })).toBeVisible();
  await expect(page.getByRole("button", { name: t.lesson.check })).toBeHidden();
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await meetNewWords(page);
  await page.getByRole("button", { name: E2E.lexemes.b.en, exact: true }).click();
  await page.getByRole("button", { name: t.lesson.check }).click();
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await skipCelebration(page);
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));

  // Home shows the guest banner with the XP; a second lesson is walled.
  await page.goto("/");
  await expect(page.getByText(/40 XP/)).toBeVisible();
  await page.goto(`/learn/${E2E.unitSlug}/00000000-0000-4000-8000-000000000999`);
  await expect(page.getByRole("heading", { name: t.guest.wallTitle })).toBeVisible();

  // Sign up from the wall; the guest lesson is replayed on the account.
  await page.getByRole("link", { name: t.guest.create }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  await expect(page.getByRole("heading", { name: t.auth.signUp })).toBeVisible();
  const email = `zz-guest-${Date.now()}@molo.local`;
  // Fill and submit; if the form submitted natively before React attached, fill again.
  await expect(async () => {
    await page.getByLabel(t.auth.name).fill("ZZ Guest");
    await page.getByLabel(t.auth.email).fill(email);
    await page.getByLabel(t.auth.password).fill("zz-e2e-password-1234");
    await page.getByLabel(t.age.birthYear).fill("1990");
    await page.getByLabel(t.age.country).selectOption("ZA");
    await page.locator("form button[type=submit]").click();
    await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible({
      timeout: 4_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(/40 \/ \d+ XP today/)).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("1 day streak").or(page.getByRole("img", { name: "1 day streak" })),
  ).toBeVisible();
});

test("a signed-out visitor on /review is asked to sign in, not left on Loading", async ({
  page,
}) => {
  await page.goto("/review");
  const prompt = page.getByTestId("review-sign-in");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText(t.review.signInFirst)).toBeVisible();
  await expect(prompt.getByRole("link", { name: t.nav.signIn })).toHaveAttribute("href", "/auth");
  await expect(page.getByText(t.common.loading, { exact: true })).toBeHidden();
});
