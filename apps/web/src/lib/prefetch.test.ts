import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  preloadLeagues,
  preloadMistakes,
  preloadPath,
  preloadReview,
  preloadUnitPage,
  prefetchReviewSession,
  warmAudio,
} from "./prefetch.ts";

const clients: QueryClient[] = [];
function client(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  return qc;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string) =>
    Promise.resolve(new Response(JSON.stringify({ url, units: [], due: [], fresh: [] }))),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  vi.unstubAllGlobals();
});

/** A browser, as far as these helpers look: storage and a language. */
function inABrowser(stored: Record<string, string> = {}) {
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => stored[k] ?? null },
  });
  vi.stubGlobal("navigator", { language: "en-GB" });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const requested = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("route loaders", () => {
  it("never fetch while the server renders, where the session cookie is not", async () => {
    const qc = client();
    qc.setQueryData(["me"], { user: { id: "learner-1" } });
    preloadPath(qc);
    preloadUnitPage(qc, "greetings");
    preloadReview(qc);
    preloadMistakes(qc);
    preloadLeagues(qc);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefetch a signed-in learner's own reads in the browser, into the pages' own entries", async () => {
    inABrowser();
    const qc = client();
    qc.setQueryData(["me"], { user: { id: "learner-1" } });
    preloadReview(qc);
    preloadLeagues(qc);
    preloadMistakes(qc);
    await settle();
    expect(requested().some((u) => u.includes("/review/session?lang=en"))).toBe(true);
    expect(requested().some((u) => u.includes("/leagues/current"))).toBe(true);
    expect(requested().some((u) => u.includes("/me/mistakes?lang=en"))).toBe(true);
    expect(qc.getQueryData(["review-session", "en"])).toBeDefined();
    expect(qc.getQueryData(["league"])).toBeDefined();
  });

  it("ask nothing of a guest's own reads", async () => {
    inABrowser();
    const qc = client();
    qc.setQueryData(["me"], null);
    preloadReview(qc);
    preloadLeagues(qc);
    preloadMistakes(qc);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leave the path alone for a first-time visitor, who gets the landing page", async () => {
    inABrowser();
    const qc = client();
    qc.setQueryData(["me"], null);
    preloadPath(qc);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    inABrowser({ "molo.onboarded": "1" });
    preloadPath(qc);
    await settle();
    expect(requested().some((u) => u.endsWith("/path"))).toBe(true);
    expect(qc.getQueryData(["path"])).toBeDefined();
  });
});

describe("prefetchReviewSession", () => {
  it("never replaces a session a review page is working through", async () => {
    inABrowser();
    const qc = client();
    qc.setQueryData(["review-session", "en"], { due: ["card-1"] });
    const observer = new QueryObserver(qc, {
      queryKey: ["review-session", "en"],
      queryFn: () => Promise.resolve({ due: [] }),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    // Old enough that a prefetch would otherwise ask again.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60_000);
    await prefetchReviewSession(qc, "en");
    unsubscribe();
    vi.restoreAllMocks();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(qc.getQueryData(["review-session", "en"])).toEqual({ due: ["card-1"] });
  });
});

describe("warmAudio", () => {
  it("asks for each recording once, the way an <audio> element does", () => {
    inABrowser();
    const url = "https://api.hellomolo.com/audio/warm-test-a.opus";
    warmAudio([url, url]);
    warmAudio([url]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ mode: "no-cors", credentials: "include" });
  });

  it("never warms editor audio or anything that is not on the network", () => {
    inABrowser();
    warmAudio([
      "https://api.hellomolo.com/audio/warm-test-b.opus?b=private&sig=x",
      "blob:https://hellomolo.com/1234",
      "",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing on the server", () => {
    warmAudio(["https://api.hellomolo.com/audio/warm-test-c.opus"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the path key", () => {
  it("is the one useLearningPath reads", () => {
    const source = readFileSync(fileURLToPath(new URL("./path.ts", import.meta.url)), "utf8");
    expect(source).toContain('export const PATH_KEY = ["path"] as const;');
  });
});
