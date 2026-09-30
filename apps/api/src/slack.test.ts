import { afterEach, describe, expect, it, vi } from "vitest";

import { postSlack } from "./slack.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Slack transport", () => {
  it("selects the purpose URL and keeps the legacy content destination", async () => {
    const fetcher = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetcher);
    const env = {
      ENVIRONMENT: "prod" as const,
      SLACK_WEBHOOK_URL: "https://content.example.test",
      SLACK_SIGNUPS_WEBHOOK_URL: "https://signups.example.test",
      SLACK_SUBSCRIPTIONS_WEBHOOK_URL: "https://subscriptions.example.test",
    };
    for (const purpose of ["content", "signups", "subscriptions"] as const) {
      expect(await postSlack(env, "fixture", purpose)).toEqual({ posted: true });
      expect(fetcher).toHaveBeenLastCalledWith(
        `https://${purpose}.example.test`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    }
  });
  it.each(["local", "preview"] as const)(
    "never sends operational messages in %s even with a URL",
    async (ENVIRONMENT) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      vi.spyOn(console, "log").mockImplementation(() => {});
      expect(
        await postSlack(
          { ENVIRONMENT, SLACK_SIGNUPS_WEBHOOK_URL: "https://unused.example.test" },
          "fixture",
          "signups",
        ),
      ).toEqual({ posted: false });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("logs only when unset", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await postSlack({ ENVIRONMENT: "prod" }, "fixture", "subscriptions")).toEqual({
      posted: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["network", "http"])("swallows %s errors without logging secrets", async (kind) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (kind === "network") throw new Error("secret-url");
        return new Response("secret-body", { status: 503 });
      }),
    );
    expect(
      await postSlack(
        { ENVIRONMENT: "prod", SLACK_SIGNUPS_WEBHOOK_URL: "secret-url" },
        "fixture",
        "signups",
      ),
    ).toEqual({ posted: false });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-url|secret-body/);
  });
  it("aborts a stalled send after three seconds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let timeout: number | undefined;
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeout = ms;
      return controller.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
            controller.abort();
          }),
      ),
    );
    expect(
      await postSlack(
        { ENVIRONMENT: "prod", SLACK_SIGNUPS_WEBHOOK_URL: "https://timeout.example.test" },
        "fixture",
        "signups",
      ),
    ).toEqual({ posted: false });
    expect(timeout).toBe(3_000);
  });
});
