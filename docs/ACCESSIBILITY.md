# Accessibility

The bar is **WCAG 2.2 level AA** for every learner-facing screen on web
(`apps/web`), and "usable with a keyboard and a screen reader" for the editor
dashboard (`/edit/*`). **Mobile** (`apps/mobile`) has its own bar and its own
section near the bottom, because a phone has no keyboard, no landmarks and no
`lang` attribute, and the platform decides more than we do. This file records
what has been checked, how to check it again, and what is deliberately left
for later. The look is not negotiable either: nothing here flattens the
palette, the display face or the mascots (`docs/DESIGN.md`).

Three rules carry most of the weight:

1. **The exercise is the product, so the exercise is the test.** If a click
   drill cannot be finished with the keyboard alone, the feature is not done.
2. **Never hard-code a name.** Accessible names come from `packages/i18n`
   (`a11y.*` and the existing keys), in `en` and `nb`, like every other
   string. `packages/i18n/src/keys.test.ts` keeps the two in step.
3. **Colour never carries a verdict on its own.** Every right/wrong state has
   words behind it, usually visually hidden.

---

## The shell

| Concern | Where | What it does |
|---|---|---|
| Skip link | `components/Layout.tsx` | First tab stop on every page, `sr-only` until focused, jumps to `#main`. |
| `main` landmark | `components/Layout.tsx` | One per page, `tabIndex={-1}` so the skip link moves focus, not just the scroll position. |
| `nav` name | `components/Layout.tsx`, `routes/edit.tsx` | `aria-label` from `a11y.mainNav` / `a11y.editorNav`. |
| `html lang` | `routes/__root.tsx`, `lib/i18n.tsx` | Follows the UI language (`en` / `nb`), set on the server render and kept in step whenever i18next changes language, including the header switch, without a reload. |
| isiXhosa in the page | `components/exercises/ClickText.tsx`, `ConcordFill`, `ClassSort`, the Goldens and Studio editor forms | `lang="xh"` so a screen reader switches voice instead of reading isiXhosa as English (WCAG 3.1.2). |
| Focus ring | `styles.css` | One `:focus-visible` ring: an opaque 2 px `sun` band against the control and a 3 px `indigo` outline outside it, so one tone always reaches 3:1 (WCAG 1.4.11). Never removed. Skip-link targets (`[tabindex="-1"]`) are excluded so `<main>` does not get a ring around half the page. |
| Toasts | `sonner` via `routes/__root.tsx` | Sonner renders its own polite live region. |

## Per route

Every route below was walked through the accessibility tree (Playwright's
snapshot) and by tab order.

