import { schema, type Db } from "@molo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { harness, type Harness } from "./helpers.ts";

/**
 * Settings → Account through the real Better Auth configuration
 * (apps/api/src/auth.ts) and the API's account routes, against Postgres.
 *
 * The contract: every change needs a session; the name is held to the
 * account-name shape; the league display name is refused by the same name
 * filter the clients check; a password changes only with the current one,
 * and a first password can be set only on an account that has none; an
 * e-mail changes only when the link sent to the new address is opened, and
 * the current address is told at the time of the request.
 */

// Keep the Worker's globals in the API typecheck; only the HTTP boundary crosses.
const apiHarnessModule = "../../../apps/api/src/test/auth-harness.ts";
type Call = (
  path: string,
  init?: { body?: unknown; cookie?: string; method?: string },
) => Promise<Response>;
const {
  authTestApp,
  AUTH_TEST_ORIGIN,
}: {
  authTestApp: (db: Db) => { request: Call; api: Call };
  AUTH_TEST_ORIGIN: string;
} = await import(apiHarnessModule);

const AGE = { birthYear: 1990, country: "ZA", ageReached: false };
const PASSWORD = "zz-integrity-password-1234";

let h: Harness;
let app: ReturnType<typeof authTestApp>;
/** Every mail the dry-run sender printed during the test. */
let mails: { to: string; subject: string; text: string }[];

