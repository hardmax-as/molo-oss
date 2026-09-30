import { XP } from "@molo/core";
import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

/** The accessible name a node carries: "<kind> <order>: <state>". */
function nodeName(kind: keyof typeof t.path.kind, order: number, state: string): string {
  return t.path.node
    .replace("{{kind}}", t.path.kind[kind])
    .replace("{{order}}", String(order))
    .replace("{{state}}", state);
}

test("the path is one continuous route: section headers, typed nodes, and a lesson opened from a node", async ({
  page,
}) => {
  await signUpLearner(page);

  // Home is the path, not a grid: one named navigation for it, with a header
  // per unit that stays on screen while its stretch scrolls.
  const trail = page.getByRole("navigation", { name: t.path.sectionNav });
  await expect(trail).toBeVisible();
  const banners = page.getByTestId("path-unit-banner");
  await expect(banners).toHaveCount(2);
  await expect(banners.first()).toContainText(t.path.unit.replace("{{number}}", "1"));
  await expect(banners.first()).toContainText(
    t.path.unitProgress.replace("{{done}}", "0").replace("{{total}}", "1"),
  );

  // The node says what it is. The fixture unit's only lesson is also its last,
  // so it is the unit's test, and it is the one the learner is pointed at.
  const node = page.getByTestId("path-node");
  await expect(node).toHaveCount(1);
  await expect(node).toHaveAttribute("data-state", "current");
  const current = page.getByRole("link", { name: nodeName("test", 1, t.path.state.current) });
  await expect(current).toHaveCount(1);

  // The locked unit's node is a real button that says it is locked and does
  // not navigate, rather than a link that goes nowhere.
  const shut = page.getByTestId("path-node-locked");
  await expect(shut).toHaveCount(1);
  await expect(shut).toBeDisabled();
  await expect(shut).toHaveAccessibleName(nodeName("test", 1, t.path.state.locked));

  // Its chest is shut with it, and the open unit's chest is shut until the
  // lesson is done: a bonus is never available before the work.
  const chests = page.getByTestId("path-chest");
  await expect(chests).toHaveCount(2);
  for (const state of await chests.evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-state")),
  ))
    expect(state).toBe("locked");

  // The header's button opens the unit's word list, with the published words
  // and never the draft one.
  await banners.first().getByTestId("path-unit-words").click();
  const words = page.getByRole("dialog");
  await expect(words).toBeVisible();
  await expect(words.getByText(E2E.lexemes.a.lemma)).toBeVisible();
  await expect(words.getByText(E2E.lexemes.draft.lemma)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(words).toHaveCount(0);

  // Walking the path: the node opens the lesson it names.
  await current.click();
  await expect(page).toHaveURL(new RegExp(`/learn/${E2E.unitSlug}/[0-9a-f-]{36}$`));
});

test("finishing a skill opens its chest, which pays out once and then stays open", async ({
  page,
}) => {
  await signUpLearner(page);

  // Finish the unit's only lesson through the API, so this test is about the
  // chest rather than about the runner.
  const unit = await (await page.request.get(`${E2E_API}/units/${E2E.unitSlug}`)).json();
  const lessonId = unit.unit.skills[0].lessons[0].id as string;
  const today = new Date().toISOString().slice(0, 10);
  const done = await page.request.post(`${E2E_API}/lessons/${lessonId}/complete`, {
    data: { correct: 2, total: 2, today },
  });
  expect(done.ok()).toBe(true);
  const before = (await done.json()).progress.xpTotal as number;

  await page.goto("/");
  const chest = page.getByTestId("path-chest").first();
  await expect(chest).toHaveAttribute("data-state", "ready");
  await expect(chest).toHaveAccessibleName(
    t.path.chest.ready.replace("{{xp}}", String(XP.skillChest)),
  );
  await chest.click();

  // Once open it stays open, and the XP landed exactly once.
  await expect(chest).toHaveAttribute("data-state", "claimed");
  await expect(chest).toBeDisabled();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${E2E_API}/me/progress?today=${today}`)).json()).xpTotal,
    )
    .toBe(before + XP.skillChest);

  // A second claim through the API grants nothing.
  const again = await page.request.post(
    `${E2E_API}/path/chests/${unit.unit.skills[0].id}/claim?today=${today}`,
    { data: {} },
  );
  expect(again.ok()).toBe(true);
  const body = await again.json();
  expect(body.alreadyClaimed).toBe(true);
  expect(body.xp).toBe(0);
});