| Route | Headings | Names and landmarks | Keyboard |
|---|---|---|---|
| `/` (landing, first visit) | `h1` hero, `h2` per section | Hero mascot pair is one named `role="img"` (`a11y.mascots`); the landscape band and every other mascot are `aria-hidden`. | Two CTAs and the legal links, in order. |
| `/` (path) | `h1` "Units", `h2` per unit header, `h3` per skill | The trail is a `nav` named `path.sectionNav`. Landscape, sunbird, crane, node icons and skill glyphs decorative; the guest banner, the unit header's progress and the crane's bubble are text. | DOM order is walking order, so the tab order is the path's order: each unit header's "Words" button, then its nodes, then its chest. |
| `/learn/$slug` word list | `h2` "Words in …" | `role="dialog" aria-modal="true"`, focus trapped, Escape closes, focus returns to the header button. | Audio button then word, per row. |
| `/welcome` | `h1` per step | Step dots are `aria-hidden`; the step number is a polite live region. Click buttons are named `onboarding.clicks.label`; the click description is a live region. The three preference switches are `role="switch"` (they were wrapped in a `<label>`, which cannot label a button). | Skip / Back / Next, all real buttons. |
| `/auth` | `h1` sign in / create | Every input has a real label and an `autocomplete`; the password rule is an `aria-describedby` hint outside the label so it is a description, not part of the name. | Social buttons, then the form, then the mode switches. |
| `/learn/$slug` | `h1` unit header, `h2` per skill | Crown ring is decorative — the sentence beside it says "N of M words mastered". Skill glyphs and node icons `aria-hidden`. | The same trail as `/`, narrowed to one unit. |
| `/learn/$slug/$lessonId` | `h1` (visually hidden) "unit — lesson N"; `h2` per exercise and per new-word card | Progress bar is a named `progressbar` with `aria-valuetext`. Quiet toggle is a named `aria-pressed` button. The hearts are a named `role="img"` ("4 of 5 hearts"); the falling heart and "−1" are hidden. XP and hearts changes go to a polite live region. Leaving halfway opens a `role="alertdialog"` ("Leave this lesson?"): "Keep going" takes focus, Tab is trapped, Escape and the backdrop mean "Keep going". | See "Exercises" below. A new-word card: each play button, then Continue (Enter anywhere also continues). |
| `/grammar` | `h1` "Grammar", `h2` per note | Each note is a labelled `region` (`a11y.grammarNote`). The paradigm is a real `<table>` with a visually hidden `<caption>`, `th scope="col"` and `th scope="row"`, and it scrolls inside its own container so the page never scrolls sideways. | Every cell's play button, in reading order; "show the ones I have not reached" is a real button. |
| `/review` | `h1` per card / summary | The bar is `aria-hidden`; the text above it carries the count. | "Show answer" hands focus to the first rating button, which used to vanish under the cursor. |
| `/leagues` | `h1` league tier | Trophies `aria-hidden`; zone chips have text next to the arrow. | Standings are a list, no interactive rows. |
| `/plus` | `h1` "Molo Plus" | Perk icons `aria-hidden`; each perk's title and body are text. | One CTA per plan. |
| `/settings` | `h1`, `h2` per card, `h3` for "Delete account" | Sound and reduce-motion are `role="switch"` with `aria-describedby` hints. The delete-confirmation field has a real label (`account.confirmLabel`, "Type DELETE to confirm") instead of only a placeholder. | Forms submit with Enter. |
| `/privacy`, `/terms` | `h1`/`h2` from the markdown | Nothing interactive. | — |

## Exercises

All ten types are completable with the keyboard alone, because every control
is a real `<button>`, `<input>` or `<a>` — no `div` with a click handler, no
`tabindex` juggling, no arrow-key widget to learn.

- **Answer tiles** (`OptionButton`) — `aria-pressed` while picking. After the
  verdict, the tile that was right carries a visually hidden "Right answer"
  and the one that was picked wrongly carries "Not quite.", so the sea/coral
  colours are never the only signal (WCAG 1.4.1). Minimum height 44 px.
- **`GrammarNote`** — the rule before the drill (docs/GRAMMAR.md). Its
  title is the heading under the lesson's `h1`; "Got it" takes focus on
  mount so a keyboard user is not left at the top of the document; the exit
  link stays on screen, because opening a lesson by mistake must not oblige
  you to read a rule to leave it. On the reference page it renders with no
  action row and takes no focus: six notes must not fight over the caret.
- **`MorphemeSplit`** — a word drawn as its parts would read to a screen
  reader as a row of disconnected syllables, so the boxes are `aria-hidden`
  and the group carries one label: "umntu, in its parts: um-, -ntu". Mobile
  does the same with `accessibilityElementsHidden`. Two tones mark the
  boundary, and the label carries it too, so colour is never the only signal.
- **`ParadigmTable`** — a real table on web. React Native has no table
  element, so mobile hides the grid from VoiceOver and announces each row as
  one string — "Class 1. Singular: … Plural: …" (`paradigmRowLabel`, unit
  tested) — which is the structure a sighted learner reads off the columns.
  A cell with no recording shows the same fully opaque "no audio yet" control
  the rest of the app uses, never a ghost of a button.
- **`CheckBar`** — the verdict, and only the verdict, is the live region
  (`role="status"`, named `a11y.answerFeedback`); the buttons around it are
  outside it so they are not re-announced. Checking disables the answers, so
  focus is moved to "Continue" (WCAG 2.4.3). Enter continues. **"Report this
  exercise"** sits beside the verdict and *outside* the live region, for the
  same reason: a verdict must not be re-announced with an action stapled to
  it. The **grammar correction** goes the other way and renders *inside* it:
  it is part of the verdict, it adds no focusable control, and one polite
  utterance is better than two. It opens the one other modal in the learner app (`ReportAction`,
  `role="dialog" aria-modal="true"`, `useFocusTrap`, Escape closes, focus
  returns to the opener), whose reasons are a real radio group in `<label>`s
  and whose note field has a real label. It is shown to signed-in learners
  only, because a report carries a name into an editor's queue.
