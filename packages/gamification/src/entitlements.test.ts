import { describe, expect, it } from "vitest";

import { decideEntitlement } from "./entitlements.ts";

const base = { id: "evt1", app_user_id: "u1", expiration_at_ms: Date.UTC(2027, 0, 1) };

describe("decideEntitlement", () => {
  it("grants on purchases and renewals, keeps access after a cancellation until expiry, revokes on expiration", () => {
    expect(decideEntitlement({ ...base, type: "INITIAL_PURCHASE" })).toEqual({
      active: true,
      expiresAt: new Date(Date.UTC(2027, 0, 1)),
    });
    expect(decideEntitlement({ ...base, type: "RENEWAL" })?.active).toBe(true);
    expect(decideEntitlement({ ...base, type: "CANCELLATION" })?.active).toBe(true);
    expect(decideEntitlement({ ...base, type: "EXPIRATION" })?.active).toBe(false);
  });

  it("ignores events that do not change access", () => {
    expect(decideEntitlement({ ...base, type: "BILLING_ISSUE" })).toBeNull();
    expect(decideEntitlement({ ...base, type: "TEST" })).toBeNull();
  });
});
