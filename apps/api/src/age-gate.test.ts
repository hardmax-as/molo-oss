import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  oauth: null as Record<string, unknown> | null,
  server: {} as Record<string, unknown>,
}));
vi.mock("better-auth/api", () => ({
  APIError: class extends Error {
    constructor(_status: string, body: { code: string; message: string }) {
      super(body.code);
    }
  },
  createAuthMiddleware: (handler: unknown) => handler,
  getOAuthState: () => Promise.resolve(state.oauth),
  addOAuthServerContext: (value: Record<string, unknown>) => {
    Object.assign(state.server, value);
    return Promise.resolve();
  },
}));

import { createAgeGate } from "./age-gate.ts";

beforeEach(() => {
  state.oauth = null;
  state.server = {};
});
// The middleware adapter is mocked; exercise its handler with the request fields it reads.
function before(
  gate: ReturnType<typeof createAgeGate>,
  path: string,
  body: Record<string, unknown>,
) {
  return (
    gate.before as unknown as (ctx: {
      path: string;
      body: Record<string, unknown>;
    }) => Promise<void>
  )({ path, body });
}

describe("age proof across auth creation paths", () => {
  it("retains only the validated email country and overrides a forged user country", async () => {
    const gate = createAgeGate();
    const body = { birthYear: 1990, country: "NO", ageReached: true };
    await before(gate, "/sign-up/email", body);
    expect(body).toEqual({});
    expect(await gate.beforeCreate({ id: "fixture-user", country: "ZA" })).toEqual({
      data: { id: "fixture-user", ageOk: true, agePending: false, country: "NO" },
    });
  });
  it("keeps country unknown for an OAuth proof issued before country retention", async () => {
    state.oauth = { serverContext: { ageOk: true }, country: "NO" };
    expect((await createAgeGate().beforeCreate({ country: "NO" })).data.country).toBeNull();
  });
  it("removes age input before OAuth state is persisted, carrying only eligibility and validated country", async () => {
    const gate = createAgeGate();
    const body = { additionalData: { ageDeclaration: { birthYear: 1990, country: "ZA" } } };
    await before(gate, "/sign-in/social", body);
    expect(body.additionalData).toEqual({});
    expect(state.server).toEqual({ ageOk: true, country: "ZA" });
    // A new request handles the provider callback.
    state.oauth = { serverContext: state.server };
    expect(await createAgeGate().beforeCreate({ id: "fixture-user" })).toEqual({
      data: { id: "fixture-user", ageOk: true, agePending: false, country: "ZA" },
    });
  });
  it("rejects client-supplied OAuth claims and creation through paths with no age proof", async () => {
    state.oauth = { ageOk: true, ageDeclaration: { birthYear: 1990, country: "ZA" } };
    await expect(createAgeGate().beforeCreate({ ageOk: true })).rejects.toThrow("AGE_REQUIREMENT");
    state.oauth = null;
    await expect(createAgeGate().beforeCreate({})).rejects.toThrow("AGE_REQUIREMENT");
  });
  it("permits native social creation after validation without a redirect", async () => {
    const gate = createAgeGate();
    await before(gate, "/sign-in/social", {
      additionalData: { ageDeclaration: { birthYear: 1990, country: "NO" } },
    });
    expect((await gate.beforeCreate({ country: "ZA" })).data).toEqual({
      ageOk: true,
      agePending: false,
      country: "NO",
    });
  });
  it("creates a one-tap social account behind the age step, never with a forged eligibility", async () => {
    for (const path of ["/sign-in/social", "/callback/:id"]) {
      const gate = createAgeGate();
      await before(gate, "/sign-in/social", {});
      expect(
        (await gate.beforeCreate({ id: "fixture-user", ageOk: true, country: "NO" }, { path }))
          .data,
      ).toEqual({ id: "fixture-user", ageOk: false, agePending: true, country: null });
    }
  });
  it("still refuses creation without proof anywhere else (magic link, e-mail, no context)", async () => {
    for (const ctx of [{ path: "/magic-link/verify" }, { path: "/sign-up/email" }, null, undefined])
      await expect(createAgeGate().beforeCreate({}, ctx)).rejects.toThrow("AGE_REQUIREMENT");
  });
  it("refuses an under-age declaration on the social path before any account exists", async () => {
    const birthYear = new Date().getUTCFullYear() - 5;
    await expect(
      before(createAgeGate(), "/sign-in/social", {
        additionalData: { ageDeclaration: { birthYear, country: "NO" } },
      }),
    ).rejects.toThrow("AGE_REQUIREMENT");
  });
});
