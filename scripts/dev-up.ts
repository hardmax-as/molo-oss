/**
 * `bun run up` — the whole local stack, in one command.
 *
 * Four things used to be four commands, in an order you had to remember, with
 * two waits nobody told you about: Postgres accepts TCP before it accepts
 * queries, and `molo dev user` signs up *through* the running API, so it
 * cannot run before the API answers. Getting the order wrong fails in ways
 * that look like product bugs. This runs them in order and waits for the real
 * signal at each step.
 *
 *   bun run up               postgres, minio, mailpit, migrations, api, web
 *   bun run up --mobile      the same, plus Expo
 *   bun run up --seed        also seed the database (idempotent, writes)
 *   bun run up --no-user     skip creating the local dev account
 *
 * It supervises what it starts: Ctrl-C stops the API and the web server it
 * launched. Docker is deliberately left running, because the data is worth
 * keeping between sessions and stopping it is `bun run down`.
 *
 * Orphaned `wrangler dev` processes are the reason the supervision matters.
 * One survived a session, stopped answering, and cost an hour of debugging a
 * mobile app that was fine.
 */

import { spawn, type Subprocess } from "bun";

const API_URL = "http://localhost:8787";
const WEB_URL = "http://localhost:3300";
const DEV_EMAIL = "dev-admin@molo.local";

const args = new Set(process.argv.slice(2));
const withMobile = args.has("--mobile");
const withSeed = args.has("--seed");
const skipUser = args.has("--no-user");

