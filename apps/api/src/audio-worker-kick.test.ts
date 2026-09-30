import { describe, expect, it, vi } from "vitest";

import { kickAudioWorker } from "./audio-worker-kick.ts";

const queue = (backlogCount: number) => ({
  metrics: async () => ({ backlogCount, oldestMessageTimestamp: Date.now() }),
});

describe("kickAudioWorker", () => {
  it("does nothing while the queue is empty", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await kickAudioWorker({ AUDIO_QUEUE: queue(0), GH_DISPATCH_TOKEN: "t" }, fetchFn)).toBe(
      "idle",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when the queue cannot say", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await kickAudioWorker({ AUDIO_QUEUE: {}, GH_DISPATCH_TOKEN: "t" }, fetchFn)).toBe(
      "unknown",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("leaves it to the schedule without a token", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await kickAudioWorker({ AUDIO_QUEUE: queue(3) }, fetchFn)).toBe("no-token");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("dispatches the workflow on main when recordings wait", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    expect(
      await kickAudioWorker({ AUDIO_QUEUE: queue(14), GH_DISPATCH_TOKEN: "secret" }, fetchFn),
    ).toBe("started");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(
      "https://api.github.com/repos/hardmax-as/molo/actions/workflows/audio-worker.yml/dispatches",
    );
    if (!init) throw new Error("dispatch sent no request options");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main" });
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
  });

  it("reports a refused dispatch without throwing", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("nope", { status: 403 }));
    expect(await kickAudioWorker({ AUDIO_QUEUE: queue(1), GH_DISPATCH_TOKEN: "t" }, fetchFn)).toBe(
      "failed",
    );
  });
});
