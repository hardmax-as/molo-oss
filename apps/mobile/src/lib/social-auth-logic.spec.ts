import {
  appleUser,
  isAppleCancel,
  randomNonce,
  visibleSocialProviders,
} from "./social-auth-logic.ts";

describe("social sign-in helpers", () => {
  it("makes a fresh alphanumeric nonce each time", () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(a).not.toBe(b);
    expect(randomNonce(8)).toHaveLength(8);
  });

  it("passes on only what Apple shared", () => {
    expect(appleUser(null, null)).toBeNull();
    expect(appleUser({ givenName: " ", familyName: null }, "")).toBeNull();
    expect(appleUser({ givenName: "Anele", familyName: "M" }, "a@example.com")).toEqual({
      name: { firstName: "Anele", lastName: "M" },
      email: "a@example.com",
    });
    expect(appleUser({ givenName: null, familyName: "M" }, null)).toEqual({
      name: { lastName: "M" },
    });
    expect(appleUser(null, "hidden@privaterelay.appleid.com")).toEqual({
      email: "hidden@privaterelay.appleid.com",
    });
  });

  it("recognises a dismissed Apple sheet", () => {
    expect(isAppleCancel({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
    expect(isAppleCancel(new Error("boom"))).toBe(false);
    expect(isAppleCancel(null)).toBe(false);
  });
});

describe("visibleSocialProviders (App Store guideline 4.8)", () => {
  it("never shows Google alone on iOS", () => {
    expect(visibleSocialProviders("ios", { apple: false, google: true })).toEqual({
      apple: false,
      google: false,
    });
    expect(visibleSocialProviders("ios", { apple: true, google: true })).toEqual({
      apple: true,
      google: true,
    });
  });
  it("shows Google on Android without Apple, and Apple never on Android", () => {
    expect(visibleSocialProviders("android", { apple: true, google: true })).toEqual({
      apple: false,
      google: true,
    });
  });
  it("keeps both visible in development builds on iOS", () => {
    expect(visibleSocialProviders("ios", { apple: false, google: false }, true)).toEqual({
      apple: true,
      google: true,
    });
  });
});
