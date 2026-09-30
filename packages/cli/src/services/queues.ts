import { envVar } from "../context.ts";

/**
 * Cloudflare Queues over the REST API (ARCHITECTURE section 5): the pull
 * consumer the audio worker uses, the read-only backlog numbers, and the
 * idempotent setup of the audio-process queue's HTTP pull consumer and
 * dead-letter queue, which Alchemy 0.94 cannot declare (its QueueConsumer is
 * Worker-only and its Queue `dlq` prop is stored but never sent).
 *
 * Needs CLOUDFLARE_API_TOKEN (Queues Edit) and CLOUDFLARE_ACCOUNT_ID.
 */
export interface CfAccount {
  readonly token: string;
  readonly accountId: string;
}

export interface QueuePullConfig extends CfAccount {
  readonly queueId: string;
}

export function cfAccount(): CfAccount | null {
  const token = envVar("CLOUDFLARE_API_TOKEN");
  const accountId = envVar("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !accountId) return null;
  return { token, accountId };
}

export function queuePullConfig(queueIdVar: string): QueuePullConfig | null {
  const acct = cfAccount();
  const queueId = envVar(queueIdVar);
  if (!acct || !queueId) return null;
  return { ...acct, queueId };
}

/** The names infra/alchemy.run.ts gives a stage's audio queue and its dead-letter queue. */
export const audioQueueName = (stage: string) => `molo-audio-process-${stage}`;
export const audioDlqName = (stage: string) => `molo-audio-process-dlq-${stage}`;

// ---- messages ----------------------------------------------------------------

export interface PulledMessage {
  readonly id: string;
  readonly lease_id: string;
  readonly body: unknown;
  readonly attempts: number;
  /** When the message was published; absent on older API responses. */
  readonly timestampMs: number | null;
}

interface RawPulled {
  id: string;
  lease_id: string;
  body: string;
  attempts: number;
  timestamp_ms?: number;
  metadata?: Record<string, string>;
}

interface PullResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: { messages?: RawPulled[] };
}

/**
 * A pulled body as the producer sent it. Cloudflare base64-encodes `json`
 * and `bytes` messages for pull consumers ("Pull consumers", Content types),
 * and the API Worker sends `json` (the default since compatibility date
 * 2024-03-18). The metadata's CF-Content-Type says which it was when present;
 * otherwise plain JSON is tried first, then base64-wrapped JSON, then the raw
 * string is returned for the message decoder to reject.
 */
export function decodePulledBody(body: string, contentType?: string): unknown {
  const tryJson = (s: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch {
      return { ok: false };
    }
  };
  const fromBase64 = (): string | null => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.trim())) return null;
    try {
      return Buffer.from(body.trim(), "base64").toString("utf8");
    } catch {
      return null;
    }
  };
  if (contentType === "text") {
    const direct = tryJson(body);
    return direct.ok ? direct.value : body;
  }
  if (contentType === "json" || contentType === "bytes") {
    const decoded = fromBase64();
    const parsed = decoded === null ? { ok: false as const } : tryJson(decoded);
    if (parsed.ok) return parsed.value;
  }
  const direct = tryJson(body);
  if (direct.ok) return direct.value;
  const decoded = fromBase64();
  if (decoded !== null) {
    const parsed = tryJson(decoded);
    if (parsed.ok) return parsed.value;
  }
  return body;
}

const messagesBase = (c: QueuePullConfig) =>
  `https://api.cloudflare.com/client/v4/accounts/${c.accountId}/queues/${c.queueId}/messages`;

export async function pullMessages(
  c: QueuePullConfig,
  batchSize = 5,
  visibilityMs = 5 * 60_000,
): Promise<PulledMessage[]> {
  const res = await fetch(`${messagesBase(c)}/pull`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batch_size: batchSize, visibility_timeout_ms: visibilityMs }),
  });
  const json = (await res.json()) as PullResponse;
  if (!res.ok || !json.success)
    throw new Error(`queues pull: ${res.status} ${json.errors?.map((e) => e.message).join("; ")}`);
  return (json.result?.messages ?? []).map((m) => ({
    id: m.id,
    lease_id: m.lease_id,
    body: decodePulledBody(m.body, m.metadata?.["CF-Content-Type"]),
    attempts: m.attempts,
    timestampMs: m.timestamp_ms ?? null,
  }));
}

