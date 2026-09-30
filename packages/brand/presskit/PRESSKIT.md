# Molo press kit

Everything here is made for Molo and may be used to talk about Molo:
posts, articles, app-store listings, slides. Please do not alter the
colours or the mascots, and do not put the mascots in other people's
artwork.

## One line

**Molo: learn isiXhosa the way it sounds.**
Norsk: **Molo: lær isiXhosa slik det høres ut.**

## Short description (app stores, bios)

Molo teaches isiXhosa to English and Norwegian speakers with a native
voice on every word, the clicks first, and short daily lessons that stick.
Every piece of content is approved by an isiXhosa editor before a learner
sees it.

Norsk: Molo lærer bort isiXhosa til engelsk- og norsktalende, med en ekte
stemme på hvert ord, klikkelydene først, og korte daglige leksjoner som
sitter. Alt innhold godkjennes av en isiXhosa-redaktør før noen lærer det.

## Why isiXhosa (facts you can quote)

- About 10 million people in South Africa speak isiXhosa as their home
  language, 16.3% of the population and the second most spoken home
  language (Statistics South Africa, Census 2022).
- One of South Africa's 12 official languages, and one of the three official
  languages of the Western Cape.
- isiXhosa has three basic clicks (c, x, q) with aspirated and nasal
  variants; roughly one in ten everyday words contains a click. The clicks
  came from centuries of contact with Khoekhoe and San speakers.
- Heard around the world through Miriam Makeba's *Qongqothwane* ("The
  Click Song") and as the spoken language of Wakanda in *Black Panther*
  (at the initiative of actor John Kani). The home language of Nelson
  Mandela and Desmond Tutu.

## What makes Molo different

- A native voice on every word: no synthetic speech reaches a learner.
- The clicks are drilled as first-class exercises: listen, tell them apart,
  record yourself and compare.
- Grammar forms come from a rule-based generator checked against forms a
  native speaker has signed off, never from a language model.
- Nothing is published without a human isiXhosa editor's approval.
- Short lessons, spaced review, streaks, weekly leagues, and three mascots.

## Mascots

- **The sunbird** (malachite sunbird, Eastern Cape): the voice. Appears
  where something is heard.
- **The penguin** (African penguin, endemic to South Africa and Namibia):
  the learner. Tries, gets it wrong, cheers.
- **The crane** (blue crane, South Africa's national bird): the mentor.
  Explains.

SVG sources: `../illustrations/`. Poses: hello, cheer, think, sleep, listen.

## Colours and type

| Name | Hex |
|---|---|
| Sun | `#F6B73C` |
| Ochre | `#D9772B` |
| Indigo | `#26264F` |
| Sea | `#1FA38C` |
| Coral | `#E85D5D` |
| Sand | `#FFF7E8` |

Fonts: Fredoka (display), Nunito (body). Both are open (SIL OFL) and load
from Google Fonts or Fontsource.

## Files

`src/` holds the sources (SVG and one HTML file for the social templates);
`png/` the rendered exports. Regenerate with
`bun packages/brand/presskit/render.ts` (needs the web app's Playwright
Chromium: `cd apps/web && bunx playwright install chromium`).

| File | Use |
|---|---|
| `logo-mark` | app icon shape, avatars (1024) |
| `logo-wordmark`, `logo-wordmark-light` | headers on light / dark |
| `app-icon` | store icon (1024, no transparency) |
| `social-og` | link previews, 1200×630 |
| `social-square` | Instagram / Facebook post, 1080×1080 |
| `social-story` | Instagram / TikTok story, 1080×1920 |
| `social-header` | X / LinkedIn header, 1500×500 |

## Contact

Molo is built by Hardmax AS. Press: see the repository README for the
current address.

---

## Files, and what each is for

Everything here is rendered by `bun packages/brand/presskit/render.ts`, which
draws the sources in `src/` with Chromium so the type is really Fredoka and
Nunito. Re-run it after any change to a source; do not hand-edit a PNG.

The mark and the wordmark are built in `src/store.html`, not as standalone
SVG files with a `<text>` element: an SVG cannot reach a webfont when a
browser renders it on its own, so those files quietly fell back to a system
face and the letter came out wrong. Where a vector is genuinely needed —
`src/logo-mark.svg`, `src/app-icon.svg`, `src/favicon-maskable.svg` and the
site's `favicon.svg` — the M is drawn as a stroked path instead of type, so
it looks the same everywhere with no font at all.

### `png/` — press and social

| File | Size | Use |
|---|---|---|
| `logo-mark.png` | 1024² | The mark alone, transparent ground. |
| `logo-wordmark.png` | 1920×600 | Mark and name, for dark grounds. |
| `logo-wordmark-light.png` | 1920×600 | The same for light grounds. |
| `app-icon.png` | 1024² | The icon artwork, for slides and articles. |
| `social-og.png` | 1200×630 | Link previews. |
| `social-square.png` | 1080² | Instagram, LinkedIn. |
| `social-story.png` | 1080×1920 | Stories and reels. |
| `social-header.png` | 1500×500 | Profile headers. |

### `store/` — what Apple and Google ask for

| File | Size | Use |
|---|---|---|
| `ios-app-icon-1024.png` | 1024² | App Store icon. Square, no alpha, no rounded corners of ours: Apple rounds it. |
| `play-icon-512.png` | 512² | Play Store listing icon, 32-bit PNG. |
| `play-feature-graphic-1024x500.png` | 1024×500 | Play feature graphic. Required; Play crops the edges on some surfaces, so nothing important sits outside the middle. |
| `listing-tile-1024.png` | 1024² | Square listing tile for press and web cards. |
| `screenshot-N-1284x2778.png` | 1284×2778 | Framed store screenshots, one caption each. |

Screenshots are built from device captures: drop `1.png` to `4.png` into
`presskit/screenshots/` and re-run the renderer. The captures currently in the
repository are development builds and **must be retaken from a release build
before submission** — a store listing that shows a dev fixture is a rejection
waiting to happen. Apple accepts the 6.7-inch size for every recent iPhone;
Play accepts the same file.

### `web/` — favicons and the manifest

`favicon-16/32/48`, `apple-touch-icon-180`, `icon-192`, `icon-512`,
`maskable-512` and `site.webmanifest`. These are copied into
`apps/web/public/` and linked from the root route; re-copy after a re-render.
The maskable icon keeps the mark inside the safe circle so Android can crop it
to any shape without cutting the bird.

### Still needed from a person

- A release-build screenshot pass on a real iPhone and a real Android phone,
  in both English and Norwegian.
- The App Store preview video, if we want one; the stores do not require it.
- The mascots' isiXhosa names, which the tutor session settles.
