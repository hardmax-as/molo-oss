# ARCHITECTURE

Authoritative. If code and this document disagree, one of them is a bug —
find out which before "fixing" the other.

---

## 1. Shape of the system

```text
                 ┌────────────────────────────────────────────────┐
  learner ──────▶│  web (TanStack Start)     mobile (Expo)        │
  editor  ──────▶│  /edit/* dashboard                              │
                 └───────────────┬────────────────────────────────┘
                                 │ HTTPS, Effect Schema at the boundary
                 ┌───────────────▼────────────────────────────────┐
                 │  api (Hono on Workers)   ── Better Auth          │
                 │    learner routes    editor routes    ingest     │
                 └──────┬──────────────┬──────────────┬───────────┘
                        │              │              │
             Hyperdrive │         R2   │       Queues │
                        ▼              ▼              ▼
                 Neon Postgres    audio/images   audio-process · ingest · forvo-backfill
                 (Drizzle)                            │
                                                      ▼
                                          Queue consumer (Workers) → shells to
                                          xh-audio (Rust) / xh-morph (WASM)
```

Three principles:

1. **isiXhosa is the pivot.** There is one body of target-language content.
   Source languages (`en`, `nb`) attach glosses and notes to it. Adding a
   third source language is adding rows, not tables. Adding a second *target*
   language is adding a course over a new lexicon — modelled in §2.6, not
   built, and it changes nothing about isiXhosa's primacy.
2. **Status is the spine.** Every content entity runs the same state machine
   and learners see one state. Everything else — dashboard, CLI, ingest,
   LLM assistance — is a producer of `draft`/`ai_draft` rows or a human
   moving them forward.
3. **Correctness lives in Rust, judgement lives in humans, glue lives in
   TypeScript.** Concord comes from `xh-morph`. Publish comes from an editor.
   Everything between is Hono and Drizzle.

---

## 2. Content model

### 2.1 Status machine (shared by lexemes, sentences, audio, exercises, units)

```text
            ┌──────────┐
  ingest ──▶│  draft   │──┐
            └──────────┘  │
            ┌──────────┐  │        ┌────────────┐  editor/admin   ┌───────────┐
  LLM ─────▶│ ai_draft │──┴───────▶│ in_review  │────────────────▶│ published │──▶ retired
            └──────────┘  editor   └────────────┘   approve        └───────────┘
                          promote        │ reject
                                         ▼
                                       draft (with note)
```

- `ai_draft → published` is not an edge. There is no code path for it.
- `in_review → published` requires `approved_by` (user id with role
  `editor|admin`) and, for lexemes and sentences, a passing **publish gate**
  (§2.5). The transition is one function in `packages/core` and it is the
  only function that sets `published`. `test:integrity` checks that nothing
  else does.
- Learner queries go through repository functions in `packages/db` that
  append `status = 'published'` unconditionally. There is no "include
  drafts" parameter on those functions.

### 2.2 Tables (Drizzle, Postgres)

**Reference**

- `languages` — `code` (`xh`, `en`, `nb`), `name`, `is_source`, `is_target`.
- `courses` — `slug`, `target_lang` (→ `languages.code`), `title_key`,
  `order`, `is_default`, plus the status spine. One row: isiXhosa. §2.6.
- `noun_classes` — the 15 isiXhosa classes plus 1a/2a: `id`, `label`
  (`1`, `1a`, `2`, `2a`, `3` … `15`), `prefix`, `plural_of` (nullable),
  `subject_concord`, `object_concord`, `adjective_concord`, `possessive_concord`,
  `relative_concord`, `notes`. **Seeded from `xh-morph`'s rule tables** so the
  database and the generator can never disagree.
- `speakers` — `id`, `display_name`, `gender`, `region`, `dialect_note`,
  `consent_recorded_at`, `consent_scope` (`internal|published|commercial`).
  **No audio row references a speaker without recorded consent.**

**Lexicon**

- `lexemes` — `id`, `target_lang` (→ `languages.code`; a word belongs to a
  language, §2.6), `lemma`, `stem`, `pos` (noun, verb, adj, adv, ideophone,
  conj, …), `noun_class_id` (nullable, nouns only), `tone_pattern`
  (nullable text — tone is not written; editors fill from audio),
  `register` (`standard|urban|formal|rural`), `cefr_band` (`A1|A2|B1`),
  `frequency_rank` (nullable), `status`, `source`, `source_ref`, `licence`,
  `created_by`, `approved_by`, `approved_at`, timestamps.
- `glosses` — `lexeme_id`, `source_lang`, `gloss`, `usage_note`,
  `contrastive_note`. Unique on `(lexeme_id, source_lang)`. The
  `contrastive_note` is where Norwegian-specific tone hints live.
- `lexeme_links` — `from_id`, `to_id`, `kind` (`synonym|antonym|plural_of|
  derived_from|see_also`). Mirrors isixhosa.click's linked words.
- `sentences` — `id`, `target_lang`, `text_xh`, `grammar_tags` (jsonb: tense, polarity,
  concord pattern, focus), `cefr_band`, `register`, `status`, `source`,
  `source_ref`, `licence`, approval fields.
- `sentence_glosses` — `sentence_id`, `source_lang`, `gloss`, `literal_gloss`
  (word-by-word, for the "why" panel).
- `sentence_lexemes` — `sentence_id`, `lexeme_id`, `position`, `surface_form`
  (the inflected form as it appears; generated by `xh-morph` or entered by an
  editor, never by an LLM).

**Audio**

- `audio_assets` — `id`, `r2_key` (content-hashed), `target_kind`
  (`lexeme|sentence|click_drill|click`), `target_id`, `speaker_id`, `tier`
  (`1_native_studio|2_native_forvo|3_tts`), `duration_ms`, `lufs`,
  `peak_dbfs`, `sha256`, `codec`, `sample_rate`, `licence`, `provenance`
  (jsonb: forvo id, tts model+version, recording session), `status`,
  approval fields.
- One target may have several assets (male/female, regional). The learner
  surface picks `published` tier 1 first, then tier 2. Tier 3 is never
  served to a learner surface; it exists for editors to compare against.

**Curriculum**

- `units` — `id`, `course_id` (not null; §2.6), `slug`, `title_key` (i18n
  key), `order`, `cefr_band`, `status`, `prerequisite_unit_id`.
- `skills` — `unit_id`, `slug`, `order`, `kind` (`vocab|grammar|pronunciation|
  culture`), `status`.
- `lessons` — `skill_id`, `order`, `status`, `estimated_minutes`.
- `exercises` — `id`, `lesson_id`, `order`, `type` (§3), `payload` (jsonb,
  validated by Effect Schema per type), `lexeme_ids[]`, `sentence_ids[]`,
  `audio_asset_ids[]`, `status`. An exercise cannot be `published` unless
  every referenced lexeme, sentence and audio asset is `published` — the
  publish gate walks the graph. Nor may two of its option tiles (listen-select,
  select-listen, match-pairs) share a lemma or a gloss in any source language
  (`option_labels_collide`, `optionCollisions` in `packages/core`); the
  clients also drop such a duplicate and never score it wrong.

**Learners**

- `users` (Better Auth) + `user_roles`.
- `user_prefs` — `source_lang`, `course_id` (the enrolment; null means the
  default course, §2.6), `daily_goal_xp`, `reminder_opt_in`.
- `push_tokens` — one Expo push token per device: `user_id`, unique `token`,
  `platform`, `app_version`, `last_seen_at`, `disabled_at`. See "Push
  reminders" in section 4.
- `review_cards` — `user_id`, `lexeme_id` (or `sentence_id`), FSRS state:
  `stability`, `difficulty`, `due_at`, `last_review_at`, `reps`, `lapses`,
  `state` (`new|learning|review|relearning`). Written only by
  `packages/scheduler`.
