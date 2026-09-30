import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { CONTENT_STALE_MS, createQueryClient, watchLearnerState } from "./query-client.ts";

/** Every client a test makes is cleared after it, so no garbage-collection timer outlives the test. */
const clients: QueryClient[] = [];
function track<T extends QueryClient>(qc: T): T {
  clients.push(qc);
  return qc;
}
afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function seeded(qc: QueryClient) {
  qc.setQueryData(["unit", "greetings", "en"], { unit: {} });
  qc.setQueryData(["units"], { units: [] });
  qc.setQueryData(["path"], { units: [] });
  qc.setQueryData(["review-session", "en"], { due: [] });
  qc.setQueryData(["progress"], { xpTotal: 100, hearts: { hearts: 5 } });
  qc.setQueryData(["me"], { user: { id: "learner-1" } });
}

const invalidated = (qc: QueryClient, key: unknown[]) =>
  qc.getQueryState(key)?.isInvalidated === true;

describe("watchLearnerState", () => {
  it("marks every piece of content that carries the learner's state stale when XP moves", async () => {
    const qc = track(new QueryClient());
    watchLearnerState(qc);
    seeded(qc);
    await flush();
    expect(invalidated(qc, ["path"])).toBe(false);

    // A lesson finished: the lesson screen writes the server's progress.
    qc.setQueryData(["progress"], { xpTotal: 115, hearts: { hearts: 5 } });
    await flush();
    expect(invalidated(qc, ["unit", "greetings", "en"])).toBe(true);
    expect(invalidated(qc, ["units"])).toBe(true);
    expect(invalidated(qc, ["path"])).toBe(true);
    // A review session being worked through is never pulled from under the learner.
    expect(invalidated(qc, ["review-session", "en"])).toBe(false);
  });

  it("ignores a progress update that is not learning, such as a heart lost", async () => {
    const qc = track(new QueryClient());
    watchLearnerState(qc);
    seeded(qc);
    await flush();
    qc.setQueryData(["progress"], { xpTotal: 100, hearts: { hearts: 4 } });
    await flush();
    expect(invalidated(qc, ["path"])).toBe(false);
  });

  it("does not treat the first read of progress as a change", async () => {
    const qc = track(new QueryClient());
    watchLearnerState(qc);
    qc.setQueryData(["path"], { units: [] });
    qc.setQueryData(["progress"], { xpTotal: 100 });
    await flush();
    expect(invalidated(qc, ["path"])).toBe(false);
  });

  it("refreshes content answered for someone else when the account changes", async () => {
    const qc = track(new QueryClient());
    watchLearnerState(qc);
    seeded(qc);
    await flush();
    qc.setQueryData(["me"], null);
    await flush();
    expect(invalidated(qc, ["units"])).toBe(true);
    expect(invalidated(qc, ["path"])).toBe(true);
  });
});

describe("createQueryClient", () => {
  it("keeps content fresh long enough for back and forth, and nothing else", () => {
    const qc = track(createQueryClient());
    expect(qc.getQueryDefaults(["unit", "greetings", "en"]).staleTime).toBe(CONTENT_STALE_MS);
    expect(qc.getQueryDefaults(["path"]).staleTime).toBe(CONTENT_STALE_MS);
    expect(qc.getQueryDefaults(["units"]).staleTime).toBe(CONTENT_STALE_MS);
    expect(qc.getQueryDefaults(["progress"]).staleTime).toBeUndefined();
    expect(qc.getQueryDefaults(["hearts"]).staleTime).toBeUndefined();
    expect(qc.getQueryDefaults(["unit-files", "greetings"]).staleTime).toBeUndefined();
  });
});
