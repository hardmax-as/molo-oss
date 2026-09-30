import { join } from "node:path";

import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";

import { envVar, fail, gate, kv, out, table, tryPromise } from "../context.ts";
import { molo } from "../root.ts";
import {
  applyAction,
  audioDlqName,
  audioQueueName,
  cfAccount,
  describeAction,
  findQueueByName,
  planAudioQueueSetup,
} from "../services/queues.ts";
import { repoRoot } from "../services/repo-paths.ts";
import {
  issuesWindow,
  SENTRY_PROJECTS,
  seenSince,
  sentryConfig,
  sentryGet,
  summariseEvent,
  type SentryEvent,
} from "../services/sentry.ts";
import { APPS, workerName } from "../services/workers-logs.ts";

// ---------------------------------------------------------------------------
// sentry issues [--since 24h] [--project] | sentry issue <shortId>
// ---------------------------------------------------------------------------

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  count: string;
  userCount: number;
  lastSeen: string;
  level: string;
  permalink: string;
}

const needSentry = () =>
  fail("SENTRY_READ_TOKEN (or SENTRY_AUTH_TOKEN) is required to read Sentry (see molo doctor)");

const sentryIssues = Command.make(
  "issues",
  {
    since: Options.text("since").pipe(
      Options.withDefault("24h"),
      Options.withDescription("how far back by last seen: 30m, 1h, 3d (at most 14d) or a date"),
    ),
    project: Options.choice("project", SENTRY_PROJECTS).pipe(
      Options.optional,
      Options.withDescription(
        "molo-api, molo-web or molo-mobile; default SENTRY_PROJECT, else molo-api",
      ),
    ),
  },
  ({ since, project }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const cfg = sentryConfig();
      if (!cfg) return yield* needSentry();
      const proj = Option.getOrUndefined(project) ?? envVar("SENTRY_PROJECT") ?? "molo-api";
      let window: ReturnType<typeof issuesWindow>;
      try {
        window = issuesWindow(since, Date.now());
      } catch (e) {
        return yield* fail(e instanceof Error ? e.message : String(e));
      }
      const all = yield* tryPromise(
        () =>
          sentryGet<SentryIssue[]>(
            cfg,
            `/projects/${cfg.org}/${encodeURIComponent(proj)}/issues/?statsPeriod=${window.statsPeriod}&query=is:unresolved`,
          ),
        "sentry",
      );
      const issues = seenSince(all, window.cutoff);
      yield* out(g, issues, () => {
        console.log(
          `${issues.length} unresolved issue(s) in ${cfg.org}/${proj}, last seen within ${since}` +
            (window.capped ? " (Sentry keeps 14 days here: capped at 14d)" : ""),
        );
        table(
          issues.map((i) => ({
            id: i.shortId,
            level: i.level,
            count: i.count,
            users: i.userCount,
            lastSeen: i.lastSeen,
            title: i.title.slice(0, 80),
          })),
        );
      });
    }),
).pipe(Command.withDescription("Recent unresolved issues (read-only)"));

const sentryIssue = Command.make(
  "issue",
  { shortId: Args.text({ name: "shortId" }).pipe(Args.withDescription("e.g. MOLO-API-1A")) },
  ({ shortId }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const cfg = sentryConfig();
      if (!cfg) return yield* needSentry();
      const found = yield* tryPromise(
        () =>
          sentryGet<{
            groupId: string;
            group?: {
              title?: string;
              permalink?: string;
              count?: string;
              userCount?: number;
              firstSeen?: string;
              lastSeen?: string;
              status?: string;
            };
          }>(cfg, `/organizations/${cfg.org}/shortids/${encodeURIComponent(shortId)}/`),
        "sentry",
      );
      const event = yield* tryPromise(
        () =>
          sentryGet<SentryEvent>(
            cfg,
            `/organizations/${cfg.org}/issues/${found.groupId}/events/latest/`,
          ),
        "sentry",
      );
      const s = summariseEvent(event);
      const issue = {
        shortId,
        id: found.groupId,
        status: found.group?.status ?? null,
        count: found.group?.count ?? null,
        users: found.group?.userCount ?? null,
        firstSeen: found.group?.firstSeen ?? null,
        lastSeen: found.group?.lastSeen ?? null,
        permalink: found.group?.permalink ?? null,
      };
      yield* out(g, { issue, latestEvent: s }, () => {
        console.log(`${shortId}  ${s.title}`);
        kv({
          culprit: s.culprit ?? "",
          status: issue.status ?? "",
          events: issue.count ?? "",
          users: issue.users ?? "",
          seen: `${issue.firstSeen ?? "?"} → ${issue.lastSeen ?? "?"}`,
          latest: `${s.date ?? "?"} (${s.eventId ?? "?"})`,
          breadcrumbs: s.breadcrumbs,
          link: issue.permalink ?? "",
        });
        if (s.exception) console.log(`\n${s.exception.type}: ${s.exception.value}`);
        for (const f of s.frames) console.log(`  at ${f}`);
        if (Object.keys(s.tags).length > 0) {
          console.log("\ntags");
          kv(s.tags);
        }
      });
    }),
).pipe(Command.withDescription("One issue's latest event: title, tags, top frames (no user data)"));