- `review_log` — append-only: `card_id`, `rating` (1–4), `elapsed_days`,
  `scheduled_days`, `reviewed_at`. This is what fsrs-rs optimises against
  later.
- `xp_events` — `user_id`, `amount`, `reason`, `ref_kind`, `ref_id`,
  `created_at`. Append-only; levels and totals are derived, never stored as
  a mutable counter that can drift.
- `learner_mistakes` — `user_id`, `lexeme_id`, `exercise_type`,
  `times_wrong`, `last_wrong_at`, `cleared_at`. One row per (learner, word,
  exercise type); the open ones are the "practise mistakes" queue.
- `streaks` — `user_id`, `current`, `longest`, `last_active_date`,
  `freeze_count`.
- `skill_chests` — `user_id`, `skill_id` (unique together), `xp_awarded`,
  `claimed_at`. The end-of-skill reward on the path. The unique constraint
  is the anti-farming mechanism: replaying a lesson cannot pay out twice.
- `leagues` (later) — weekly cohorts, `user_league_membership`.

**Editorial**

- `review_assignments` — one row per item in review: `entity_kind`,
  `entity_id` (unique together), `assigned_to`, `assigned_at`,
  `assigned_by`, `priority`, `notes`. An editor claims an unassigned item or
  releases their own; only an admin moves one between editors. Assignment
  never touches `status` — approving is still a transition.
- `review_queue` — view over `in_review` rows joined to their assignment:
  `assigned_to`, `assigned_at`, `assigned_by`, `priority`, `notes`.
- `content_revisions` — `entity_kind`, `entity_id`, `diff` (jsonb),
  `actor_id`, `created_at`. Every status change and every field edit, and
  every studio note. `entity_kind = 'click'` is a note on a bare click, whose
  `entity_id` is its fixed `CLICK_SOUNDS` id; a click has no row and no status.
- `ingest_runs` — `adapter`, `started_at`, `rows_in`, `rows_created`,
  `rows_skipped`, `licence`, `notes`.

### 2.3 Why `frequency_rank` is nullable and important

Ordering the curriculum by real frequency is what separates a course from a
dictionary dump. isixhosa.click has no ranking; the government corpora have
the wrong register. `molo content rank` sets the column from a blend of the
two corpora we have: the Gothenburg spoken corpus (~21 000 running words of
spontaneous Eastern Cape conversation, CC BY 4.0) weighted nine to one over
the NCHLT written frequency list (~889 000 running words of government prose,
CC BY 2.5 ZA). Because the corpora differ in size by about fifty times, that
weight has a deliberate consequence: **every word attested even once in
conversation outranks every word attested only in government prose.** The rule
and its arithmetic live in `packages/content/src/frequency.ts` as a pure
tested function, and the two weights are the only knob.

A rank is only as good as the matching behind it, so that is conservative too:
a corpus token counts for a lexeme when its surface form *is* the lemma, or
when the corpus's own morpheme segmentation yields a root we derive from the
lemma **and** the corpus's own sense is one of the lexeme's glosses. Nothing is
inferred from a prefix the lexeme's class does not declare. About 1 190 of the
2 110 lexemes earn a rank this way; the rest keep `null`, sort last, and do not
enter Units 1–3.

The curriculum those ranks order is `curriculum/spine.json` and
`curriculum/themes.json` — editor-facing data files, not code, headed as
proposals. `molo content curate` reads them and writes `draft` units, skills,
lessons, exercises and corpus sentences. It cannot publish, it never writes
isiXhosa it did not read from the lexicon or a corpus, and it is idempotent.

### 2.4 Two source languages, one target

- UI strings: `packages/i18n`, `en.json` / `nb.json`, typed keys, react-i18next.
- Content: `glosses.source_lang`, `sentence_glosses.source_lang`. A learner's
  `user_prefs.source_lang` selects which gloss they see. Missing `nb` gloss
  on a `published` lexeme is a **publish-gate failure**, not a fallback to
  English — otherwise the Norwegian product silently rots into an English
  one.
- `contrastive_note` examples: for `nb`, "isiXhosa high/low tone is closer to
  *tonelag* than to stress — think *bønder/bønner*"; for `en`, a stress vs
  tone note. Written by editors; drafted by LLM only as `ai_draft`.

### 2.5 Publish gate (lexeme)

A lexeme may move `in_review → published` only if:

1. `pos` set; if noun, `noun_class_id` set and `xh-morph` can generate its
   plural (or `plural_of` is set).
2. `glosses` exist for **every** `is_source` language.
3. At least one `audio_assets` row with `tier ∈ {1, 2}` and `status =
   published` targets it.
4. `licence` and `source` set.
5. `approved_by` has role `editor|admin` and is not `created_by`
   (four-eyes on content), unless the approver is an `admin`: an admin may
   approve their own row, and the revision records it
   (`ADMIN_SELF_APPROVAL_NOTE` in `packages/core/src/status.ts`). The
   operator's decision of 2026-09-27, for a one-tutor team; the gate's other
   conditions still hold.

Sentences: same, plus every `sentence_lexemes.lexeme_id` is `published` and
every `surface_form` is either `xh-morph`-verified or editor-marked
`irregular` with a note.

Exercises: everything they reference is `published`. Lessons, skills and
units (`containerPublishGate`): every child that was sent on is `published`,
at least one is, and a child still in `draft` or `ai_draft` does not hold the
container back; it stays invisible to learners until approved in its own
right. A child `in_review` holds it back until decided; a retired one never
counts. Decided 2026-09-27, so a unit can go out with the skills that are
ready and grow as the rest is approved.

### 2.6 Courses (structure only — isiXhosa is the only course)

**Decided 2026-09-04.** isiXhosa was assumed everywhere: `languages` had
`is_target`, but units, lexemes and sentences carried no target language and
the learner endpoints returned "the" curriculum. That assumption is now
modelled, so a second target language is a migration and some content rather
than a rewrite. **No second course exists and no isiZulu content was added.**

**A course is a curriculum over a target language.** `courses` carries a
`slug`, a `target_lang` (→ `languages.code`), a `title_key`, an `order`, an
`is_default` flag (at most one row, enforced by a partial unique index), and
the same status spine every content row runs. Exactly one row is seeded by
migration `0012_multi_course`: `xhosa` / `xh`, default, `published`.

Its status is `published` on purpose. A course's status decides whether the
course is *offered*, not whether any isiXhosa has been approved — every unit,
lexeme, sentence and recording inside it still runs its own gate, unchanged.
Seeding it as a draft would have retroactively hidden a curriculum that is
already published, which is not a migration. Nothing in the app creates or
transitions a course: they come from a migration or an operator, which is why
`entity_kind` does not (yet) carry `course`. Building a second course means
adding that value, a branch in the `review_queue` view, and a dashboard path.

#### Where a row belongs, and why

| Row | Belongs to | Because |
|---|---|---|
| `units` (→ skills → lessons → exercises) | a **course** | a unit is a step in a curriculum; the order, the prerequisite chain and the CEFR band are editorial decisions about *this* course |
| `lexemes`, `sentences`, `glosses`, `audio_assets` | a **language** | a word's noun class, its plural and its recording are facts about isiXhosa, not about a syllabus |

**A lexeme belongs to a language, not to a course.** The schema already said
so before this change: `lexemes.noun_class_id` points at `noun_classes`,
which are isiXhosa's classes; `sentence_lexemes.morph_verified` is decided by
`xh-morph`, a *language* generator; an `audio_assets` row is a recording of a
word by a speaker of that language. None of those facts change when the
curriculum around them changes. So `lexemes` and `sentences` carry
`target_lang`, and their natural keys became per language — the same string
can be a word in two languages without being the same word. The consequence
is deliberate: two courses over isiXhosa (a beginner course and, say, a
business course) would **share one lexicon** rather than fork it, which is
the whole point of having a lexicon.

