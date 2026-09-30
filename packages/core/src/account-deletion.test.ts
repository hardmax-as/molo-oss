import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETE_CONFIRMATION,
  confirmWordMatches,
  deletionConfirmed,
} from "./account-deletion.ts";

describe("account deletion consent", () => {
  it("matches the typed word regardless of case and surrounding space", () => {
    expect(confirmWordMatches(" delete ", "DELETE")).toBe(true);
    expect(confirmWordMatches("Slett", "SLETT")).toBe(true);
    expect(confirmWordMatches("DELET", "DELETE")).toBe(false);
    expect(confirmWordMatches("", "DELETE")).toBe(false);
    expect(confirmWordMatches("   ", "DELETE")).toBe(false);
  });

  it("accepts the token without asking for the email (relay addresses stay untyped)", () => {
    expect(
      deletionConfirmed({ confirm: ACCOUNT_DELETE_CONFIRMATION }, "x7k2@privaterelay.appleid.com"),
    ).toBe(true);
  });

  it("still accepts the account email from older builds", () => {
    expect(deletionConfirmed({ confirmEmail: " Ada@Example.com " }, "ada@example.com")).toBe(true);
    expect(deletionConfirmed({ confirmEmail: "someone@else.com" }, "ada@example.com")).toBe(false);
  });

  it("refuses anything else", () => {
    expect(deletionConfirmed(null, "ada@example.com")).toBe(false);
    expect(deletionConfirmed({}, "ada@example.com")).toBe(false);
    expect(deletionConfirmed({ confirm: "DELETE" }, "ada@example.com")).toBe(false);
    expect(deletionConfirmed({ confirm: true }, "ada@example.com")).toBe(false);
    expect(deletionConfirmed({ confirmEmail: "" }, "")).toBe(false);
  });
});
