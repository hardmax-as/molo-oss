# CACHING — what we cache, where, and how it is invalidated

Molo's learners are in two places with very different networks: Norway, on
fast connections a few tens of milliseconds from a European database, and
South Africa, where the expected majority are **tourists on a two or three
week trip** — roaming or a local SIM, expensive data, and long stretches with
no signal at all in the Kruger, the Karoo or on the road.

That second group changes the design. Latency to the database is not their
problem; connectivity and data cost are. A lesson they cannot open in a game
reserve is worse than a lesson that takes 300 ms to open in Cape Town.

This document is the plan. Sections marked **built** describe what exists;
sections marked **planned** do not exist yet and are tracked in
[`NEXT.md`](NEXT.md).

---

## 1. The shape of the problem

Every read the app makes is one of two kinds, and they want opposite things.

| | Published content | Learner state |
|---|---|---|
| Examples | units, lessons, exercises, words, glosses, audio | experience points, streak, hearts, review cards, mistakes |
| Same for everyone? | **yes** | no, it is one person's |
| Changes how often? | when an editor publishes, so rarely | constantly |
| Safe at the edge? | **yes** | no |
| Share of reads | most of them | the rest |

Published content is the bulk of what a learner downloads and almost never
changes. It belongs in a cache near the learner. Learner state is small,
personal and changes on every answer; it belongs in the database, and the
round trip to Europe is acceptable because it happens once per answer and the
interface does not wait on it to feel responsive.

The database region question follows from that table rather than the other way
round. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for where the database lives
and why.

---

## 2. The layers

Five, from the learner outwards, and in front of them the screen's own memory.

### 2.0 The screen: memory, prefetch and warm audio — built 2026-09-28

The goal is that a learner never waits on a screen. Three things get there,
and a skeleton covers the rare case none of them has.

- **What is already known is drawn at once.** Both apps keep content in the
  TanStack Query cache: a unit, the unit list and the path stay fresh for
  five minutes and in memory for thirty (`query-client.ts` on each platform),
  so going back and forth is drawn from memory. On the phone, a unit opened
  before and the unit list are also drawn from the device's copy (2.1) while
  the network answers, and the unit list falls back to that copy offline, so
  a learner in airplane mode still sees the path and their downloaded units.
- **What comes next is fetched before the tap.** The home screen fetches the
  unit that holds the next lesson (`nextLessonOf`, `nextLessonInPath` and
  `nextUnitForGuest` in `packages/core/src/prefetch.ts`) and, signed in, the
  review session; the web unit page fetches the unit payload every lesson on
  it opens from. On the web, the learner routes' loaders prefetch their data
  on hover or touch (`defaultPreload: "intent"`), in the browser only: the
  server renders no learner data, and a loader that fetched there would ask
  without the session cookie. Never the whole course: one unit, one session.
- **The next clips are fetched before they play.** When a lesson opens, the
  recordings of its first three exercises are warmed (`lessonAudioUrls`). On
  the web that is a low-priority request shaped like the `<audio>` element's
  own, which lands in the browser's cache and the service worker's. On the
  phone it is a file in the app's cache directory, fetched under a temporary
  name and renamed only when whole, which `AudioButton` plays when present;
  on Wi-Fi or Ethernet the rest of the unit's clips follow (expo-network
  reports no "metered" flag, so cellular and unknown count as metered).

Three rules keep this honest.

- **Stale progress is worse than a skeleton.** Units, the unit list and the
  path carry the learner's own state (locks, crowns, "new word" and "tricky"),
  so whenever the learner's XP changes they are marked stale and fetched
  again behind the copy on screen, and when the signed-in account changes
  they are fetched again at once (`watchLearnerState`). A review session
  being worked through is never replaced under the learner: a prefetch skips
  it while a review screen holds it, and leaving after a rating drops it.
- **Warm is not downloaded.** The warm cache never writes the downloads
  index, so no unit is marked "Downloaded" or claimed to work offline because
  some of its clips happen to be warm; the OS may empty that directory, and a
  clip that vanished is fetched as it would have been anyway.
- **Only what a learner endpoint served is cached,** so published-only holds
  for every copy here exactly as it does for the API.

### 2.1 The device (mobile) — built

The mobile app keeps finished lesson content in an encrypted SQLite database
(`op-sqlite` with SQLCipher). A lesson opened once can be opened again with no
network at all.

**"Download this unit" — built 2026-09-05.** A unit's page offers to take it
offline: it shows what the recordings will cost before a byte is spent, then
fetches every exercise *and every audio file*, counting real files as they
land, and can be stopped at any point. The unit list marks which units are
downloaded, and settings says how many and how much of the phone they use.

