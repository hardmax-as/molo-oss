# STACK — what we build on, and what was rejected

Every entry: the choice, why, and what lost. If you change a choice, add the
reason here first. "It's what I know" is a valid reason; write it down.

---

## Database: PlanetScale Postgres + Hyperdrive + Drizzle

**Decision 2026-09-03:** hosted Postgres is **PlanetScale Postgres**, chosen
by the operator on cost. It replaces Neon below; everything else in this
entry (why Postgres, why not D1, Hyperdrive as the hop from Workers) stands.
PlanetScale's Postgres product removes the original objection to it, which
was that it was MySQL. Two things to confirm at provisioning, before
workstream F: that branching covers the Postgres product on the plan we buy
(ARCHITECTURE §9 assumes a database per PR), and that logical replication is
exposed, which Zero or PowerSync will need later. The code stays
provider-agnostic: plain Postgres through Hyperdrive, Drizzle, the `postgres`
driver; switching providers is a connection string and an entry here.

### Original entry (Neon), kept for the reasoning

**Chosen** over PlanetScale (MySQL/Vitess) and Cloudflare D1 (SQLite).

Why:

- **The roadmap already decided this.** Both sync engines on the "future"
  list — **Zero (Rocicorp)** and **PowerSync** — are Postgres-first. Choosing
  D1 or MySQL today means a migration on the day offline sync matters, which
  for a mobile learning app is the day it gets serious.
- **Full-text search** (`tsvector`) for the dictionary and the editor
  dashboard's content grid. SQLite FTS5 exists but is a second-class citizen
  in Drizzle; MySQL FTS is weaker for morphologically rich text.
- **JSONB** for exercise payloads, which vary by exercise type and will keep
  changing while pedagogy is being calibrated.
- **`pgvector`** is one extension away when an LLM conversational partner
  arrives and needs retrieval over the *validated* corpus.

Costs: Hyperdrive is a required hop from Workers (connection pooling); D1
would have been zero-config. Accepted.

D1 rejected: sync-engine dead end, 10 GB soft ceiling, weaker FTS.
PlanetScale rejected: MySQL, and Zero/PowerSync are Postgres-first. Also the
free tier is gone.

Local: Docker Compose Postgres, same major as the hosted database (17 until
PlanetScale says otherwise at provisioning). Mobile uses **op-sqlite +
SQLCipher** as a *client cache* — that is a different question from the
server store and does not contradict this.

---

## API: Hono on Cloudflare Workers

Chosen because the operator already runs Workers and the edge is where
learners in South Africa and Norway both get acceptable latency. Hono for
Workers-native routing with typed middleware.

Rejected: Elysia (Bun-first, weaker Workers story), tRPC (Effect Schema at the
boundary gives us the typing without the coupling to one client).

---

## Async: Cloudflare Queues — required, not optional

The original list had Queues as "maybe." It is not maybe. The audio path is
inherently asynchronous: an editor uploads or records → `xh-audio` trims,
normalises, encodes → manifest written → R2 → row updated → review queue
notified. That is a job, and jobs go through Queues so a slow encode never
holds an HTTP request and retries are free.

Also used for: corpus ingest batches, Forvo backfill (500 req/day on the
non-profit tier — a natural rate-limited consumer), nightly `audio missing`
reports to Slack.

---

## Storage: Cloudflare R2

Audio and images. Public bucket for `published` assets behind a CDN path;
private bucket for `draft`/`in_review` audio. Object keys are content-hashed
(`audio/<sha256>.opus`) so re-uploads dedupe and cache invalidation is a
non-problem. **Cloudflare Image Optimization** for editor-uploaded imagery
(exercise pictures); low priority.

Local: **MinIO** with the same bucket names.

---

## IaC: Alchemy

Chosen over Wrangler-only config and Terraform. TypeScript IaC that speaks
Workers, R2, Queues, Hyperdrive and D1 natively, and can be driven from the
`molo cf` CLI. `--live` gate on every apply.

**Version note, 2026-09-03:** `alchemy@latest` on npm is a 2.0 beta
("Infrastructure-as-Effects") built on the Effect 4 release candidate. This
repo pins Effect 3.22, so infra uses the stable `alchemy@0.94` line
(`alchemy.run.ts`, `Worker`/`R2Bucket`/`Queue`/`Hyperdrive` resources).
Revisit when Effect 4 is stable and the rest of the stack has moved.

---

## Auth: Better Auth

Roles: `learner`, `editor`, `admin`. Editors and admins see `/edit/*`.
Email/password + magic link (Resend) at launch. **Vipps** later via the
generic OAuth plugin — the Norwegian audience makes this worth the plumbing
eventually, not now.

