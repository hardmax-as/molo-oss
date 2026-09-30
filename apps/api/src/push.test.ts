import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bindings } from "./env.ts";
import { batchTokens, readTickets, sendPush, streakReminderPush } from "./push.ts";

const env = (extra: Partial<Bindings> = {}) => ({ ...extra }) as Bindings;
const token = (n: number) => `ExponentPushToken[${String(n).padStart(6, "0")}]`;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Records what was posted and answers with the tickets the test wants. */
function expoStub(tickets: (start: number, count: number) => unknown[]) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  let seen = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { to: string[] };
    calls.push({
      url,
      body: body as unknown as Record<string, unknown>,
      auth: new Headers(init.headers).get("authorization"),
    });
    const data = tickets(seen, body.to.length);
    seen += body.to.length;
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

describe("sendPush", () => {
  it("sends nothing and reports a dry run without EXPO_ACCESS_TOKEN", async () => {
    const calls = expoStub(() => []);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const r = await sendPush(env(), { to: [token(1)], title: "t", body: "b" });
    expect(r).toEqual({ sent: 0, unregistered: [] });
    expect(calls).toHaveLength(0);
    expect(log.mock.calls[0]?.[0]).toContain("[push dry-run]");
    log.mockRestore();
  });

  it("does not call Expo when there is nobody to push to", async () => {
    const calls = expoStub(() => []);
    const r = await sendPush(env({ EXPO_ACCESS_TOKEN: "x" }), { to: [], title: "t", body: "b" });
    expect(r).toEqual({ sent: 0, unregistered: [] });
    expect(calls).toHaveLength(0);
  });

  it("posts batches of 100 with the bearer token and the route payload", async () => {
    const calls = expoStub((_, count) => Array.from({ length: count }, () => ({ status: "ok" })));
    const tokens = Array.from({ length: 250 }, (_, i) => token(i));
    const r = await sendPush(env({ EXPO_ACCESS_TOKEN: "secret" }), {
      to: tokens,
      title: "Molo",
      body: "streak",
      data: { route: "/review" },
    });
    expect(r.sent).toBe(250);
    expect(calls.map((c) => (c.body["to"] as string[]).length)).toEqual([100, 100, 50]);
    expect(calls[0]?.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(calls[0]?.auth).toBe("Bearer secret");
    expect(calls[0]?.body["data"]).toEqual({ route: "/review" });
  });

  it("collects tokens Expo says are gone and keeps the rest", async () => {
    expoStub((start, count) =>
      Array.from({ length: count }, (_, i) =>
        start + i === 1
          ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
          : { status: "ok" },
      ),
    );
    const r = await sendPush(env({ EXPO_ACCESS_TOKEN: "secret" }), {
      to: [token(0), token(1), token(2)],
      title: "Molo",
      body: "streak",
    });
    expect(r.sent).toBe(2);
    expect(r.unregistered).toEqual([token(1)]);
  });

  it("throws when Expo refuses the whole request", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    await expect(
      sendPush(env({ EXPO_ACCESS_TOKEN: "secret" }), { to: [token(0)], title: "t", body: "b" }),
    ).rejects.toThrow(/expo push: 500/);
  });
});

describe("ticket reading", () => {
  it("ignores errors that are not a dead device", () => {
    const r = readTickets([token(0), token(1)], {
      data: [
        { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
        { status: "ok" },
      ],
    });
    expect(r).toEqual({ sent: 1, unregistered: [] });
  });

  it("survives a body that is not a ticket list", () => {
    expect(readTickets([token(0)], null)).toEqual({ sent: 0, unregistered: [] });
    expect(readTickets([token(0)], { errors: [{ code: "x" }] })).toEqual({
      sent: 0,
      unregistered: [],
    });
  });

  it("de-duplicates tokens before batching", () => {
    expect(batchTokens([token(1), token(1), token(2)], 2)).toEqual([[token(1), token(2)]]);
  });
});

describe("reminder copy", () => {
  it("comes from packages/i18n in both languages, with the streak count", () => {
    const en = streakReminderPush({ name: "Anele", streak: 7, sourceLang: "en" });
    expect(en.title).toBe("Molo, Anele!");
    expect(en.body).toContain("7-day streak");
    const nb = streakReminderPush({ name: "Kari", streak: 1, sourceLang: "nb" });
    expect(nb.title).toBe("Molo, Kari!");
    expect(nb.body).toContain("1 dag ryker");
    expect(streakReminderPush({ name: "Kari", streak: 3, sourceLang: "nb" }).body).toContain(
      "3 dager ryker",
    );
  });
});
