import { describe, expect, it, vi } from "vitest";

import type { Bindings } from "./env.ts";

// The mail transport is mocked so the test asserts what Better Auth is told
// to send, not whether Resend accepts it.
vi.mock("./email.ts", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

const { sendEmail } = await import("./email.ts");
const { createAuth } = await import("./auth.ts");

const env = (extra: Partial<Bindings> = {}) =>
  ({
    ENVIRONMENT: "prod",
    BETTER_AUTH_URL: "https://api.example.test",
    BETTER_AUTH_SECRET: "x".repeat(32),
    WEB_ORIGIN: "https://example.test",
    ...extra,
  }) as Bindings;

describe("createAuth email verification", () => {
  it("reports only newly created accounts whose age gate was already passed", async () => {
    const completed = vi.fn();
    const db = { insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) };
    const after = createAuth(env(), db as never, completed).options.databaseHooks?.user?.create
      ?.after;
    expect(after).toBeTypeOf("function");
    await after!({ id: "pending", ageOk: false, agePending: true } as never);
    await after!({ id: "invalid", ageOk: false, agePending: false } as never);
    expect(completed).not.toHaveBeenCalled();
    await after!({ id: "age-approved", ageOk: true, agePending: false } as never);
    expect(completed).toHaveBeenCalledExactlyOnceWith("age-approved");
  });
  it("requires a verified address in production and has a mail to send", async () => {
    const auth = createAuth(env(), {} as never);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
    const send = auth.options.emailVerification?.sendVerificationEmail;
    expect(send).toBeTypeOf("function");
    await send!({
      user: { id: "u1", email: "learner@example.test" } as never,
      url: "https://api.example.test/api/auth/verify-email?token=t",
      token: "t",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: "learner@example.test",
        text: expect.stringContaining("verify-email?token=t"),
      }),
    );
  });

  it("does not require verification locally, so dev sign-up still signs in", () => {
    const auth = createAuth(env({ ENVIRONMENT: "local" }), {} as never);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
  });
});

describe("createAuth social sign-in and account linking", () => {
  const social = env({
    APPLE_CLIENT_ID: "com.example.molo.web",
    APPLE_CLIENT_SECRET: "apple-secret-fixture",
    APPLE_APP_BUNDLE_IDENTIFIER: "com.example.molo",
    GOOGLE_CLIENT_ID: "google-client-fixture",
    GOOGLE_CLIENT_SECRET: "google-secret-fixture",
  });

  it("never creates an account from an implicit social sign-in", () => {
    const { socialProviders } = createAuth(social, {} as never).options;
    expect(socialProviders?.apple?.disableImplicitSignUp).toBe(true);
    expect(socialProviders?.google?.disableImplicitSignUp).toBe(true);
  });

  it("links explicitly across e-mails, but implicitly only on verified ones", () => {
    // Widened to Better Auth's option shape so the defaults we rely on can be asserted absent.
    const linking = createAuth(social, {} as never).options.account?.accountLinking as
      | {
          enabled?: boolean;
          allowDifferentEmails?: boolean;
          trustedProviders?: unknown;
          disableImplicitLinking?: boolean;
          requireLocalEmailVerified?: boolean;
          allowUnlinkingAll?: boolean;
        }
      | undefined;
    expect(linking?.enabled).toBe(true);
    // Apple's private relay address never equals the account's e-mail.
    expect(linking?.allowDifferentEmails).toBe(true);
    // Trusting a provider by name would skip the provider's email_verified check.
    expect(linking?.trustedProviders).toEqual([]);
    expect(linking?.disableImplicitLinking).not.toBe(true);
    // Better Auth's default (true) makes implicit linking require a verified local address.
    expect(linking?.requireLocalEmailVerified).not.toBe(false);
    expect(linking?.allowUnlinkingAll).toBe(false);
  });

  it("keeps the age gate before every request and logs social failures after", () => {
    const { hooks } = createAuth(social, {} as never).options;
    expect(hooks?.before).toBeTypeOf("function");
    expect(hooks?.after).toBeTypeOf("function");
  });
});
