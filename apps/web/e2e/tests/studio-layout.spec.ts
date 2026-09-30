import { expect, test } from "@playwright/test";

import { grantEditorRole } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("the studio fits a 390 px phone, with the working panel before a collapsed queue (W04)", async ({
  page,
}) => {
  const email = await signUpLearner(page);
  await grantEditorRole(E2E_DATABASE_URL, email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/edit/studio");
  await expect(page.getByRole("heading", { name: t.edit.studio.title })).toBeVisible();

  const panel = page.getByTestId("studio-panel");
  const queue = page.getByTestId("studio-queue");
  await expect(panel).toBeVisible();
  // Collapsed on a phone: the summary shows, the list does not.
  await expect(queue.locator("summary")).toBeVisible();
  await expect(queue).not.toHaveAttribute("open");

  const panelBox = await panel.boundingBox();
  const queueBox = await queue.boundingBox();
  expect(panelBox && queueBox && panelBox.y < queueBox.y).toBe(true);

  // No horizontal scrolling of the document.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
