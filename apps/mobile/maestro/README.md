# Maestro flows

End-to-end flows for the learner app (docs/STACK.md: Jest + Maestro on
mobile). They drive the dev client on a simulator and need the local API.

```bash
brew install maestro                     # once
cd apps/api && bunx wrangler dev --port 8787
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:8787 bunx expo start --dev-client
maestro test apps/mobile/maestro/fixture-lesson.yaml
maestro test apps/mobile/maestro/sign-in.yaml -e EMAIL=you@example.com -e PASSWORD=...
```

- `fixture-lesson.yaml` walks the `__DEV__` fixture unit to the summary card.
  It does not judge answers; it proves the runner, the check bar and the
  summary all render and chain.
- `sign-in.yaml` signs in with email and password and expects the signed-in
  home (the Review tab).
- `close-from-onboarding.yaml` opens the sign-up sheet from the last
  onboarding step, where it is the only screen on the stack, and expects
  "Close" to land on the path rather than do nothing.

In CI the flows run from `.github/workflows/mobile-e2e.yml`: an iOS job on a
macOS runner and an Android job on Linux with the emulator runner. Both are
off until the repository variable `MOBILE_E2E_ENABLED` is `true`, because
the macOS job spends 10x minutes and needs a full native build; enable it
once a Mac runner is budgeted. Until then run the flows locally before a
release. For Android locally: boot an AVD, then
`EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 bunx expo run:android` (the
emulator reaches the host on 10.0.2.2, not localhost).

`tour-native-controls.yaml` walks what `@expo/ui` replaced: the segmented
language control, the switches, the voice menu and the developer screen. It
exists because the iOS side of those controls was walked by hand and the
Android side never was, the emulator having wedged under load both times it was
tried. Run it on both platforms and compare.

**Ids rot.** `tour.yaml` pointed at `open-settings` for a long time after that
id had been removed from the app, so the flow failed at that step and nobody
noticed. Where a native control is involved, prefer its visible label: the tab
bar has no ids, and every tab shows its label on both platforms. The label
patterns in these flows accept English or Norwegian so a flow does not depend
on the device's language.

Element ids used by the flows are `testID`s in the screens (`go-sign-in`,
`email`, `password`, `submit-auth`, `start-<slug>`, `lesson-<n>`,
`check`, `continue`, `celebration`, `celebration-lesson`, `celebration-skip`,
`finish`).

`bun run --cwd apps/mobile test --runInBand maestro-contract` checks every YAML
flow without a device. Bun’s built-in YAML parser reads both documents; Babel
parses app/ and src/ to collect literal, conditional and template testIDs.
Forwarded props and comments never count as declarations. Each text regex must
match a complete en or nb string from packages/i18n. This catches selector rot;
it cannot prove a conditional element exists for an account, that a dynamic
ID’s value is present, or that navigation/recording works on a device. The
`league-me` row still exists conditionally, but navigation tours now wait on the
league tab label so an opted-out account does not require that row.
