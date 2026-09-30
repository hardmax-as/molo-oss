import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API } from "../playwright.config.ts";
import { signUpLearner, t } from "./helpers.ts";

test("unpublished content is invisible to learners through both the page and the API", async ({
  page,
}) => {
  await signUpLearner(page);

  // The draft unit's page shows an error, never its content.
  await page.goto(`/learn/${E2E.draftUnitSlug}`);
  await expect(page.getByText(t.common.error)).toBeVisible();

  // The same session against the API directly: the learner surface is published-only.
  const units = await page.request.get(`${E2E_API}/units`);
  expect(units.ok()).toBe(true);
  const slugs = ((await units.json()) as { units: { slug: string }[] }).units.map((u) => u.slug);
  expect(slugs).toEqual([E2E.unitSlug, E2E.lockedUnitSlug]);

  const draft = await page.request.get(`${E2E_API}/units/${E2E.draftUnitSlug}`);
  expect(draft.status()).toBe(404);

  const unit = await page.request.get(`${E2E_API}/units/${E2E.unitSlug}`);
  const body = JSON.stringify(await unit.json());
  expect(body).toContain(E2E.lexemes.a.en);
  expect(body).not.toContain(E2E.lexemes.draft.lemma);
  expect(body).not.toContain(E2E.lexemes.draft.en);

  // Editor surfaces are closed to learners.
  const grid = await page.request.get(`${E2E_API}/edit/lexemes`);
  expect([401, 403]).toContain(grid.status());

  // Including the grid's bulk transition: a batch is not a way around the role
  // check, and the draft lexeme stays a draft.
  const bulk = await page.request.post(`${E2E_API}/edit/lexemes/transition`, {
    data: { ids: [crypto.randomUUID()], to: "published" },
  });
  expect([401, 403]).toContain(bulk.status());

  // Nor is the review queue's bulk approval.
  const approve = await page.request.post(`${E2E_API}/edit/review-queue/approve`, {
    data: { items: [{ kind: "lexeme", id: crypto.randomUUID() }] },
  });
  expect([401, 403]).toContain(approve.status());

  const assign = await page.request.post(`${E2E_API}/edit/review-queue/assign`, {
    data: { kind: "lexeme", id: crypto.randomUUID(), assignedTo: null },
  });
  expect([401, 403]).toContain(assign.status());

  const stillHidden = await page.request.get(`${E2E_API}/units/${E2E.unitSlug}`);
  expect(JSON.stringify(await stillHidden.json())).not.toContain(E2E.lexemes.draft.lemma);
});
