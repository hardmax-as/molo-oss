# Molo look and feel

One product on two screens. Web and mobile share this spec, the sound set
in `packages/sfx`, and the same names for every moment. Read it before
touching a learner-facing screen.

## Mood

Warm, bright, tactile. Molo means "hello": the app should feel like a
friendly greeting, not a test. Eastern Cape light: ochre and sun-yellow
against deep indigo, with a sea-green accent. Big rounded shapes, generous
spacing, one playful display face for headings and a calm body face.

| Token | Value | Use |
|---|---|---|
| `sun` | `#F6B73C` | XP, streak flame, primary buttons |
| `ochre` | `#D9772B` | pressed states, warm accents |
| `indigo` | `#26264F` | headings, dark surfaces, the night sky behind celebrations |
| `sea` | `#1FA38C` | correct, progress, "published" |
| `coral` | `#E85D5D` | wrong (soft, never alarming), streak at risk |
| `sand` | `#FFF7E8` | page background |
| `cloud` | `#FFFFFF` | cards |
| `ink` | `#1E1E2A` | body text |
| `mist` | `#66667F` | secondary text (5.2:1 on sand; the lighter `#8A8AA3` is for icons and dividers only) |

The base swatches fill, border and illustrate; they are too light for text.
Text and filled controls use the darker roles, which keep the hue: `sea-deep`
`#11705F`, `coral-deep` `#B53C3C` and `ochre-deep` `#9C4F14` are the faces
under white text and the text colour on white, sand and the soft tints;
`sun-text` `#8A5A00` is the x click and any sun-coloured text on a light
surface. Every pair reaches WCAG AA (4.5:1). The values live in
`packages/brand/src/palette.ts`; `palette.test.ts` computes the ratios and
keeps the web `@theme` and the mobile theme in step with it.

Fonts: **Fredoka** (display, 600/700) for headings, lesson prompts and
numbers that celebrate; **Nunito** (body, 400/600/700) for everything else.
Web loads them with Fontsource, mobile with `@expo-google-fonts/*`. Never
render isiXhosa in a decorative weight that hides the diacritics.

Shapes: cards `rounded-3xl`, buttons `rounded-2xl` with a 3 px bottom edge
in a darker shade (a "pressable" look); the edge collapses on press.
Progress is a ring, never a thin bar, except the lesson progress strip.

## Motion

Every state change moves. Nothing bounces for the sake of bouncing.

- **Enter:** cards rise 12 px and fade in, 220 ms, ease-out, staggered 40 ms.
- **Press:** scale 0.97 and the bottom edge collapses, 90 ms.
- **Correct:** the chosen option flashes `sea`, a check draws itself, XP chip
  counts up; sound `correct`; haptic light.
- **Wrong:** the chosen option shakes 3 times (6 px), the right one glows
  `sea`; sound `wrong`; haptic medium. Never red text on red.
- **Lesson complete:** the celebration sequence takes the screen; see
  "After a lesson" below.
- **Level up:** full-screen indigo sky, the new level number scales in with
  a ring of particles; sound `level_up`.
- **Crown:** slow golden shimmer over the unit card; sound `crown`.
- **Streak:** flame icon with a living flicker (2 s loop); on extension a
  whoosh (`streak`) and the day count pops.
- **Click drill:** big tactile buttons, a `cue` tick before the speaker
  plays, the waveform of the reference pulses while it plays.