Sign in with Apple's client secret is an expiring JWT. The
`.github/workflows/secret-expiry.yml` job runs every Monday at 08:00 UTC (and
can be dispatched manually), decodes `exp` from the `APPLE_CLIENT_SECRET`
repository secret without a private key or an Apple request, and prints only
whole days remaining. It fails below 30 days, or if the secret is missing or
malformed. Regenerate and redeploy the secret with `molo auth apple-secret`
before expiry; the check does not rotate credentials or verify the signature.

The same workflow independently reads EAS's App Store signing metadata for
`com.hardmax.molo` using `EXPO_ACCESS_TOKEN`. It reports the iOS Distribution
certificate and provisioning profile expiry dates and whole days remaining,
and fails below 30 days or when credentials cannot be resolved unambiguously.
It never downloads signing material or creates, rotates or revokes credentials.

---

## Validation and orchestration: Effect Schema everywhere, Effect selectively

- **Effect Schema** decodes every request and every Queue message. One schema,
  shared with clients through `packages/core`.
- **Effect proper** is used where there is real orchestration: the audio
  pipeline (multi-step, retries, typed failures), corpus ingest, the Forvo
  backfill consumer, `molo doctor`. It is **not** used for a CRUD handler.
  A `try/catch` around a Drizzle call is fine and more readable.
- **Effect version:** pin it, and record real API shapes in
  the library notes as discovered. Do not assume the major your training
  data describes. The `effect-patterns` CLI (`ep`) is available for idioms.

---

## Web: TanStack Start

One web app, two surfaces: the learner app and the editor dashboard under
`/edit/*`. Tailwind + shadcn, TanStack Query/Form (Effect Schema)/Table,
Lucide, Sonner, Motion (subtle — gamification feedback, not decoration),
React Aria for a11y-critical widgets, Fontsource (self-hosted; no external
requests at runtime).

**react-i18next from day one** — the product ships to two source languages.
"Add i18n later" is a rewrite.

Rejected: Next.js (Workers deployment story is worse; TanStack Start is
Vite-native and edge-friendly), Remix (superseded).

---

## Mobile: Expo SDK 57 + NativeWind + op-sqlite

Learner app only. Offline lesson cache and FSRS state in op-sqlite with
SQLCipher. Audio playback via `expo-audio`; recording for speak exercises.
`xh-fsrs` via WASM. Jest + Maestro.

**Mobile is Phase 4, not Phase 1.** See PLAN.md. The habit loop is mobile, but
the *content and pedagogy loop* is validated faster on web, and the editor
dashboard is web regardless.

---

## Rust: three crates, one rule

**Rule:** Rust for correctness- or performance-critical cores; never CRUD.

- **`xh-morph`** — FST noun-class/concord generator. Rust because the rule
  set must be fast, deterministic and testable to the byte; because it
  compiles to WASM for on-device exercise generation; and because it is the
  most intellectually rewarding thing in the repo to learn Rust on. Crates:
  hand-rolled FST or `fst`-family; `serde` for the lexicon.
- **`xh-audio`** — `symphonia` (decode), `ebur128` (LUFS), `rubato`
  (resample), `opus` / `fdk-aac` bindings (encode), `sha2`. Rust because
  audio DSP in TypeScript on Workers is the wrong tool and because a native
  binary in the Queue consumer path is simpler than a WASM audio stack.
- **`xh-fsrs`** — `fsrs-rs`, the reference FSRS implementation used by Anki.
  Rust because it already exists there and is correct. `wasm-bindgen` export.
  `ts-fsrs` was the TypeScript alternative; rejected only because the
  operator wants the Rust surface and fsrs-rs is upstream.

Workspace: `Cargo.toml` at root with `crates/*`. `cargo fmt`, `clippy -D
warnings`, `cargo test` in CI. Golden files under `crates/xh-morph/golden/`.

---

## Lint / format: Oxlint + Oxfmt

Fast, single binary, good enough. Biome is the fallback if Oxfmt's TSX
coverage disappoints in practice — note it here if you switch.

---

## Tests

- **Vitest** — unit, everywhere in TS.
- **Playwright** — component tests for exercise widgets; e2e for the lesson
  flow and the editor publish gate.
- **DB integration** — against Docker Postgres, Drizzle migrations applied,
  `packages/testkit` fixtures. The integrity suite lives here.
- **MSW** — mock Forvo, TTS, Sentry, Resend in tests. No live calls in CI.
- **Jest + Maestro** — mobile.
- **`cargo test`** — with golden files for `xh-morph`; property tests for
  `xh-audio` manifests.

