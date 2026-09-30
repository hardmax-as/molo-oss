import { mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { Args, Command, Options } from "@effect/cli";
import { forvo } from "@molo/content";
import { AudioProcessMessage, type AudioTier } from "@molo/core";
import {
  actorForRef,
  audioAssetForUpload,
  editorRepo,
  lexemesMissingAudio,
  schema,
  type Db,
} from "@molo/db";
import { eq } from "drizzle-orm";
import { Effect, Either, Option, Schema } from "effect";

import {
  type CliError,
  ENV_VARS,
  envVar,
  fail,
  gate,
  kv,
  out,
  table,
  tryPromise,
  withDb,
} from "../context.ts";
import { type EnvName, molo } from "../root.ts";
import { actorRefFor, UPLOADER, visibilityMsFor } from "../services/audio-worker.ts";
import {
  ackMessages,
  audioQueueName,
  backlogReport,
  type CfAccount,
  cfAccount,
  findQueueByName,
  getQueue,
  pullMessages,
  type QueueInfo,
  type QueueMetrics,
  type QueuePullConfig,
  queueMetrics,
} from "../services/queues.ts";
import { repoRoot } from "../services/repo-paths.ts";
import { S3_VARS, s3Client, s3Config, type S3Config } from "../services/s3.ts";
import { processAudio } from "../services/xh-audio.ts";

const decodeMsg = Schema.decodeUnknownEither(AudioProcessMessage);

const process_ = Command.make(
  "process",
  {
    input: Args.file({ name: "input", exists: "yes" }),
    out: Options.directory("out").pipe(
      Options.withDefault(join(repoRoot(), "spike", "audio", "processed")),
    ),
  },
  ({ input, out: outdir }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      mkdirSync(outdir, { recursive: true });
      const r = yield* processAudio(input, outdir);
      yield* out(g, r.manifest, () => {
        console.log(`processed ${basename(input)} -> ${r.opusPath}`);
        kv({
          duration_ms: r.manifest.duration_ms,
          lufs_integrated: r.manifest.lufs_integrated,
          true_peak_dbtp: r.manifest.true_peak_dbtp,
          sha256: r.manifest.sha256,
          master: r.flacPath,
          manifest: r.manifestPath,
        });
      });
    }),
).pipe(
  Command.withDescription(
    "Run xh-audio on a file and print the manifest (local, no --live needed)",
  ),
);

const missing = Command.make(
  "missing",
  { limit: Options.integer("limit").pipe(Options.withDefault(200)) },
  ({ limit }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const rows = yield* Effect.promise(() => lexemesMissingAudio(db, limit));
          yield* out(g, rows, () => {
            console.log(`${rows.length} published lexeme(s) without tier-1/2 audio`);
            table(
              rows.map((r) => ({
                rank: r.frequencyRank ?? "",
                lemma: r.lemma,
                pos: r.pos,
                class: r.nounClass ?? "",
                id: r.id,
              })),
            );
          });
        }),
      );
    }),
).pipe(Command.withDescription("Published lexemes without tier-1/2 audio"));