**A Molo Plus perk, in one pill — 2026-09-28.** Starting a download is one of
the Plus perks (`docs/MONETISATION.md`). On the unit screen the control is a
single pill at the end of the header line, beside the crown count, instead of
the card that used to push the path a third of the way down the screen
(`apps/mobile/src/components/UnitDownload.tsx`):

| Pill | Who sees it | A tap |
|---|---|---|
| "Offline · Plus" | free plan, nothing on the phone, nothing running | opens `/plus` |
| "Download" | Plus | the sheet: the size estimate and Download |
| "Download failed" | Plus, after a stop that was not a cancel | the sheet: why, and Try again |
| a ring and "42%" | anyone with a download running | the sheet: the count, the bytes, Cancel |
| "Ready offline" | anyone with the unit on the phone | the sheet: the size on the phone, Remove |

The plan only decides whether a *new* download may start. A unit already on
the phone, or a download already running, stays usable and removable whatever
the plan — a lapsed subscription, or a download from before the perk was
gated, never takes away what is there (`offlineStateOf`, covered by
`UnitDownload.spec.tsx`). The detail is the native sheet (`ui/Sheet.tsx`),
with its own Close button for anyone who cannot swipe; where `ExpoUI` is not
linked it expands inline under the line instead.

- **A partial download never claims to be offline.** The row that says a unit
  works with no signal is written once, at the end. Every other ending —
  cancelled, out of space, the connection lost, a recording that 404s —
  deletes what was written and leaves the unit exactly as it was, and says
  which of those happened. Half a unit in a game reserve is a promise broken
  at the worst possible moment.
- **Recordings are shared and content-addressed.** They are stored under the
  file's own SHA-256, which is what section 2.3 made the URL, so two units
  that teach the same word keep one copy, a word already on the device costs
  nothing to download again, and removing a unit deletes only what no other
  unit still needs.
- **A downloaded recording is played from the device even when online.** The
  audience this is for pays roaming rates; a word they have already paid for
  should not be paid for twice. A recording an editor replaces has a
  different URL, is not on the device, and comes from the network by itself —
  so there is no staleness check to get wrong.
- The state machine is `apps/mobile/src/lib/download-logic.ts`, pure and
  ports-injected, with `download-logic.spec.ts` covering every way it can
  stop half way. The filesystem and the index are behind it in
  `download-ports.ts` and `downloads.ts`.

### 2.2 The device (web) — built 2026-09-05

`apps/web/public/sw.js` holds the shell, the current unit and its audio, so a
browser learner gets the same protection as the mobile one. It is deliberately
the smallest thing that does that, and it is conservative in four ways.

- **Learner state is never cached, online or off.** `/me`, progress, hearts,
  reviews, mistakes, leagues. The list of API paths it may keep is closed —
  `/units`, `/units/:slug`, `/path` — and everything else falls through
  untouched. A stale streak is worse than a spinner, because the learner
  believes it.
- **No editor route is ever cached**, on either origin.
- **Published content and the shell are network-first.** The cached copy is
  reached only when the network actually fails, which is the one moment a
  learner prefers yesterday's lesson to an error. Recordings are the exception
  and are cache-first, because `GET /audio/<sha256>` is immutable by
  construction (2.3) — that is the single biggest saving for a learner on
  South African mobile data.
- **A deploy cannot strand anyone.** The worker takes over as soon as it
  installs, sweeps every cache that is not its version's, and never pins an
  HTML document while the network is up. Signed private audio (`?b=private`)
  and anything that is not a `GET` are passed straight through.

It registers in production builds only: a worker caching `vite dev`'s HTML and
modules would fight the dev server for no benefit. Its routing rules are
asserted in `apps/web/src/lib/sw-policy.test.ts`, which evaluates the shipped
file rather than a TypeScript source that resembles it.

Two things it deliberately does not do. It does not reload a tab when a new
worker takes over — that would throw away a lesson in progress, and
network-first navigation already gets the new bundle at the next navigation.
And its cache version is a constant in the file rather than something a build
derives, so bumping it is a manual edit; nothing depends on that being
automatic, because no cached entry can be wrong, only redundant.

### 2.3 The browser and the Cloudflare edge

Two different things share one mechanism: an HTTP response with a
`cache-control` header. Cloudflare has three data centres in South Africa
(Johannesburg, Cape Town, Durban), so a cacheable response is served from the
same country rather than from Europe.

**Audio — fixed 2026-09-05.** It used to be served with an HMAC signature that
expired after an hour, and the signature sits in the URL, so **the URL changed
every hour and a changed URL is a cache miss at every layer**. A learner who
studied daily re-downloaded the same recordings forever, on the most expensive
data of any audience we have, and audio is the heaviest thing we ship.

