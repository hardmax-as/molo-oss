# iOS simulator captures — 2026-09-20

iPhone 16 Pro Max simulator, 1320 × 2868 (App Store 6.9"), release-style
`simulator` EAS build `6e442747` against the production API, status bar
overridden to 9:41. `en-*` was launched with `-AppleLanguages (en)`, `nb-*`
with `(nb)`; the UI follows the device language.

| File | What |
|---|---|
| `*-01-welcome` | Onboarding step 1 |
| `*-06-onboarding-6` | Onboarding step 6: first lesson, create account, guest |
| `*-07-signup` | Sign-up with the age gate (#66) and Sign in with Apple / Google |
| `*-08-path-empty` | The path as a guest with **no published content** — the true state until an editor publishes Unit 1 |
| `*-12-settings` | Settings: language, listening/speaking, sound, motion, offline data |
| `*-13-paywall` | Molo Plus paywall: the App Store Connect review screenshot for both subscriptions |

The demo video's phone segments are recorded from the same build by
`apps/web/e2e/demo/record-phone.sh`.

Lessons, click drills and the review session are **not** here: they need
published content, and nothing is published (MOL-6 recordings, MOL-47 tutor
session). The press kit calls fixture screenshots a rejection, so none were
made. Capture command, for the next pass:

```sh
xcrun simctl launch <udid> com.hardmax.molo -AppleLanguages "(nb)" -AppleLocale nb_NO
xcrun simctl io <udid> screenshot --type=png out.png
```
