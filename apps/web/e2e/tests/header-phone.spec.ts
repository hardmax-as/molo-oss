import { expect, test, type Page } from "@playwright/test";

import { signUpLearner, t } from "./helpers.ts";

/**
 * The header on a phone (docs/DESIGN.md): at 320–430 px nothing scrolls
 * sideways, a guest sees the wordmark, the language and Sign in, and a
 * signed-in learner reaches everything else through a menu that behaves
 * like one: aria-expanded, focus inside, Escape back to the button, and
 * targets a thumb can hit.
 */

const WIDTHS = [320, 390, 430] as const;

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `page is ${scrollWidth}px wide in a ${innerWidth}px window`,
  ).toBeLessThanOrEqual(innerWidth);
}

async function expectInsideViewport(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, `${testId} is not rendered`).not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

for (const width of WIDTHS) {
  test(`a guest's header fits ${width} px with Sign in fully visible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/grammar", "/auth"]) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: t.a11y.mainNav });
      await expect(nav.getByTestId("header-sign-in")).toBeVisible();
      await expectInsideViewport(page, "header-sign-in");
      await expectNoSidewaysScroll(page);
      // The rest is off the phone header; the landing page carries Grammar.
      await expect(nav.getByRole("link", { name: t.nav.grammar })).toHaveCount(0);
    }
    await page.goto("/");
    await expect(page.getByRole("link", { name: t.nav.grammar }).last()).toBeVisible();
  });
}

test("a signed-in learner's phone header fits, and the menu holds the rest", async ({ page }) => {
  await signUpLearner(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: t.units.title })).toBeVisible();
    await expectInsideViewport(page, "app-menu-button");
    await expectNoSidewaysScroll(page);
  }

  const button = page.getByRole("button", { name: t.nav.menu });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator("#app-menu");
  for (const name of [
    t.nav.grammar,
    t.nav.review,
    t.nav.leagues,
    t.nav.account,
    t.settings.title,
  ]) {
    const item = menu.getByRole("link", { name, exact: true });
    await expect(item).toBeVisible();
    // Rounded: the sticky, blurred header lands items on sub-pixel boundaries.
    expect(Math.round((await item.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
  await expect(menu.getByRole("button", { name: t.nav.signOut })).toBeVisible();
  // Focus moved into the menu, and Escape hands it back to the button.
  expect(await page.evaluate(() => document.activeElement?.closest("#app-menu") !== null)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // A link in the menu goes there and closes it.
  await button.click();
  await menu.getByRole("link", { name: t.nav.grammar }).click();
  await expect(page.getByRole("heading", { level: 1, name: t.grammar.title })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expectNoSidewaysScroll(page);
});