beforeEach(async () => {
  h ??= await harness();
  app ??= authTestApp(h.db);
  mails = [];
  // No RESEND_API_KEY in the harness: sendEmail prints instead of sending.
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    const m = /^\[email dry-run\] to=(\S+) subject=("(?:[^"\\]|\\.)*")\n([\s\S]*)$/.exec(
      String(line),
    );
    if (m) mails.push({ to: m[1]!, subject: JSON.parse(m[2]!) as string, text: m[3]! });
  });
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    throw new Error(`unexpected fetch in the account-settings test: ${url.split("?")[0]}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => h?.close());

let serial = 0;
function uniqueEmail(label: string) {
  serial += 1;
  return `zz-account-${label}-${Date.now()}-${serial}@molo.local`;
}

function sessionCookie(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
}

async function signUp(label: string) {
  const email = uniqueEmail(label);
  const res = await app.request("/sign-up/email", {
    body: { email, password: PASSWORD, name: "Fixture Learner", ...AGE },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { email, userId: body.user.id, cookie: sessionCookie(res) };
}

async function signIn(email: string, password: string) {
  return app.request("/sign-in/email", { body: { email, password } });
}

async function userRow(id: string) {
  const [row] = await h.db.select().from(schema.users).where(eq(schema.users.id, id));
  return row!;
}

describe("every account change needs a session", () => {
  it.each([
    ["/update-user", { name: "Nomsa" }],
    ["/change-email", { newEmail: "zz-nobody@molo.local" }],
    ["/change-password", { currentPassword: PASSWORD, newPassword: "another-password-99" }],
  ])("Better Auth refuses %s without one", async (path, body) => {
    expect((await app.request(path, { body })).status).toBe(401);
  });

  it.each([
    ["PUT", "/me/league-profile", { displayName: "Ada", leaguesOptOut: false }],
    ["POST", "/me/password", { newPassword: "another-password-99" }],
  ])("the API refuses %s %s without one", async (method, path, body) => {
    expect((await app.api(path, { method, body })).status).toBe(401);
  });
});

describe("name and league display name", () => {
  it("stores a trimmed name and refuses an empty or invisible one", async () => {
    const { userId, cookie } = await signUp("name");
    const ok = await app.request("/update-user", { cookie, body: { name: "  Nomsa Dube " } });
    expect(ok.status).toBe(200);
    expect((await userRow(userId)).name).toBe("Nomsa Dube");
    for (const name of ["   ", "No​msa", "x".repeat(81)]) {
      const bad = await app.request("/update-user", { cookie, body: { name } });
      expect(bad.status, JSON.stringify(name)).toBe(400);
      expect(await bad.json()).toMatchObject({ code: "INVALID_NAME" });
    }
    expect((await userRow(userId)).name).toBe("Nomsa Dube");
  });

  it("cannot change the e-mail or server-only fields through /update-user", async () => {
    const { userId, email, cookie } = await signUp("fields");
    const res = await app.request("/update-user", {
      cookie,
      body: { email: uniqueEmail("sneaky") },
    });
    expect(res.status).toBe(400);
    const res2 = await app.request("/update-user", { cookie, body: { ageOk: false } });
    expect(res2.status).toBe(400);
    expect(await userRow(userId)).toMatchObject({ email, ageOk: true });
  });

  it("refuses a display name the name filter holds back, and keeps an allowed one", async () => {
    const { userId, cookie } = await signUp("display");
    const refused = await app.api("/me/league-profile", {
      cookie,
      method: "PUT",
      body: { displayName: "Molo Team", leaguesOptOut: false },
    });
    expect(refused.status).toBe(400);
    expect((await userRow(userId)).displayName).toBeNull();
    const ok = await app.api("/me/league-profile", {
      cookie,
      method: "PUT",
      body: { displayName: "Bjørn", leaguesOptOut: false },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ displayName: "Bjørn", publicName: "Bjørn" });
    expect((await userRow(userId)).displayName).toBe("Bjørn");
  });
});

describe("password", () => {
  it("refuses a wrong current password and a short new one, then changes it", async () => {
    const { email, cookie } = await signUp("password");
    const wrong = await app.request("/change-password", {
      cookie,
      body: { currentPassword: "not-the-password", newPassword: "a-new-password-42" },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "INVALID_PASSWORD" });
    const short = await app.request("/change-password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "short" },
    });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect((await signIn(email, PASSWORD)).status).toBe(200);

    const ok = await app.request("/change-password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "a-new-password-42" },
    });
    expect(ok.status).toBe(200);
    expect((await signIn(email, PASSWORD)).status).toBe(401);
    expect((await signIn(email, "a-new-password-42")).status).toBe(200);
  });

  it("signs out every other session when asked", async () => {
    const { email, cookie } = await signUp("revoke");
    const other = sessionCookie(await signIn(email, PASSWORD));
    expect((await app.request("/get-session", { cookie: other })).status).toBe(200);
    const res = await app.request("/change-password", {
      cookie,
      body: {
        currentPassword: PASSWORD,
        newPassword: "a-new-password-42",
        revokeOtherSessions: true,
      },
    });
    expect(res.status).toBe(200);
    const fresh = sessionCookie(res);
    expect(await (await app.request("/get-session", { cookie: other })).json()).toBeNull();
    expect(await (await app.request("/get-session", { cookie: fresh })).json()).not.toBeNull();
  });

  it("sets a first password only on an account without one", async () => {
    const { userId, email, cookie } = await signUp("setpw");
    // As an Apple/Google-only account: a social row and no credential row.
    await h.db
      .delete(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "credential")));
    await h.db.insert(schema.accounts).values({
      id: `acc-${userId}`,
      accountId: `google-sub-${userId}`,
      providerId: "google",
      userId,
    });
    const short = await app.api("/me/password", { cookie, body: { newPassword: "short" } });
    expect(short.status).toBe(400);

    const ok = await app.api("/me/password", { cookie, body: { newPassword: "first-password-1" } });
    expect(ok.status).toBe(200);
    const providers = await h.db
      .select({ providerId: schema.accounts.providerId })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(providers.map((p) => p.providerId).sort()).toEqual(["credential", "google"]);
    expect((await signIn(email, "first-password-1")).status).toBe(200);

    // A second call would replace a password without the current one: refused.
    const again = await app.api("/me/password", {
      cookie,
      body: { newPassword: "second-password-2" },
    });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: { code: "PASSWORD_ALREADY_SET" } });
    expect((await signIn(email, "first-password-1")).status).toBe(200);
  });

  it("never replaces an e-mail account's password through the set-password route", async () => {
    const { email, cookie } = await signUp("setpw-existing");
    const res = await app.api("/me/password", {
      cookie,
      body: { newPassword: "hijack-password-1" },
    });
    expect(res.status).toBe(400);
    expect((await signIn(email, "hijack-password-1")).status).toBe(401);
  });
});

describe("e-mail change", () => {
  it("mails the new address a link and the current one a notice, and changes only on the link", async () => {
    const { userId, email, cookie } = await signUp("email");
    await h.db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, userId));
    const next = uniqueEmail("email-new");
    mails = [];
    const res = await app.request("/change-email", { cookie, body: { newEmail: next } });
    expect(res.status).toBe(200);
    expect((await userRow(userId)).email).toBe(email);

    const verify = mails.find((m) => m.to === next);
    const notice = mails.find((m) => m.to === email);
    expect(mails).toHaveLength(2);
    expect(verify?.subject).toBe("Confirm your new email for Molo");
    expect(notice?.subject).toBe("Your Molo email is being changed");
    expect(notice?.text).toContain(next);
    // The notice carries no link: the change needs the new inbox.
    expect(notice?.text).not.toMatch(/https?:\/\//);

    const link = new URL(/https?:\/\/\S+/.exec(verify!.text)![0]);
    expect(link.searchParams.get("callbackURL")).toBe(
      `${AUTH_TEST_ORIGIN}/settings?email=changed#account`,
    );
    const opened = await app.request(`${link.pathname.replace(/^\/api\/auth/, "")}${link.search}`);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toBe(
      `${AUTH_TEST_ORIGIN}/settings?email=changed#account`,
    );
    expect(await userRow(userId)).toMatchObject({ email: next, emailVerified: true });
    expect((await signIn(next, PASSWORD)).status).toBe(200);
  });

  it("writes in the learner's language", async () => {
    const { userId, cookie } = await signUp("email-nb");
    await h.db
      .insert(schema.userPrefs)
      .values({ userId, sourceLang: "nb" })
      .onConflictDoUpdate({ target: schema.userPrefs.userId, set: { sourceLang: "nb" } });
    mails = [];
    const res = await app.request("/change-email", {
      cookie,
      body: { newEmail: uniqueEmail("email-nb-new") },
    });
    expect(res.status).toBe(200);
    expect(mails.map((m) => m.subject).sort()).toEqual([
      "Bekreft den nye e-posten din for Molo",
      "E-posten på Molo-kontoen din endres",
    ]);
  });

  it("says nothing about an address that already has an account", async () => {
    const taken = await signUp("email-taken");
    const { userId, email, cookie } = await signUp("email-taker");
    mails = [];
    const res = await app.request("/change-email", { cookie, body: { newEmail: taken.email } });
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(0);
    expect((await userRow(userId)).email).toBe(email);
  });
});