The signature was protecting nothing there. An object only reaches the public
bucket when its asset is published, and the key is the file's own SHA-256, so
the bytes at a key can never change.

- `GET /audio/<key>` is the published bucket: no signature, and
  `cache-control: public, max-age=31536000, immutable`.
- `?b=private` is unchanged: signed, expiring, and an editorial session on top,
  which is where the protection was always doing the work.

A word is now fetched from Europe once per edge location, ever, and from the
device's own cache after that.

**Published API responses — built 2026-09-05.** `GET /units`,
`GET /units/:slug` (which carries the lesson payloads) and `GET /path` now
carry `cache-control: public, max-age=60` and a `vary: cookie`, plus an
`x-molo-content-version` header naming the version they were built at.
Everything else the API answers carries `private, no-store`, and it does so by
default rather than by being remembered: a middleware sets it on any response
that did not set a `cache-control` of its own, so a new route is uncacheable
until somebody deliberately makes it otherwise.

**One correction.** This page said those three responses are identical for
every learner in a course and language. They are not. Each carries the
caller's own state: which units their progress has unlocked, and the "new
word" and "tricky" badges computed from what they have seen and got wrong. So
they are shared **only for a request with no session**, where they are pure
content by construction. A signed-in learner gets `private, no-store` and a
database read, with Hyperdrive's cached read path (2.5) shortening the query
half. Sharing an assembled response between two learners to save a query would
be a privacy bug, and no latency is worth one.

Making the signed-in case cacheable too is possible and not done: it would
mean splitting each endpoint into a content document and a learner overlay,
so the document could be cached and the overlay applied per request. That is
a real refactor of `unitLocks` and `pathRepo.overview`, and it should be paid
for by a measurement rather than by this paragraph.

### 2.4 The Worker's cache — built 2026-09-05

For responses the browser should not cache but the edge should, the Worker
keeps its own copy under a key it controls. This is where the published
content payloads belong: cached per edge location, so the first learner in
Johannesburg pays the round trip and the next fifty do not.

`apps/api/src/content-cache.ts` holds all of it: the version, the key, the
decision about what may be shared, and the wrapper the three routes call. The
Cache API's key is a synthetic URL on the Worker's own origin —
`/__content/<route>?v=…&course=…&lang=…` — because Cloudflare refuses a key
from a hostname the zone does not own, and `/__content/` is not a route.

The entry is *stored* with a long `max-age` and *returned* with a short one.
That looks inconsistent and is the point: the stored copy names its version in
its key, so it can never be stale, only orphaned, and storing it for a minute
would throw it away every minute and put the database back on the path. The
browser cannot see the version, so it is told sixty seconds, which is the
promise below.

### 2.5 Hyperdrive — built 2026-09-05

Hyperdrive already sits in front of the database and pools connections. That
alone removes several round trips of TLS and authentication per request, which
on a Cape Town to Frankfurt path is worth more than it sounds.

Its query cache is now on for the read path, and this page had two things
wrong about it.

**It was already on.** Hyperdrive's query caching defaults to *enabled*, at
`max_age` 60 and `stale_while_revalidate` 15. Omitting the option does not mean
"no cache"; it means "the default cache". Our one Hyperdrive configuration had
therefore been caching every read it judged non-mutating — including Better
Auth's session lookups and a learner's own XP — since the day it was created,
which is exactly what section 3 says must never happen. Hyperdrive does not
invalidate on a write; the cache is purely TTL. A learner could finish a lesson
and read back their score from before it.

**So it needs two configurations, not one option.** Cloudflare's own guidance
for an application with both kinds of read is two Hyperdrive configurations
over the same origin, bound side by side, with the application choosing:

- `HYPERDRIVE` — `caching: { disabled: true }`. The default for everything:
  auth, sessions, roles, learner state, every write.
- `HYPERDRIVE_CACHED` — `caching: { max_age: 60, stale_while_revalidate: 15 }`.
  Published content reads and nothing else.

Sixty seconds is deliberately the same number the Worker holds the content
version for, so the two layers go stale together rather than one after the
other, and the promise in section 3 stays one minute rather than two.

This does not replace the Worker cache, because Hyperdrive caches a *query
result*, not an assembled response: it saves the database round trip but not
the hydration, the encoding or the JSON. The two compose — the Worker cache
serves the whole payload when it has it, and Hyperdrive shortens the miss.

---

## 3. Invalidation, which is where caching designs die

We do not purge. Purging is a distributed system pretending to be a variable,
and it fails quietly. Instead, **the cache key carries a content version**, so
publishing something makes every old key unreachable rather than wrong.

