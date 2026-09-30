import { schema, type Db } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { harness, type Harness } from "./helpers.ts";

/**
 * Account deletion and Sign in with Apple (App Store guideline 5.1.1(v)):
 * every way an account is deleted — "Delete account", the age step below the
 * minimum age, and the nightly cleanup of abandoned one-tap sign-ups — goes
 * through `deleteAccount`, which revokes the account's Apple grant at Apple
 * before the rows go, and deletes the account even when Apple cannot be
 * reached. Accounts without Apple never cause a call to Apple.
 *
 * `fetch` is stubbed: nothing leaves the process.
 */

// Keep the Worker's globals in the API typecheck; only function calls and HTTP cross.
const deletionModule = "../../../apps/api/src/account-deletion.ts";
const harnessModule = "../../../apps/api/src/test/auth-harness.ts";

type Bindings = Record<string, unknown>;
const {
  deleteAccount,
  pruneAgePendingAccounts,
}: {
  deleteAccount: (db: Db, env: Bindings, userId: string) => Promise<{ revoked: number }>;
  pruneAgePendingAccounts: (
    db: Db,
    env: Bindings,
    now: Date,
  ) => Promise<{ deleted: number; failed: number }>;
} = await import(deletionModule);
const {
  authTestApp,
}: {
  authTestApp: (
    db: Db,
    overrides?: Bindings,
  ) => {
    request: (
      path: string,
      init?: { body?: unknown; cookie?: string; method?: string },
    ) => Promise<Response>;
    api: (
      path: string,
      init?: { body?: unknown; cookie?: string; method?: string },
    ) => Promise<Response>;
  };
} = await import(harnessModule);

const APPLE = {
  APPLE_CLIENT_ID: "com.example.molo.web",
  APPLE_CLIENT_SECRET: "apple-web-secret-fixture",
  APPLE_APP_BUNDLE_IDENTIFIER: "com.example.molo",
  APPLE_APP_CLIENT_SECRET: "apple-app-secret-fixture",
};
const REVOKE = "https://appleid.apple.com/auth/revoke";
const TOKEN = "https://appleid.apple.com/auth/token";
const DAY = 86_400_000;

