/**
 * Hearts and entitlements against Postgres: a wrong answer costs one, never
 * below zero; practice gives one back every five ratings; plus makes them
 * unlimited; RevenueCat events grant and revoke idempotently.
 */

import { schema } from "@molo/db";
import {
  addHearts,
  applyRevenueCatEvent,
  getHearts,
  grantEntitlement,
  loseHeart,
  planOf,
  practiceTick,
  revokeEntitlement,
} from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const learner = FIXTURE_USERS.learner.id;
const NOW = new Date("2026-09-04T12:00:00Z");
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

describe("hearts", () => {
  it("starts full, loses one per wrong answer, never goes below zero, regenerates with time", async () => {
    expect((await getHearts(h.db, learner, NOW)).hearts).toBe(5);
    for (let i = 0; i < 7; i++) await loseHeart(h.db, learner, NOW);
    const empty = await getHearts(h.db, learner, NOW);
    expect(empty.hearts).toBe(0);
    expect(empty.nextRegenAt).toBe(later(4).toISOString());
    expect((await getHearts(h.db, learner, later(9))).hearts).toBe(2);
    expect((await addHearts(h.db, learner, 10, later(9))).hearts).toBe(5);
  });

  it("five review ratings give one heart back", async () => {
    await loseHeart(h.db, learner, NOW);
    let earned = 0;
    for (let i = 0; i < 5; i++) {
      const r = await practiceTick(h.db, learner, NOW);
      if (r.earned) earned++;
    }
    expect(earned).toBe(1);
    expect((await getHearts(h.db, learner, NOW)).hearts).toBe(5);
  });

  it("plus makes hearts unlimited and losing one is a no-op", async () => {
    await grantEntitlement(h.db, learner, "plus", "promo", null);
    const s = await loseHeart(h.db, learner, NOW);
    expect(s).toMatchObject({ unlimited: true, hearts: 5 });
    expect((await planOf(h.db, learner, NOW)).plan).toBe("plus");
    await revokeEntitlement(h.db, learner, "plus");
    expect((await planOf(h.db, learner, NOW)).plan).toBe("free");
  });
});

describe("revenuecat events", () => {
  it("grants on purchase, ignores a replay, keeps access after cancellation until expiry, revokes on expiration", async () => {
    const exp = later(24 * 30).getTime();
    const purchase = {
      id: "e1",
      type: "INITIAL_PURCHASE",
      app_user_id: learner,
      entitlement_ids: ["plus"],
      expiration_at_ms: exp,
      product_id: "molo_plus_yearly",
      store: "APP_STORE",
    };
    expect(await applyRevenueCatEvent(h.db, purchase)).toMatchObject({ active: true });
    expect(await applyRevenueCatEvent(h.db, purchase)).toBeNull();
    expect((await planOf(h.db, learner, NOW)).plan).toBe("plus");
    expect(
      await applyRevenueCatEvent(h.db, { ...purchase, id: "e2", type: "CANCELLATION" }),
    ).toMatchObject({ active: true });
    expect((await planOf(h.db, learner, NOW)).plan).toBe("plus");
    expect((await planOf(h.db, learner, new Date(exp + 1))).plan).toBe("free"); // past expiry, even while "active"
    expect(
      await applyRevenueCatEvent(h.db, { ...purchase, id: "e3", type: "EXPIRATION" }),
    ).toMatchObject({ active: false });
    expect((await planOf(h.db, learner, NOW)).plan).toBe("free");
    const [row] = await h.db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, learner));
    expect(row?.lastEventId).toBe("e3");
  });
});
