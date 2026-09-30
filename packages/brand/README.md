# Molo brand assets

Vector sources for the mascot and the hero landscape, drawn in the
`docs/DESIGN.md` palette. The web components in
`apps/web/src/components/illustrations/` are the living versions (they
animate); the SVG files here are static exports for mobile, store listings
and documents. Redraw here first, then port.

- `sunbird-hello.svg`: the voice, a malachite sunbird (common in the
  Eastern Cape).
- `penguin-hello.svg`: the learner, an African penguin (endemic to South
  Africa and Namibia). Their isiXhosa names are the tutor's call.
- `crane-hello.svg`: the mentor, a blue crane (South Africa's national bird).
- `landscape.svg`: sun, hills, an aloe.

## Rendered artwork

`presskit/` holds the sources and the renderer. `bun
packages/brand/presskit/render.ts` draws everything: press and social images
in `presskit/png/`, the App Store and Play Store set in `presskit/store/`,
and favicons plus the web manifest in `presskit/web/` (copied into
`apps/web/public/`). `presskit/PRESSKIT.md` lists every file, its size and
what it is for, and says what still needs a person.

Licence: created for Molo; no third-party artwork.

## Licences and attributions

`legal/attributions.en.md` and `.nb.md` are the shared legal source. Web
`/licences` and mobile Settings bundle their generated Markdown and the
appropriate app's library list. Original assets have `LICENSE-assets`; the
application code is AGPL-3.0 (the repository's `LICENSE`).

After changing dependencies, the lockfile or these legal sources, run
`bun run licences:generate` and commit `generated/`. Both builds regenerate;
`bun run licences:check` and the unit suite reject stale committed output.
The extractor reads installed production trees locally, excluding private
workspace entries. It retains full available notices, including bundled
third-party notices. Reviewed supplements in `legal/library-notices/sources.json`
record exact package versions, source URLs and SHA-256. Where a publisher
supplies only a licence designation, the supplement says so, preserves available
attribution and includes standard terms; it never invents a copyright notice.
See the library notes for those limitations and API
verification. Regeneration makes no network request.