const C = {
  dim: "[2m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  cyan: "[36m",
  magenta: "[35m",
  bold: "[1m",
  off: "[0m",
};

function step(n: number, of: number, text: string): void {
  console.log(`${C.dim}[${n}/${of}]${C.off} ${text}`);
}

function die(message: string, hint?: string): never {
  console.error(`\n${C.red}${C.bold}stopp:${C.off} ${message}`);
  if (hint) console.error(`${C.dim}${hint}${C.off}`);
  process.exit(1);
}

/** Runs to completion, inheriting the terminal. Returns the exit code. */
async function run(cmd: string[], label: string): Promise<number> {
  const p = spawn(cmd, { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  const code = await p.exited;
  if (code !== 0) die(`${label} feilet (exit ${code})`);
  return code;
}

/** Runs quietly and returns the output; does not die on a non-zero exit. */
async function capture(cmd: string[]): Promise<{ code: number; out: string }> {
  const p = spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  return { code: await p.exited, out: out + err };
}

/**
 * Server output is held back until the startup sequence has printed, then
 * flushed. Without it wrangler's first lines land in the middle of the
 * progress dots and the two are unreadable together.
 */
let holdLogs = true;
const held: string[] = [];
function emit(line: string): void {
  if (holdLogs) held.push(line);
  else console.log(line);
}
function releaseLogs(): void {
  holdLogs = false;
  for (const line of held.splice(0)) console.log(line);
}

/** A long-lived server, with its output prefixed so two streams stay readable. */
function serve(label: string, colour: string, cmd: string[], cwd: string): Subprocess {
  const child = spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const tag = `${colour}${label.padEnd(6)}${C.off} `;
  for (const stream of [child.stdout, child.stderr]) {
    if (typeof stream === "number") continue;
    void (async () => {
      const reader = (stream as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let rest = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) emit(tag + line);
      }
    })();
  }
  return child;
}

/** Polls until `check` succeeds. The point of the whole script. */
async function waitFor(
  what: string,
  check: () => Promise<boolean>,
  seconds: number,
): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  process.stdout.write(`      ${C.dim}venter på ${what}${C.off}`);
  for (;;) {
    if (await check().catch(() => false)) {
      process.stdout.write(` ${C.green}ok${C.off}\n`);
      return;
    }
    if (Date.now() > deadline) {
      process.stdout.write(` ${C.red}ga opp etter ${seconds}s${C.off}\n`);
      die(`${what} svarte ikke`);
    }
    process.stdout.write(".");
    await Bun.sleep(500);
  }
}

// ---------------------------------------------------------------------------

const total = withMobile ? 6 : 5;
console.log(`${C.bold}molo${C.off} ${C.dim}lokal stack${C.off}\n`);

// 1. Docker. This is the step that actually fails, so it gets a real message.
step(1, total, "docker");
const info = await capture(["docker", "info", "--format", "{{.ServerVersion}}"]);
if (info.code !== 0) {
  die(
    "Docker svarer ikke.",
    "Start Docker Desktop og kjør på nytt. Alt under her trenger Postgres.",
  );
}
// Not `--wait`. It treats any container that has exited as a failure, and
// `minio-init` is a one-shot that creates the two buckets and exits 0, so
// `--wait` reports failure on a stack that came up perfectly. Start everything,
// then wait for the one signal that matters by asking Postgres itself, using
// the same command its healthcheck uses.
await run(["docker", "compose", "up", "-d"], "docker compose up");
await waitFor(
  "Postgres",
  async () => {
    const r = await capture([
      "docker",
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_isready",
      "-U",
      "molo",
      "-d",
      "molo",
    ]);
    return r.code === 0;
  },
  60,
);

// 2. Schema. Idempotent: Drizzle applies what is missing and nothing else.
step(2, total, "migrasjoner");
await run(["bun", "run", "db:migrate"], "db:migrate");
if (withSeed) {
  step(2, total, "seed");
  await run(["bun", "run", "db:seed"], "db:seed");
}

// 3. The API, and wait until it answers rather than until it is spawned.
step(3, total, `api  ${C.dim}${API_URL}${C.off}`);
const children: Subprocess[] = [];
children.push(serve("api", C.cyan, ["bun", "run", "dev"], "apps/api"));
await waitFor(
  "API",
  async () => {
    const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  },
  90,
);

// 4. The account. It signs up through the API, so it has to come after step 3.
if (!skipUser) {
  step(4, total, `konto ${C.dim}${DEV_EMAIL}${C.off}`);
  const user = await capture(["bun", "run", "molo", "dev", "user", DEV_EMAIL, "--live"]);
  if (user.code === 0) {
    console.log(`      ${C.green}ok${C.off} ${C.dim}passord molo-dev-1234${C.off}`);
  } else {
    // Not fatal: the stack is usable, you just sign in with an account you
    // already have. Say what happened rather than failing the whole start.
    console.log(
      `      ${C.yellow}hoppet over${C.off} ${C.dim}${user.out.trim().split("\n").pop()}${C.off}`,
    );
  }
}

// 5. Web.
step(5, total, `web  ${C.dim}${WEB_URL}${C.off}`);
children.push(serve("web", C.magenta, ["bun", "run", "dev"], "apps/web"));

if (withMobile) {
  step(6, total, "mobile");
  children.push(serve("expo", C.yellow, ["bun", "run", "start"], "apps/mobile"));
}

console.log(`
${C.green}${C.bold}klar${C.off}

  ${C.bold}${WEB_URL}${C.off}        læreren
  ${C.bold}${WEB_URL}/edit${C.off}   redaktørdashbordet, start her
  ${C.bold}${WEB_URL}/dev${C.off}    komponentgalleriet, uten publisert innhold
  ${C.dim}${API_URL}          API
  http://localhost:8025      Mailpit, e-post som ikke sendes
  http://localhost:9001      MinIO, R2 lokalt${C.off}

${C.dim}Ctrl-C stopper api og web. Docker blir stående; bun run down tar den.${C.off}
`);
releaseLogs();

// ---------------------------------------------------------------------------
// Supervision. Without this, Ctrl-C kills this process and leaves wrangler and
// vite running on their ports, and the next start fails on a port in use.

let stopping = false;
function stop(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  console.log(`\n${C.dim}stopper api og web${C.off}`);
  for (const child of children) child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(0);
  }, 4000).unref();
  void Promise.all(children.map((c) => c.exited)).then(() => process.exit(0));
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

// If a server dies on its own, take the rest down: half a stack is worse than
// none, because the half that answers hides which half did not.
await Promise.race(children.map((c) => c.exited));
if (!stopping) {
  console.error(`\n${C.red}en av serverne stoppet av seg selv${C.off}`);
  stop("SIGTERM");
}