export const sentry = Command.make("sentry", {}).pipe(
  Command.withDescription("Sentry (EU region, read-only; prefers SENTRY_READ_TOKEN)"),
  Command.withSubcommands([sentryIssues, sentryIssue]),
);

// ---------------------------------------------------------------------------
// cf deploy | cf tail <app>
// ---------------------------------------------------------------------------

// A stage deploys as a whole: Alchemy destroys what a run does not declare,
// so "just the api" would take the web Worker down with it, and vice versa.
const cfDeploy = Command.make("deploy", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    if (g.env === "local") return yield* fail("deploy targets preview or prod: --env preview|prod");
    const script = join(repoRoot(), "infra", "alchemy.run.ts");
    const apply = yield* gate(g, `run Alchemy for api and web in ${g.env} (${script})`);
    if (!apply) return;
    for (const v of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"])
      if (!envVar(v)) return yield* fail(`${v} is not set`);
    const proc = Bun.spawn(["bun", script, "--stage", g.env], {
      cwd: repoRoot(),
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, MOLO_LIVE: "1" },
    });
    const code = yield* tryPromise(() => proc.exited, "alchemy");
    if (code !== 0) return yield* fail(`alchemy exited with ${code}`);
  }),
).pipe(Command.withDescription("Alchemy deploy of the whole stage (api and web); --live required"));

const cfTail = Command.make(
  "tail",
  {
    app: Args.choice(APPS.map((a) => [a, a] as const)),
    grep: Options.text("grep").pipe(
      Options.optional,
      Options.withDescription("Only invocations whose console output contains this text"),
    ),
    status: Options.choice("status", ["ok", "error", "canceled"] as const).pipe(
      Options.optional,
      Options.withDescription("Invocation outcome (not HTTP status; molo logs --status has that)"),
    ),
  },
  ({ app, grep, status }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (g.env === "local") return yield* fail("tail targets preview or prod: --env preview|prod");
      const args = ["bunx", "wrangler", "tail", workerName(app, g.env), "--format", "pretty"];
      if (Option.isSome(grep)) args.push("--search", grep.value);
      if (Option.isSome(status)) args.push("--status", status.value);
      const proc = Bun.spawn(args, {
        cwd: join(repoRoot(), "apps", app),
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = yield* tryPromise(() => proc.exited, "wrangler tail");
      if (code !== 0) return yield* fail(`wrangler tail exited with ${code}`);
    }),
).pipe(Command.withDescription("Stream live Workers logs (read-only); molo logs for history"));

/**
 * The audio-process queue's HTTP pull consumer, dead-letter queue and
 * retention. Alchemy 0.94 cannot declare a pull consumer (its QueueConsumer
 * is Worker-only) and never sends a queue's `dlq`, so this does it over the
 * REST API. Idempotent: the deploy runs it after `alchemy up`, and a second
 * run plans nothing. Retention above 24 hours needs Workers Paid; on the
 * free plan that step is refused and reported, and the rest still applies.
 */
const cfQueues = Command.make(
  "queues",
  {
    stage: Options.text("stage").pipe(
      Options.optional,
      Options.withDescription("Stage name when it is not the env (a per-PR preview: preview-pr-N)"),
    ),
  },
  ({ stage }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (g.env === "local")
        return yield* fail("queues live on Cloudflare: --env preview|prod (local simulates them)");
      const acct = cfAccount();
      if (!acct) return yield* fail("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
      const stageName = Option.getOrElse(stage, () => g.env);
      const name = audioQueueName(stageName);
      const queue = yield* tryPromise(() => findQueueByName(acct, name), "find queue");
      if (!queue) return yield* fail(`no queue named ${name}; deploy the stage first`);
      const dlq = yield* tryPromise(
        () => findQueueByName(acct, audioDlqName(stageName)),
        "find dead-letter queue",
      );
      const plan = planAudioQueueSetup(stageName, queue, dlq);
      yield* out(g, { queue: name, queueId: queue.id, plan }, () => {
        console.log(`${name} (${queue.id})`);
        if (plan.length === 0)
          console.log("  already in shape: HTTP pull consumer, dead letters, retention");
        for (const a of plan) console.log(`  ${describeAction(a)}`);
      });
      const blocked = plan.find((a) => a.kind === "blocked");
      if (blocked) return yield* fail(describeAction(blocked));
      if (plan.length === 0) return;
      const apply = yield* gate(g, `apply ${plan.length} change(s) to ${name}`);
      if (!apply) return;
      const resolveId = async (n: string) => (await findQueueByName(acct, n))?.id ?? null;
      for (const action of plan) {
        const r = yield* tryPromise(
          () => applyAction(acct, queue, action, resolveId),
          describeAction(action),
        ).pipe(Effect.either);
        if (r._tag === "Right") console.log(`done: ${describeAction(action)}`);
        else if (action.kind === "set_retention")
          console.warn(`warning: ${r.left.message} (the free plan caps retention at 24 hours)`);
        else return yield* Effect.fail(r.left);
      }
    }),
).pipe(
  Command.withDescription(
    "Give the audio-process queue its HTTP pull consumer, dead-letter queue and 14-day retention; idempotent, --live applies",
  ),
);

export const cf = Command.make("cf", {}).pipe(
  Command.withDescription("Cloudflare"),
  Command.withSubcommands([cfDeploy, cfTail, cfQueues]),
);

// ---------------------------------------------------------------------------
// linear issues list | linear issues create --title ... [--description ...]
// ---------------------------------------------------------------------------

const LINEAR = "https://api.linear.app/graphql";
const TEAM_KEY = "MOL";

async function linear<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = envVar("LINEAR_API_KEY");
  if (!key) throw new Error("LINEAR_API_KEY is not set");
  const res = await fetch(LINEAR, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length)
    throw new Error(json.errors?.map((e) => e.message).join("; ") ?? `${res.status}`);
  return json.data as T;
}