/**
 * Acknowledge and retry in one call. A retry carries a delay so a message
 * that just failed is not handed straight back to the same draining run.
 */
export async function ackMessages(
  c: QueuePullConfig,
  acks: readonly string[],
  retries: readonly string[] = [],
  retryDelaySeconds = 0,
): Promise<void> {
  const res = await fetch(`${messagesBase(c)}/ack`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      acks: acks.map((lease_id) => ({ lease_id })),
      retries: retries.map((lease_id) =>
        retryDelaySeconds > 0 ? { lease_id, delay_seconds: retryDelaySeconds } : { lease_id },
      ),
    }),
  });
  const json = (await res.json()) as { success: boolean; errors?: { message: string }[] };
  if (!res.ok || !json.success)
    throw new Error(`queues ack: ${res.status} ${json.errors?.map((e) => e.message).join("; ")}`);
}

// ---- queue management (REST) --------------------------------------------------

export interface ConsumerInfo {
  readonly id: string;
  readonly type: "worker" | "http_pull" | string;
  readonly script: string | null;
  readonly deadLetterQueue: string | null;
  readonly settings: Record<string, number | undefined>;
}

export interface QueueInfo {
  readonly id: string;
  readonly name: string;
  readonly retentionSeconds: number | null;
  readonly consumers: readonly ConsumerInfo[];
}

export interface QueueMetrics {
  readonly backlogCount: number;
  readonly backlogBytes: number;
  /** null when the queue is empty (the API reports 0). */
  readonly oldestMessageMs: number | null;
}

interface RawConsumer {
  consumer_id?: string;
  type?: string;
  script?: string;
  script_name?: string;
  dead_letter_queue?: string;
  settings?: Record<string, number | undefined>;
}

interface RawQueue {
  queue_id: string;
  queue_name: string;
  settings?: { message_retention_period?: number };
  consumers?: RawConsumer[];
}

const accountBase = (a: CfAccount) =>
  `https://api.cloudflare.com/client/v4/accounts/${a.accountId}/queues`;

async function cf<T>(a: CfAccount, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${accountBase(a)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${a.token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message: string }[] | null;
    result?: T;
  };
  if (!res.ok || json.success === false)
    throw new Error(
      `queues ${init.method ?? "GET"} ${path || "/"}: ${res.status} ${(json.errors ?? []).map((e) => e.message).join("; ")}`,
    );
  return json.result as T;
}

export function toQueueInfo(q: RawQueue): QueueInfo {
  return {
    id: q.queue_id,
    name: q.queue_name,
    retentionSeconds: q.settings?.message_retention_period ?? null,
    consumers: (q.consumers ?? []).map((c) => ({
      id: c.consumer_id ?? "",
      type: c.type ?? "unknown",
      script: c.script ?? c.script_name ?? null,
      deadLetterQueue: c.dead_letter_queue ?? null,
      settings: c.settings ?? {},
    })),
  };
}

export async function getQueue(a: CfAccount, queueId: string): Promise<QueueInfo> {
  return toQueueInfo(await cf<RawQueue>(a, `/${queueId}`));
}

/** Finds a queue by name; the list endpoint does not filter, so this pages through. */
export async function findQueueByName(a: CfAccount, name: string): Promise<QueueInfo | null> {
  for (let page = 1; page < 50; page++) {
    const rows = await cf<RawQueue[]>(a, `?page=${page}&per_page=100`);
    const hit = rows.find((q) => q.queue_name === name);
    if (hit) return getQueue(a, hit.queue_id);
    if (rows.length < 100) return null;
  }
  return null;
}

export async function queueMetrics(a: CfAccount, queueId: string): Promise<QueueMetrics> {
  const r = await cf<{
    backlog_count?: number;
    backlog_bytes?: number;
    oldest_message_timestamp_ms?: number;
  }>(a, `/${queueId}/metrics`);
  const oldest = r.oldest_message_timestamp_ms ?? 0;
  return {
    backlogCount: r.backlog_count ?? 0,
    backlogBytes: r.backlog_bytes ?? 0,
    oldestMessageMs: oldest > 0 ? oldest : null,
  };
}

// ---- the audio queue's desired shape ----------------------------------------------