/** One message: download, process, upload, create the audio_assets row (once). */
function handleMessage(
  db: Db,
  s3: S3Config,
  as: string,
  workdir: string,
  raw: unknown,
): Effect.Effect<{ id: string; reused: boolean }, CliError> {
  return Effect.gen(function* () {
    const decoded = decodeMsg(raw);
    if (decoded._tag === "Left")
      return yield* fail(`malformed audio.process message: ${String(decoded.left)}`);
    const m = decoded.right;
    // At-least-once delivery: an earlier run may have made the row and died before its ack.
    const existing = yield* tryPromise(
      () => audioAssetForUpload(db, m.uploadKey),
      "look up earlier asset",
    );
    if (existing) return { id: existing, reused: true };
    const actorRef = actorRefFor(as, m.uploadedBy);
    const actor = yield* tryPromise(() => actorForRef(db, actorRef), "resolve actor");
    if (!actor) return yield* fail(`no user matches ${actorRef} (pass an email or a user id)`);
    const priv = s3Client(s3, s3.privateBucket);
    const inputPath = join(workdir, `${m.uploadKey.replace(/[^A-Za-z0-9._-]/g, "_")}`);
    yield* tryPromise(async () => {
      const bytes = await priv.file(m.uploadKey).arrayBuffer();
      await Bun.write(inputPath, bytes);
    }, `download ${m.uploadKey}`);
    const outdir = join(workdir, "out");
    mkdirSync(outdir, { recursive: true });
    const r = yield* processAudio(inputPath, outdir);
    const opusKey = `audio/${r.manifest.sha256}.opus`;
    const flacKey = `masters/${r.manifest.master_sha256}.flac`;
    const manifestKey = `manifests/${r.manifest.sha256}.json`;
    yield* tryPromise(async () => {
      await priv.write(opusKey, Bun.file(r.opusPath), { type: "audio/ogg" });
      await priv.write(flacKey, Bun.file(r.flacPath), { type: "audio/flac" });
      await priv.write(manifestKey, JSON.stringify(r.manifest, null, 2), {
        type: "application/json",
      });
    }, "upload processed audio");
    const id = yield* tryPromise(
      () =>
        editorRepo(db, actor).createAudioAsset({
          targetKind: m.targetKind,
          targetId: m.targetId,
          speakerId: m.speakerId,
          tier: m.tier as AudioTier,
          r2Key: opusKey,
          sha256: r.manifest.sha256,
          durationMs: r.manifest.duration_ms,
          lufs: r.manifest.lufs_integrated,
          peakDbfs: r.manifest.true_peak_dbtp,
          codec: "opus",
          sampleRate: 48_000,
          licence: m.licence,
          provenance: {
            uploadKey: m.uploadKey,
            uploadedBy: m.uploadedBy,
            uploadedAt: m.uploadedAt,
            originalFilename: m.originalFilename,
          },
          manifest: r.manifest,
        }),
      "create audio_assets row",
    );
    for (const p of [inputPath, r.opusPath, r.flacPath, r.manifestPath]) rmSync(p, { force: true });
    return { id, reused: false };
  });
}

/**
 * The stage's audio queue. By name for preview and prod, so a prod queue id
 * left in `.env` can never be drained by `--env preview`; QUEUE_AUDIO_PROCESS_ID,
 * when set, saves the lookup and is checked against the name.
 */
export function resolveAudioQueue(
  env: EnvName,
): Effect.Effect<{ acct: CfAccount; queue: QueueInfo } | { missing: string }, CliError> {
  return Effect.gen(function* () {
    const acct = cfAccount();
    if (!acct) return { missing: "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID" };
    const id = envVar("QUEUE_AUDIO_PROCESS_ID");
    if (env === "local") {
      if (!id) return { missing: "QUEUE_AUDIO_PROCESS_ID (local has no Cloudflare queue)" };
      return { acct, queue: yield* tryPromise(() => getQueue(acct, id), "read queue") };
    }
    const name = audioQueueName(env);
    if (id) {
      const q = yield* tryPromise(() => getQueue(acct, id), "read queue");
      if (q.name !== name)
        return yield* fail(
          `QUEUE_AUDIO_PROCESS_ID is ${q.name}, not ${name}; unset it or use the matching --env`,
        );
      return { acct, queue: q };
    }
    const q = yield* tryPromise(() => findQueueByName(acct, name), "find queue");
    if (!q) return yield* fail(`no queue named ${name} in this account`);
    return { acct, queue: q };
  });
}