const linearList = Command.make(
  "list",
  { limit: Options.integer("limit").pipe(Options.withDefault(25)) },
  ({ limit }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const data = yield* tryPromise(
        () =>
          linear<{
            issues: {
              nodes: {
                identifier: string;
                title: string;
                state: { name: string };
                updatedAt: string;
                url: string;
              }[];
            };
          }>(
            `query($key: String!, $first: Int!) { issues(filter: { team: { key: { eq: $key } } }, first: $first, orderBy: updatedAt) { nodes { identifier title state { name } updatedAt url } } }`,
            { key: TEAM_KEY, first: limit },
          ),
        "linear",
      );
      yield* out(g, data.issues.nodes, () =>
        table(
          data.issues.nodes.map((i) => ({
            id: i.identifier,
            state: i.state.name,
            updated: i.updatedAt.slice(0, 10),
            title: i.title.slice(0, 70),
          })),
        ),
      );
    }),
).pipe(Command.withDescription(`List ${TEAM_KEY}- issues (read-only)`));

const linearCreate = Command.make(
  "create",
  {
    title: Options.text("title"),
    description: Options.text("description").pipe(Options.withDefault("")),
  },
  ({ title, description }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const apply = yield* gate(g, `create Linear issue "${title}" in team ${TEAM_KEY}`);
      if (!apply) return;
      const team = yield* tryPromise(
        () =>
          linear<{ teams: { nodes: { id: string }[] } }>(
            `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`,
            { key: TEAM_KEY },
          ),
        "linear",
      );
      const teamId = team.teams.nodes[0]?.id;
      if (!teamId) return yield* fail(`no Linear team with key ${TEAM_KEY}`);
      const created = yield* tryPromise(
        () =>
          linear<{ issueCreate: { issue: { identifier: string; url: string } } }>(
            `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
            { input: { teamId, title, description } },
          ),
        "linear",
      );
      yield* out(g, created.issueCreate.issue, () =>
        console.log(`${created.issueCreate.issue.identifier} ${created.issueCreate.issue.url}`),
      );
    }),
).pipe(Command.withDescription("Create an issue (--live)"));

const linearIssues = Command.make("issues", {}).pipe(
  Command.withSubcommands([linearList, linearCreate]),
);

export const linearCmd = Command.make("linear", {}).pipe(
  Command.withDescription(`Linear (${TEAM_KEY}- team)`),
  Command.withSubcommands([linearIssues]),
);