- The editor repository already writes a `content_revisions` row on every
  status transition, for the audit trail.
- **Two corrections to what this page used to say about that table.** Its
  `id` is a random UUID, not a sequence: "the highest id" is not a number and
  does not increase. What does increase is the row count — the table is
  append-only, and the one update it ever takes (blanking `actor_id` when an
  account is deleted) touches neither the count nor `created_at`. The version
  is therefore the **count paired with the newest `created_at`**, the pair
  rather than either alone because a restored backup could move one without
  the other. And it moves on any edit, not only on a publish: a draft edit
  writes a revision too. That over-approximates — the version can change when
  nothing a learner sees has changed — which is the safe direction: a wasted
  cache fill, never a stale lesson.
- The Worker reads that pair and holds it for **sixty seconds**, per isolate.
  Every published-content cache key includes it, alongside the course and the
  interface language: `/__content/<route>?v=<version>&course=<id>&lang=<code>`.
- When an editor publishes, the version moves, the keys change, and the old
  entries are simply never asked for again. They expire on their own.
- Enforced by `apps/api/src/content-cache.test.ts` (what the key separates,
  and what may never be cached), `packages/testkit/integrity/content-version.test.ts`
  (a publish moves the version, against a real database) and
  `apps/web/e2e/tests/caching.spec.ts` (the headers a browser actually sees).

- **The web build itself** is not versioned by content: every build carries
  one id (`molo-build-` and the release SHA on a deploy), baked into the bundle and written to
  `/build.json`. Editor pages fetch that file with `cache: "no-store"` every
  five minutes and on focus, and offer a refresh when it names another build
  (`apps/web/src/lib/build-version.ts`). The service worker never caches it:
  `.json` is not a static asset in `public/sw.js`, so the request passes
  straight through.

The trade is explicit: **an editor's change reaches learners within a minute,
not instantly.** That is the right way round. Editors accept a minute; a
learner in Cape Town should not pay a European round trip for a word list that
has not changed since March.

Learner state is never cached at the edge. Not by the Worker, not by the
browser, not by Hyperdrive. It carries `private, no-store`, and the only copy
outside the database is the learner's own device.

---

## 4. What each audience gets from this

**A tourist in South Africa.** Downloads a unit on hotel wifi, including its
audio, and studies it with no signal. When they are online, lesson content and
audio come from Johannesburg or Cape Town rather than Frankfurt, and each
recording is fetched once rather than hourly. Their own progress goes to
Europe, once per answer, and the interface does not wait for it.

**A learner in Norway.** Loses nothing. The same content comes from a European
edge instead of a European database, which is marginally faster, and their
progress writes are unchanged.

**An editor.** Sees their own drafts immediately, because editor endpoints are
never cached. A publish reaches learners within a minute.

---

## 5. What this is not

- **Not a reason to move the database.** If South Africa ever becomes the
  paying market rather than the travelling one, the answer is a Postgres in
  Cape Town or Johannesburg, either as the primary or as a subscriber to the
  European one over logical replication. That is a decision to make on
  evidence, and the code is provider-agnostic so it stays cheap to make later.
- **Not a reason to use an edge database.** Cloudflare D1's read replicas do
  not cover Africa and its primary's location is not ours to choose, so it
  would not shorten a South African learner's path to their own data. It would
  also cost a schema port and a weaker transaction story on the publish gate,
  which is the mechanism the whole content model rests on.
- **Not a substitute for offline.** A cache helps a learner with a slow
  connection. Only the device helps a learner with none.

---

## 6. The work, in order

1. ~~Stable, unsigned URLs and immutable caching for public audio.~~ Done
   2026-09-05.
2. ~~Hyperdrive query caching on the read path. Configuration only.~~ Done
   2026-09-05, and it turned out to be two configurations rather than one
   option: see section 2.5.
3. ~~Content version in the Worker cache key, and `cache-control` on the
   published content endpoints.~~ Done 2026-09-05, for requests with no
   session; a signed-in learner's copy carries their own state and is not
   shared. See section 2.3.
4. ~~"Download this unit" on mobile, audio included.~~ Done 2026-09-05. See
   section 2.1.
5. ~~A service worker for the web app.~~ Done 2026-09-05. See section 2.2.
6. ~~Screens that never wait: memory, prefetch, warm audio.~~ Done
   2026-09-28. See section 2.0.

Everything on this list is built. What is deliberately left: the published
content cache in section 2.4 covers requests with no session only, and
extending it to a signed-in learner needs each endpoint split into a content
document and a learner overlay. That should be paid for by a measurement.
