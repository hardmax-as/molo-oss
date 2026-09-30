# apps/mobile

The Expo learner app (docs/STACK.md "Mobile"). Learner only: units, lessons,
review, leagues, settings, Better Auth sign-in. No editor surface here, ever.
The look and the celebrations follow `docs/DESIGN.md`; the sounds come from
`packages/sfx`.

## Run

```bash
bun install                                   # from the repo root
cd apps/api && bunx wrangler dev --port 8787  # the API, in another terminal
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:8787 bunx expo start --dev-client
```

The app uses native modules (Reanimated, expo-audio, expo-haptics, svg,
Sentry, op-sqlite with SQLCipher), so it runs in a **development client**,
not Expo Go. Build one once per simulator with `bunx expo run:ios`
(CocoaPods + xcodebuild, slow the first time), then `expo start --dev-client`
serves JS to it.

`EXPO_PUBLIC_API_URL` defaults to `http://localhost:8787`, which is what the
iOS simulator can reach. A physical device needs your machine's LAN address.
`EXPO_PUBLIC_SENTRY_DSN` turns Sentry on; without it the SDK is a no-op.

Checks:

```bash
bun run --filter @molo/mobile typecheck
bun run --filter @molo/mobile test          # Jest (jest-expo) on the pure helpers
bunx oxlint --deny-warnings apps/mobile
maestro test apps/mobile/maestro/fixture-lesson.yaml   # see maestro/README.md
```

## Layout

```text
app/
  _layout.tsx               fonts, providers (React Query, i18n, prefs, sfx), Stack, Sentry wrap
  index.tsx                 home: greeting, progress strip, review/league cards, the unit path
  auth.tsx                  email + password sign-in / sign-up
  settings.tsx              language, source language, daily goal, reminders, sounds, offline
  review.tsx                FSRS review session; offline ratings queue and replay
  leagues.tsx               weekly league standings and history
  learn/[slug]/index.tsx    unit page: lesson nodes, mastery crown
  learn/[slug]/[lessonId].tsx  lesson runner chrome, summary, level-up overlay
src/
  ui/                       theme tokens, Button, Card, ProgressRing, StreakFlame, XpChip,
                            Confetti, LevelUp, OptionTile, sfx, haptics, motion, fonts
  components/ProgressStrip.tsx  level, streak flame, daily-goal ring, due count
  components/AudioButton.tsx   expo-audio player; pulses while playing; mutes UI sounds
  components/exercises/     one widget per exercise type; helpers.ts is pure (Jest)
  lib/api.ts                typed client; attaches the SecureStore session cookie
  lib/db.ts                 op-sqlite + SQLCipher (key in the keychain); null without the native module
  lib/offline.ts            unit cache and the pending-reviews queue over db.ts (AsyncStorage fallback)
  lib/prefs.tsx             device prefs (sound on/off)
  lib/push-logic.ts         the push lifecycle as pure decisions over ports (Jest)
  lib/push-ports.ts         expo-notifications + expo-device wiring; sign-out withdraws the token
  lib/push.tsx              PushProvider, the Settings toggle state, the tap → Review deep link
  lib/sentry.ts             init and wrap; no-op without a DSN
  fixtures/demo-unit.ts     __DEV__-only unit so the runner can be exercised before anything is published
maestro/                    end-to-end flows (not in CI; need a simulator)
```

## Behaviour worth knowing

- **Sounds** never play over a pronunciation clip; the toggle in settings
  persists in AsyncStorage. Reduce-motion (OS setting) shortens every
  animation to a fade and skips particles.
- **Offline**: units you open are stored encrypted; review ratings made
  without network are queued and replayed the next time the review screen
  opens (or from settings). A dev client built without op-sqlite falls back
  to AsyncStorage automatically.
- **Speak** exercises record with expo-audio and let the learner compare with
  the speaker; there is no scoring, XP only on an honest "sounded right".
  Microphone denial skips the exercise without XP.
- **Leagues** call `/leagues/current` and `/leagues/history`; a `__DEV__`
  fixture stands in while the API answers 404.
- **Push reminders** are asked for in Settings, behind the "Push reminders"
  toggle — never at first launch. Turning it on requests permission and
  registers the Expo token with `POST /me/push-token`; app start with a
  session refreshes it silently and never prompts; sign-out withdraws it.
  A simulator cannot be registered (`Device.isDevice`) and the row says so
  instead of failing. A tapped reminder opens the Review tab through an
  allowlist, so a payload can only reach a screen the app knows. The nightly
  push needs an EAS project id and push credentials; without them the token
  request fails and the row shows the failure note.
- **No `async`/`await`, no array destructuring and no `class X extends Error`
  in anything the Jest suite imports.** `@babel/runtime` is not resolvable
  from `apps/mobile` under Bun's isolated layout, so any construct Babel
  compiles with a helper from it fails the suite with "Cannot find module
  '@babel/runtime/helpers/interopRequireDefault'" — and the message names the
  importing file rather than the construct, so it reads like a resolution
  problem when it is a syntax one. Object spread and `[...set]` are fine;
  `const [a, b] = xs` and `for (const [k, v] of Object.entries(o))` are not
  (`_slicedToArray`). `lib/push-logic.ts` and `lib/download-logic.ts` are
  written to that constraint (the library notes).
- **Downloaded units.** `lib/download-logic.ts` is the state machine,
  `lib/download-ports.ts` the filesystem and index behind it, and
  `lib/downloads.ts` the op-sqlite tables. A `unit_downloads` row is a promise
  that the unit works with no signal, so it is written only when every
  recording arrived; every other ending discards. Recordings live in one
  shared directory named by their own SHA-256, so two units share a word and
  removing a unit deletes only what nothing else needs.

## Gotchas met in the audit

- **`expo-network` is required.** `@better-auth/expo` imports it lazily when
  the session store re-initialises (sign-out, sign-in). Without it Metro
  throws "Cannot find module 'expo-network'" and sign-out rejects; it is a
  native module, so a dev client built before it was added must be rebuilt.
- **rem is 16, not NativeWind's default 14.** `metro.config.js` passes
  `inlineRem: 16`; without it `h-11` is 38.5 pt and `text-base` is 14 pt.
- **`mist` is for text, `mist-soft` for icons.** `#66667F` clears 4.5:1 on
  sand and cloud; the lighter shade does not.
- **Skipped is not wrong.** Widgets report `skipped: true` (see
  `exercises/types.ts`) when the learner could not answer; the runner
  charges no heart and leaves it out of the score.

## What is still deferred

- Magic-link sign-in on the phone needs the `@better-auth/expo` server plugin
  and `molo://` in `trustedOrigins` on the API (API workstream).
- Reminder opt-in is written but not read back (`/me` does not return it yet).
- Android has not been built or tested; the code has no iOS-only APIs.

## Simulator automation

`idb ui text` sends US HID key codes. With a Norwegian hardware keyboard
layout on the simulator, `-` arrives as `+` and `@` as `"`, so typed
credentials are silently wrong. Put the value on the simulator clipboard
with `xcrun simctl pbcopy <udid>` and long-press the field, then Paste. The
Maestro flows use `inputText`, which does not have this problem.
