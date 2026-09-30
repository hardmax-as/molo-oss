import { expect, test, type Page } from "@playwright/test";

import { allDemos, DEMO_GROUPS } from "../../src/dev/catalog.ts";

/**
 * The developer gallery (docs/DESIGN.md "Developer gallery"). The suite runs
 * against `vite dev`, so `import.meta.env.DEV` is true and the gate opens
 * without an account — which is exactly the case the gallery exists for.
 *
 * The last test is the one that earns its keep: it opens *every* registered
 * demo and insists each one paints without a page error. A demo that fakes
 * its own copy of a component would still pass, but a demo whose real
 * component has stopped taking the props it is given would not.
 */

/**
 * Uncaught exceptions for the whole of one visit. Console errors are not
 * watched: a signed-out browser gets a 401 from `/me` on every page, which
 * Chromium logs as one, and that says nothing about the demo.
 */
function watchForFailures(page: Page): { failures: string[] } {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(`${e.message}`));
  return { failures };
}

test("the gallery lists every group and every demo", async ({ page }) => {
  await page.goto("/dev");
  await expect(page.getByTestId("dev-gallery")).toBeVisible();
  for (const group of DEMO_GROUPS)
    await expect(page.getByTestId(`dev-group-${group}`)).toBeVisible();
  for (const demo of allDemos()) await expect(page.getByTestId(`demo-${demo.id}`)).toBeVisible();
  // The two dev pages that already existed are linked from it.
  await expect(page.getByRole("link", { name: /Playground/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mascots/ })).toBeVisible();
});

test("Settings offers the gallery on a development build", async ({ page }) => {
  await page.goto("/settings");
  const link = page.getByTestId("settings-developer");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByTestId("dev-gallery")).toBeVisible();
});

test("a demo opens full screen and comes back", async ({ page }) => {
  await page.goto("/dev");
  await page.getByTestId("demo-streak-extended").click();
  await expect(page).toHaveURL(/\/dev\/demo\/streak-extended$/);
  // The real celebration component, driven by a fabricated streak beat.
  await expect(page.getByTestId("celebration")).toBeVisible();
  await expect(page.getByTestId("celebration-streak")).toBeVisible();
  await page.getByTestId("demo-back").click();
  await expect(page.getByTestId("dev-gallery")).toBeVisible();
});

test("every registered demo renders", async ({ page }) => {
  // This is the one test whose length grows with the catalogue: it loads a
  // page per demo, in series, against a dev server. The suite's flat 45
  // seconds stopped being enough somewhere in the forties, so the budget is
  // per demo instead. It still fails if any one of them hangs.
  test.setTimeout(allDemos().length * 3_000);
  const { failures } = watchForFailures(page);
  for (const demo of allDemos()) {
    if (demo.href !== undefined) continue;
    await page.goto(`/dev/demo/${demo.id}`);
    // An overlay demo (a celebration, the level-up sky) leaves its section
    // with no box of its own, so the section is asserted attached and the
    // back link — which every demo has, and which sits above the overlay —
    // is asserted visible.
    await expect(page.getByTestId(`demo-view-${demo.id}`)).toBeAttached();
    await expect(page.getByTestId("demo-back")).toBeVisible();
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
