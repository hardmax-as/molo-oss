import { expect, test, type Page } from "@playwright/test";

import { t } from "./helpers.ts";

/**
 * The playground is server-rendered before React attaches, and a cold Vite
 * dev server reloads the page once while it optimises dependencies. Both
 * swallow a click. So the first interaction of every test re-navigates and
 * retries until it takes; from then on the page is live and ordinary
 * auto-waiting is enough.
 */
async function firstInteraction(page: Page, url: string, act: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.goto(url);
    await act();
  }).toPass({ timeout: 60_000 });
}

/**
 * Tapping a word in a sentence prompt shows what it means — and never what
 * the exercise is asking for. The dev playground is used rather than seeded
 * content because it is the one place with a sentence that has tokens and
 * linked lexemes, and because the fixture's glosses are unmistakable
 * ("fixture alpha", "fixture beta") so a leak cannot hide in real copy.
 *
 * The concord-fill fixture blanks position 1, whose lexeme's gloss is
 * "fixture beta": that word must have no hint at all.
 */
test("a word hint opens on tap and on the keyboard, and never leaks the answer", async ({
  page,
}) => {
  const hints = page.getByTestId("word-hint");
  const popover = page.getByTestId("word-hint-popover");

  // Tapping a word shows its gloss in the learner's own language.
  await firstInteraction(page, "/dev/playground?only=concord_fill", async () => {
    // Three words in the sentence, one of them the blank: two are tappable.
    await expect(hints).toHaveCount(2, { timeout: 5_000 });
    await expect(popover).toHaveCount(0, { timeout: 1_000 });
    await hints.first().click();
    await expect(popover).toHaveCount(1, { timeout: 1_000 });
  });
  await expect(popover).toHaveText("fixture alpha");

  // Escape closes it, and it is not a trap: focus stays where it was.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("word-hint-popover")).toHaveCount(0);

  // Reachable by keyboard: the hints are real buttons, so focus and Enter open one.
  await hints.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(popover).toHaveText("fixture gamma");

  // The answer is not on the page: no hint for the blanked word, and its
  // gloss appears nowhere, open popover or not.
  await expect(page.getByText("fixture beta")).toHaveCount(0);
  for (const word of await hints.allInnerTexts()) {
    expect(word).not.toBe("zz-iyahamba");
  }

  // The blanked word is a gap to fill, not a word to look up.
  await expect(
    page.getByRole("button", { name: t.lesson.blankAt.replace("{{n}}", "2") }),
  ).toBeVisible();
});

test("the badge above the prompt says what kind of moment this is", async ({ page }) => {
  await page.goto("/dev/playground?only=listen_select");
  await expect(page.getByText(t.lesson.moment.newWord)).toBeVisible({ timeout: 30_000 });
});

/**
 * The run of right answers is quiet below three and then says so. The rule
 * is unit-tested in `packages/core`; this is the wiring: the runner counts
 * answers, not checks, and the strip carries the words as well as the colour.
 */
test("the run counter stays quiet until three in a row", async ({ page }) => {
  const run = page.getByTestId("run-counter");
  const answer = async (act: () => Promise<void>) => {
    await act();
    await page.getByRole("button", { name: t.lesson.check }).click();
    await page.getByRole("button", { name: t.lesson.continue }).click();
  };

  // Exercise one: hear the word, pick its meaning.
  await firstInteraction(page, "/dev/playground", async () => {
    await page.getByRole("button", { name: "fixture alpha", exact: true }).click();
    await expect(page.getByRole("button", { name: t.lesson.check })).toBeEnabled({
      timeout: 1_000,
    });
  });
  await page.getByRole("button", { name: t.lesson.check }).click();
  await page.getByRole("button", { name: t.lesson.continue }).click();
  await expect(run).toHaveCount(0);

  await answer(async () => {
    await page.locator("input").fill("zz-inca zz-iyahamba zz-kakuhle");
  });
  await expect(run).toHaveCount(0);

  await answer(async () => {
    await page.getByRole("button", { name: "zz-iyahamba", exact: true }).click();
  });
  await expect(run).toHaveText(t.lesson.run.inARow.replace("{{count}}", "3"));
});