- **Word hints** (`WordHint`) — in a sentence prompt each isiXhosa word is a
  real `<button>` with `aria-expanded` / `aria-controls` and, while open,
  `aria-describedby` pointing at the `role="tooltip"` gloss, so the state and
  the meaning both reach a screen reader. The button's accessible name is the
  word itself, in `lang="xh"`. Escape and a click outside close it. Words the
  exercise is testing are rendered as plain text with no button and no
  underline: the hint must never be the answer.
- **`MomentBadge`** — "new word" / "tricky" above the prompt. A label, not an
  alert: no live region, no sound. Named by `a11y.momentBadge`; the colour
  (sun / coral) is never the only signal, the words are.
- **The run counter** — the lesson strip's colour change is backed by words
  ("7 in a row") and by the progress bar's `aria-valuetext`, so a run is
  never carried by colour alone (WCAG 1.4.1).
- **`translate_tap`** — the answer strip is a named group; each tile is named
  "Add {{word}}" or "Remove {{word}}" rather than being a bare word whose
  effect you have to guess.
- **`concord_fill`** — each gap is a button named "Gap N" (plus its current
  filling), `aria-pressed` for the active gap; the option list is named after
  the gap it fills.
- **`class_sort`** — the bucket used to be a `<button>` containing a `<ul>`,
  which is invalid (a button may only hold phrasing content) and hid the
  sorted words from some screen readers. It is now spans, and the button's
  name is built from its content, so it reads "Class 5, put the chosen word
  in Class 5, umzi — Right answer".
- **`match_pairs`** — the two columns are named lists.
- **`click_drill`** — the click letters are a named list of tiles.
- **`speak`** — the level meter is `aria-hidden` (it is a picture of
  loudness); "Recording…" is a polite live region. Record/stop are named
  buttons; the exercise can always be skipped.
- **`listen_select` / `select_listen`** — audio buttons are named "Listen",
  "Slowly"; the voice switch is named "Voice 1 of 3. Hear another voice."
  rather than the bare "1/3".
- **`culture_card`** — text and one Continue button.

## The path

Every node on the path is a real control with a name that says which lesson
it is and what state it is in — `path.node` renders as "Listening lesson 2:
Start here", plus its length and exercise count. The four states are words,
never only a colour: **Start here**, **Not started**, **Finished, crown level
N**, **Locked**. A locked node is a `disabled` button rather than a link, so
it cannot be activated by any input; the reason ("Finish Unit 1 first") is
visible text in the unit's section header, not a tooltip. Chests name their
own state the same way, including the XP they hold.

The trail between the nodes is decoration (`aria-hidden`, and
`accessibilityElementsHidden` on the phone): solid for walked, dashed for
ahead only repeats what each node's name already says. Its one animation, a
newly walked stretch drawing itself on, does not run under reduced motion.
While the path loads, the web shows a grey skeleton of it inside a
`role="status"` region whose only text is "Loading" (`common.loading`), so a
screen reader hears the same word it always did.

Known gap, shared with the rest of the app: the signed-in header's nav
(`components/Layout.tsx`) overflows horizontally below about 400 px. The path
itself fits 320 px with no sideways scroll; the header does not, and predates
this work.

## Live regions

| Event | Politeness | Where |
|---|---|---|
| Right / wrong | `polite` | `CheckBar` |
| XP gained, heart lost | `polite` | `LessonRunner` |
| Recording | `polite` | `Speak` |
| Onboarding step, click explanation | `polite` | `welcome.tsx` |
| Out of hearts | `assertive` (`role="alert"`) | `OutOfHearts` |
| Toasts | `polite` | `sonner` |

Confetti (`canvas-confetti`) and the level-up particles are decoration and
are never announced.

## Overlays and interruptions

- **The launch greeting is not an overlay you can get stuck behind.**
  `components/Launch.tsx` is `pointer-events-none` from its first frame,
  renders only after hydration, plays once per browsing session
  (`sessionStorage`), and does not play at all under reduced motion. It is a
  `role="status"` named `a11y.launch` so a screen reader is told the app is
  starting rather than being handed a nameless picture.