The curriculum *references* the lexicon: an exercise names lexeme ids, and
the publish gate walks that graph exactly as before.

#### The learner: what is global and what is per course

- **Global to the learner: XP, levels, streaks, hearts, leagues, plan.**
  These are facts about a person's habit, not about a syllabus. `xp_events`,
  `streaks`, `hearts`, `entitlements` and the league tables gained no course
  column and must not: a learner who studies two courses has one streak, and
  splitting XP would make the leagues meaningless. Do not "fix" this later
  without re-reading this paragraph.
- **Per course: review cards and mistakes — through the course's language.**
  A card is about a *word*, and a word belongs to a language, so
  `review_cards` and `learner_mistakes` gained no `course_id` either. The
  session is filtered by the enrolled course's `target_lang`
  (`buildSession`, `dueCount`, `mistakesRepo.open`/`openCount`), which gives
  the behaviour that matters — a learner studying isiZulu never sees isiXhosa
  cards — while keeping the schedule for a word intact if a learner ever
  moves between two courses over the same language. Adding `course_id` to
  those tables would have duplicated FSRS state for one word and thrown away
  the learner's history on a switch.
- **The enrolment** is `user_prefs.course_id`. Null means the default course,
  so no learner row needed a backfill and nobody is stranded when a course is
  retired: `coursesRepo.enrolled()` falls back to the default, and only a
  `published` course can be chosen (`assertEnrollable`).

#### The API

- `GET /courses` — published courses plus the caller's `enrolledCourseId`.
- `GET /me` — reports the resolved `course` alongside `prefs.courseId`.
- `PUT /me/prefs` — accepts `courseId`; refuses anything not published.
- Learner reads (`/units`, `/units/:slug`, `/welcome`, `/clicks`, `/units/:slug/crown`,
  `/review/session`, `/me/mistakes`, lesson completion and guest import) all
  resolve the enrolled course first. `learnerRepo.listUnits`,
  `getUnitBySlug` and `unitContentIndex` take the course id as a **required**
  argument, so a caller cannot forget it; completing a lesson outside the
  enrolled course is a 404, not a silent credit.
- Editor: `GET /edit/courses` lists every course at every status,
  `GET /edit/curriculum?courseId=` scopes the tree, `POST /edit/units` takes
  a `courseId` (omitted means the default course), and
  `GET /edit/lexemes?targetLang=` narrows the lexicon grid to a language. The
  dashboard's curriculum page has a course selector defaulting to the default
  course, so it cannot write into the wrong curriculum when a second exists.
- Clients: web Settings and mobile Settings show the course, **disabled**,
  with a "more languages later" note. The picker is there so the plumbing is
  exercised rather than theoretical.

#### The morphology boundary

`crates/xh-morph` is isiXhosa's noun-class generator, and it stays that.
The publish gate no longer calls "the generator" — it asks **which generator
this row's language uses**. `MorphPort` is
`generatorFor(targetLang) → string | null` plus
`canGeneratePlural(targetLang, lemma, class)`, and `morphGeneratorFor` in
`packages/core/src/courses.ts` is the one mapping: `xh → xh-morph`, everything
else `null`.

A language with no generator has **no morphology-dependent publishing**:

- a noun fails the gate with `no_morphology_generator` (not
  `plural_not_generable` — there is no generator to have said no) and can
  publish only on an editor's explicit `plural_of` link;
- a sentence token can never become `morph_verified`, so the sentence
  publishes only when every such token is marked irregular with a note, and
  the gate says `no_morphology_generator` once rather than leaving the editor
  to wonder.

There is deliberately no second generator and the golden files are untouched.
Writing one is a project (a validated lexicon, a tutor, goldens per class),
not a fallback.

---

## 3. Exercises

Payloads are per-type Effect Schemas in `packages/core/exercises/*`. Every
type has a **listen** variant; pronunciation is the product.

| Type | What | Correctness source |
|---|---|---|
| `listen_select` | Hear a word/sentence, pick the gloss (or picture) | audio tier 1/2 |
| `select_listen` | See gloss, pick the audio that says it | audio tier 1/2 |
| `translate_tap` | Assemble the isiXhosa sentence from word tiles | `sentence_lexemes`, distractors from same class/pos |
| `translate_type` | Type the isiXhosa (lenient on tone marks, strict on clicks) | `sentences.text_xh` |
| `concord_fill` | Fill the concord: `aba__ntwana ba__hle` | **`xh-morph`** generates target and distractors |
| `class_sort` | Drag nouns into their class buckets | `noun_classes` |
| `click_drill` | Minimal pairs on c/x/q (+ ch, xh, qh, nc, nx, nq, gc, gx, gq): hear, identify; then record and compare waveform/ASR | dedicated `click_drill` audio sets, tier 1 only |
| `speak` | Record the prompt; ASR + editor-approved reference; pass/hint | ASR is advisory (§6), never blocking |
| `match_pairs` | Word ↔ gloss ↔ audio | lexemes |
| `culture_card` | Short note, no scoring | editor-written |
| `click_identify` | Hear a bare click (no word), pick its letter from a set: A c/x/q, B plain/aspirated, then nasal, voiced, voiced nasal | published tier-1 studio take of every click in the set (`audio_assets.target_kind = 'click'`); gate `click_audio_missing` |

**Distractor policy:** distractors are drawn from `published` lexemes of the
same `pos` and, for nouns, adjacent noun classes — because the pedagogical
target of isiXhosa vocabulary is *class*, not just meaning. No LLM-generated
distractors; a distractor that is not a real word teaches a non-word.

**Click drills are not optional content.** Unit 1 opens with them and every
unit has at least one. They use tier-1 audio only, recorded in minimal-pair
sets by a single speaker per set so the only variable is the click.

---

## 4. Scheduling vs. gamification — who owns what

Two systems, deliberately separated, because Duolingo's known failure mode
is letting engagement mechanics decide what you review.

- **`packages/scheduler` (FSRS via `xh-fsrs`) owns *what* you review and
  *when*.** Every lesson completion and every review writes `review_log`
  and updates `review_cards` through fsrs-rs. The daily session is
  `due_cards ∪ new_cards(limit)`. Nothing in gamification may reorder or
  drop due cards.
- **`packages/gamification` owns *whether you show up*.** XP per correct
  answer (with a combo multiplier that resets on error), daily goal, streak
  with earned freezes, levels as a monotone function of lifetime XP,
  weekly leagues later. It reads `review_log` and `xp_events`; it writes
  `xp_events` and `streaks` only.

Levels (initial curve, tune with data):

```text
level(xp) = floor( sqrt(xp / 50) )         # 50 XP → L1, 200 → L2, 450 → L3 …
XP: correct 10 · perfect lesson +20 · click_drill correct 15 · speak attempt 5
```

A "unit crown" is awarded when every lexeme in the unit has FSRS `state =
review` with `stability ≥ 21 days`. That ties the shiny thing to actual
retention, which is the one place the two systems are allowed to touch.

---

### First-run onboarding

`/welcome` (web and mobile) runs six short, skippable steps: hear a real
published greeting (`GET /welcome` returns "molo" with audio when it is
published, plus the first unit to start), choose the source language, the
daily goal, listening and speaking modes, meet the three basic clicks
(descriptions only, never invented words), and start the first lesson.
Sign-up is offered, never required. Completion is `user_prefs.onboarded_at`
for a signed-in learner and a browser flag for a guest; a guest's choices
are pushed to the server once they sign up.

### Guest funnel

