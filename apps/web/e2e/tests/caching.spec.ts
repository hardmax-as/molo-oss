import { expect, test } from "@playwright/test";

import { E2E } from "../../../../packages/testkit/src/e2e-seed.ts";
import { E2E_API } from "../playwright.config.ts";
import { signUpLearner } from "./helpers.ts";

/**
 * What may be shared and what may not (docs/CACHING.md section 3). Published
 * content is the same for everybody and carries a `cache-control` that says
 * so; a learner's own response, and every editor screen, carries
 * `private, no-store` and never reaches an edge.
 *
 * `x-molo-cache` says hit or miss. It is asserted to be present, not to be a
 * hit: `wrangler dev` gives the Worker a Cache API that stores nothing, so a
 * hit locally is not something to hold a suite to.
 */

const PUBLIC = "public, max-age=60";
const PRIVATE = "private, no-store";

test("published content is cacheable and carries a content version", async ({ request }) => {
  for (const path of ["/units", "/path", `/units/${E2E.unitSlug}`]) {
    const res = await request.get(`${E2E_API}${path}`);
    expect(res.ok(), path).toBe(true);
    const h = res.headers();
    expect(h["cache-control"], path).toBe(PUBLIC);
    // The version is what makes a publish reach a learner without a purge.
    expect(h["x-molo-content-version"], path).toMatch(/^\d+-\d+$/);
    expect(h["x-molo-cache"], path).toMatch(/^(hit|miss)$/);
    // A shared proxy must not hand the guest body to a request with a session.
    expect(h["vary"], path).toContain("cookie");
  }
});

test("a learner's own responses are never cacheable", async ({ page }) => {
  await signUpLearner(page);

  // The same three paths, now answered for a signed-in learner: they carry
  // that learner's unlocks and badges, so they may not be shared.
  for (const path of ["/units", "/path", `/units/${E2E.unitSlug}`]) {
    const res = await page.request.get(`${E2E_API}${path}`);
    expect(res.ok(), path).toBe(true);
    const h = res.headers();
    expect(h["cache-control"], path).toBe(PRIVATE);
    expect(h["x-molo-cache"], path).toBeUndefined();
    expect(h["x-molo-content-version"], path).toBeUndefined();
  }

  // Learner state, which is never cacheable for anyone.
  for (const path of [
    "/me",
    "/me/hearts",
    "/me/mistakes?lang=en",
    `/units/${E2E.unitSlug}/crown`,
  ]) {
    const res = await page.request.get(`${E2E_API}${path}`);
    expect(res.headers()["cache-control"], path).toBe(PRIVATE);
  }

  // An editor screen, refused for a learner — and refused without being
  // cached, which is the half that matters here.
  const edit = await page.request.get(`${E2E_API}/edit/overview`);
  expect(edit.status()).toBe(403);
  expect(edit.headers()["cache-control"]).toBe(PRIVATE);
});
