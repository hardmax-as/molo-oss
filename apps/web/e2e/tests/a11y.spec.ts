import { expect, test, type Page } from "@playwright/test";

import nb from "../../../../packages/i18n/src/locales/nb.json" with { type: "json" };
import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { dismissGrammarNote, signUpLearner, t } from "./helpers.ts";

/**
 * Accessibility guarantees that must not regress (docs/ACCESSIBILITY.md):
 * the skip link, a keyboard-only lesson, the polite verdict, and focus
 * landing inside the account wall. Everything is asserted through roles and
 * accessible names, so a change that keeps the pixels but loses the name
 * fails here.
 */

/** The focused element's accessible name, close enough for a tab-order walk. */
async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    return (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
  });
}

/** Tabs forward until the focused element is named `name`. Keyboard only: no clicks. */
async function tabTo(page: Page, name: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if ((await focusedName(page)) === name) return;
  }
  throw new Error(`no focusable element named "${name}" within ${max} tabs`);
}

test("the skip link is the first tab stop and moves focus into main", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: t.landing.hero.cta }).first()).toBeVisible();

  await page.keyboard.press("Tab");
  expect(await focusedName(page)).toBe(t.a11y.skipToContent);
  // It is invisible until focused, and visible once it is.
  await expect(page.getByRole("link", { name: t.a11y.skipToContent })).toBeVisible();

  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
});

test("every page has one main landmark and a named navigation", async ({ page }) => {
  for (const path of ["/", "/auth", "/welcome", "/privacy", "/terms", "/plus", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: t.a11y.mainNav })).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
});

test("switching the UI language updates <html lang> without a reload (W09)", async ({ page }) => {
  await page.goto("/privacy");
  const html = page.locator("html");
  const language = page.getByLabel(t.common.language);
  await expect(html).toHaveAttribute("lang", "en");
  // The select is server-rendered before React attaches; retry until the switch takes.
  await expect(async () => {
    await language.selectOption("nb");
    await expect(html).toHaveAttribute("lang", "nb", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel(nb.common.language).selectOption("en");
  await expect(html).toHaveAttribute("lang", "en");
});

test("a lesson can be finished with the keyboard alone, and the verdict is announced", async ({
  page,
}) => {
  await signUpLearner(page);
  await page.goto(`/learn/${E2E.unitSlug}`);
  await page.getByRole("link", { name: /min · 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}/[0-9a-f-]{36}$`));
  await dismissGrammarNote(page);

  // The lesson names itself for a screen reader even though nothing is drawn.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t.units.lesson.replace("{{order}}", "1"),
  );
  await expect(page.getByRole("progressbar", { name: t.a11y.lessonProgress })).toBeVisible();

  for (const gloss of [E2E.lexemes.a.en, E2E.lexemes.b.en]) {
    // Each word is met on a card first, and the card is left by keyboard too.
    // An enabled answer, because the outgoing exercise's disabled ones are
    // still on screen while it slides away and the card has not come in yet.
    const card = page.getByTestId("new-word-card");
    const ready = page.getByRole("button", { name: gloss, exact: true, disabled: false });
    await expect(card.or(ready).first()).toBeVisible();
    if (await card.isVisible()) {
      await tabTo(page, t.lesson.continue);
      await page.keyboard.press("Enter");
      await expect(card).toBeHidden();
    }
    // Both exercises offer both glosses, and the outgoing one is still on
    // screen while it slides away with its answers disabled. Waiting for a
    // single enabled button is waiting for the new exercise to be the only
    // one there.
    const answer = page.getByRole("button", { name: gloss, exact: true });
    await expect(answer).toHaveCount(1);
    await expect(answer).toBeEnabled();
    await tabTo(page, gloss);
    await page.keyboard.press("Enter");
    await tabTo(page, t.lesson.check);
    await page.keyboard.press("Enter");

    // The verdict lives in a polite live region of its own, not on the buttons.
    const feedback = page.getByRole("status", { name: t.a11y.answerFeedback });
    await expect(feedback).toContainText(t.lesson.correct);
    // Checking disables the answers, so focus is handed to "Continue".
    await expect.poll(() => focusedName(page)).toBe(t.lesson.continue);
    await page.keyboard.press("Enter");
  }

  // The lesson ends in the celebration sequence: a labelled dialog that
  // takes focus, and whose "skip" is reachable without a mouse.
  await expect(page.getByRole("dialog", { name: t.celebration.a11y.sequence })).toBeVisible();
  await expect(page.getByText(t.celebration.lesson.perfect)).toBeVisible();
  await tabTo(page, t.celebration.skipAll);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}$`));
});

test("the account wall takes focus and both ways out are reachable by keyboard", async ({
  page,
}) => {
  // A guest who has already used the free lesson; the wall replaces the next one.
  await page.addInitScript(() => {
    localStorage.setItem("molo.onboarded", "1");
    localStorage.setItem(
      "molo.guest",
      JSON.stringify({
        lessons: [
          {
            lessonId: "00000000-0000-4000-8000-000000000111",
            unitSlug: "zz-e2e-unit",
            correct: 2,
            total: 2,
            xp: 40,
            today: new Date().toISOString().slice(0, 10),
          },
        ],
      }),
    );
  });
  await page.goto(`/learn/${E2E.unitSlug}/00000000-0000-4000-8000-000000000999`);

  const title = page.getByRole("heading", { name: t.guest.wallTitle, level: 1 });
  await expect(title).toBeVisible();
  // The wall swapped itself in where the lesson was: focus follows it.
  await expect(title).toBeFocused();

  // It is a page, not a trapped overlay: Tab reaches both ways out, then leaves.
  await tabTo(page, t.guest.create);
  await tabTo(page, t.guest.haveAccount);
  await expect(page.getByRole("link", { name: t.guest.create })).toBeVisible();
  await expect(page.getByRole("link", { name: t.guest.haveAccount })).toBeVisible();
});
