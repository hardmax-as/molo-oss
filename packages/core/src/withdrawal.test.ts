import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  canWithdraw,
  RevenueCatEvent,
  WebCheckoutRequest,
  withdrawalDeadline,
  withdrawalRefund,
} from "./withdrawal.ts";

describe("web purchase withdrawal", () => {
  it("requires an explicit true request for a recognized product", () => {
    for (const expressStart of [false, undefined, "true"])
      expect(
        Schema.decodeUnknownEither(WebCheckoutRequest)({
          productId: "molo_plus_monthly",
          expressStart,
        })._tag,
      ).toBe("Left");
    expect(
      Schema.decodeUnknownEither(WebCheckoutRequest)({
        productId: "molo_plus_monthly",
        expressStart: true,
      })._tag,
    ).toBe("Right");
  });
  it("excludes purchase day and allows the whole final day, then refuses", () => {
    const start = new Date("2026-09-01T12:00:00Z");
    const end = withdrawalDeadline(start);
    expect(end.toISOString()).toBe("2026-09-15T22:00:00.000Z");
    expect(canWithdraw(start, new Date(start.getTime() - 1))).toBe(false);
    expect(canWithdraw(start, new Date(end.getTime() - 1))).toBe(true);
    expect(canWithdraw(start, end)).toBe(false);
  });
  it.each([
    ["2026-09-20T12:00:00Z", "2026-10-05T22:00:00.000Z"], // Sunday -> Monday
    ["2026-03-20T12:00:00Z", "2026-04-07T22:00:00.000Z"], // Good Friday -> Tuesday, crossing DST
    ["2026-12-11T12:00:00Z", "2026-12-28T23:00:00.000Z"], // Christmas -> Monday
    ["2026-04-17T12:00:00Z", "2026-05-04T22:00:00.000Z"], // Labour Day -> Monday
    ["2026-10-16T23:30:00Z", "2026-11-02T23:00:00.000Z"], // Oslo date and autumn DST
  ])("extends the deadline for %s", (start, end) =>
    expect(withdrawalDeadline(new Date(start)).toISOString()).toBe(end),
  );
  it("calculates proportionate refunds with currency rounding, and no deduction without consent", () => {
    const start = new Date("2026-09-01T12:00Z"),
      end = new Date("2026-10-01T12:00Z"),
      now = new Date("2026-09-11T12:00Z");
    expect(withdrawalRefund(79, "NOK", start, end, now, true)).toBe(52.67);
    expect(withdrawalRefund(79, "NOK", start, end, now, false)).toBe(79);
    expect(withdrawalRefund(100, "JPY", start, end, now, true)).toBe(67);
    expect(withdrawalRefund(0, "NOK", start, end, now, true)).toBe(0);
    expect(withdrawalRefund(null, "NOK", start, end, now, true)).toBeNull();
    expect(withdrawalRefund(79, "NOK", start, null, now, true)).toBeNull();
    expect(withdrawalRefund(79, "NOK", start, null, now, false)).toBe(79);
  });
  it("rejects malformed payment fields before arithmetic", () => {
    expect(
      Schema.decodeUnknownEither(RevenueCatEvent)({
        id: "event",
        type: "INITIAL_PURCHASE",
        app_user_id: "user",
        purchased_at_ms: "yesterday",
      })._tag,
    ).toBe("Left");
  });
});
