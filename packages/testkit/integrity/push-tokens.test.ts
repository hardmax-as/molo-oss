/**
 * Device push tokens against Postgres: registration is idempotent on the
 * token, a dead device is disabled rather than deleted, the learner's export
 * shows the device but never the token, and deleting the account takes every
 * token with it (GDPR articles 15 and 17).
 */

import {
  deleteUserAccount,
  disablePushTokens,
  enabledPushTokens,
  exportUserData,
  registerPushToken,
  removePushTokens,
  schema,
} from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS, seedFixtureUsers } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const learner = FIXTURE_USERS.learner.id;
const other = FIXTURE_USERS.editorA.id;
const iphone = "ExponentPushToken[fixture-iphone]";
const pixel = "ExponentPushToken[fixture-pixel]";

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

const rowsFor = (userId: string) =>
  h.db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));

describe("push token registration", () => {
  it("is idempotent on the token and refreshes what changed", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios", appVersion: "0.0.1" });
    const [first] = await rowsFor(learner);
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios", appVersion: "0.0.2" });
    const rows = await rowsFor(learner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appVersion).toBe("0.0.2");
    expect(rows[0]?.id).toBe(first?.id);
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first?.createdAt.getTime() ?? 0);
  });

  it("moves a device that signs in as somebody else, rather than pushing to both", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios" });
    await registerPushToken(h.db, other, { token: iphone, platform: "ios" });
    expect(await rowsFor(learner)).toHaveLength(0);
    expect(await rowsFor(other)).toHaveLength(1);
  });

  it("refuses a platform the app does not ship on", async () => {
    const failure = await h.db
      .insert(schema.pushTokens)
      .values({ userId: learner, token: "zz-bad", platform: "windows" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    const cause = (failure as { cause?: { constraint_name?: string } }).cause;
    expect(cause?.constraint_name).toBe("push_tokens_platform");
    expect(await rowsFor(learner)).toHaveLength(0);
  });
});

describe("the nightly job's view", () => {
  it("returns live tokens per learner and skips disabled ones", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios" });
    await registerPushToken(h.db, learner, { token: pixel, platform: "android" });
    await registerPushToken(h.db, other, {
      token: "ExponentPushToken[fixture-other]",
      platform: "ios",
    });
    const all = await enabledPushTokens(h.db, [learner, other]);
    expect(all.get(learner)?.sort()).toEqual([iphone, pixel].sort());
    expect(all.get(other)).toHaveLength(1);

    expect(await disablePushTokens(h.db, [pixel])).toBe(1);
    // A second report about the same dead device changes nothing.
    expect(await disablePushTokens(h.db, [pixel])).toBe(0);
    expect((await enabledPushTokens(h.db, [learner])).get(learner)).toEqual([iphone]);
    expect(await rowsFor(learner)).toHaveLength(2);
  });

  it("asks nothing of the database when there are no candidates", async () => {
    expect((await enabledPushTokens(h.db, [])).size).toBe(0);
    expect(await disablePushTokens(h.db, [])).toBe(0);
  });
});

describe("sign-out and account deletion", () => {
  it("forgets one device, or every device when no token is named", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios" });
    await registerPushToken(h.db, learner, { token: pixel, platform: "android" });
    expect(await removePushTokens(h.db, learner, iphone)).toBe(1);
    expect(await rowsFor(learner)).toHaveLength(1);
    expect(await removePushTokens(h.db, learner)).toBe(1);
    expect(await rowsFor(learner)).toHaveLength(0);
  });

  it("never lets one learner remove another learner's device", async () => {
    await registerPushToken(h.db, other, { token: iphone, platform: "ios" });
    expect(await removePushTokens(h.db, learner, iphone)).toBe(0);
    expect(await rowsFor(other)).toHaveLength(1);
  });

  it("exports the device metadata without the token itself", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios", appVersion: "0.0.1" });
    const data = await exportUserData(h.db, learner);
    const devices = data["pushDevices"] as Record<string, unknown>[];
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ platform: "ios", appVersion: "0.0.1", disabledAt: null });
    expect(JSON.stringify(data)).not.toContain(iphone);
  });

  it("deletes every token with the account", async () => {
    await registerPushToken(h.db, learner, { token: iphone, platform: "ios" });
    await registerPushToken(h.db, other, { token: pixel, platform: "android" });
    await deleteUserAccount(h.db, learner);
    expect(await h.db.select().from(schema.pushTokens)).toHaveLength(1);
    // The fixture user is gone with the account; put it back for the next test.
    await seedFixtureUsers(h.db);
  });
});