/** 14 days: the Workers Paid maximum. The free plan caps retention at 24 hours. */
export const AUDIO_RETENTION_SECONDS = 14 * 24 * 60 * 60;
/** Below this a missed weekend of worker runs loses recordings. */
export const MIN_SAFE_RETENTION_SECONDS = 4 * 24 * 60 * 60;

export interface ConsumerBody {
  readonly type: "http_pull";
  readonly dead_letter_queue: string;
  readonly settings: {
    readonly batch_size: number;
    readonly max_retries: number;
    readonly retry_delay: number;
    readonly visibility_timeout_ms: number;
  };
}

/**
 * The HTTP pull consumer the audio worker relies on. Five attempts, a minute
 * apart at least, then the dead-letter queue: a recording that fails five
 * times (bad file, a speaker without consent) is kept for a person to look
 * at rather than dropped. The worker passes its own visibility timeout on
 * each pull; this is the default for anything that does not.
 */
export function audioConsumerBody(stage: string): ConsumerBody {
  return {
    type: "http_pull",
    dead_letter_queue: audioDlqName(stage),
    settings: {
      batch_size: 20,
      max_retries: 5,
      retry_delay: 60,
      visibility_timeout_ms: 15 * 60_000,
    },
  };
}

export type SetupAction =
  | { readonly kind: "create_dlq"; readonly name: string }
  | { readonly kind: "create_consumer"; readonly body: ConsumerBody }
  | { readonly kind: "update_consumer"; readonly consumerId: string; readonly body: ConsumerBody }
  | { readonly kind: "set_retention"; readonly queue: string; readonly seconds: number }
  | { readonly kind: "blocked"; readonly reason: string };

function consumerMatches(c: ConsumerInfo, want: ConsumerBody): boolean {
  if (c.type !== want.type || c.deadLetterQueue !== want.dead_letter_queue) return false;
  return (Object.keys(want.settings) as (keyof ConsumerBody["settings"])[]).every(
    (k) => c.settings[k] === want.settings[k],
  );
}

/**
 * What it takes to bring the audio queue to its desired shape. Pure: the
 * command reads the current state, prints this plan, and applies it only
 * with --live. Running it twice plans nothing the second time.
 */
export function planAudioQueueSetup(
  stage: string,
  queue: QueueInfo,
  dlq: QueueInfo | null,
): SetupAction[] {
  const actions: SetupAction[] = [];
  const want = audioConsumerBody(stage);
  const workers = queue.consumers.filter((c) => c.type === "worker");
  if (workers.length > 0) {
    return [
      {
        kind: "blocked",
        reason: `${queue.name} has a Worker consumer (${workers.map((w) => w.script).join(", ")}); the audio queue must be pull-only, remove it from infra/alchemy.run.ts first`,
      },
    ];
  }
  if (!dlq) actions.push({ kind: "create_dlq", name: want.dead_letter_queue });
  const pull = queue.consumers.find((c) => c.type === "http_pull");
  if (!pull) actions.push({ kind: "create_consumer", body: want });
  else if (!consumerMatches(pull, want))
    actions.push({ kind: "update_consumer", consumerId: pull.id, body: want });
  if ((queue.retentionSeconds ?? 0) < AUDIO_RETENTION_SECONDS)
    actions.push({ kind: "set_retention", queue: queue.name, seconds: AUDIO_RETENTION_SECONDS });
  if (dlq && (dlq.retentionSeconds ?? 0) < AUDIO_RETENTION_SECONDS)
    actions.push({ kind: "set_retention", queue: dlq.name, seconds: AUDIO_RETENTION_SECONDS });
  else if (!dlq)
    actions.push({
      kind: "set_retention",
      queue: want.dead_letter_queue,
      seconds: AUDIO_RETENTION_SECONDS,
    });
  return actions;
}

export function describeAction(a: SetupAction): string {
  switch (a.kind) {
    case "create_dlq":
      return `create dead-letter queue ${a.name}`;
    case "create_consumer":
      return `add HTTP pull consumer (max_retries ${a.body.settings.max_retries}, retry_delay ${a.body.settings.retry_delay}s, dead letters to ${a.body.dead_letter_queue})`;
    case "update_consumer":
      return `update HTTP pull consumer ${a.consumerId} to max_retries ${a.body.settings.max_retries}, retry_delay ${a.body.settings.retry_delay}s, dead letters to ${a.body.dead_letter_queue}`;
    case "set_retention":
      return `set ${a.queue} message retention to ${a.seconds / 86_400} days`;
    case "blocked":
      return `cannot proceed: ${a.reason}`;
  }
}

