import { describe, expect, it } from "vitest";

import {
  isSocialProvider,
  isUnlinkedSocialAccount,
  socialLinkError,
  registrationCountry,
  registrationCountryFromLanguage,
} from "./social-auth.ts";

describe("social registration defaults", () => {
  it.each([
    ["NO", "NO"],
    ["za", "ZA"],
    ["GB", "OTHER"],
    [null, "OTHER"],
  ] as const)("maps device region %s to %s", (region, expected) => {
    expect(registrationCountry(region)).toBe(expected);
  });
  it.each([
    ["nb-NO", "NO"],
    ["en-ZA", "ZA"],
    ["en-GB", "OTHER"],
    ["nb", "OTHER"],
    ["en-Latn-ZA", "ZA"],
    ["invalid_locale", "OTHER"],
    [undefined, "OTHER"],
  ] as const)("maps browser language %s to %s", (locale, expected) => {
    expect(registrationCountryFromLanguage(locale)).toBe(expected);
  });
  it("tells an existing but unconnected account apart from a missing one", () => {
    expect(isUnlinkedSocialAccount({ code: "account_not_linked" })).toBe(true);
    expect(
      isUnlinkedSocialAccount({ code: "OAUTH_LINK_ERROR", message: "account not linked" }),
    ).toBe(true);
    expect(isUnlinkedSocialAccount({ code: "OAUTH_LINK_ERROR", message: "signup disabled" })).toBe(
      false,
    );
  });
  it.each([
    ["SOCIAL_ACCOUNT_ALREADY_LINKED", "taken"],
    ["account_already_linked_to_different_user", "taken"],
    ["SESSION_NOT_FRESH", "reauth"],
    ["FAILED_TO_UNLINK_LAST_ACCOUNT", "last"],
    ["LINKING_NOT_ALLOWED", "unverified"],
    ["email_does_not_match", "generic"],
    [undefined, "generic"],
  ] as const)("maps the link error %s to %s", (code, expected) => {
    expect(socialLinkError({ code })).toBe(expected);
  });
  it("accepts only the offered providers", () => {
    expect(isSocialProvider("apple")).toBe(true);
    expect(isSocialProvider("google")).toBe(true);
    expect(isSocialProvider("credential")).toBe(false);
  });
});