const worker = Command.make(
  "worker",
  {
    once: Options.boolean("once").pipe(
      Options.withDescription("Drain the queue until a pull comes back empty, then exit"),
    ),
    as: Options.text("as").pipe(
      Options.withDefault(UPLOADER),
      Options.withDescription(
        "Who the assets are attributed to: `uploader` (the editor who uploaded each take) or a user id/email",
      ),
    ),
    batch: Options.integer("batch").pipe(Options.withDefault(5)),
    pollSeconds: Options.integer("poll-seconds").pipe(Options.withDefault(15)),
    maxBatches: Options.integer("max-batches").pipe(
      Options.withDefault(50),
      Options.withDescription("With --once: stop after this many pulls even if more are waiting"),
    ),
    retryDelay: Options.integer("retry-delay").pipe(
      Options.withDefault(300),
      Options.withDescription("Seconds before a failed message is offered again"),
    ),
  },
  ({ once, as, batch, pollSeconds, maxBatches, retryDelay }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const s3 = s3Config(g.env);
      const dbVar = ENV_VARS.databaseUrl[g.env];
      const resolved = yield* resolveAudioQueue(g.env);
      const q = "queue" in resolved ? resolved : null;
      const metrics = q
        ? yield* tryPromise(() => queueMetrics(q.acct, q.queue.id), "read queue metrics").pipe(
            Effect.map((m): QueueMetrics | null => m),
            Effect.catchAll(() => Effect.succeed(null)),
          )
        : null;
      const hasPull = !!q?.queue.consumers.some((c) => c.type === "http_pull");
      const unset = [
        ...("missing" in resolved ? [resolved.missing] : []),
        ...(s3 ? [] : S3_VARS[g.env === "local" ? "local" : "remote"]),
        ...(envVar(dbVar) ? [] : [dbVar]),
      ];
      const status = {
        queue: q ? { name: q.queue.name, id: q.queue.id, pullConsumer: hasPull } : null,
        waiting: metrics?.backlogCount ?? null,
        storage: s3 ? { privateBucket: s3.privateBucket } : null,
        database: envVar(dbVar) ? dbVar : null,
        actor: as,
        batch,
        once,
        missing: unset,
      };
      yield* out(g, status, () => {
        console.log(
          "audio worker (Queues pull consumer -> xh-audio -> object storage -> audio_assets in_review)",
        );
        kv({
          queue: q
            ? `${q.queue.name}${hasPull ? "" : " (no HTTP pull consumer: molo cf queues --live)"}`
            : `missing ${"missing" in resolved ? resolved.missing : ""}`,
          waiting: metrics ? metrics.backlogCount : "unknown",
          storage: s3
            ? `configured (${s3.privateBucket})`
            : `missing ${S3_VARS[g.env === "local" ? "local" : "remote"].join(", ")}`,
          database: envVar(dbVar) ? `configured (${dbVar})` : `missing ${dbVar}`,
          actor: as === UPLOADER ? "uploader (the editor who uploaded each take)" : as,
        });
      });
      const apply = yield* gate(
        g,
        `pull and process messages from the audio-process queue (env ${g.env})`,
      );
      if (!apply) return;
      if (!q || unset.length > 0)
        return yield* fail(`worker needs ${unset.join(", ")}; see molo doctor`);
      if (!hasPull)
        return yield* fail(
          `${q.queue.name} has no HTTP pull consumer; run \`molo cf queues --env ${g.env} --live\` once`,
        );
      const pull: QueuePullConfig = { ...q.acct, queueId: q.queue.id };
      const workdir = join(repoRoot(), ".molo-audio-work");
      mkdirSync(workdir, { recursive: true });
      const totals = { processed: 0, reused: 0, failed: 0 };
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          for (let pulls = 1; ; pulls++) {
            const msgs = yield* tryPromise(
              () => pullMessages(pull, batch, visibilityMsFor(batch)),
              "pull",
            );
            const acks: string[] = [];
            const retries: string[] = [];
            for (const msg of msgs) {
              const r = yield* handleMessage(db, s3 as S3Config, as, workdir, msg.body).pipe(
                Effect.either,
              );
              if (r._tag === "Right") {
                console.log(
                  `${r.right.reused ? "already processed" : "processed"} ${msg.id} -> audio_asset ${r.right.id}`,
                );
                totals[r.right.reused ? "reused" : "processed"]++;
                acks.push(msg.lease_id);
              } else {
                console.error(`failed ${msg.id} (attempt ${msg.attempts}): ${r.left.message}`);
                totals.failed++;
                retries.push(msg.lease_id);
              }
            }
            if (acks.length + retries.length > 0)
              yield* tryPromise(() => ackMessages(pull, acks, retries, retryDelay), "ack");
            if (once) {
              if (msgs.length === 0) break;
              if (pulls >= maxBatches) {
                console.log(`stopping after ${pulls} pulls (--max-batches); more may be waiting`);
                break;
              }
              continue;
            }
            yield* Effect.sleep(`${pollSeconds} seconds`);
          }
        }),
      );
      yield* out(g, totals, () =>
        console.log(
          `done: ${totals.processed} processed, ${totals.reused} already processed, ${totals.failed} failed (retried later)`,
        ),
      );
      if (totals.failed > 0 && totals.processed + totals.reused === 0)
        return yield* fail(`${totals.failed} message(s) failed and none succeeded`);
    }),
).pipe(
  Command.withDescription(
    "Pull consumer for the audio-process queue; --once drains and exits (needs --live and credentials)",
  ),
);