- **`LevelUp`, the report dialog and "Leave this lesson?" are the only
  modals.** The first two are `role="dialog"`, the last `role="alertdialog"`
  (`LeaveLesson.tsx`), all `aria-modal="true"`; focus
  moves in, Tab is trapped inside, Escape closes it, and focus returns to
  the opener (`lib/focus.ts`, `useFocusTrap`).
- **`SaveProgressWall` and `OutOfHearts` are pages, not overlays.** They
  replace the lesson the learner asked for (out of hearts keeps the lesson
  header above it, ✕ included, and pauses rather than ends the lesson), so
  the heading takes focus
  (`useFocusOnMount`) and out-of-hearts is a `role="alert"`. Focus is
  deliberately **not** trapped: with nothing behind them and no way out of a
  trap, trapping would fail WCAG 2.1.2 rather than satisfy it. The e2e test
  asserts focus lands in the wall and that both ways out are reachable.

## Motion

`prefers-reduced-motion` is honoured in three places, and the three agree:

1. `lib/motion.ts` — `useMotionPrefs()` feeds `reduced` into every Motion
   animation, and `burst()` (confetti) is a no-op when reduced.
2. `styles.css` — the CSS keyframes (flicker, shake, shimmer, pulse) shorten
   to nothing.
3. **Settings → "Reduce motion"** — an explicit override stored in
   localStorage (`molo.motion`) and mirrored onto `<html data-motion>`, so
   the CSS follows the choice too. `null` (the default) follows the OS,
   `reduced` forces less, `full` opts back into animation for someone whose
   device setting does not match what they want here.

Sound has the same shape: on by default, a settings switch, `molo.sound` in
localStorage, and pronunciation clips always mute the effects.

## Targets

24 × 24 CSS px is the floor (WCAG 2.5.8) and is met everywhere; the controls
a learner hits repeatedly are larger:

- Answer tiles, word-bank tiles, gap buttons: `min-h-11` (44 px).
- Audio buttons: 48 px (`md`), 64 px (`lg`); the secondary "Slowly" and
  voice-switch buttons are 36 and 32 px — above the floor, and never the only
  way to do anything.
- Lesson exit / quiet toggle: 40 px. Header nav links: ~36 px. The progress
  strip's heart and review chips carry `min-h-6`.

## Editor dashboard (`/edit/*`)

A lighter pass: labels, table headers, dialog focus.

- Tab strip is a named `nav`.
- Sentence and golden tables have a visually hidden `<caption>` and
  `scope="col"` on every `<th>`; the goldens' delete column has a name.
- Placeholder-only fields in the curriculum forms and the lexeme picker got
  `aria-label`s; the reject-note textareas too.

`edit.studio.tsx`, `edit.index.tsx` and `edit.review.tsx` were **not**
touched — another workstream is rewriting them. Read, not changed; what they
still need:

- **`edit.index.tsx`** — every filter and every new-lexeme field already has
  a real label. Missing: `scope="col"` on the eight `<th>`s and a caption or
  `aria-label` on the grid; the "missing audio" checkbox's label reads
  `Audio: 0`, which describes nothing; and the grid re-queries as you type in
  the search box with no polite "N results", so a screen-reader user gets
  silence.
- **`edit.review.tsx`** — a read-only list, so nothing is unreachable, but
  `entityKind` is rendered as the raw database value (`lexeme`, `sentence`)
  with no i18n key, and only `lexeme` rows are links, so the other kinds are
  a dead end. Each row would read better as a heading plus its metadata.
- **`edit.studio.tsx`** — three things. (1) The `window` keydown handler
  skips `INPUT`/`SELECT`/`TEXTAREA` but not `BUTTON`, so pressing Space on a
  focused button both activates it and toggles recording. (2) The level meter
  is `aria-live="polite"` with an `aria-label` and no text content, so it
  announces nothing; it should be `aria-hidden` with a visually hidden status
  line, the way `Speak` now does it. (3) The new-speaker form's
  `displayName` and `region` inputs have only a placeholder, and that
  placeholder — like the three `consent: …` options and the consent note — is
  **hard-coded English**, which the project rules rule 2 forbids. Those need
  i18n keys before they need `aria-label`s.

## How to test (web)

