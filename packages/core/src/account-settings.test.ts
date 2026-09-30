import { describe, expect, it } from "vitest";

import {
  ACCOUNT_NAME_MAX,
  hasPasswordSignIn,
  normaliseAccountName,
  passwordRefusal,
} from "./account-settings.ts";

describe("password settings", () => {
  it("offers change only to an account with a credential", () => {
    expect(hasPasswordSignIn(["google", "credential"])).toBe(true);
    expect(hasPasswordSignIn(["apple"])).toBe(false);
  });

  it("names Better Auth's refusals", () => {
    expect(passwordRefusal("INVALID_PASSWORD")).toBe("wrong");
    expect(passwordRefusal("PASSWORD_TOO_SHORT")).toBe("short");
    expect(passwordRefusal(undefined)).toBe("generic");
  });
});

describe("normaliseAccountName", () => {
  it("trims and keeps an ordinary name", () => {
    expect(normaliseAccountName("  Thandi Mbeki ")).toBe("Thandi Mbeki");
    expect(normaliseAccountName("Åse Ødegård")).toBe("Åse Ødegård");
  });

  it("refuses empty, too long, non-string and invisible characters", () => {
    expect(normaliseAccountName("   ")).toBeNull();
    expect(normaliseAccountName("x".repeat(ACCOUNT_NAME_MAX + 1))).toBeNull();
    expect(normaliseAccountName(42)).toBeNull();
    expect(normaliseAccountName("Ana​bel")).toBeNull();
    expect(normaliseAccountName("Ana\nbel")).toBeNull();
  });
});
