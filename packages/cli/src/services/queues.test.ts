import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIO_RETENTION_SECONDS,
  audioConsumerBody,
  backlogReport,
  decodePulledBody,
  planAudioQueueSetup,
  toQueueInfo,
  type QueueInfo,
} from "./queues.ts";
import { bucketNames } from "./s3-buckets.ts";

const msg = { kind: "audio.process", uploadKey: "incoming/j/a.webm" };

describe("decodePulledBody", () => {
  it("reads a plain JSON body", () => {
    expect(decodePulledBody(JSON.stringify(msg))).toEqual(msg);
  });

  it("reads the base64 body Cloudflare hands a pull consumer for json messages", () => {
    const b64 = Buffer.from(JSON.stringify(msg)).toString("base64");
    expect(decodePulledBody(b64, "json")).toEqual(msg);
    // Without the metadata header it still falls back to base64.
    expect(decodePulledBody(b64)).toEqual(msg);
  });

  it("reads plain JSON even when the header says json", () => {
    expect(decodePulledBody(JSON.stringify(msg), "json")).toEqual(msg);
  });

  it("returns the raw string when it is neither, for the decoder to reject", () => {
    expect(decodePulledBody("not a message")).toBe("not a message");
  });
});

const STAGE = "prod";
const queue = (over: Partial<QueueInfo> = {}): QueueInfo => ({
  id: "q1",
  name: "molo-audio-process-prod",
  retentionSeconds: AUDIO_RETENTION_SECONDS,
  consumers: [],
  ...over,
});
const dlq = queue({ id: "d1", name: "molo-audio-process-dlq-prod" });
const goodPull = {
  id: "c1",
  type: "http_pull",
  script: null,
  deadLetterQueue: "molo-audio-process-dlq-prod",
  settings: { ...audioConsumerBody(STAGE).settings },
};

describe("planAudioQueueSetup", () => {
  it("plans the dead-letter queue first, then the consumer, then retention", () => {
    const plan = planAudioQueueSetup(STAGE, queue({ retentionSeconds: 86_400 }), null);
    expect(plan.map((a) => a.kind)).toEqual([
      "create_dlq",
      "create_consumer",
      "set_retention",
      "set_retention",
    ]);
    expect(plan[0]).toEqual({ kind: "create_dlq", name: "molo-audio-process-dlq-prod" });
  });

  it("plans nothing when the queue is already in shape", () => {
    expect(planAudioQueueSetup(STAGE, queue({ consumers: [goodPull] }), dlq)).toEqual([]);
  });

  it("updates a pull consumer that has no dead-letter queue or other settings", () => {
    const plan = planAudioQueueSetup(
      STAGE,
      queue({
        consumers: [
          {
            ...goodPull,
            deadLetterQueue: null,
            settings: { batch_size: 10, max_retries: 5, retry_delay: 0 },
          },
        ],
      }),
      dlq,
    );
    expect(plan).toEqual([
      { kind: "update_consumer", consumerId: "c1", body: audioConsumerBody(STAGE) },
    ]);
  });

  it("refuses to touch a queue that has a Worker consumer", () => {
    const plan = planAudioQueueSetup(
      STAGE,
      queue({
        consumers: [
          { id: "w", type: "worker", script: "molo-api-prod", deadLetterQueue: null, settings: {} },
        ],
      }),
      dlq,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]?.kind).toBe("blocked");
  });
});

describe("toQueueInfo", () => {
  it("maps the REST shape, including a consumer's dead-letter queue", () => {
    const info = toQueueInfo({
      queue_id: "q1",
      queue_name: "molo-audio-process-prod",
      settings: { message_retention_period: 86_400 },
      consumers: [
        {
          consumer_id: "c1",
          type: "http_pull",
          dead_letter_queue: "dlq",
          settings: { batch_size: 10 },
        },
      ],
    });
    expect(info.retentionSeconds).toBe(86_400);
    expect(info.consumers[0]).toMatchObject({
      id: "c1",
      type: "http_pull",
      deadLetterQueue: "dlq",
    });
  });
});

describe("backlogReport", () => {
  const NOW = Date.parse("2026-09-26T12:00:00Z");
  const empty = { backlogCount: 0, backlogBytes: 0, oldestMessageMs: null };

  it("is quiet when a pull consumer, dead letters and long retention are in place", () => {
    const r = backlogReport(queue({ consumers: [goodPull] }), empty, empty, NOW);
    expect(r.warnings).toEqual([]);
    expect(r.consumer).toBe("http_pull");
  });

  it("warns about each way a recording could vanish", () => {
    const r = backlogReport(
      queue({ retentionSeconds: 86_400 }),
      { backlogCount: 3, backlogBytes: 1245, oldestMessageMs: NOW - 13 * 3_600_000 },
      null,
      NOW,
    );
    expect(r.waiting).toBe(3);
    expect(r.oldestAgeMinutes).toBe(13 * 60);
    expect(r.warnings.join("\n")).toMatch(/no HTTP pull consumer/);
    expect(r.warnings.join("\n")).toMatch(/retention is 24h/);
    expect(r.warnings.join("\n")).toMatch(/past half the retention window/);
  });

  it("counts dead letters", () => {
    const r = backlogReport(
      queue({ consumers: [goodPull] }),
      empty,
      { ...empty, backlogCount: 2 },
      NOW,
    );
    expect(r.deadLettered).toBe(2);
    expect(r.warnings).toEqual([
      "2 message(s) in the dead-letter queue: recordings that failed processing",
    ]);
  });
});

describe("bucketNames", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps local on the MinIO names", () => {
    vi.stubEnv("S3_BUCKET_PRIVATE", "");
    expect(bucketNames("local").privateBucket).toBe("molo-private");
  });

  it("derives remote names from the stage and ignores the local variables", () => {
    vi.stubEnv("S3_BUCKET_PRIVATE", "molo-private");
    vi.stubEnv("R2_BUCKET_PRIVATE", "");
    expect(bucketNames("prod")).toEqual({
      publicBucket: "molo-public-prod",
      privateBucket: "molo-private-prod",
    });
  });

  it("lets a per-PR preview name its buckets", () => {
    vi.stubEnv("R2_BUCKET_PRIVATE", "molo-private-preview-pr-7");
    expect(bucketNames("preview").privateBucket).toBe("molo-private-preview-pr-7");
  });
});