```bash
bun run lint && bun run typecheck        # oxlint + oxfmt, then tsc
bunx vitest run --project unit           # includes the i18n key completeness test
bun run test:e2e                         # apps/web/e2e, includes a11y.spec.ts
```

`apps/web/e2e/tests/a11y.spec.ts` is the regression net: the skip link, one
lesson finished with the keyboard alone, the polite verdict, the landmarks on
every static route, and focus in the account wall. It queries by **role and
accessible name only**, so a change that keeps the pixels and loses the name
fails.

By hand, per screen:

1. Unplug the mouse. Tab from the top. Every stop must be visible and
   obviously focused; nothing may be reachable that you cannot see.
2. VoiceOver (⌘F5) → rotor → Headings, then Landmarks. The headings should
   read as an outline of the page; there should be one `main`.
3. macOS System Settings → Accessibility → Display → Reduce motion, and the
   in-app switch. Both must calm the same animations.
4. Zoom the browser to 200 % and to 400 % at 1280 px wide: no horizontal
   scrolling, nothing clipped.

No automated auditor (`axe-core`, Lighthouse) is wired in — see below.

## Mobile (`apps/mobile`)

### What the bar is on a phone

WCAG is written for pages, and half of what carries the web section — a skip
link, landmarks, a visible focus ring, a keyboard, `lang="xh"`, 200 % zoom —
either does not exist on a phone or is the operating system's job. So the bar
here is the platform's, stated as five things a walk has to be able to
confirm:

1. **Every control has a name, a role and, where it has one, a state.** Read
   with the screen reader's own gestures, not by looking at the screen. A
   `Pressable` with no `accessibilityLabel` and no text child is a bug.
2. **The exercise is the product, so the exercise is the test.** If a lesson
   cannot be finished with VoiceOver on and the screen curtained, the feature
   is not done.
3. **Nothing is announced by colour alone.** Right and wrong are words as
   well as sea and coral, and the words are in the tree.
4. **44 pt.** Every target, measured in points, not in Tailwind classes —
   see the `inlineRem` note below for why that distinction is not pedantic.
5. **Reduce motion is obeyed**, both the OS switch and the in-app one
   (WCAG 2.3.3), and obeying it means *not rendering* the confetti rather
   than rendering it invisibly.

Accessible names come from `packages/i18n` in `en` and `nb` like every other
string; `apps/mobile/src/dev/strings.ts` is developer-only English for the
gallery and nothing a learner reaches may come from it (the project rules
rule 2). Mobile leans on its own keys (`lesson.progress`, `path.node`,
`path.state.*`, `hearts.count`) plus `celebration.a11y.week/medal/crown` and
`a11y.launch`; most of the shared `a11y.*` block is still web-only, which is
half of the gap list below.

### The shell

| Concern | Where | What it does |
|---|---|---|
| Tab bar | `app/(tabs)/_layout.tsx` | `expo-router/unstable-native-tabs`. Each `NativeTabs.Trigger.Label` is an i18n string and *is* the accessible name — the API has no separate label prop. `labelVisibilityMode="labeled"` is forced on Android because Material hides the label of unselected tabs, and four destinations with one visible name is a guessing game. |
| Stack headers | per-tab `_layout.tsx`, `src/ui/stack-options.ts` | Titles from i18n. `headerBackButtonDisplayMode: "minimal"` means the back button is a bare chevron whose name is the platform's own "Back" — correct, but generic; we never say "back to Learn". |
| Modals | `app/_layout.tsx` | The sign-in and Plus sheets carry an i18n title and a `CloseButton` with `accessibilityRole="button"`, `accessibilityLabel={t("common.close")}`, `hitSlop={8}` and a 44 pt box, because a sheet that can only be swiped away is a sheet some people cannot leave. |
| Screen wrapper | `src/ui/Screen.tsx` | A scroll view with the platform's inset behaviour. There is no landmark equivalent on native and none is invented. |

### Native controls (`@expo/ui`)

The four wrappers in `src/ui/` exist because `@expo/ui`'s accessibility is
uneven between the platforms and has to be handled by us. iOS has real
SwiftUI modifiers — `accessibilityLabel`, `accessibilityHint`,
`accessibilityValue`, `accessibilityAddTraits`, `accessibilityHidden`.
**Jetpack Compose exposes none of them**: the only semantics modifier is
`semantics({ contentType })`, plus `toggleable` and `selectable`.