let h: Harness;
let app: ReturnType<typeof authTestApp>;
let calls: { url: string; form: Record<string, string> }[];
let appleAnswer: (url: string, form: Record<string, string>) => Promise<Response>;

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const jwt = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims))}.sig`;

let serial = 0;
function uniq(label: string) {
  serial += 1;
  const id = `zz-del-${label}-${Date.now()}-${serial}`;
  return { id, email: `${id}@molo.local`, appleSub: `apple-sub-${id}` };
}

async function insertUser(
  label: string,
  opts: { agePending?: boolean; createdAt?: Date; apple?: boolean; google?: boolean } = {},
) {
  const who = uniq(label);
  await h.db.insert(schema.users).values({
    id: who.id,
    name: "Fixture Learner",
    email: who.email,
    agePending: opts.agePending ?? false,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  });
  if (opts.apple)
    await h.db.insert(schema.accounts).values({
      id: `acc-apple-${who.id}`,
      accountId: who.appleSub,
      providerId: "apple",
      userId: who.id,
      refreshToken: `apple-refresh-${who.id}`,
      idToken: jwt({ sub: who.appleSub, aud: APPLE.APPLE_CLIENT_ID }),
    });
  if (opts.google)
    await h.db.insert(schema.accounts).values({
      id: `acc-google-${who.id}`,
      accountId: `google-sub-${who.id}`,
      providerId: "google",
      userId: who.id,
      refreshToken: `google-refresh-${who.id}`,
    });
  return who;
}

async function exists(userId: string): Promise<boolean> {
  const rows = await h.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return rows.length === 1;
}

const revokes = () => calls.filter((c) => c.url === REVOKE);

beforeEach(async () => {
  h ??= await harness();
  app ??= authTestApp(h.db, APPLE);
  calls = [];
  appleAnswer = async () => new Response(null, { status: 200 });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    calls.push({ url, form });
    if (url === REVOKE || url === TOKEN) return appleAnswer(url, form);
    // Nothing else may leave the process.
    throw new Error(`unexpected fetch in the account-deletion test: ${url.split("?")[0]}`);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => h?.close());

describe("deleting an account revokes its Apple grant first", () => {
  it("revokes the stored refresh token with the configured clients, then deletes", async () => {
    const who = await insertUser("apple", { apple: true });
    const out = await deleteAccount(h.db, APPLE, who.id);
    expect(out.revoked).toBe(1);
    expect(revokes().length).toBeGreaterThan(0);
    // The client in the token's audience is asked first.
    expect(revokes()[0]!.form).toEqual({
      client_id: APPLE.APPLE_CLIENT_ID,
      client_secret: APPLE.APPLE_CLIENT_SECRET,
      token: `apple-refresh-${who.id}`,
      token_type_hint: "refresh_token",
    });
    expect(await exists(who.id)).toBe(false);
    const accounts = await h.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, who.id));
    expect(accounts).toHaveLength(0);
  });

  it("never calls Apple for an account without Apple", async () => {
    const who = await insertUser("google", { google: true });
    await deleteAccount(h.db, APPLE, who.id);
    expect(calls).toHaveLength(0);
    expect(await exists(who.id)).toBe(false);
  });

  it("deletes the account even when Apple cannot be reached", async () => {
    appleAnswer = () => Promise.reject(new TypeError("fetch failed"));
    const who = await insertUser("apple-down", { apple: true });
    await deleteAccount(h.db, APPLE, who.id);
    expect(revokes().length).toBeGreaterThan(0);
    expect(await exists(who.id)).toBe(false);
    const warned = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    expect(warned).toContain("auth.apple_revoke_failed");
    expect(warned).not.toContain(`apple-refresh-${who.id}`);
  });
});

describe("the age step below the minimum age goes through the same path", () => {
  it("revokes the Apple grant and deletes the account", async () => {
    const who = uniq("underage");
    const res = await app.request("/sign-up/email", {
      body: {
        email: who.email,
        password: "zz-integrity-password-1234",
        name: "Fixture Learner",
        birthYear: 1990,
        country: "ZA",
        ageReached: false,
      },
    });
    expect(res.status).toBe(200);
    const userId = ((await res.json()) as { user: { id: string } }).user.id;
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0]!)
      .join("; ");
    // As a one-tap Apple sign-up would leave it: age step owed, Apple account linked.
    await h.db.update(schema.users).set({ agePending: true }).where(eq(schema.users.id, userId));
    await h.db.insert(schema.accounts).values({
      id: `acc-apple-${userId}`,
      accountId: who.appleSub,
      providerId: "apple",
      userId,
      refreshToken: "apple-refresh-underage",
    });
    const step = await app.api("/me/age", {
      cookie,
      body: { birthYear: new Date().getUTCFullYear() - 10, country: "NO" },
    });
    expect(step.status).toBe(403);
    expect(revokes().map((c) => c.form["token"])).toContain("apple-refresh-underage");
    expect(await exists(userId)).toBe(false);
  });
});

describe("the native authorization code becomes a revocable refresh token", () => {
  async function signedInWithApple(label: string) {
    const who = uniq(label);
    const res = await app.request("/sign-up/email", {
      body: {
        email: who.email,
        password: "zz-integrity-password-1234",
        name: "Fixture Learner",
        birthYear: 1990,
        country: "NO",
        ageReached: false,
      },
    });
    expect(res.status).toBe(200);
    const userId = ((await res.json()) as { user: { id: string } }).user.id;
    // What Better Auth's native id-token sign-in stores: the id token, no refresh token.
    await h.db.insert(schema.accounts).values({
      id: `acc-apple-${userId}`,
      accountId: who.appleSub,
      providerId: "apple",
      userId,
      idToken: jwt({ sub: who.appleSub, aud: APPLE.APPLE_APP_BUNDLE_IDENTIFIER }),
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0]!)
      .join("; ");
    return { who, userId, cookie };
  }

  it("exchanges the code with the bundle id, stores the token, and deletion revokes it", async () => {
    const { who, userId, cookie } = await signedInWithApple("code");
    appleAnswer = async (url) =>
      url === TOKEN
        ? Response.json({
            access_token: "apple-access-native",
            refresh_token: "apple-refresh-native",
            id_token: jwt({ sub: who.appleSub, aud: APPLE.APPLE_APP_BUNDLE_IDENTIFIER }),
            expires_in: 3600,
          })
        : new Response(null, { status: 200 });
    const res = await app.api("/me/apple/authorization-code", {
      cookie,
      body: { code: "native-code-fixture" },
    });
    expect(await res.json()).toEqual({ stored: true });
    expect(calls.find((c) => c.url === TOKEN)?.form).toEqual({
      client_id: APPLE.APPLE_APP_BUNDLE_IDENTIFIER,
      client_secret: APPLE.APPLE_APP_CLIENT_SECRET,
      code: "native-code-fixture",
      grant_type: "authorization_code",
    });
    await deleteAccount(h.db, APPLE, userId);
    expect(revokes()[0]!.form).toMatchObject({
      client_id: APPLE.APPLE_APP_BUNDLE_IDENTIFIER,
      token: "apple-refresh-native",
      token_type_hint: "refresh_token",
    });
    expect(await exists(userId)).toBe(false);
  });

  it("never stores a token whose Apple subject is not the caller's", async () => {
    const { userId, cookie } = await signedInWithApple("foreign");
    appleAnswer = async () =>
      Response.json({
        refresh_token: "apple-refresh-foreign",
        id_token: jwt({ sub: "someone-else", aud: APPLE.APPLE_APP_BUNDLE_IDENTIFIER }),
      });
    const res = await app.api("/me/apple/authorization-code", {
      cookie,
      body: { code: "foreign-code" },
    });
    expect(await res.json()).toEqual({ stored: false, reason: "no_account" });
    const [row] = await h.db
      .select({ refreshToken: schema.accounts.refreshToken })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(row?.refreshToken).toBeNull();
  });

  it("degrades to a no-op while APPLE_APP_CLIENT_SECRET is not set, and deletion still works", async () => {
    const { APPLE_APP_CLIENT_SECRET: _unset, ...webOnly } = APPLE;
    const today = authTestApp(h.db, webOnly);
    const { userId, cookie } = await signedInWithApple("unconfigured");
    const res = await today.api("/me/apple/authorization-code", {
      cookie,
      body: { code: "native-code-fixture" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: false, reason: "not_configured" });
    expect(calls).toHaveLength(0);
    // Only the native id token is stored: nothing to revoke, and the account still goes.
    await deleteAccount(h.db, webOnly, userId);
    expect(calls).toHaveLength(0);
    expect(await exists(userId)).toBe(false);
    // With no Apple credentials at all, a stored token is skipped and the account still goes.
    const who = await insertUser("no-apple-config", { apple: true });
    await deleteAccount(h.db, {}, who.id);
    expect(calls).toHaveLength(0);
    expect(await exists(who.id)).toBe(false);
  });

  it("refuses a signed-out caller", async () => {
    const res = await app.api("/me/apple/authorization-code", { body: { code: "x" } });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("abandoned one-tap sign-ups are deleted after seven days", () => {
  it("deletes age-pending accounts older than seven days, revoking Apple, and keeps the rest", async () => {
    const now = new Date();
    const stale = await insertUser("stale", {
      agePending: true,
      createdAt: new Date(now.getTime() - 8 * DAY),
      apple: true,
    });
    const fresh = await insertUser("fresh", {
      agePending: true,
      createdAt: new Date(now.getTime() - 6 * DAY),
    });
    const confirmed = await insertUser("confirmed", {
      createdAt: new Date(now.getTime() - 30 * DAY),
      apple: true,
    });
    const out = await pruneAgePendingAccounts(h.db, APPLE, now);
    expect(out.failed).toBe(0);
    expect(out.deleted).toBeGreaterThanOrEqual(1);
    expect(await exists(stale.id)).toBe(false);
    expect(await exists(fresh.id)).toBe(true);
    expect(await exists(confirmed.id)).toBe(true);
    const tokens = revokes().map((c) => c.form["token"]);
    expect(tokens).toContain(`apple-refresh-${stale.id}`);
    expect(tokens).not.toContain(`apple-refresh-${confirmed.id}`);
  });
});