const backlog = Command.make("backlog", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    if (g.env === "local")
      return yield* fail("backlog reads a Cloudflare queue: --env preview|prod");
    const resolved = yield* resolveAudioQueue(g.env);
    if ("missing" in resolved) return yield* fail(`backlog needs ${resolved.missing}`);
    const { acct, queue } = resolved;
    const metrics = yield* tryPromise(() => queueMetrics(acct, queue.id), "read queue metrics");
    const dlqName = queue.consumers.find((c) => c.type === "http_pull")?.deadLetterQueue ?? null;
    const dlq = dlqName
      ? yield* tryPromise(() => findQueueByName(acct, dlqName), "find dead-letter queue")
      : null;
    const dlqMetrics = dlq
      ? yield* tryPromise(() => queueMetrics(acct, dlq.id), "read dead-letter metrics")
      : null;
    const report = backlogReport(queue, metrics, dlqMetrics, Date.now());
    yield* out(g, { ...report, queueId: queue.id }, () => {
      kv({
        queue: `${report.queue} (${queue.id})`,
        waiting: report.waiting,
        oldest: report.oldestAgeMinutes === null ? "-" : `${report.oldestAgeMinutes} min ago`,
        retention: report.retentionHours === null ? "unknown" : `${report.retentionHours} h`,
        consumer: report.consumer,
        dead_letters: report.deadLetterQueue
          ? `${report.deadLetterQueue} (${report.deadLettered ?? "?"} waiting)`
          : "none",
      });
      for (const w of report.warnings) console.log(`warning: ${w}`);
      if (report.warnings.length === 0) console.log("ok");
    });
  }),
).pipe(
  Command.withDescription(
    "Read-only: recordings waiting in the audio-process queue, the oldest one's age, and consumer, dead-letter and retention checks",
  ),
);

// ---- Forvo tier-2 backfill ------------------------------------------------

interface ForvoTarget {
  readonly id: string;
  readonly lemma: string;
}

/**
 * One lexeme: look up, pick, download, process, upload, create the row.
 * The API call and the download are the only network I/O; both are behind
 * the caller's --live check.
 */
