import { QueryClient, QueryObserver } from "@tanstack/react-query";

import {
  nextUnitToPrefetch,
  prefetchNextUnit,
  prefetchReviewSession,
  type NextUnitInput,
} from "./prefetch-logic.ts";

/** Every client a test makes is cleared after it, so no garbage-collection timer outlives the test. */
const clients: QueryClient[] = [];
function track<T extends QueryClient>(qc: T): T {
  clients.push(qc);
  return qc;
}
afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
});

function pathWith(units: { slug: string; locked: boolean; crowns: number[] }[]) {
  return {
    units: units.map((u, i) => ({
      id: `u${i}`,
      slug: u.slug,
      locked: u.locked,
      skills: [
        {
          id: `s${i}`,
          lessons: u.crowns.map((crownLevel, j) => ({ id: `u${i}-l${j}`, crownLevel })),
        },
      ],
    })),
  } as never;
}

const units = [
  { id: "u1", slug: "one", lessonCount: 1, prerequisiteUnitId: null },
  { id: "u2", slug: "two", lessonCount: 1, prerequisiteUnitId: "u1" },
];

function input(over: Partial<NextUnitInput> = {}): NextUnitInput {
  return {
    signedIn: false,
    path: { queryKey: ["path"], queryFn: () => Promise.reject(new Error("unused")) },
    units,
    guestLessons: [],
    ...over,
  };
}

describe("nextUnitToPrefetch", () => {
  it("reads a signed-in learner's next unit from /path, and leaves the path in memory", async () => {
    const qc = track(new QueryClient());
    const queryFn = jest.fn(() =>
      Promise.resolve(
        pathWith([
          { slug: "one", locked: false, crowns: [1] },
          { slug: "two", locked: false, crowns: [0] },
        ]),
      ),
    );
    const slug = await nextUnitToPrefetch(
      qc,
      input({ signedIn: true, path: { queryKey: ["path"], queryFn } }),
    );
    expect(slug).toBe("two");
    expect(qc.getQueryData(["path"])).toBeDefined();
  });

  it("uses the device's lessons for a guest, never the network", async () => {
    const qc = track(new QueryClient());
    const done = [{ unitSlug: "one", lessonId: "a" }];
    expect(await nextUnitToPrefetch(qc, input({ guestLessons: [] }))).toBe("one");
    expect(await nextUnitToPrefetch(qc, input({ guestLessons: done }))).toBe("two");
  });

  it("is null when the path cannot be read", async () => {
    const qc = track(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const path = { queryKey: ["path"], queryFn: () => Promise.reject(new Error("offline")) };
    expect(await nextUnitToPrefetch(qc, input({ signedIn: true, path }))).toBeNull();
  });
});

describe("prefetchNextUnit", () => {
  it("fills exactly the entry the unit screen reads", async () => {
    const qc = track(new QueryClient());
    const slug = await prefetchNextUnit(qc, input(), (s) => ({
      queryKey: ["unit", s, "en"],
      queryFn: () => Promise.resolve({ slug: s }),
    }));
    expect(slug).toBe("one");
    expect(qc.getQueryData(["unit", "one", "en"])).toEqual({ slug: "one" });
  });
});

describe("prefetchReviewSession", () => {
  const session = (fn: () => Promise<unknown>) => ({
    queryKey: ["review-session", "en"],
    queryFn: fn,
  });

  it("replays offline ratings first, then fetches the session", async () => {
    const qc = track(new QueryClient());
    const order: string[] = [];
    const ok = await prefetchReviewSession(qc, {
      session: session(() => {
        order.push("session");
        return Promise.resolve({ due: [] });
      }),
      flush: () => {
        order.push("flush");
        return Promise.resolve(0);
      },
      queueEmpty: () => true,
    });
    expect(ok).toBe(true);
    expect(order).toEqual(["flush", "session"]);
  });

  it("never replaces a session a review screen is working through", async () => {
    const qc = track(new QueryClient());
    qc.setQueryData(["review-session", "en"], { due: ["card-1"] });
    const observer = new QueryObserver(qc, {
      queryKey: ["review-session", "en"],
      queryFn: () => Promise.resolve({ due: [] }),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const fetch = jest.fn(() => Promise.resolve({ due: [] }));
    const ok = await prefetchReviewSession(qc, {
      session: session(fetch),
      flush: () => Promise.resolve(0),
      queueEmpty: () => true,
    });
    unsubscribe();
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(qc.getQueryData(["review-session", "en"])).toEqual({ due: ["card-1"] });
  });

  it("skips the session while ratings are still waiting to be sent", async () => {
    const qc = track(new QueryClient());
    const fetch = jest.fn(() => Promise.resolve({ due: [] }));
    const ok = await prefetchReviewSession(qc, {
      session: session(fetch),
      flush: () => Promise.reject(new Error("offline")),
      queueEmpty: () => false,
    });
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not ask again for a session fetched in the last minute", async () => {
    const qc = track(new QueryClient());
    const fetch = jest.fn(() => Promise.resolve({ due: [] }));
    const ports = {
      session: session(fetch),
      flush: () => Promise.resolve(0),
      queueEmpty: () => true,
    };
    await prefetchReviewSession(qc, ports);
    await prefetchReviewSession(qc, ports);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
