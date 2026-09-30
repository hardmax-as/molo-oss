import { expect, test, type Page } from "@playwright/test";

import { KNOB_GROUPS } from "../../src/dev/knobs.ts";
import { DEV_STRINGS } from "../../src/dev/strings.ts";
import { fill, playFixtureLesson, signUpLearner, t } from "./helpers.ts";

/**
 * The knobs panel's whole claim: turn a number and the real screens follow,
 * while the server is left alone. The suite runs against `vite dev`, so
 * `import.meta.env.DEV` is true and the gate opens without an account —
 * which is the case the gallery exists for.
 *
 * Every test clears the store first. Overrides live in `localStorage`, and a
 * spec that inherited one from its neighbour would be exactly the confusion
 * the banner exists to prevent.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/dev/knobs");
  await page.evaluate(() => window.localStorage.removeItem("molo.dev.knobs"));
  await page.reload();
});

/**
 * Typed, not filled, and retried until it takes.
 *
 * Two things make this fiddly, and both are honest facts about the panel
 * rather than about the test. Playwright's `fill` on a number input assigns
 * `value` directly, which React's own change tracker swallows — so real key
 * events. And a number input accepts a keystroke whether or not React has
 * attached, so SSR can paint the panel and take the number while nothing is
 * listening; the banner appearing is the proof that it did take.
 */
async function setKnob(page: Page, id: string, value: string): Promise<void> {
  const field = page.getByTestId(`knob-${id}`);
  await expect(async () => {
    await field.click();
    await field.press("ControlOrMeta+a");
    await field.pressSequentially(value);
    await field.blur();
    await expect(page.getByTestId("knobs-banner")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(field).toHaveValue(value);
}

/** The same retry for a button: SSR paints it before React can hear it. */
async function clickUntilOverridden(page: Page, testId: string): Promise<void> {
  await expect(async () => {
    await page.getByTestId(testId).click();
    // Another override can already show the banner before hydration. Wait for
    // this card's Clear button so navigating away cannot discard an unheard click.
    await expect(
      page.getByTestId(testId).locator("..").getByRole("button", {
        name: DEV_STRINGS.knobs.states.clear,
        exact: true,
      }),
    ).toBeVisible({ timeout: 1_000 });
    await expect(page.getByTestId("knobs-banner")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test("every group is on the panel, and nothing is overridden to begin with", async ({ page }) => {
  await expect(page.getByTestId("dev-knobs")).toBeVisible();
  for (const group of KNOB_GROUPS)
    await expect(page.getByTestId(`knob-group-${group}`)).toBeVisible();
  await expect(page.getByTestId("knob-group-states")).toBeVisible();
  await expect(page.getByTestId("knobs-count")).toHaveText(DEV_STRINGS.knobs.nothingSet);
  // Nothing overridden, so no banner: it only appears when it has something to say.
  await expect(page.getByTestId("knobs-banner")).toHaveCount(0);
  // And the panel says out loud who the authority is.
  await expect(page.getByText(DEV_STRINGS.knobs.serverNote)).toBeVisible();
});

test("an override raises the banner, and one button clears everything", async ({ page }) => {
  await setKnob(page, "xp.correct", "200");

  const banner = page.getByTestId("knobs-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(DEV_STRINGS.knobs.bannerTitle);
  await expect(banner).toContainText(DEV_STRINGS.knobs.bannerServer);

  // It follows the reader onto a real screen, not only the gallery.
  await page.goto("/");
  await expect(page.getByTestId("knobs-banner")).toBeVisible();

  await page.getByTestId("knobs-banner-reset").click();
  await expect(page.getByTestId("knobs-banner")).toHaveCount(0);
  await page.goto("/dev/knobs");
  await expect(page.getByTestId("knobs-count")).toHaveText(DEV_STRINGS.knobs.nothingSet);
  // Back to the shipped constant, which is the reset the button promises.
  await expect(page.getByTestId("knob-xp.correct")).toHaveValue("10");
});

test("XP per answer and the lesson bonus change what the real celebration counts to", async ({
  page,
}) => {
  await setKnob(page, "xp.correct", "200");
  await setKnob(page, "xp.perfectLessonBonus", "100");
  await expect(page.getByTestId("knobs-banner")).toBeVisible();

  await signUpLearner(page);
  // The seeded lesson is two exercises, both answered right, so the run is
  // perfect and the bonus applies: 2 × 200 + 100.
  await playFixtureLesson(page);
  await expect(page.getByTestId("celebration-lesson")).toContainText("500");
});

test("the fabricated states put the client where it is asked to be", async ({ page }) => {
  await signUpLearner(page);

  await page.goto("/dev/knobs");
  await clickUntilOverridden(page, "fake-streak-set");

  // The header's flame is a real screen reading a fabricated number.
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: fill(t.gamification.streak_other, { count: 30 }) }),
  ).toBeVisible();

  await page.goto("/dev/knobs");
  await clickUntilOverridden(page, "fake-hearts-empty");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: fill(t.hearts.count, { hearts: 0, max: 5 }) }),
  ).toBeVisible();
});