Nobody is asked for an account before the app has shown its value. A
guest gets the landing page, the welcome flow and the first lesson; the
result is kept on the device (`molo.guest`: localStorage on web, AsyncStorage
on mobile). The second lesson, the review tab, the leagues and Plus show the
account wall ("save your progress", with the XP earned), the path marks the
locked lessons, and home carries a banner while guest XP exists. On sign-up
or sign-in the client posts the guest lessons to `POST /me/import-progress`,
which replays each lesson once (XP, streak, review cards) and skips lessons
already credited, then clears the local copy. Sign in with Apple and Google
are offered when the deployment has the credentials (`GET /auth/providers`):
on web through Better Auth's redirect flow; on mobile Apple is the native
sheet (`expo-apple-authentication`) whose identity token goes to
`signIn.social({ idToken })`, and Google opens the Expo plugin's
authorisation proxy in the system browser and returns to `molo://`. The
Apple id-token audience is the app's bundle id, so the API needs
`APPLE_APP_BUNDLE_IDENTIFIER` alongside the client id and secret.

### Registration age gate (MOL-20)

Web and mobile sign-up ask for birth year and country of residence. The shared
`ageEligibility` rule refuses under 13 everywhere and under 18 in South Africa.
In the boundary year a separate confirmation is required that the birthday
has already happened. The input is validated at the API boundary. Birth year and birthday confirmation
are discarded; `users.age_ok` and the validated country choice (`NO`, `ZA`,
`OTHER`) in nullable `users.country` are stored. Older accounts keep a null
country and cannot use web checkout. Existing accounts default to false (not previously
checked), and this change does not block their sign-in.

The Better Auth before hook removes age fields before creating a user or
persisting OAuth state. Only the server-validated boolean and country travel through
`serverContext` during Apple/Google redirects. The user creation hook refuses
new accounts without that proof on every path except Apple and Google: e-mail
sign-up must carry it, and a magic link for an unknown address creates nothing.
The age result and country are server-only and cannot be changed through `update-user`.

**One-tap Apple and Google (2026-09-25).** Current clients send
`requestSignUp: true` on every Apple/Google tap (the providers keep
`disableImplicitSignUp`, so an app build from before this change still gets
"no account" rather than an account it cannot unlock). A new identity gets
its account in that tap. If the request carried the sign-up tab's
declaration, the account is complete, as before. If not, the creation hook
stores it with `age_ok = false`, no country and `users.age_pending = true`
(migration 0023), and:

- `GET /me` says `ageRequired: true`, and `requireAgeConfirmed`
  (`apps/api/src/age-step.ts`, right after the session middleware) answers
  every other API route with 403 `age_required`. Open while pending: `GET /me`,
  `POST /me/age`, `POST /me/apple/authorization-code`, `DELETE /me`,
  `GET /me/export`, `DELETE /me/push-token` (sign-out), `GET /health`,
  `GET /auth/providers`, the webhooks, and all of `/api/auth/*` (sign-out
  included).
