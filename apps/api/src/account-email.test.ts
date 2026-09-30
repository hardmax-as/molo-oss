import { describe, expect, it } from "vitest";

import { emailChangeFromToken, emailChangeMails, landOnSettings } from "./account-email.ts";

const jwt = (payload: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("emailChangeFromToken", () => {
  it("reads a change request's current and new address", () => {
    expect(
      emailChangeFromToken(
        jwt({
          email: "old@x.test",
          updateTo: "ny@æøå.test",
          requestType: "change-email-verification",
        }),
      ),
    ).toEqual({ from: "old@x.test", to: "ny@æøå.test" });
  });

  it("is null for a sign-up verification and for garbage", () => {
    expect(emailChangeFromToken(jwt({ email: "old@x.test" }))).toBeNull();
    expect(emailChangeFromToken("not-a-jwt")).toBeNull();
    expect(emailChangeFromToken("a.%%%.c")).toBeNull();
  });
});

describe("landOnSettings", () => {
  it("replaces only the callback", () => {
    const out = new URL(
      landOnSettings(
        "https://api.test/api/auth/verify-email?token=abc&callbackURL=%2F",
        "https://web.test",
      ),
    );
    expect(out.searchParams.get("token")).toBe("abc");
    expect(out.searchParams.get("callbackURL")).toBe(
      "https://web.test/settings?email=changed#account",
    );
  });
});

describe("emailChangeMails", () => {
  it("sends the link to the new address and a link-free notice to the old one", () => {
    const [verify, notice] = emailChangeMails(
      { from: "old@x.test", to: "new@x.test" },
      "https://api.test/link",
      "en",
    );
    expect(verify).toMatchObject({ to: "new@x.test" });
    expect(verify.text).toContain("https://api.test/link");
    expect(notice).toMatchObject({ to: "old@x.test" });
    expect(notice.text).toContain("new@x.test");
    expect(notice.text).not.toContain("https://api.test/link");
  });

  it("writes Norwegian for a Norwegian learner", () => {
    const [verify] = emailChangeMails({ from: "a@x.test", to: "b@x.test" }, "https://l", "nb");
    expect(verify.subject).toBe("Bekreft den nye e-posten din for Molo");
  });
});