/**
 * Applies one action. Retention is best effort: on the Workers free plan
 * Cloudflare refuses anything above 24 hours, and that must not stop the
 * consumer from being created, so the caller reports it as a warning.
 */
export async function applyAction(
  a: CfAccount,
  queue: QueueInfo,
  action: SetupAction,
  resolveId: (name: string) => Promise<string | null>,
): Promise<void> {
  switch (action.kind) {
    case "create_dlq":
      await cf(a, "", { method: "POST", body: JSON.stringify({ queue_name: action.name }) });
      return;
    case "create_consumer":
      await cf(a, `/${queue.id}/consumers`, {
        method: "POST",
        body: JSON.stringify(action.body),
      });
      return;
    case "update_consumer":
      await cf(a, `/${queue.id}/consumers/${action.consumerId}`, {
        method: "PUT",
        body: JSON.stringify(action.body),
      });
      return;
    case "set_retention": {
      const id = action.queue === queue.name ? queue.id : await resolveId(action.queue);
      if (!id) throw new Error(`queue ${action.queue} not found`);
      await cf(a, `/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          queue_name: action.queue,
          settings: { message_retention_period: action.seconds },
        }),
      });
      return;
    }
    case "blocked":
      throw new Error(action.reason);
  }
}

// ---- health -------------------------------------------------------------------

export interface BacklogReport {
  readonly queue: string;
  readonly waiting: number;
  readonly oldestAgeMinutes: number | null;
  readonly retentionHours: number | null;
  readonly consumer: string;
  readonly deadLetterQueue: string | null;
  readonly deadLettered: number | null;
  readonly warnings: readonly string[];
}

/**
 * The sanity check behind `molo audio backlog`: how many recordings are
 * waiting, how old the oldest is, and whatever would make one silently
 * disappear (no pull consumer, no dead-letter queue, a retention window the
 * oldest message is about to fall out of).
 */
export function backlogReport(
  queue: QueueInfo,
  metrics: QueueMetrics,
  dlqMetrics: QueueMetrics | null,
  now: number,
): BacklogReport {
  const warnings: string[] = [];
  const pull = queue.consumers.find((c) => c.type === "http_pull");
  const worker = queue.consumers.find((c) => c.type === "worker");
  if (!pull)
    warnings.push(
      "no HTTP pull consumer: the worker cannot pull (run `molo cf queues --env <env> --live`)",
    );
  if (worker)
    warnings.push(
      `a Worker consumer (${worker.script}) is attached; audio.process must be pulled, not pushed`,
    );
  const dlqName = pull?.deadLetterQueue ?? null;
  if (pull && !dlqName)
    warnings.push("no dead-letter queue: a message that fails max_retries times is deleted");
  const retention = queue.retentionSeconds;
  if (retention !== null && retention < MIN_SAFE_RETENTION_SECONDS)
    warnings.push(
      `retention is ${Math.round(retention / 3600)}h: an upload not processed within that is lost from the queue (its file stays in R2 under incoming/)`,
    );
  const ageMs =
    metrics.oldestMessageMs !== null ? Math.max(0, now - metrics.oldestMessageMs) : null;
  if (ageMs !== null && retention !== null && ageMs > (retention * 1000) / 2)
    warnings.push(
      `the oldest message is ${Math.round(ageMs / 3_600_000)}h old, past half the retention window`,
    );
  if (dlqMetrics && dlqMetrics.backlogCount > 0)
    warnings.push(
      `${dlqMetrics.backlogCount} message(s) in the dead-letter queue: recordings that failed processing`,
    );
  return {
    queue: queue.name,
    waiting: metrics.backlogCount,
    oldestAgeMinutes: ageMs === null ? null : Math.round(ageMs / 60_000),
    retentionHours: retention === null ? null : Math.round(retention / 3600),
    consumer: pull ? "http_pull" : worker ? `worker (${worker.script})` : "none",
    deadLetterQueue: dlqName,
    deadLettered: dlqMetrics ? dlqMetrics.backlogCount : null,
    warnings,
  };
}