function backfillOne(
  db: Db,
  s3: S3Config,
  actorId: string,
  workdir: string,
  key: string,
  target: ForvoTarget,
  minRate: number,
): Effect.Effect<{ lemma: string; result: string; assetId?: string }, CliError> {
  return Effect.gen(function* () {
    const req = { key, word: target.lemma, minRate, limit: 10 } as const;
    const looked = yield* tryPromise(
      () => forvo.fetchPronunciations(req),
      `forvo lookup ${target.lemma}`,
    );
    if (Either.isLeft(looked)) return { lemma: target.lemma, result: looked.left };
    const best = forvo.pickBest(looked.right.items, { minRate });
    if (!best)
      return {
        lemma: target.lemma,
        result: `no usable pronunciation (${looked.right.items.length} returned)`,
      };
    const inputPath = join(workdir, `forvo-${best.id}.mp3`);
    yield* tryPromise(async () => {
      const res = await fetch(best.mp3Url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      await Bun.write(inputPath, await res.arrayBuffer());
    }, `download forvo ${best.id}`);
    const outdir = join(workdir, "out");
    mkdirSync(outdir, { recursive: true });
    const r = yield* processAudio(inputPath, outdir);
    const priv = s3Client(s3, s3.privateBucket);
    const opusKey = `audio/${r.manifest.sha256}.opus`;
    const flacKey = `masters/${r.manifest.master_sha256}.flac`;
    const manifestKey = `manifests/${r.manifest.sha256}.json`;
    yield* tryPromise(async () => {
      await priv.write(opusKey, Bun.file(r.opusPath), { type: "audio/ogg" });
      await priv.write(flacKey, Bun.file(r.flacPath), { type: "audio/flac" });
      await priv.write(manifestKey, JSON.stringify(r.manifest, null, 2), {
        type: "application/json",
      });
    }, "upload processed audio");
    const actor = yield* Effect.promise(() => actorForRef(db, actorId));
    if (!actor)
      return yield* Effect.die(
        new Error(`no user matches ${actorId} (pass an email or a user id)`),
      );
    const assetId = yield* tryPromise(
      () =>
        editorRepo(db, actor).createAudioAsset({
          targetKind: "lexeme",
          targetId: target.id,
          speakerId: null,
          tier: "2_native_forvo",
          r2Key: opusKey,
          sha256: r.manifest.sha256,
          durationMs: r.manifest.duration_ms,
          lufs: r.manifest.lufs_integrated,
          peakDbfs: r.manifest.true_peak_dbtp,
          codec: "opus",
          sampleRate: 48_000,
          licence: forvo.FORVO_LICENCE,
          provenance: forvo.provenanceFor(best, looked.right.url),
          manifest: r.manifest,
        }),
      "create audio_assets row",
    );
    return {
      lemma: target.lemma,
      result: `in_review from ${best.username} (${best.country ?? "?"}, rate ${best.rate})`,
      assetId,
    };
  });
}

const forvoBackfill = Command.make(
  "forvo",
  {
    lemma: Options.text("lemma").pipe(
      Options.optional,
      Options.withDescription("One lemma (must exist as a lexeme)"),
    ),
    missing: Options.integer("missing").pipe(
      Options.optional,
      Options.withDescription(
        "Up to N published lexemes without tier-1/2 audio, most frequent first",
      ),
    ),
    minRate: Options.integer("min-rate").pipe(Options.withDefault(0)),
    as: Options.text("as").pipe(
      Options.withDefault("dev_editor"),
      Options.withDescription("User id acting as editor"),
    ),
  },
  ({ lemma, missing: missingCount, minRate, as }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const wantLemma = Option.getOrUndefined(lemma);
      const wantMissing = Option.getOrUndefined(missingCount);
      if (!wantLemma && wantMissing === undefined)
        return yield* fail("give --lemma <lemma> or --missing <n>");
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const targets: ForvoTarget[] = wantLemma
            ? yield* tryPromise(
                () =>
                  db
                    .select({ id: schema.lexemes.id, lemma: schema.lexemes.lemma })
                    .from(schema.lexemes)
                    .where(eq(schema.lexemes.lemma, wantLemma))
                    .limit(1),
                "find lexeme",
              )
            : (yield* Effect.promise(() => lexemesMissingAudio(db, wantMissing ?? 0))).map((r) => ({
                id: r.id,
                lemma: r.lemma,
              }));
          if (targets.length === 0)
            return yield* fail(
              wantLemma ? `no lexeme with lemma ${wantLemma}` : "nothing is missing audio",
            );
          const key = envVar("FORVO_API_KEY");
          const s3 = s3Config(g.env);
          const plan = targets.map((t) => ({
            lemma: t.lemma,
            request: forvo.redactKey(
              forvo.buildUrl({ key: key ?? "missing", word: t.lemma, minRate, limit: 10 }),
            ),
          }));
          yield* out(g, { targets: plan, keyConfigured: !!key, s3Configured: !!s3 }, () => {
            table(plan);
            kv({
              forvo_key: key ? "configured" : "missing (FORVO_API_KEY)",
              storage: s3 ? "configured" : "missing S3/R2 credentials",
            });
          });
          const apply = yield* gate(
            g,
            `call Forvo for ${targets.length} lexeme(s) (quota) and store tier-2 audio`,
          );
          if (!apply) return;
          if (!key) return yield* fail("FORVO_API_KEY is not set");
          if (!s3) return yield* fail("S3/R2 credentials are not set (molo doctor)");
          const workdir = join(repoRoot(), ".cache", "forvo");
          mkdirSync(workdir, { recursive: true });
          const results: { lemma: string; result: string; assetId?: string }[] = [];
          for (const t of targets) {
            const r = yield* backfillOne(db, s3, as, workdir, key, t, minRate).pipe(
              Effect.catchAll((e) =>
                Effect.succeed({ lemma: t.lemma, result: `failed: ${e.message}` }),
              ),
            );
            results.push(r);
          }
          yield* out(g, { results }, () => table(results));
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Tier-2 backfill from Forvo: --lemma X or --missing N. Dry run prints the requests; --live spends API quota and creates in_review audio assets with attribution.",
  ),
);

export const audio = Command.make("audio", {}).pipe(
  Command.withDescription("xh-audio processing, missing-audio report, the queue worker"),
  Command.withSubcommands([process_, missing, worker, backlog, forvoBackfill]),
);
