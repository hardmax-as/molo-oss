import { completedMemberNotification, confirmPendingAge, isAgePending } from "@molo/db";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAccount } from "../account-deletion.ts";
import type { AppEnv, Bindings } from "../env.ts";
import { postSlack } from "../slack.ts";
import { ageRoutes } from "./age.ts";

vi.mock("@molo/db", () => ({
  completedMemberNotification: vi.fn(),
  confirmPendingAge: vi.fn(),
  isAgePending: vi.fn(),
  activePlusMemberCount: vi.fn(),
}));
vi.mock("../account-deletion.ts", () => ({ deleteAccount: vi.fn() }));
vi.mock("../auth.ts", () => ({
  createAuth: () => ({ api: { signOut: async () => ({ headers: new Headers() }) } }),
}));
vi.mock("../middleware.ts", () => ({
  requireUser: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../slack.ts", () => ({ postSlack: vi.fn() }));

let pending: boolean;
let tasks: Promise<unknown>[];
const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("db", {} as never);
    c.set("actor", { id: "new-member", roles: ["learner"] });
    await next();
  })
  .route("/", ageRoutes);
const deliver = (body: unknown = { birthYear: 1990, country: "NO", ageReached: true }) =>
  app.request(
    "/me/age",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { ENVIRONMENT: "prod" } as Bindings,
    {
      waitUntil: (task: Promise<unknown>) => {
        tasks.push(task);
      },
      passThroughOnException() {},
      props: {},
    },
  );

beforeEach(() => {
  vi.resetAllMocks();
  pending = true;
  tasks = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(isAgePending).mockImplementation(async () => pending);
  vi.mocked(confirmPendingAge).mockImplementation(async () => {
    pending = false;
    return true;
  });
  vi.mocked(completedMemberNotification).mockImplementation(async () => {
    expect(pending).toBe(false);
    return { name: "Alex PrivateSurname", provider: "apple", sourceLang: "nb", memberNumber: 84 };
  });
  vi.mocked(postSlack).mockResolvedValue({ posted: true });
});
afterEach(() => vi.restoreAllMocks());

describe("age completion notifications", () => {
  it("announces only after confirming age, and not again on a retry", async () => {
    expect(postSlack).not.toHaveBeenCalled();
    expect((await deliver()).status).toBe(200);
    await Promise.all(tasks);
    expect(postSlack).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      ":wave: New member — Alex · member #84 overall · via apple · learns from nb",
      "signups",
    );
    expect((await deliver()).status).toBe(200);
    await Promise.all(tasks);
    expect(postSlack).toHaveBeenCalledTimes(1);
  });
  it("does not announce a concurrent request that did not win the update", async () => {
    vi.mocked(confirmPendingAge).mockResolvedValue(false);
    expect((await deliver()).status).toBe(200);
    expect(tasks).toHaveLength(0);
  });
  it.each([
    [{}, 400],
    [{ birthYear: new Date().getUTCFullYear() - 10, country: "NO", ageReached: true }, 403],
  ])("does not announce invalid or under-age declarations", async (body, status) => {
    expect((await deliver(body)).status).toBe(status);
    expect(confirmPendingAge).not.toHaveBeenCalled();
    expect(postSlack).not.toHaveBeenCalled();
    if (status === 403) expect(deleteAccount).toHaveBeenCalled();
  });
  it("leaves completion successful when Slack throws", async () => {
    vi.mocked(postSlack).mockRejectedValue(new Error("private URL"));
    expect((await deliver()).status).toBe(200);
    await expect(Promise.all(tasks)).resolves.toBeDefined();
    expect(pending).toBe(false);
    expect(console.warn).toHaveBeenCalledWith("[background] member notification failed");
  });
});