- Web and mobile show one blocking screen, "Your birth year and country"
  (the sign-up form's age fields and copy), before anything else, and hold
  back guest-progress import, onboarding sync, push registration and the
  RevenueCat login until it is done. Nothing else is asked: no name or
  e-mail again after Apple. The web keeps the legal pages and
  `/delete-account` readable.
- `POST /me/age` runs the same `ageEligibility` rule. Adult: `age_ok` and the
  validated country are stored, `age_pending` cleared, exactly what e-mail
  sign-up keeps; the birth year and birthday confirmation are discarded.
  Below the minimum age: the account and all its rows are deleted at once
  through `deleteAccount` (the "Delete account" path, Apple revocation
  included), the response
  expires the session cookie, and the client shows the sign-up form's
  under-age message plus "we have deleted the account". A malformed year or
  an unconfirmed boundary year is a 400 and changes nothing. An account that
  is not pending cannot use the endpoint to change an earlier answer.

Accounts created before the age gate keep `age_ok = false` and
`age_pending = false`: they are not asked retroactively.

An account that never answers the step is deleted seven days after it was
created (`AGE_PENDING_RETENTION_DAYS`, stated in the privacy policy): the
nightly cron runs `pruneAgePendingAccounts` first, before leagues and
reminders, and `molo user prune-pending` does the same by hand. Each account
goes through `deleteAccount`, so its Apple grant is revoked too.

### Settings → Account: name, e-mail and password

The first section of Settings on both clients. It shows the signed-in
address and the linked sign-in methods (Connected accounts), and changes:

- **Name** through Better Auth's `/update-user`. A plugin hook
  (`accountNameGuard` in `apps/api/src/auth.ts`) holds it to
  `normaliseAccountName` in `@molo/core`: 1–80 characters after trimming, no
  control or invisible characters, stored trimmed. Leagues show only its first
  word, filtered where they read it.
- **League display name** through `PUT /me/league-profile`
  (`apps/api/src/routes/account.ts`), refused by the same name filter the
  clients check first.
- **E-mail** through `/change-email` (`user.changeEmail.enabled`). The new
  address gets a link; the address changes, verified, only when it is opened,
  and the link lands on the web `/settings?email=changed#account` whichever
  client asked. The current address gets a notice without a link at the same
  time (`apps/api/src/account-email.ts`), in the learner's source language. A
  new address that already has an account is answered like any other and
  mailed nothing.
- **Password** through `/change-password`: the current password is required,
  the new one has at least 10 characters, and "Sign out on other devices"
  (on by default) revokes every other session. An account with no
  `credential` row (Apple or Google only) sees "Set a password" instead, which
  calls `POST /me/password`: Better Auth's server-only `setPassword` behind the
  session, which refuses once a password exists.

### Account deletion and Sign in with Apple revocation

Every deletion — `DELETE /me`, the age step below the minimum age, the
age-pending cleanup — goes through `deleteAccount`
(`apps/api/src/account-deletion.ts`): read the user's `account` rows with
provider `apple`, revoke their tokens at `https://appleid.apple.com/auth/revoke`
(App Store guideline 5.1.1(v)), then `deleteUserAccount`. Revocation never
blocks deletion: each request has a 3-second deadline, failures are the log
line `auth.apple_revoke_failed client=<id> status=<code|timeout|network>`
(never a token), and the rows are deleted regardless.

Apple binds a token to the client that issued it, and each client has its
own client-secret JWT (`sub` = client id):

- **Web redirect flow**: the Services ID (`APPLE_CLIENT_ID`,
  `APPLE_CLIENT_SECRET`). Better Auth stores the refresh token from the code
  exchange on the account row.
- **Native iOS sheet**: the bundle id (`APPLE_APP_BUNDLE_IDENTIFIER`,
  `APPLE_APP_CLIENT_SECRET`). Better Auth's id-token sign-in stores only the
  id token (1.7.2 drops `idToken.refreshToken` when it writes the account),
  so the app posts the sheet's one-time `authorizationCode` to
  `POST /me/apple/authorization-code` right after signing in or connecting
  Apple. The API exchanges it at `/auth/token` with the bundle id's secret and
  stores the refresh token on the caller's Apple account whose `account_id`
  equals the returned id token's `sub`; a code for another Apple ID stores
  nothing. Without `APPLE_APP_CLIENT_SECRET` the endpoint answers
  `{ stored: false, reason: "not_configured" }` and native grants cannot be
  revoked by us (the learner can still stop using Apple ID in iOS Settings).

The row does not record which client issued its refresh token (a web
sign-in followed by a native one leaves a web refresh token next to a native
id token), so revocation sends the token to every configured client at once,
the id token's audience first; one 2xx counts as revoked.

### Rate limiting, the learner's data, streak freezes

- **Rate limiting**: the Workers `ratelimits` bindings (`AUTH_LIMITER`, 20 per
  minute per IP on `/api/auth/*`; `WEBHOOK_LIMITER`, 120 per minute on
  `/webhooks/*`; `REPORT_LIMITER`, 5 per minute **per account** on
  `POST /exercises/:id/report`). Without the binding (some local runs) the
  middleware passes everything through rather than locking anyone out.
  The report limiter is keyed on the learner's id rather than the address,
  because that endpoint needs a session and the thing being protected is an
  editor's queue, not the sign-in form. It refuses with its own code
  (`report_rate_limited`) so the clients can say why instead of showing the
  generic failure; the reasoning behind the number is in
  `apps/api/src/ratelimit.ts`. The binding's `period` may only be 10 or 60
  seconds, so this is a burst cap and not a daily quota: a patient script can
  still drip, and the answer to that is suspending the account.
- **The learner's data**: `GET /me/export` returns everything held about
  the signed-in learner; `DELETE /me` (email repeated as consent) deletes
  the account, revoking a Sign in with Apple grant first (see "Account
  deletion and Sign in with Apple revocation"). Learner rows cascade; editorial rows keep the content and
  lose the person (`created_by`, `approved_by`, `actor_id` set to null).
  Privacy policy and terms live in `packages/brand/legal` and render at
  `/privacy` and `/terms`; both are drafts for legal review.
- **Streak freeze** (Plus): one per ISO week, topped up when the learner
  studies; exactly one missed day is covered and the freeze is spent. Free
  learners never have one.

### Hearts and Molo Plus

Free learners have five hearts; a wrong answer in a lesson costs one, and
hearts return with time or practice. An active `plus` entitlement makes them
unlimited. Entitlements are written only by the RevenueCat webhook or an
admin command; see `docs/MONETISATION.md`.

Inside a lesson the header shows the count and lowers it the moment a wrong
answer is continued past, before `POST /me/hearts/lose` has answered: the
runner keeps a small tally (`HeartsTally` in `packages/core/src/lesson.ts`),
re-anchored on each answer, and `lessonHeartsView` never shows more hearts
than the server last said. The server stays the only place a heart is
actually spent.

### Meeting a new word

`GET /units/:slug` carries, for a signed-in learner, `unseenLexemeIds`: the
lexemes the unit's exercises teach that the learner has not met in a
finished lesson. It is the same history the "new word" badge reads
(`seenLexemeIds`, from `xp_events`), and since `teaches` holds published
lexemes only, the list can name nothing else. A guest gets no list; the
device answers from the lessons it keeps (`newWordsFor`). The field is
optional, so older app builds ignore it. The runner meets each such word on
a card before the first exercise that asks for its meaning
(`newWordIntroductions`); the card is a runner step built from the unit
payload's lexemes, never an exercise row. Lesson completion invalidates the
cached unit on both clients so the next lesson does not meet the same words
again.

### Practise mistakes

Every wrong answer in a lesson files the word it was about in
`learner_mistakes` (learner, lexeme, exercise type, `times_wrong`,
`last_wrong_at`, `cleared_at`). The runner decides which word that is with
`mistakeLexemeId` in `packages/core`: only exercise types with one
unambiguous subject report one, so a misplaced tile in a match-pairs grid
never marks six words wrong. The server keeps only words the lesson
actually teaches. `GET /me/mistakes` serves the open ones — hydrated
exactly like a review session, and joined against `lexemes` so a word that
leaves `published` silently leaves the list. `POST /me/mistakes/practise`
takes one answer: right clears the row, wrong bumps the counter and leaves
it for next time. Practice here is remediation, so it never costs a heart;
a cleared word earns the same XP as any other correct answer. Web runs it
at `/mistakes` and mobile at `review/mistakes`, both on the review
session's own card component. Guests have no server state: the entry is
hidden and the screen shows the account wall.

### Unit prerequisites

`units.prerequisite_unit_id` gates the path. A unit is locked while its
prerequisite is neither completed (every published lesson credited in
`xp_events`) nor crowned; the rule is `lockedUnitIds` in `packages/core`,
pure, and it walks chains so a unit behind a locked unit is locked too. The
learner endpoints carry `locked`, `lessonCount` and the prerequisite's slug
and title key, computed server-side in `apps/api/src/locks.ts`. A guest
gets `locked: false` and the clients apply the same rule to the lessons
kept on the device, counting against `lessonCount`. The lock is not
cosmetic: completing a lesson in a locked unit is refused with 403
`unit_locked`, and a guest's import skips such a lesson rather than failing
the whole import.

### The path

`GET /path` is the learner's whole course in one read: every published unit
with its skills and lesson nodes, plus this learner's state on them — each
node's kind (from `lessonKindOf` over its exercise types), its crown level
(how many times `xp_events` credits that lesson, capped at 5) and whether
the skill's chest has been taken. It carries no exercise payloads, glosses
or audio: those come from `/units/:slug` when a lesson is actually opened.
A guest gets the same curriculum with the state at zero and lays the device
copy over it. `packages/db/src/repositories/path.ts` computes it; the rules
themselves are pure in `packages/core/src/path.ts` so both clients draw the
same node for the same lesson (docs/DESIGN.md, "The path").

`POST /path/chests/:skillId/claim` opens the chest at the end of a skill for
`XP.skillChest`. It refuses a skill that is not published (404) or whose
published lessons are not all finished (403 `chest_not_ready`); a second
claim is answered with `alreadyClaimed: true` and no XP rather than an
error, so a retry is safe. The row in `skill_chests` is written before the
XP, so a crash between them loses a bonus rather than granting two. Guests
claim on the device and `POST /me/import-progress` replays those skill ids
after the lessons, where the same readiness check applies.

### Voices

Every learner-facing audio reference carries its speaker (name, gender,
age group) and a word exposes all of its published voices, ordered by the
learner's preferred voice; the UI plays the first and offers the rest. See
CONTENT.md, "Several voices per word".

### Listening and speaking modes

Two learner preferences (`user_prefs.listening_enabled`, `speaking_enabled`;
localStorage for anonymous learners) decide what a lesson does on a bus or in
a library. `packages/core/src/exercises/modes.ts` is the single rule used by
web and mobile: listening off runs `listen_select` and `select_listen` in a
quiet variant (the isiXhosa is shown, not played) and skips click drills and
`speak`; speaking off skips `speak` and record-only drills. The runner shows
how many exercises it skipped, and a lesson that would be empty explains
why and offers the switch. XP is computed over the exercises actually shown.

### Weekly leagues and reminders (Phase 4)

- **Leagues** live in `packages/gamification/src/leagues.ts`. A league is a
  cohort of up to 20 learners in one of five tiers (bronze → ruby) for one
  ISO week (Monday, UTC). `awardXp` seats the learner in this week's league
  on their first XP; standings are derived from `xp_events`, never stored.
  The nightly cron (and any read of `/leagues/current`) finalises leagues
  whose week is over: top five promote, bottom five demote, bronze never
  demotes, ruby never promotes, zero XP never promotes. Outcomes are written
  once and decide next week's tier.
- **Reminders**: `reminderCandidates` picks opted-in learners with a streak
  who have not earned XP today; the Worker's 17:00 UTC tick emails them
  through Resend, a dry-run log without a key. `molo notify reminders` runs
  the same query by hand.
- **Crons**: one five-minute trigger (`*/5 * * * *`, in
  `apps/api/wrangler.jsonc` and the Alchemy worker), because the Cloudflare
  plan allows five triggers per account and other projects use three.
  `apps/api/src/scheduled.ts` picks the jobs from the tick's time
  (`dueJobs`): every tick asks the audio queue whether recordings wait and,
  if so, dispatches the GitHub audio worker (`audio-worker-kick.ts`, no
  database connection); 17:00 UTC is the nightly job above; Monday 08:00 UTC
  posts the **weekly content report** to Slack: rows by status, publish-gate
  blockers (lexemes without tier-1/2 audio, unvalidated noun classes), the
  unpublished audio queue, and learner activity over seven days — active
  learners, lessons completed, sign-ups, Plus subscribers. Counts only; no
  learner is ever named. The numbers come from `contentReport` in
  `packages/db/src/repositories/report.ts` and the text from
  `formatContentReport` in `packages/core/src/report.ts`, so `molo content
  report` and the cron say exactly the same thing. `postSlack`
  (`apps/api/src/slack.ts`) mirrors `sendEmail`: without `SLACK_WEBHOOK_URL`
  it logs the report instead of posting it.

#### Operational Slack notifications

`#molo-signups` uses `SLACK_SIGNUPS_WEBHOOK_URL`; `#molo-subscriptions` uses
`SLACK_SUBSCRIPTIONS_WEBHOOK_URL`. Both are optional production-only Worker
secrets (Alchemy + deploy workflow); local and preview log only. The weekly
report retains `SLACK_WEBHOOK_URL`. Setup and verification are in
[SLACK.md](SLACK.md); `molo notify slack-test --channel signups|subscriptions`
previews a synthetic message, with `--env prod --live` required to post it.
`molo doctor` reports credential presence only.

`announceCompletedMember` is the shared member notification entry point.
One-tap Apple/Google accounts are announced only after `POST /me/age` wins
its conditional pending-to-confirmed update. For upfront age-approved signup,
Better Auth's creation hook records the ID and `handleAuthRequest` schedules
it after the response is decided. Ordinary sign-ins do not announce again.
The repository rechecks eligibility, reads only the name and saved language
(default `en`), and counts accounts with `age_pending = false`, including
legacy accounts. This count can be reused after deletion or by simultaneous
signups; it is not a persistent member number. Messages use first names only,
never email (including an email used as a provider's name fallback).

The RevenueCat route reads the Plus entitlement's `last_event_id` before
applying the event, suppressing a matching ID. This is deliberately best
effort: billing issues do not update the entitlement, and old or concurrent
retries may post twice. A receipts table is the upgrade path; there is no
schema change. Initial purchase, renewal, cancellation, uncancellation,
expiration, billing issue and product change post; `TEST` stays silent and
sandbox events have a `[sandbox]` prefix. Active Plus counts match the
active/unexpired rule used by `planOf`, including manual and sandbox grants.

Counts and sending run in `executionCtx.waitUntil`, after deciding the
response. Database cleanup waits for background tasks; the response does not.
Slack has a three-second timeout and safe error logging. Delivery is best
effort with no outbox or retry, so Slack outages can lose a notification.
No new cron trigger or daily digest is added.

#### Push reminders

The same nightly candidate list also reaches the phone. `push_tokens` holds
one row per device (`user_id`, unique `token`, `platform`, `app_version`,
`last_seen_at`, `disabled_at`); the mobile app writes it through
`POST /me/push-token` when the learner turns "Push reminders" on in Settings
and refreshes it on every start with a session, and `DELETE /me/push-token`
withdraws it on sign-out. Permission is asked from Settings, behind the
toggle — never at first launch — and a simulator says so instead of failing.

`apps/api/src/push.ts` posts to Expo's push service in batches of 100 and is
a dry run (one log line, nothing sent) unless `EXPO_ACCESS_TOKEN` is set,
mirroring `sendEmail`. Copy comes from `packages/i18n`
(`notifications.streakReminder.*`) in the learner's UI language. Tickets that
come back as `DeviceNotRegistered` set `disabled_at` on that token, so a dead
device is never pushed to again but a reinstall can revive the row. The
payload carries `{ route: "/review" }`; the app maps it through an allowlist,
so a notification can only open a screen the app already knows. The learner's
export lists the devices' metadata and never the tokens, and deleting the
account deletes them.

## 5. Audio pipeline

```text
editor records in browser (MediaRecorder, webm/opus)   ─┐
editor uploads wav/mp3                                  ─┼─▶ POST /edit/audio  → R2 private/incoming/<uuid>
molo audio process <file>  (CLI, local)                 ─┘        │
                                                                   ▼  Queue: audio-process
                                                   consumer: xh-audio (Rust binary)
                                                     decode (symphonia)
                                                     trim leading/trailing silence (−50 dBFS, 80 ms pad)
                                                     normalise to −16 LUFS integrated, peak ≤ −1 dBTP (ebur128)
                                                     resample → 48 kHz (rubato)
                                                     encode → Opus 48 kbps (learner) + keep FLAC master
                                                     manifest.json: duration, lufs, peak, sha256, codec, speaker, tier, licence
                                                                   │
                                                                   ▼
                                           R2 private/processed/<sha256>.{opus,flac,json}
                                           audio_assets row → status in_review
                                           review_queue notified (Slack)
                                                                   │  editor approves in dashboard
                                                                   ▼
                                           copy → R2 public/audio/<sha256>.opus ; status published
```

- **Decided 2026-09-03 (Phase 1):** the `audio-process` queue has no
  Worker consumer. A Bun process (`molo audio worker`, on the operator's
  machine or a VPS) is a Queues *pull consumer*: it pulls messages over the
  Queues REST API, downloads the upload from the private bucket over S3,
  runs the native `xh-audio` binary, uploads `<sha256>.{opus,flac,json}`
  and creates the `audio_assets` row (status `in_review`) through the
  editor API. No shim, no container, no WASM audio. The Worker only
  produces messages. Locally the Worker's R2 is wrangler's simulation and
  MinIO serves the Bun side; the two are bridged by the API, never shared.
- **2026-09-26: the worker runs in the cloud.** Production had no pull
  consumer attached and nobody running the worker, so studio uploads sat in
  the queue. Now `.github/workflows/audio-worker.yml` runs every five minutes
  (GitHub's shortest schedule, often late under load): an idle run is one
  curl against the queue's metrics; when recordings wait it restores or
  builds the `xh-audio` release binary and runs `molo audio worker --once`,
  which drains the queue and exits. One run at a time (concurrency group).
  `molo cf queues --live` (run by the deploy after Alchemy, which cannot
  declare it) attaches the HTTP pull consumer (five attempts, a minute apart,
  then `molo-audio-process-dlq-<stage>`) and sets 14-day retention; it was
  24 hours, so a weekend without a worker lost uploads from the queue (the
  files stay in R2 under `incoming/`). Pulled `json` bodies may arrive
  base64-encoded; the worker decodes both forms. A redelivered message whose
  asset already exists (same upload key) is acknowledged, not processed twice.
  Assets are attributed to the editor who uploaded the take
  (`--as uploader`), so the four-eyes rule keeps a speaker from approving
  their own recordings. The studio and the review queue show "N recordings
  waiting to be processed" from `GET /edit/audio/backlog`, which reads the
  queue binding's realtime `metrics()`; no table.
- Forvo backfill is the same pipeline with `tier = 2` and
  `provenance.forvo_id` set; the consumer is rate-limited to the plan (500
  req/day on non-profit; the plan is a config value, not a constant).
- TTS is the same pipeline with `tier = 3`; never published to learners.

---

## 6. Pronunciation feedback (speak / click_drill)

Honest position: ASR on **learner-accented isiXhosa with clicks** is an
unsolved product problem. Available engines (Meta MMS-1B, Whisper v3, Lelapa
Vulavula STT) are trained on native speech, mostly broadcast or call-centre.
So:

- ASR output is **advisory**. It never blocks progress and never costs XP.
- The learner always hears the reference (tier 1) immediately after their
  attempt, side by side, with a waveform overlay. Self-comparison is the
  primary feedback; ASR is a hint ("we heard *x* where *q* was expected").
- Store attempts (consented) in a private R2 prefix. This becomes the
  dataset for a fine-tuned click classifier later — a far more tractable
  problem than full ASR, and one only this product will have data for.
- Evaluate engines in Phase 5 with a held-out set of editor-labelled learner
  clips. Ship nothing that fails on that set.

---

## 7. Editor dashboard (`/edit/*`)

The moat is here, not in the learner app.

- **Landing page** (`/edit`): what needs doing, not the filing cabinet. Two
  columns — the writing gap (skills whose lessons hold no sentence, named
  with their unit; words missing a gloss in one or both source languages;
  exercises on unpublished content; untranslated sentences) and the
  recording gap (words with no native recording per unit, takes awaiting
  approval, speakers with consent) — plus a third block that aggregates the
  publish gate's own refusal reasons across pending content. Every figure
  links to the view filtered to exactly the rows it counted, which is why
  the grid, the sentence list and the studio keep their filters in the URL
  and why `status=pending`, `missingGloss=all` and `missingGloss=any` exist.
  One round trip: `GET /edit/overview` returns the whole `ContentReport`
  that `molo content report` and the Monday cron already build, extended in
  `packages/db/src/repositories/editor-queue.ts` with the two gaps it did
  not know about. Every predicate there mirrors `publish-gate.ts`, and
  `packages/testkit/integrity/editor-queue.test.ts` holds the aggregate to
  what `publishCheck` answers row by row. `plural_not_generable` is the one
  verdict SQL cannot reach, so the candidate nouns are put to the same
  `MorphPort` the gate uses.
- **Content grid** (`/edit/content`, TanStack Table over Postgres FTS): filter by status,
  band, pos, class, missing-audio, missing-`nb`-gloss, source, licence. Row
  selection (checkboxes, shift-click ranges) drives bulk transitions through
  `POST /edit/lexemes/transition` `{ids, to, note?}`, which loops over the
  same `transitionEntity()` a single row uses — same edges, same four-eyes
  rule, same note requirement, same publish gate, one row at a time — and
  answers with a verdict per id. There is no bulk path through the status
  machine; `ai_draft → published` is refused in a batch exactly as it is per
  row, and the dashboard shows each blocked row's reasons.
- **Curriculum editor** (`/edit/curriculum`): the whole tree at every
  status; inline creation of units, skills and lessons; per-row transitions.
  Exercises get their own editor (`/edit/exercises/:id`): a typed form for
  `listen_select` and `select_listen` (lemma picker, one correct option), a
  JSON editor with per-type templates for the rest, live validation against
  the Effect schema for the type, a panel of referenced lexemes that flags
  anything unpublished, the publish check and the transitions. Deletion is
  allowed only for rows that were never published; everything else is retired.
- **Lexeme editor**: fields above; `xh-morph` live preview of generated
  forms; "generate plural / concord set" button; gloss editors per source
  language side by side.
- **Recorder**: in-browser recording with level meter; batch mode ("record
  these 40 words, one per line"); assigns `speaker_id`; enqueues. The studio
  adds audio QA on the take: `decodeAudioData` into a canvas waveform,
  duration, peak dBFS, a clipping and a too-quiet warning, and two
  keyboard-operable handles that cut the start and the end. A trimmed take is
  uploaded as 16-bit PCM WAV written in the browser (no dependency); an
  untrimmed one is uploaded as recorded. `xh-audio` still trims silence and
  normalises to −16 LUFS server-side and remains the source of truth.
- **Review queue**: diff view against previous revision; approve/reject with
  note; four-eyes enforced; keyboard-driven. `GET /edit/review-queue?filter=
  all|mine|unassigned` and `POST /edit/review-queue/assign` claim, release or
  (admin only) hand over an item; `GET /edit/editors` lists who it can go to.
  Every assignment change is appended to `content_revisions`.
- **Sentence builder** (`/edit/sentences`): the isiXhosa text is stored
  exactly as the editor typed it; the token list is picked from the lexicon
  and each token's surface form defaults to the lemma. `xh-morph` never
  fills or corrects a form: on every save and read it reports each token as
  `verified` (the lemma, or the class plural of a tutor-validated class),
  `unverified` (nothing to compare against, or the class is not validated
  yet) or `mismatch` (differs from the generated plural). `morph_verified`
  is computed server-side from that verdict and never accepted from a
  client. An unverified form publishes only when the editor marks it
  irregular with a note. Glosses per source language, with a word-by-word
  literal gloss.
- **Bulk import** (admin): CSV → `draft` rows with a dry-run report first.
- **LLM assist** (editor-only): `POST /edit/lexemes/:id/assist` drafts the
  en/nb gloss, usage note and contrastive note (Norwegian leaning on tonelag)
  from the source gloss. Saved as `ai_draft`, only for languages with no
  human gloss; suggestions for the rest are shown, never written. The model
  is instructed never to write isiXhosa, and example-sentence drafting is
  deliberately left out until the tutor loop exists. Inert without
  `ANTHROPIC_API_KEY`; `?dryRun=1` returns the exact request. Always visibly
  badged as AI in the queue. The prompt and the call live in
  `packages/content/src/assist.ts` so that `molo content gloss` runs the same
  request in bulk rather than a second copy of it; the endpoint imports it
  through the `@molo/content/assist` subpath, which keeps the corpus adapters
  out of the Worker's type graph.

Roles: `editor` can do everything above except bulk import, speaker consent
records and user administration; `admin` can. Better Auth roles checked in
Hono middleware **and** in `packages/db` repository functions for write paths.

---

### Review from mobile

The mobile Review tab is visible only to editor/admin roles and uses the same
`GET /edit/review-queue?filter=all`, `GET /edit/lexemes/:id` and
`POST /edit/transition` as the dashboard, limited to lexemes and glosses.
Queue rows include their parent `lexemeId`; gloss detail includes origin from
the latest recorded upsert and its revision notes. Missing origin is explicit,
never inferred from `in_review`. These are additions to existing editor-only
responses, with no new routes or status write paths. Editorial queries are
session-scoped, removed on sign-out, never persisted, and unavailable offline.


## Mobile releases

The store binary uses `expo-updates` with runtime policy `appVersion`. Version
1.0.0 must be built with this configuration before it can receive updates.
Preview and production builds use the corresponding EAS channels; development
and simulator builds have no channel. Launch checks for updates with a zero
cache fallback timeout, so a slow network does not delay the cached app.

JavaScript, styles, translations and bundled assets can go OTA when compatible
with the installed native runtime. Native modules, config plugins, entitlements,
permissions or native project changes need a new store build and an app-version
bump. `mobile-ota.yml` watches `apps/mobile`, `packages/core`, `packages/i18n`,
`packages/sfx`, the root package/lockfile and shared TypeScript configuration.
Tests, docs and Maestro are excluded; database, content-ingestion, API and other
server-only packages are not in its path list.

On main, the workflow fingerprints HEAD and the latest `mobile/v*` tag in a
separate worktree. Equal or unknown fingerprints pass the operator's policy.
Different hashes are inspected with `fingerprint:diff`: only `bareNativeDir`,
`rncoreAutolinkingAndroid/Ios`, `expoAutolinkingIos/Android`, or
`expoConfigPlugins` reasons block production. Generation or classification
errors fail closed. Preview is always attempted; automatic production OTA only
follows a green gate. A blocked gate records both hashes and asks the operator
to run **Mobile Release Build**. A PR touching mobile compares base and head,
updating one bot comment when the fingerprint changes. Fork PRs run the read-only
check but cannot post a comment with the restricted fork token.

**Mobile Release Build** validates the requested version against `app.json`,
refuses an existing tag and defaults to dry-run. A live production run waits for
the requested EAS builds to finish, optionally submits them, then creates
`mobile/v<version>` and a GitHub release listing commits since the previous tag.
Preview builds are internal distributions and cannot be auto-submitted. Node 22
is installed before Bun 1.4.2 on the configured CI runner. The EAS robot must be
a Developer, Admin or Owner on `hardmax`; a Viewer is refused before publishing
or building. These workflows use `EXPO_CI_TOKEN`, the dedicated GitHub CI/CD
robot whose Developer role the operator verified with `eas whoami`. The Viewer
`EXPO_ACCESS_TOKEN` push robot remains on deploy.yml; it is not used for releases.

**Mobile Production OTA** manually republishes the checked-out source with a
message and the same gate. Its explicit `force` input is an operator override,
not the automatic path. For rollback, inspect `eas update:republish --help` and
republish a previously working production update group with the matching runtime;
do not change runtime versions to force incompatible native code onto a binary.
Publishing helpers are dry-run without `--live`; no local validation publishes.
OTA source maps go to Sentry EU (`malmo-development/molo-mobile`); a failed upload
adds a warning to the step summary without failing the successful update. There
are no Slack notifications until MOL-30.

## 8. The `molo` CLI

TypeScript (Bun), Effect for the multi-step commands. Dry-run default,
`--live`, `--json`. Subcommands listed in the project rules. Design rules:

- Every command that mutates prints the plan first, then applies only with
  `--live`.
- `molo db query` is read-only unless `--live`; production requires
  `--env prod --live` and prints a red banner.
- Rust binaries are located via `MOLO_BIN_DIR` or built on demand with
  `cargo build --release`.
- `molo doctor --json` is the first thing an agent runs in a fresh session.

### Debugging production

Every command here is read-only; none needs `--live`. They read the root
`.env` (`bun --env-file=.env packages/cli/src/main.ts …` from a worktree).

- `molo logs api --env prod --since 6h --grep /api/auth/` answers "what did
  this request do": one line per request (time, status, method, path, wall
  time) with its console lines indented beneath. `--status 5xx` and
  `--level error` find the failures; `--json` gives the same projection.
  It queries Workers Logs through the observability API
  (the library notes), which keeps
  seven days; `molo cf tail` is the live stream. Query strings are stripped
  and headers, IPs and geo are never printed.
- `molo sentry issues --project molo-api` and `molo sentry issue <shortId>`
  read Sentry in the EU region. They need `SENTRY_READ_TOKEN` (an internal
  integration token with `org:read`, `project:read`, `event:read`); the
  deploy's `SENTRY_AUTH_TOKEN` is `org:ci` and gets a 403 that says so.
- `molo db activity --env prod` shows connections, their state, waits and
  the running query with literals masked; `molo db slow --env prod` ranks
  statements from `pg_stat_statements`. On 2026-09-25 that extension was
  available but not installed on the PlanetScale branch, so `slow` says so;
  installing it is a schema change for a person to make.

---

## 9. Environments

`local` (Docker: Postgres, MinIO, Mailpit) · `preview` (per-PR Workers via
Alchemy; all previews share one preview database until PlanetScale branching
is wired) · `prod`.

What `prod` is, as provisioned on 2026-09-19 (identifiers only; every value
lives in the root `.env` and in the repository's GitHub secrets, never here):

| Piece | Where | Notes |
|---|---|---|
| Domain | Cloudflare Registrar, zone `hellomolo.com`, account **Hardmax AS** | DNS is on Cloudflare; the API token `molo-deploy` is this project's alone |
| API | Worker `molo-api-prod` at `https://api.hellomolo.com`, placed in `aws:eu-west-2` | `url: false`: the workers.dev hostname is off so Better Auth has one origin. Region placement puts the Worker beside the database so a request's two to four round-trips are intra-region; the learner pays the long hop once (MOL-25). The web Worker stays at the edge |
| Web | Worker `molo-web-prod` at `https://hellomolo.com` (TanStack Start server entry + client assets) | `www.` is bound too and `apps/web/src/start.ts` answers it with a 301, because CORS and the auth cookies know one origin. One Alchemy run deploys api and web: Alchemy destroys what a run does not declare |
| Database | PlanetScale Postgres `hardmax-as/molo`, branch `main`, `aws-eu-west-2` (London), single node PS-5 | Closest region to Cape Town on offer; no African region exists. Role `molo-api` runs migrations too, so it carries the `postgres` privilege for now. Reached from the Worker through Hyperdrive `molo-db-prod` / `molo-db-cached-prod`. The deploy applies pending migrations before Alchemy ships the code (`molo db migrate --env prod --live`), and only additive ones: a migration that drops, retypes, renames or truncates stops the deploy until a person applies it with `--allow-destructive` |
| Storage, queues | R2 `molo-public-prod`, `molo-private-prod`; Queues `molo-audio-process-prod`, `molo-ingest-prod`, `molo-forvo-backfill-prod` | Created and owned by `infra/alchemy.run.ts` |
| Errors | Sentry org `malmo-development`, projects `molo-api` (Workers), `molo-web` (TanStack Start), `molo-mobile` (React Native), EU ingest | DSNs: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` |
| Email | Resend, domain `hellomolo.com` verified, region `eu-west-1` | DKIM, return-path CNAMEs and DMARC are in the zone; the key is send-only |

Alchemy's state is on Cloudflare, in the Worker `molo-alchemy-state` (a
SQLite Durable Object, `CloudflareStateStore`), keyed by `ALCHEMY_STATE_TOKEN`
and encrypted with `ALCHEMY_PASSWORD`. A laptop and a CI runner therefore see
the same state; the local `.alchemy/` holds only bundler output. Alchemy
refuses to run in CI on the local store, and it is right to: an empty state
plus `adopt: true` can create and update, but never notice a resource that
should go. The account's other `alchemy-state-*` Workers belong to other
projects and their tokens; Molo does not share them.

---

## 10. Offline and caching

Published units, their audio (Opus) and the learner's `review_cards` are
cached in op-sqlite. FSRS runs on-device via `xh-fsrs` WASM. `review_log`
and `xp_events` are append-only, so sync is a merge, not a conflict. That
is the property a sync engine (Zero/PowerSync) will later exploit — do not
introduce mutable counters that break it.

The device is the innermost of five caching layers. The other four, what each
one may hold, and the rule that published content is cached by a version in
the key rather than purged, are in [`CACHING.md`](CACHING.md). The short
version: published content is identical for every learner and belongs at the
edge; learner state never leaves the database and the device. That document
also records why the expected South African audience — tourists on a two or
three week trip, often with no signal — makes offline matter more than the
database's region.

In front of the device sits each app's query cache, and the rule that a
learner never waits on a screen (CACHING.md section 2.0): content is drawn
from memory or from the device's copy while the network answers, the home
screen prefetches the unit that holds the next lesson and the review
session, a lesson's next clips are fetched before they play, and any change
in the learner's XP marks the content that carries their state (locks,
crowns, badges) stale. The web prefetches in the browser only, never while
the server renders, because learner reads need the session cookie.

### League privacy (MOL-21)

`user.display_name` is optional; league responses resolve it to the first word
of the account name when unset. They never return the account surname.
`user.leagues_opt_out` defaults to false. Settings on web and mobile write
`PUT /me/league-profile` (Effect-validated, 1–40 characters or null, no control
characters) and `/me` returns the profile. Opting out removes this week's
membership immediately, retains XP and finalized history, and excludes the
learner from standings and future assignment. Opting back in takes effect on
the next XP award. Profile changes and assignment both lock the user row in
a transaction so simultaneous XP cannot undo an opt-out.

### Reporting and hiding league names (Apple 1.2)

League names are the one piece of user-generated content another learner
sees, so there is a floor and two tools. The floor is `nameAllowed` in
`packages/core/src/name-filter.ts`: a short English and Norwegian denylist plus
names that would pass for staff. `PUT /me/league-profile` refuses a display
name it rejects (both clients check first and say why), and standings return
`name: null` for any name it rejects, including the first-name fallback. The
tools are `POST /leagues/report` and `POST /leagues/hide` (and
`DELETE /leagues/hide/:userId`), each accepting only a member of the caller's
own league this week. `league_hides` makes a name `null` for that viewer only;
`league_reports` holds one report per pair with the name as the reporter saw
it, hides it for the reporter, and posts a counts-only alert to Slack. While
three or more open reports stand against someone their name is `null` for
everyone. Ranks never change: a held name is a row without a name. Both
tables cascade with either account. Resolving a report is operator work
(`docs/STORE-REVIEW-CHECKLIST.md`, "Moderating league names").
