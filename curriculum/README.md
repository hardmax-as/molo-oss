# curriculum — the course spine, as reviewable data

The JSON files an editor is expected to read and correct:

| File | What it is |
|---|---|
| [`spine.json`](spine.json) | The proposed sections and their skills: slug, title key, CEFR band, theme, the grammar point each introduces, and a target number of new words. |
| [`themes.json`](themes.json) | The keyword and sense map `molo content curate` uses to decide which lexeme belongs to which skill. |
| [`grammar-notes.json`](grammar-notes.json) | Explicit grammar notes, loaded as `ai_draft` by `molo content grammar`. |
| [`sentence-requests.json`](sentence-requests.json) | English and Norwegian sentences a beginner needs, per skill, for the tutor to answer in isiXhosa at `/edit/write` (`molo content sentence-requests`). |
| [`culture-cards.json`](culture-cards.json) | Culture cards drafted by a model, each with the claims the tutor must confirm, loaded as `ai_draft` by `molo content culture`. isiXhosa only as `{lemma}` placeholders filled from the lexicon. |

**The spine, the themes and the drafts are proposals, not decisions.** Each says so in its own `header`
field, at length. Nothing here has been reviewed by an isiXhosa editor, and
nothing produced from it is ever published: `molo content curate` writes units,
skills, lessons, exercises and sentences as `draft` and they wait in the review
queue like every other row.

**No isiXhosa is written in these files.** They are English and Norwegian titles,
English keywords, and structure. Every isiXhosa string in the course comes from
the lexicon or a corpus, verbatim, with its provenance — the curation step
selects and arranges, it never writes (the project rules, non-negotiable 1). The lookups in `reference/` are the exception:
they hold the book's forms, each with the page it is printed on.

---

## Why this is a directory of its own

`spike/` is Phase 0's output: a one-off snapshot the `molo` CLI replaced, kept
for reference. This is the opposite — it is meant to be edited for as long as the
course exists, by people who are not going to open `packages/`. So it sits at the
top level next to `corpora/` and `docs/`, where an editor will find it.

JSON rather than TOML, because these files are read by a Vitest unit test as well
as by Bun, and TOML imports are a Bun-only convenience. The prose that would have
been TOML comments lives in the `header` array at the top of each file instead.

## How the two files fit together

```text
spine.json           units and skills, in order,   each skill names a theme
      |                                                     |
      v                                                     v
molo content curate  -----------------------------> themes.json
      |                    picks lexemes whose glosses or corpus senses
      |                    match the theme, ranked by frequency_rank
      v
draft units, skills, lessons, exercises, sentences  ->  editor review queue
```

`titleKey` on every unit and skill points into `packages/i18n`, which is the
authoritative place for learner-facing copy. The `title` object next to it is the
same string kept here so the proposal reads on its own;
`packages/content/src/curriculum/spine.test.ts` fails if the two ever disagree,
in either language.

## Changing something

- **A word is in the wrong skill.** Fix `themes.json` — move the keyword, or add
  the word's gloss to an `exclude` list. Re-run `molo content curate` to see the
  effect; without `--live` it only prints.
- **A skill should teach more or fewer words.** Change `targetNewWords`.
- **The order is wrong.** Change `order` on the units. The prerequisite chain is
  derived from it, so the path relocks itself.
- **A title should read differently.** Change it in `packages/i18n/src/locales/`
  *and* in `spine.json`; the test insists on both.

`molo content curate` is idempotent: run it twice and the second run writes
nothing. It never touches a row an editor has already changed — an existing
exercise, sentence or gloss is left exactly as it was found.