- **`Switch.tsx`** — on iOS the name is a SwiftUI `accessibilityLabel`
  modifier on the control itself. **On Android there is nowhere to put it, so
  the wrapper sets `accessible`, `accessibilityRole="switch"`,
  `accessibilityLabel` and `accessibilityState={{ checked, disabled }}` on
  the surrounding React Native `<Host>` view instead.** That is the one
  arrangement in the app where the thing announced and the thing operated are
  different views, and **it has never been checked with TalkBack.** If a
  switch on Android announces its name but not its on/off state, or announces
  the state twice, this is the line to come back to. The plain React Native
  fallback (no `@expo/ui` linked) carries the same label and lets `Switch`
  report its own value.
  `styles.host` pins `minHeight: 44` independently of the rem scale.
- **`MenuSelect.tsx`** — the trigger is deliberately our own React Native
  view (`accessible`, `accessibilityRole="button"`, `accessibilityLabel` =
  the field's name, `accessibilityValue={{ text: current }}`) because
  `@expo/ui`'s universal `Picker` accepts no `modifiers` prop on **either**
  platform, so there is no way to name it. The popup itself is native.
- **`Segmented.tsx`** — the gap. `SegmentedProps` has no `label` at all and
  nothing is passed to the native control, so the group has no name on either
  platform: a screen reader gets the segment texts and no idea what they are
  segments *of*. `MenuSelect` takes a `label` for exactly this reason and
  `Segmented` should follow it.
- **`Sheet.tsx`** — wraps the universal `BottomSheet`. Its children carry
  their own names; there is no focus management and no dismissal
  announcement, because neither SwiftUI's sheet nor Compose's
  `ModalBottomSheet` gives us a hook for one.
- **The unit screen's offline pill** (`components/UnitDownload.tsx`) is a
  `Pressable` button in a 44 pt box around a smaller drawn pill. Its name is
  its visible words ("Download", "Ready offline", "Download failed"; the Plus
  one reads "Offline with Molo Plus", because a middle dot is read
  differently by every screen reader), and the hint carries the detail the
  old card showed in full: the size, the reason a download stopped, what
  Plus adds. While a download runs its value is "3 of 12 recordings"; the
  sheet's bar is a real `progressbar`. The sheet has its own Close button,
  so nobody has to swipe to leave it.

### Inside a lesson

- Every control is a real `Pressable`, `TextInput` or `Button` with a role.
  Answer tiles (`src/ui/OptionTile.tsx`) carry `accessibilityState={{
  selected, disabled }}`; the class-sort chips and buckets, the concord
  blanks, the click-drill letters, the record button and the word-hint
  trigger (with `accessibilityState={{ expanded }}`) all carry names from
  i18n.
- **A clip inside a tile is an action on the tile.** On iOS an accessible
  parent hides its children, so the play button nested in a select-listen
  tile, a match-pairs word or a class-sort chip cannot be focused. Those
  tiles carry a custom `play` accessibility action named "Listen" or
  "Listen 2" (`src/ui/tile-a11y.ts`); VoiceOver users swipe up or down to it
  and double-tap, and a plain double-tap still chooses the tile. Not yet
  heard on a device.
- **Leaving asks first.** Once an exercise is done, ✕ and Android's back
  open a confirmation whose cancel action, "Keep going", is the default.
- **Hearts in the strip** (`LessonHearts.tsx`) are one labelled node ("4 of
  5 hearts", or "Unlimited hearts"), not a button. A lost heart is said in
  the words the web uses ("Heart lost. 4 of 5 left."): announced on iOS
  (`useAnnounce`), and on Android the node's label changes inside a polite
  live region. The "−1" and the falling heart are hidden from both.
- **A new word's card** (`NewWords.tsx`) has a header, the lemma as tagged
  `XhosaText`, a play button per word named "Listen" or "Listen to {word}",
  and a real Continue button.
- **The verdict is words, never colour.** `CheckBar.tsx` prints
  `lesson.correct` / `lesson.incorrect` plus the correct answer and the
  detail line, so the tree says what happened whatever the background is.
- The progress bar (`LessonStrip.tsx`) is a named `progressbar` with
  `accessibilityValue`, and folds the run of right answers into its label
  while a run is going.
- The mascot in a speech bubble is one named `role="image"` node with the
  drawing hidden underneath it (`SpeechBubble.tsx`, `Mascots.tsx`).
- "Report this exercise" (`ReportAction.tsx`) is a named button; the reason
  list is `accessibilityRole="radio"` with `selected` state, the note field
  has a label, and the failure line is an `alert`.

### The celebration and the path

- The celebration sequence can be advanced by tapping anywhere (an invisible
  full-screen button named `celebration.continue`) or skipped outright
  (`celebration-skip`), so it is never a wall. Each beat's artwork — the week
  strip, the medal, the crown — collapses to one `role="image"` node named
  from `celebration.a11y.*` rather than seven unlabelled cells.
- **Reduce motion** is `useMotion()` in `src/ui/motion.ts`: the OS setting
  through `react-native-reanimated`'s `useReducedMotion()`, overridden by the
  in-app switch in Settings. Under it the confetti does not mount at all, the
  progress ring animates in zero milliseconds, the path's idle pulse stops
  and beats fade instead of sliding.
- On the path (`src/components/path/PathNodes.tsx`) every node's label says
  its kind **and its state in words** — done, locked, current, open, plus the
  crown level — so the drawing is never the only signal; a locked node is a
  real `disabled` button, and the glyphs beside a labelled node are
  `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.

### Verified on the simulator, not assumed

These come from the iOS walk on an iPhone 17, iOS 26 (they used to live in
the library notes, which is a record of what libraries do, not of what we
checked):

- With the SwiftUI `accessibilityLabel` modifier, the universal `Switch`
  reports as `AXCheckBox` with subrole `AXSwitch`, its label, and `AXValue`
  `"1"` / `"0"` — the same information React Native's own `Switch` gave.
- The community `SegmentedControl` reports as **one** `AXTabGroup` carrying
  the `testID`. `idb` does not enumerate its segments, so it has to be
  checked with VoiceOver rather than a tree dump.
- `idb`'s tree reports frames in **points**, which is how the undersized
  buttons were caught: NativeWind's `withNativeWind` defaults `inlineRem` to
  14, so every rem-based Tailwind class rendered at 14/16 of its web size and
  `h-11` landed at 38.5 pt rather than the 44 pt target.
  `apps/mobile/metro.config.js` pins `inlineRem: 16`. It is a
  build-config setting, not something any component enforces, so a refactor
  can reintroduce it silently — measure, do not read the class name.
- SwiftUI's gesture recogniser ignores a zero-duration synthetic tap:
  driving these controls from `idb ui tap` needs `--duration 0.15`, or the
  toggle silently does not move.

### Known untested, and known missing

- **Android, entirely.** No TalkBack pass has happened. The switch
  arrangement above is the specific thing to check first; after it, the tab
  bar's forced labels and the Material bottom sheet.
- ~~**`accessibilityLiveRegion` is Android-only.**~~ Fixed 2026-09-06.
  React Native's types mark it `@platform android`, so every live region in
  the app announced nothing at all on iOS — including the verdict, which is
  the one announcement that has to arrive on its own.
  `apps/mobile/src/lib/announce.ts` is the other half: Android keeps its live
  regions, iOS gets an explicit `announceForAccessibilityWithOptions`, and
  neither says the same thing twice. It is wired into all six sites that had
  a live region — the verdict in `CheckBar`, the toast, the sign-in error,
  the Plus status line, the "heart earned" pop-up, and the report sheet's
  thanks and failure lines. **Not yet heard on a device**; the code path is
  right and VoiceOver has not been asked to confirm it.
- ~~**No isiXhosa language tagging.**~~ Fixed 2026-09-06.
  `apps/mobile/src/ui/XhosaText.tsx` is the counterpart of the web's
  `ClickText`: it paints the click consonants and sets
  `accessibilityLanguage="xh"`, and it replaced three separate copies of the
  painting code in `TranslateType`, `WordHint` and `RecallCard`. The
  exercise components that show a lemma without painting it — `ListenSelect`,
  `ClassSort`, `ClickDrill`, `MatchPairs`, `SelectListen`, `TranslateTap`,
  `Speak` — carry the attribute on the `Text` itself. Two caveats, both
  unchanged by the fix: `accessibilityLanguage` is iOS-only, so Android has
  no equivalent and TalkBack still reads isiXhosa in whatever language it is
  already in; and no common screen reader ships an isiXhosa voice, so the
  ceiling is low on both platforms. Tone is carried by the audio, not the
  synthesiser.
- **Unnamed controls**: `Segmented` (no group name, above);
  `TranslateTap`'s word-bank tiles are bare `Pressable`s that borrow their
  text child, with no "add"/"remove" distinction the way web has;
  `MomentBadge` has no accessible wrapper at all although `a11y.momentBadge`
  exists; the run counter has no name of its own outside the progress bar's
  label; the onboarding dots are a `progressbar` with a value and no label.
- **Grouping labels** that web has and mobile does not: `a11y.options`,
  `a11y.wordBank`, `a11y.wordsXh` / `a11y.meanings`, `a11y.wordsToSort`.
  The individual tiles are named; the list around them is not.
- **The celebration is not modal to a screen reader.** `LevelUp.tsx` sets
  `accessibilityViewIsModal`; `Celebration.tsx` does not, and no beat change
  is announced.
- **No automated coverage.** `apps/mobile/jest.config.js` matches
  `src/**/*.spec.ts` only, nothing renders a component, and there is no
  `@testing-library/react-native` in the tree — so no test anywhere asserts a
  role or an accessible name. The Maestro flows drive by `testID`, which
  survives a lost label. Adding a real regression net means a dependency and
  a `testMatch` change, which needs the operator's yes (the project rules
  rule 7).

### How to test it

There is no `axe` for a phone. The walk is manual, and it is three tools.

**VoiceOver (iOS).** On the simulator, Settings → Accessibility →
VoiceOver → on, or bind the triple-click side button. Then, per screen:

1. Swipe right from the top to the bottom. Every stop must say a name, a
   role, and a state where it has one. Anything that says only its text, or
   says "button" with no name, is a finding.
2. Use the rotor (two-finger rotate) → Headings, then Form Controls, to see
   the screen as a list rather than a picture.
3. Finish one whole lesson without looking at the screen. That is the test
   the other two only prepare for.
4. Curtain the screen (three-finger triple tap) if looking is too tempting.

**TalkBack (Android).** Settings → Accessibility → TalkBack. Swipe right to
walk, double-tap to activate, and read the switch in Settings first — that is
where the Compose limitation lands.

**Xcode's Accessibility Inspector.** Xcode → Open Developer Tool →
Accessibility Inspector, point it at the simulator, and use the target picker
to hover a control and read its label, value, traits and frame. It is the
fastest way to answer "what exactly is this node called", and its audit tab
catches unlabelled elements and small targets on the screen in front of it.

**The tree dump.** With `idb` attached to a booted simulator, `ui_describe_all`
prints the whole accessibility tree with frames in points — the only one of
the three that gives a diffable artefact and the one that caught the
undersized targets. It does not enumerate a `SegmentedControl`'s segments,
so it never replaces VoiceOver, and driving controls from it needs
`idb ui tap --duration 0.15`. There is no wrapper script and no CI step: this
is an engineer at a terminal, deliberately, until there is something worth
automating.

**And the cheap ones.** Settings → Accessibility → Motion → Reduce Motion,
and the in-app switch: both must calm the same animations. Settings →
Display & Brightness → Text Size at its largest: nothing may clip.

## Deliberately not done yet

- **`@axe-core/playwright`.** It would catch the mechanical rules a
  role-and-name test cannot: duplicate ids, nested interactive controls,
  ARIA attributes on roles that do not allow them, and contrast regressions
  on states we never screenshot. It is one dev dependency and about ten lines
  per route. It needs the operator's yes (the project rules rule 7); until
  then those classes of bug are only caught by review.
- **Contrast** was fixed in an earlier round and is not re-verified here.
  `mist-soft` (`#E6E6EF`) is a divider and icon colour only — it must never
  carry text.
- **Reading isiXhosa aloud.** `lang="xh"` is set, but no common screen reader
  ships an isiXhosa voice, so it will fall back. Tone is carried by the audio
  (`docs/CONTENT.md`), not by the synthesiser.
- **Cognitive load**: no reading-level pass on the glosses, and no option to
  turn off the streak/league pressure. Worth a look when the content exists.
