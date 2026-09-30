import { expect, type Page } from "@playwright/test";

import en from "../../../../packages/i18n/src/locales/en.json" with { type: "json" };
import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";

export const t = en;

/** i18next interpolation, enough for the strings the specs assert. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/{{(\w+)}}/g, (_, k: string) => String(values[k] ?? ""));
}

/** Creates a fresh learner through the real sign-up form and lands on the unit list. */
export async function signUpLearner(
  page: Page,
  country: "NO" | "ZA" | "OTHER" = "ZA",
): Promise<string> {
  const email = `zz-learner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@molo.local`;
  await page.goto("/auth");
  // SSR paints the form before React attaches; retry the mode toggle until it takes.
  // The first spec of a run meets a cold dev server, which hydrates slowest.
  await expect(async () => {
    await page.getByRole("button", { name: t.auth.signUp, exact: true }).click();
    await expect(page.getByRole("heading", { name: t.auth.signUp })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 25_000 });
  await page.getByLabel(t.auth.name).fill("ZZ Learner");
  await page.getByLabel(t.auth.email).fill(email);
  await page.getByLabel(t.auth.password).fill("zz-e2e-password-1234");
  await page.getByLabel(t.age.birthYear).fill("1990");
  await page.getByLabel(t.age.country).selectOption(country);
  await page.locator("form button[type=submit]").click();
  // Account creation and the session refresh can exceed the normal UI
  // assertion budget on a cold CI worker. Poll the actual navigation; never
  // submit again or reload, which could hide a broken sign-up flow.
  await expect(page).toHaveURL((url) => url.pathname === "/", { timeout: 30_000 });
  // A fresh learner sees the landing page, then the first-run flow; going through
  // "Get started" and "Skip" is part of the journey.
  const start = page.getByRole("link", { name: t.landing.hero.cta }).first();
  const skip = page.getByRole("button", { name: t.onboarding.skip, exact: true });
  const units = page.getByRole("heading", { name: t.units.title });
  // Session/onboarding queries can briefly replace the landing page with a
  // loading state. Re-evaluate which step is visible until the path arrives,
  // instead of taking a single isVisible() snapshot and skipping that step.
  await expect(async () => {
    if (await start.isVisible()) await start.click({ timeout: 2_000 });
    if (await skip.isVisible()) await skip.click({ timeout: 2_000 });
    await expect(units).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] });
  return email;
}

/**
 * The grammar note now stands in front of the seeded skill's drill
 * (docs/GRAMMAR.md). It is shown once per browser and remembered, so a spec
 * that opens the fixture lesson dismisses it and then answers as before.
 * Tolerant on purpose: a spec that has already dismissed it in this context
 * must not fail on the second visit.
 */
export async function dismissGrammarNote(page: Page): Promise<void> {
  const note = page.getByTestId("grammar-note");
  const drill = page.getByRole("button", { name: t.lesson.check });
  // After the note, a new word's card may stand in front of the drill.
  const card = page.getByTestId("new-word-card");
  await expect(note.or(drill).or(card).first()).toBeVisible();
  if (await note.isVisible()) {
    await page.getByRole("button", { name: t.grammar.gotIt }).click();
    await expect(note).toBeHidden();
  }
}

/**
 * A word the learner has never met is met first, on a card in front of the
 * exercise that asks for it (docs/DESIGN.md "Inside a lesson"). For a fresh
 * learner or guest, each of the fixture lesson's two exercises brings one
 * new word, so a spec continues past its card before answering. Tolerant on
 * purpose: a word already met in a finished lesson has no card.
 */
export async function meetNewWords(page: Page): Promise<void> {
  const card = page.getByTestId("new-word-card");
  const drill = page.getByRole("button", { name: t.lesson.check });
  await expect(card.or(drill).first()).toBeVisible();
  if (await card.isVisible()) {
    await page.getByTestId("new-word-continue").click();
    await expect(card).toBeHidden();
  }
}

/**
 * Plays the seeded unit's only lesson right through, leaving the learner on
 * the celebration sequence. Both exercises are answered correctly, so the
 * run is perfect and the unit is finished.
 */
export async function playFixtureLesson(page: Page): Promise<void> {
  // The home page is the path itself now: one click on the lesson node, not
  // a "start" link into a unit page that no longer exists. The node's own
  // accessible name contains the unit's title, so target the test id.
  await page.getByTestId("path-node").first().click();
  await dismissGrammarNote(page);
  for (const lexeme of [E2E.lexemes.a, E2E.lexemes.b]) {
    await meetNewWords(page);
    await page.getByRole("button", { name: lexeme.en, exact: true }).click();
    await page.getByRole("button", { name: t.lesson.check }).click();
    await page.getByRole("button", { name: t.lesson.continue }).click();
  }
  await expect(page.getByTestId("celebration")).toBeVisible();
}

/**
 * Waits until the celebration sequence holds every beat this lesson earned
 * — the primary button reads "continue" rather than "back to the path" only
 * once a second beat has joined — then skips the lot. Every fixture flow
 * earns at least two beats, so this never waits forever.
 */
export async function skipCelebration(page: Page): Promise<void> {
  await expect(page.getByTestId("celebration")).toBeVisible();
  await expect(page.getByTestId("celebration-continue")).toHaveText(t.celebration.continue);
  await page.getByRole("button", { name: t.celebration.skipAll }).click();
}