`bun run test:integrity` is the fast suite that asserts the content model
(status machine, publish gate, ai_draft never auto-publishes, learner
queries filter on `published`). Run it often.

---

## Observability: Sentry

Workers, web and mobile. Source maps uploaded in CI. Sentry MCP available to
the agent; `molo sentry issues` wraps the same API for scripts.

The live deploy uses the commit SHA as both web and API Sentry release, with
`SENTRY_AUTH_TOKEN` supplied only to the build environment. The web's
`@sentry/vite-plugin` uploads hidden source maps to `molo-web`, then deletes
them; the build refuses any map left in the served assets. Alchemy's API
bundle uses the esbuild entry of `@sentry/bundler-plugins` for `molo-api`; its
maps remain private Worker metadata. Both projects belong to
`malmo-development` at `https://de.sentry.io`. Uploads skip without the token
or the live deploy gate. These are explicit build dependencies on packages
already present through the web Sentry SDK; no runtime dependency is added.
A configured upload failure fails the build before that bundle is deployed.

**PostHog** later (product analytics). Not before there are learners to
analyse. Reaffirmed 2026-09-06: the recommendation is yes, and the blocker is
not the integration but the three things around it — a consent surface in web
and mobile in two languages, a line in the privacy policy, and a
data-residency choice, because an audience of visitors inside South Africa
brings South African data-protection law alongside the European rules the
Norwegian company already answers to. `docs/NEXT.md` carries the full
reasoning.

---

## CI: GitHub Actions on Blacksmith

> **Runner note (2026-09-04, connected 2026-09-20).** Workflows read the
> runner label from the repository variables `CI_RUNNER` / `CI_RUNNER_SMALL`
> and fall back to `ubuntu-latest`. The Blacksmith GitHub App is installed
> on the `hardmax-as` organisation and the variables are set to
> `blacksmith-4vcpu-ubuntu-2404` / `blacksmith-2vcpu-ubuntu-2404`, so every
> Linux job (CI, deploy, preview, the mobile-e2e Linux half) runs on
> Blacksmith; a job's log says `Runner name: 'blacksmith-…'`. The macOS job
> in `mobile-e2e.yml` reads `CI_RUNNER_MACOS` and still falls back to
> GitHub's `macos-15`. Before 2026-09-20 nothing had ever run on Blacksmith
> and the org's 2 000 included GitHub minutes ran out (MOL-50); unset the
> two variables to fall back. The `deploy` workflow is
> gated on the repository variable `DEPLOY_ENABLED=true` and `preview` on
> `PREVIEW_ENABLED=true` (2026-09-19: production went live first, and a
> preview run without `PREVIEW_DATABASE_URL` would fail on every pull
> request), so each stays skipped until its secrets exist.

Drop-in runner replacement. Gates: `oxlint`, `oxfmt --check`, `typecheck`,
`vitest`, `test:integrity`, `cargo fmt/clippy/test`, `astro`-style build of
web, Expo `export` for mobile. Alchemy deploy of `main` behind `--live` in a
protected environment.

---

## Comms

- **Resend** — magic links, streak-at-risk nudges (later, opt-in).
- **Expo push** (`expo-notifications` + `https://exp.host/--/api/v2/push/send`)
  — the same streak-at-risk nudge on the phone. Worker binding
  `EXPO_ACCESS_TOKEN`; without it the nightly push is a dry-run log line,
  exactly like `RESEND_API_KEY`. No push provider SDK on the server: the
  endpoint is one `fetch`.
- **Twilio** — SMS OTP for the South African market later. Not Phase 1.
- **Slack webhooks** — CI, Linear, nightly `content stats` and `audio
  missing` reports.

---

## Issue tracking: Linear

`MOLO-` prefix. Linear MCP for the agent; Slack integration via webhooks.

---

## MCP servers available to the agent

Linear · Sentry · Chrome DevTools / Playwright · Cloudflare docs · Neon ·
Effect patterns · Context7. Prefer these over web search for library and
service APIs.

---

## Rejected outright

- **Duolingo-style LLM-generated lessons at runtime.** Fluent wrong isiXhosa
  reaches learners. Everything generated is `ai_draft` behind a human.
- **Firebase / Supabase.** The operator's centre of gravity is Cloudflare +
  Neon; adding a second platform buys nothing.
- **Hand-rolled spaced repetition.** fsrs-rs exists.
- **Ingesting a copyrighted dictionary.** It is a reference for *editors*,
  not a data source.
- **Building mobile first.** See above.
