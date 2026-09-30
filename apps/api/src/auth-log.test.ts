import { describe, expect, it } from "vitest";

import { socialFailureLine } from "./auth-log.ts";

const apiError = (statusCode: number, body: Record<string, unknown> = {}) => ({ statusCode, body });

describe("social auth failure log line", () => {
  it("names the native Apple refusal seen from TestFlight 0.0.3", () => {
    expect(
      socialFailureLine({
        path: "/sign-in/social",
        body: { provider: "apple", idToken: { token: "eyJ.secret.token", nonce: "n" } },
        returned: apiError(401, { code: "OAUTH_LINK_ERROR", message: "signup disabled" }),
      }),
    ).toBe(
      'auth.social_failed provider=apple path=/sign-in/social status=401 code=OAUTH_LINK_ERROR reason="signup disabled"',
    );
  });

  it("reduces a callback redirect to its error code and never logs the query string", () => {
    const line = socialFailureLine({
      path: "/callback/:id",
      params: { id: "google" },
      returned: apiError(302),
      location:
        "molo://auth?socialFlow=abc&error=signup_disabled&error_description=learner%40example.test",
    });
    expect(line).toBe(
      "auth.social_failed provider=google path=/callback/:id status=302 code=signup_disabled",
    );
    expect(line).not.toContain("socialFlow");
    expect(line).not.toContain("example.test");
  });

  it("says nothing about a successful callback redirect or a successful call", () => {
    expect(
      socialFailureLine({
        path: "/callback/:id",
        params: { id: "google" },
        returned: apiError(302),
        location: "molo://auth?socialFlow=abc&cookie=better-auth.session_token%3Dsecret",
      }),
    ).toBeNull();
    expect(
      socialFailureLine({ path: "/link-social", body: { provider: "apple" }, returned: {} }),
    ).toBeNull();
  });

  it("covers link and unlink failures", () => {
    expect(
      socialFailureLine({
        path: "/link-social",
        body: { provider: "google" },
        returned: apiError(409, {
          code: "SOCIAL_ACCOUNT_ALREADY_LINKED",
          message: "Social account already linked",
        }),
      }),
    ).toContain("provider=google path=/link-social status=409 code=SOCIAL_ACCOUNT_ALREADY_LINKED");
    expect(
      socialFailureLine({
        path: "/unlink-account",
        body: { accountId: "acc_1" },
        returned: apiError(400, { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" }),
      }),
    ).toBe(
      "auth.social_failed provider=unknown path=/unlink-account status=400 code=FAILED_TO_UNLINK_LAST_ACCOUNT",
    );
  });

  it("drops a message that could carry user data, and ignores other routes", () => {
    const line = socialFailureLine({
      path: "/sign-in/social",
      body: { provider: "google" },
      returned: apiError(400, {
        code: "VALIDATION_ERROR",
        message: "bad email learner@example.test",
      }),
    });
    expect(line).toBe(
      "auth.social_failed provider=google path=/sign-in/social status=400 code=VALIDATION_ERROR",
    );
    expect(
      socialFailureLine({
        path: "/sign-in/email",
        body: { email: "learner@example.test" },
        returned: apiError(401, { code: "INVALID_EMAIL_OR_PASSWORD" }),
      }),
    ).toBeNull();
  });
});