- **Mascots at rest:** a slow bob; the penguin blinks every few seconds; the
  two birds in the landscape flap and drift. The sunbird waves once when a
  page it greets from appears (the landing hero, the path's band), and again
  on hover, focus or tap; the penguin on the empty path does the same.
  Loops run on transform only, pause offscreen, and do not run at all under
  reduced motion (`useLoop`, `useWave` in `apps/web/src/lib/motion.ts`).
- **Hover:** with a real pointer, pressable buttons rise 2 px and the
  landing's cards 3 px (`translate`, never layout).
- **The landing hero** has one entrance, in reading order — title, promise,
  buttons, then the birds land and the sunbird waves — not a scatter of
  separate effects.

**The header on a phone.** Under 640 px the header holds only what fits a
320 px viewport: signed out, the wordmark, the language switch and Sign in
("Get started" is on the page); signed in, the wordmark, Learn, the
language switch and a menu button. The menu holds Grammar, Review, Leagues,
Editor, Account (`/settings#account`), Settings and Sign out, each at least
44 px tall; focus moves into it and is trapped there, and Escape returns it
to the button. A guest reaches the public grammar reference from the landing
page and from the path. From 640 px up the header shows everything in one
row, with Account and the gear as two icons. The landing page and Sign in are
for visitors only: a signed-in learner opening `/` gets the path, and `/auth`
sends them there too.

Web: `motion` (Motion One / Framer Motion API) and `canvas-confetti`.
Mobile: `react-native-reanimated` 4 with worklets, `expo-haptics`, and a
Reanimated particle burst for confetti. Respect `prefers-reduced-motion`
and the OS setting: shorten to a fade and skip particles.

## After a lesson

The end of a lesson is not one card. It is a short sequence of full-screen
beats on the indigo night sky, each with its own entrance, one primary
button and a tap-anywhere that moves it on. Beats the learner has not
earned are not shown — never an empty or greyed-out one — and the whole
sequence is skippable from a "Skip" in the corner. Nothing here keeps a
learner from the path for longer than a tap.

Which beats a result earns is the pure `celebrationBeats` in
`packages/core/src/celebration.ts`, so web and mobile always agree. Their
order never changes:

1. **Lesson complete** — the penguin (the learner) with `cheer` for a clean
   run and `hello` otherwise. The XP counts up from zero over 900 ms and
   lands with a small overshoot, sun rays turn slowly behind it and
   sparkles pop in around it; the accuracy line sits underneath. Sound
   `perfect` and a bigger burst for a perfect lesson, `lesson_complete` and
   the ordinary burst otherwise.
2. **Streak extended** — only when *this* lesson moved the streak on; a
   second lesson the same day earns nothing. The sunbird (the daily
   greeting), the flame, the day count landing, and a Monday-first week
   strip showing which days carry activity with today ringed. A streak that
   a Plus freeze saved says so instead of claiming an extension. Sound
   `streak`, no confetti: the flame is the picture.
3. **Milestone** — only when the lesson crossed 25, 50, 100, 250 or 500
   words learned (`WORD_MILESTONES`; the largest crossed, if several).
   "Words learned" is the learner's review-card count: one card exists per
   published lexeme a lesson has taught them. The crane (the mentor) hands
   over a medal with the round number on it. Sound `level_up`.
4. **Unit finished** — only when this lesson was the last unfinished one of
   its unit, and only the first time. A crown over the unit's title, and the
   trio takes a bow. A unit whose every lesson was finished without a wrong
   answer earns the higher tier: a gold crown with a shimmer instead of the
   sea one. Sound `crown`.

A level gained still gets its own moment, but it waits until the sequence
is over: two full-screen celebrations at once is one too many.

**Reduced motion** (`prefers-reduced-motion` on web, the OS setting on
mobile): numbers appear rather than count, entrances shorten to fades, rays
stop turning, sparkles and confetti do not run at all. **Sound** follows the
existing setting through `packages/sfx`; **haptics** fire once per beat on
mobile (medium for the unit, success for the rest).

The figures behind beats two to four come from the server on the
lesson-complete response (`LessonCelebration` in `packages/core/src/api.ts`)
and reach the sequence while it is still on its first beat. A guest has no
account, so no streak and no words-learned figure exist for them: they get
the lesson beat, plus the unit beat when the lessons on their device
finished a unit.

## Sound

`packages/sfx/sounds/*.wav`, synthesised by `packages/sfx/src/generate.ts`.
Names: `correct`, `wrong`, `tap`, `lesson_complete`, `perfect`, `streak`,
`level_up`, `crown`, `cue`. Sound is on by default, with a toggle in
settings that persists (localStorage on web, AsyncStorage on mobile).
Never play UI sounds over a pronunciation clip: the audio button pauses
sound effects while a clip plays.

## Illustration

- **Mascots, a trio:** the **sunbird** (malachite sunbird, Eastern Cape,
  feeds on the aloe in our landscape) is *the voice*: it appears where
  something is heard or said (landing hero, the welcome greeting, listening
  moments). The **penguin** (African penguin, endemic to South Africa and
  Namibia; largest colony on St Croix Island off Gqeberha) is *the learner*:
  it tries, gets things wrong, thinks and cheers (lesson summary, empty
  states, the welcome "ready" step, streak at risk). The **crane** (blue
  crane, South Africa's national bird, Eastern Cape grassland) is *the
  mentor*: it appears where something is explained (culture cards, the
  click and grammar tips, the leagues rules, editor pages). Same flat style,
  same five poses: `hello`, `cheer`, `think`, `sleep`, `listen`. Web:
  `components/illustrations/{Sunbird,Penguin,Crane}.tsx`; static SVG in
  `packages/brand/illustrations`. Their isiXhosa names are the tutor's call.
- **Mascots on a dark surface** — the indigo sky behind the celebrations,
  an indigo card — take `surface="dark"`. The penguin's body and flippers,
  the sunbird's outer tail and the crane's legs are the ground's own indigo
  and would vanish, so the whole silhouette gets a cream (`sand`) rim, about
  2.5 pt showing at any size, like a sticker's edge. The birds' own colours
  never change. Mobile draws the rim as the outline shapes again under the
  drawing (`ui/Mascots.tsx`, `rimWidth`); the web lays four hard
  `drop-shadow`s over the rendered SVG (`illustrations/surface.ts`), so the
  flippers Motion swings carry their rim with them. Nothing moves that did
  not move before, so reduced motion is unaffected.
- **Landscape:** sun, three hill bands (sea light, sea, ochre), an aloe.
  Hero bands, empty states, the landing page.
- **Skill glyphs:** one pictogram per skill kind (vocab, grammar,
  pronunciation, culture) in a soft circle, used on the unit path.
- Rules: no photographs of people, no cultural motifs used as decoration,
  no stock illustrations. Everything is drawn for Molo and can be redrawn
  by an illustrator later without touching the app.

## The path

The path is a **place**, not a list of cards. One continuous route runs from
the first unit to the last: the web home page *is* the path, and a unit page
is the same trail narrowed to one unit. Mobile draws the same trail inside a
unit. Both clients build it from the same pure rules in
`packages/core/src/path.ts`, so a node means the same thing on both.

**Sections.** A unit is a stretch of path with a header that travels with
the learner: it names the unit (`path.unit`, "Unit 3"), its CEFR band and how
many of its lessons are done, in the unit's own colour — indigo, sea, ochre,
indigo-soft, cycling. It is `position: sticky` inside its section, so it
stays for the whole stretch and is pushed off by the next unit's header with
no scroll listener. A button on it opens the unit's **word list**: every word
the unit teaches with its gloss and a voice, read from `/units/:slug`, which
serves published rows only.

**Nodes.** Every lesson is one node, and the node says what it drills:

| Icon | Kind | Rule |
|---|---|---|
| headphone | `listen` | half or more of its exercises are `listen_select` / `select_listen` / `click_identify` |
| microphone | `speak` | half or more are `speak` / `click_drill` (ties go to speaking) |
| book | `culture` | every exercise is a `culture_card` |
| crown | `test` | the unit's last lesson, whatever it holds |
| star | `mixed` | anything else |

`lessonKindOf` is the only place that decides. Four states: **current** (the
one node the learner is pointed at — larger, raised, a slow idle pulse),
**done** (filled `sea`, with its crown level 1–5 in a `sun` badge),
**open**, and **locked** (`mist`, a padlock, a real disabled button that does
not navigate). The path winds: nodes step 0, +1, 0, −1 off the centre line
(3.5 rem), small enough that a 320 px viewport never scrolls sideways; a
chest sits on the centre line, the pause in the winding.

**The trail.** A curve joins each node to the next, following the winding
and sitting behind the nodes. The stretch the learner has walked — the node
above finished, the node below reached (done or current; a chest ready or
claimed), which in the usual order is everything up to the current node — is
solid `sea`. The stretch ahead is dashed in mist over sand, and a stretch
touching a locked node is dashed and fainter still. The trail **breaks at
every skill title and unit header**: the chest closes its skill and the
title opens the next, and a line through the title, or detouring round it,
would be harder to read than a clean gap. So a skill that is only a chest
has no trail, and a unit of one lesson has one stretch, into its chest. The
newest walked stretch of a unit draws itself on once (900 ms, the upper half
first) the first time the learner sees it walked, after a lesson rather than
on every visit; under reduced motion it is simply there. The rules and the
curve are pure functions in `packages/core/src/path.ts` (`pathLinks`,
`linkHalf`, `LINK_STYLE`): each row draws its own halves of the links above
and below it, and the halves meet on the row edge in phase, so neither
client draws one SVG over the whole path. While the web path loads it
shows a skeleton of the same shape (a header, a title, four grey nodes on
the winding with the dashed trail) and says "Loading" only to a screen
reader. Light theme only for now (mobile ships `userInterfaceStyle:
"light"`); the colours are tokens, so a dark theme follows them.

**Chests.** Each skill ends in a chest worth `XP.skillChest` (25). It opens
when every lesson in the skill has been finished at least once, and it opens
**once ever**: the claim is a unique row in `skill_chests`, so replaying a
lesson can never farm it. A second claim answers `alreadyClaimed` with no XP
rather than an error. A guest opens theirs on the device and it is replayed
at sign-up, exactly like their lessons — and refused there if the lessons
did not land.

**The guide.** The crane, the mentor, stands beside the current node. It
speaks on the very first visit and after a week away (`guideSpeechFor`),
never in between; under reduced motion it simply appears. The bubble reuses
existing copy — `onboarding.ready.body` first, `lesson.keepGoing` after. It
never moves the node: on the web it hangs to the node's right from 640 px
up; on the phone it stands on the side the winding leaves open (left of a
node stepped right, otherwise right) with the bubble over its head, and the
row grows to fit it rather than spilling onto the rows around it.

**Taking a unit offline** (mobile only; the web has no unit downloads). Above
the path, the header line carries the crown count and, at its end, one small
pill — never a card that pushes the path down. It says the state in a word or
two: "Offline · Plus" on the free plan (a tap opens `/plus`; starting a
download is a Plus perk), "Download", a ring and a percentage while one runs,
"Download failed", "Ready offline". Everything else — the size before a byte
is spent, the count of recordings, why it stopped, Remove — is in a sheet one
tap away, which has its own Close button. A unit already on the phone, or a
download already running, stays usable whatever the plan. The home screen's
unit card keeps its "Downloaded" caption. `docs/CACHING.md` section 2.1 has
the table.

**Speed.** Mobile renders the path with a `SectionList`
(`stickySectionHeadersEnabled` gives the travelling header, windowing keeps a
long unit cheap); each row carries its own two small trail SVGs, so the
trail is windowed with the rows. Web keeps the sticky headers in CSS and
staggers only the first eight entrances.
## Inside a lesson

- **The rule comes before the drill.** A skill that teaches a rule shows it
  once, in front of its first exercise: the crane, a worked example split
  into its morphemes, the rule in a sentence or two, and a paradigm in which
  **every cell has its own play button** — because tone is phonemic and the
  spelling does not carry it, so a written paradigm is never complete
  (`docs/GRAMMAR.md`). A cell with no recording says so. Two ways out, "Got
  it" and "Skip", both remembered on the device, so a learner who has read a
  rule is never stopped by it again; the reference page at `/grammar` is
  where they go back to it. A wrong answer afterwards names the pattern
  inside the check bar's verdict rather than only saying "not quite".
- **Meet a word before being asked for it.** A word the learner has never
  met is shown first, on a card in front of the first exercise that asks
  for its meaning: the lemma large and painted, its recording played once on
  arrival (tap to replay; nothing plays in quiet mode), and its gloss in the
  learner's own language, then "Continue". Several new words for one
  exercise — a match-pairs of three — share one "New words" card, a row and
  a play button each, and only the first row plays by itself. No card in
  front of a click drill or a click identification (they are about sounds,
  not meanings) or a culture card (it presents its words itself, and they
  count as met afterwards). Everything on the card is the published lexeme
  already in the unit payload; nothing is composed, and a word with no gloss
  in this language still gets its lemma and its recording. The card is a
  step of the runner, not an exercise type and not a row: unscored, no
  hearts, no XP, and the progress bar does not move for it, so it never
  jumps back. Which words are new comes from the same history as the badge
  below — `unseenLexemeIds` on the unit for a signed-in learner, the device
  store for a guest — and where the cards go is `newWordIntroductions` in
  `packages/core`, so both clients place them identically.
- **A tapped word speaks.** Choosing an isiXhosa tile in match-pairs plays
  its recording once per tap, as Duolingo does for a target-language tile;
  the meanings' side stays silent, quiet mode and a word with no recording
  play nothing, and the tile's speaker still replays it (`playsOnTap` in
  `packages/core`).
- **Hearts on the right of the header**, as Duolingo has them: the count for
  a free learner, ∞ for Plus, nothing for a guest. A wrong answer breaks a
  heart there the moment it is continued past, before the server has
  answered: the heart pops and shakes, a copy of it drops away, the number
  ticks down and a brief "−1" rises (closed-form springs, no wobble). Under
  reduced motion the number just changes. The server's count stays the
  ceiling (`lessonHeartsView`). None left pauses the lesson in place, under
  the header where the last heart broke, with the answers so far kept.
- **Leaving halfway asks first**, on both platforms: once an exercise is
  done, until the lesson is over or paused for hearts ("Leave this
  lesson?", with "Keep going" the default). On the web that covers the ✕,
  every other link and the back button (an in-page alert dialog), and a
  reload or a closed tab (the browser's own prompt). A quit lesson is not
  resumed, as on Duolingo, so the question says the answers are lost.
- **Say what kind of moment this is.** A small badge above the prompt: *new
  word* in `sun` when the exercise introduces a lexeme the learner has not
  met, *tricky* in `coral` when it is built on one they have got wrong
  before. Derived from the learner's own history — server-side for a signed-in
  learner, from the device store for a guest — by `momentFor` in
  `packages/core`. Neither, and no badge: an ordinary exercise says nothing.
- **A run counter.** Three right answers in a row turns the lesson strip from
  `sun` to `sea` and says "5 in a row"; seven adds a slow shimmer. A wrong
  answer resets it. Quiet below three, because a counter that congratulates
  everything congratulates nothing. `RUN_MIN_TO_SHOW` / `RUN_HOT_AT` in
  `packages/core`, so both clients agree.
- **A speaker, not a sentence in a void.** A sentence prompt is said by a
  mascot in a speech bubble: the **sunbird** when the prompt is something to
  hear, the **crane** when the sentence is being explained, the **penguin**
  when the learner is being asked to produce it. Single-word prompts keep
  their larger, plainer layout.
- **Matching pairs never answer themselves.** The words keep their order on
  the left; the meanings on the right are arranged so that none shares a row
  with its own word (a derangement, `matchPairsMeanings` in
  `packages/core`). It is the same order on web and mobile and on every
  visit to the exercise — no randomness to store, and no exercise that
  happens to line every pair up for everyone.
- **Tap a word for its meaning.** In a sentence prompt every isiXhosa word is
  tappable, faintly underlined, and shows its gloss in the learner's own
  language — from the sentence's linked lexemes, never composed. Words the
  exercise is testing are not tappable: a hint may never be the answer.
- **The feedback bar can be answered back to.** The verdict carries "report
  this exercise", which files a note for an editor. It is how a wrong gloss
  reaches us from inside the lesson instead of from a review on the store.
- **The first second.** The app opens with the sunbird arriving and the
  wordmark settling — a native splash handing over to a short Reanimated
  sequence on mobile, a light entrance on first paint on web. Once per
  launch, never blocking a tap, nothing at all under reduced motion.

## Learning first

- The isiXhosa is always the largest thing on the screen.
- Every word has an audio button; the button is big enough for a thumb.
- Clicks (c, x, q) are colour-coded consistently: c `sea`, x `sun`, q `coral`,
  and the same colours in the drill, the tiles and the review cards.
- Feedback tells the learner what was right, not only that they were wrong.
- Celebrations are short. The next exercise is one tap away.

## Developer gallery

Nobody should have to keep a streak alive for a week to look at the screen
that congratulates them for it. The gallery opens every screen, celebration
and state directly, with fabricated props.

**Where it is.** Web: `/dev` — the gallery itself, one demo at
`/dev/demo/:id`, and the two older pages `/dev/playground` and
`/dev/mascots` alongside it. Mobile: a "Developer" row at the bottom of
Settings pushes `/dev`, and a demo opens full screen at `/dev/:id`.

**How it is gated.** One question, asked in one place: `useDevAccess()`
(`apps/*/src/dev/access.ts`) — a development build (`import.meta.env.DEV`,
`__DEV__`), **or** an account with the `admin` role. On the web that is the
editor dashboard's shape: `/dev` is a layout route whose component refuses
the way `/edit` refuses, and every dev page is a child of it, so there is no
second door. `import.meta.env.DEV` is a compile-time constant, so a
production bundle evaluates the gate to "admins only". On mobile the
Settings row, the Developer screen and every demo screen ask the same
question. A learner never reaches any of it.

**What it may not do.** Nothing in the gallery writes to the database or
calls a paid API, and no demo invents isiXhosa: the mobile demos use the
`__DEV__` fixture in `apps/mobile/src/fixtures/demo-unit.ts` (isixhosa.click
entries, CC-BY-SA), and the web demos use the `zz-` placeholder fixture in
`apps/web/src/dev/fixtures.ts`, which is visibly not isiXhosa.

**Demos render the real components.** A demo that keeps its own copy of a
component is worse than no demo, because it drifts and then lies. Where a
component could not be driven by props alone it was given the smallest seam
that lets it be, and the app uses that seam too:
`components/path/PathNodes.tsx` and `components/exercises/LessonStrip.tsx`
on mobile, `components/exercises/LessonProgress.tsx` and
`components/LeagueBoard.tsx` on both, `WordHint`'s `defaultOpen`, `Launch`'s
`force`, and the exported report dialog.

**The knobs panel** (`/dev/knobs` on web, `Knobs` on the mobile developer
screen) is the other half of the gallery: the gallery is for *looking* at
things, the knobs are for changing a number and seeing the consequence. Every gamification constant in `packages/core` and
`packages/gamification` is turnable — rewards and the level curve, hearts and
their regeneration, the streak freeze, the run counter's thresholds, the word
milestones — grouped the way somebody thinks about them rather than the way
the code is laid out.

Three rules make it safe:

- **The server is the authority.** An override changes what the client
  *shows* and nothing else. Turning XP per answer up to 200 makes the
  celebration count to 200; the row the API wrote still says 10. The panel
  says so twice, because the first bug report would otherwise be "the
  numbers do not persist".
- **Session-local.** It lives in this browser's `localStorage`, or this
  install's `AsyncStorage`, under `molo.dev.knobs` — the same key on both, so
  the record reads alike. It is never sent anywhere and reaches nobody else.
- **Impossible to forget.** A banner sits above the header on every web page,
  and as a pill over the bottom of every mobile screen, while anything is in
  force — with one button that clears the lot. Nobody should debug a screen
  for an hour that a stale knob is driving.

It is gated by the same `useDevAccess()` question, and the gate is the only
thing that ever arms the store — in both directions; the `/dev` layout route
on web, the developer screen on mobile — so a release build applies nothing
to an account it has not called `admin`. A second block on the same page
fabricates the states that are tedious to reach: a streak of any length, empty or full hearts, XP one lesson below the
next level, a unit drawn as finished. All of it client-side, all of it
labelled as fake.

The model is in `src/dev/knobs.ts` in each app — pure, so
`apps/web/src/dev/knobs.test.ts` and `apps/mobile/src/dev/knobs.spec.ts` hold
the resolution to its rules without a browser or a renderer — and the store,
the hooks and the banner in `knobs.tsx`. The two models are deliberately the
same shape over the same knob ids: mobile's labels come from its own
`strings.ts`, and its store reads `AsyncStorage` once at start so every read
after that is synchronous. The screens read `useTuning()` where they display
a number and `currentTuning()` where they score an answer, which is why the
demos and the real app agree.
`@molo/core` takes the constants as optional parameters (`levelForXp`,
`runHeat`, `celebrationBeats`); every caller in the app passes nothing.

**Adding a demo** is two edits per app. An entry in `src/dev/catalog.ts` —
`{ id, group, title, note }`, or `href` instead of a view when the app
already routes to the real screen — and a view for that id in
`src/dev/views.tsx`. `DEMO_VIEWS` is a `Record<ViewDemoId, …>` keyed off the
catalogue, so a catalogued demo with no view does not compile, and a view
with no catalogue entry does not either.

**Its English is developer English.** Every label in the gallery lives in
one file per app — `apps/web/src/dev/strings.ts` and
`apps/mobile/src/dev/strings.ts` — untranslated on purpose, because a
developer tool kept in two languages stops being maintained. Those two files
are the only place in either app allowed to hold copy outside
`packages/i18n`; everything a learner can see still comes from there.

**Tests.** `apps/web/src/dev/catalog.test.ts` and
`apps/mobile/src/dev/catalog.spec.ts` hold the registry to its rules;
`apps/web/e2e/tests/dev-gallery.spec.ts` opens the gallery and then every
registered demo in a browser, and fails on an uncaught error in any of them.
`apps/web/src/dev/knobs.test.ts`, `apps/mobile/src/dev/knobs.spec.ts` and
`apps/web/e2e/tests/dev-knobs.spec.ts` do the same for the knobs: the last
one turns XP per answer up to 200 and plays the seeded lesson to watch the
celebration count to 500.
