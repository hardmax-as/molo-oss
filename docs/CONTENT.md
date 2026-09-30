# CONTENT — sources, licences, register, audio tiers

Read before touching `packages/content`, the dashboard, or anything that
produces a lexeme, sentence or audio row.

---

## 1. What we are actually building

A validated, licensed, audio-complete isiXhosa lexicon and sentence bank,
ordered by real conversational frequency, glossed in English and Norwegian —
wrapped in a course. The wrapper is easy. The lexicon is the company.

Targets (see PLAN.md for phasing):

| Milestone | Lexemes | Sentences | Audio | Band |
|---|---|---|---|---|
| Phase 0 spike | 300 | 60 | tier 1, 100 % | A1 |
| Units 1–4 | 600 | 250 | tier 1 ≥ 80 %, rest tier 2 | A1 |
| A2 complete | ~1 500 | ~900 | tier 1 ≥ 60 % | A2 |
| B1 (aspirational) | ~3 000 | ~2 500 | — | B1 |

B1 is listed so nobody pretends it is close. It is a multi-year content
programme with a paid editorial team; the architecture does not preclude it,
and nothing in Phases 0–5 depends on it.

---

## 2. Source matrix

| Source | What | Licence | Register | Use |
|---|---|---|---|---|
| **isixhosa.click** (CSV / GitHub) | ~2 300 lexemes, examples, linked words; SADiLaR-funded, editor-reviewed, UCT-linked | **CC-BY-SA 4.0** (data), AGPL (code) | mixed; learner-oriented glossaries | **Primary lexicon seed.** Ingest as `draft`. Attribute. **Share-alike propagates** to derived lexeme/sentence content — see §3. |
| **Vuk'uzenzele** corpus (DSFSI, University of Pretoria) | 11 SA languages, government magazine; ~2 200 aligned pairs for isiXhosa | **CC-BY 4.0** — verified 2026-09-05 on Zenodo (10.5281/zenodo.7635496) and the DSFSI repository. **Not** share-alike, despite one report saying so. | formal / journalistic | Grammar and vocabulary mining only. Never a model of conversational speech. |
| **Corpus of Spoken isiXhosa** (Språkbanken, University of Gothenburg) | 1 890 sentences / 8 688 tokens of transcribed spontaneous Eastern Cape speech, with morpheme glosses, part-of-speech tags and **free English translations**. Transcriptions only; **no audio is distributed**. | **CC-BY 4.0** — verified 2026-09-05 at `spraakbanken.gu.se/en/resources/xhosa` (DOI 10.23695/xrsg-mp07) | **spontaneous conversational**, Eastern Cape, recorded from 2015 | **The only conversational, translated, commercially usable isiXhosa sentence source we have found.** Recorded and annotated under Eva-Marie Bloom Ström's projects. Editors select the teachable subset: this is linguistic transcription, so expect fragments, disfluencies and dialect. Attribute Språkbanken and cite the DOI. |
| **ZA-Gov multilingual** (cabinet statements) | sentence-aligned | **MIT** | bureaucratic | Same as above; lower priority. |
| **NCHLT isiXhosa text corpus** (SADiLaR / CTexT) | gov.za documents | **CC BY 2.5 South Africa** — [dataset 314](https://hdl.handle.net/20.500.12185/314) | formal | Frequency statistics for *formal* register only; not for ranking Units 1–3. |
| **NCHLT isiXhosa speech corpus** (SADiLaR) | ~56 h transcribed broadband speech, collected with a smartphone prompting tool | **CC-BY 3.0 Unported** — verified 2026-09-05 at `repo.sadilar.org/handle/20.500.12185/279` | read / prompted, native | **Commercially usable with attribution**, which is more than we assumed. Not conversational and not word-level for our lexemes, so it does **not** satisfy the publish gate. Use as a pronunciation reference and for speech-tech evaluation. |
| **Lwazi speech corpus** | read speech, native | research licence — **verify before any product use** | read | ASR evaluation data. **Not** learner audio, **not** for publishing. |
| **Masakhane** (MasakhaPOS / NER) | annotated sentences | varies (mostly CC) | news | POS priors for `xh-morph` validation. |
| **Forvo** (API) | native word pronunciations | Forvo API licence: non-profit $2/mo (500 req/day, **non-commercial only**), commercial small-business $28.95/mo billed 6 months at a time, $173.70 (10 k/day, **commercial allowed, attribution required**) | native | **Tier 2 audio backfill.** Coverage measured 2026-09-23 against Unit 1: **13 of 92 words (14 %)** have a Xhosa pronunciation — and the hits cluster in the greetings (molo, enkosi, molweni, umama, utata), so a random word is worse than that. It cannot carry a unit on its own, and minimal-pair click sets may not use it at all. Revisit as long-tail backfill once tier-1 recording is routine. |
| **Editors / tutors** (recorded via dashboard) | anything we ask for | ours, with **speaker consent** on file | urban conversational (by brief) | **Tier 1 audio. The core.** |
| **Ubuntu Bridge / Tessa Dowling / Teach Yourself / uTalk** | courses, audio | **proprietary** | conversational | **Reference for editors** on sequencing and register. **Never ingested.** |
| **LLMs** (Claude etc.) | drafts of glosses, contrastive notes, example sentences, distractor *candidates* | n/a | whatever we prompt | **`ai_draft` only.** Never concord, never surface forms, never published unreviewed. |

### 2.1 Leads from the September 2026 source survey — verify before ingesting

Two research agents surveyed the open isiXhosa data landscape. The three rows that
mattered most have been checked and moved into the matrix above; what is left here
is **unverified**, so every row is a lead to confirm at the download page, not a
licence position. The verdicts use this document's own test: commercial use must be
permitted, and the register decides whether a source can be published or only mined.

| Lead | Reported contents | Reported licence | Why it matters | Status |
|---|---|---|---|---|
| **NCHLT isiXhosa text + frequency list** | ~1.5M words, POS, lemma, frequency | CC-BY 2.5 South Africa | Used as the written component of frequency ranking alongside the spoken corpus (see `corpora/README.md`). | Verified at [SADiLaR dataset 314](https://hdl.handle.net/20.500.12185/314), 2026-09-21 |
| **SADiLaR / Autshumato monolingual and parallel** | ~233k segments monolingual, ~110k parallel | CC-BY 4.0 | Vocabulary and grammar mining at scale. Government register, so mining only. | Verify |
| **SADiLaR morphologically annotated corpus** | ~46 465 tokens with morphological analysis | CC-BY 4.0 | Directly useful for growing `xh-morph` past its four forms. | Verify |
| **Leipzig Corpora Collection, isiXhosa** | word and frequency lists | CC-BY | Second frequency source to cross-check the first. | Verify |
| **Peace Corps isiXhosa material** | survival dialogues: greetings, family, food, directions | public domain *claimed*; the host disclaims commercial rights | Exactly our register. Needs written confirmation from Peace Corps before any use. | Verify in writing |
| **Tatoeba isiXhosa** | small learner sentence set, per-sentence licence | CC-BY 2.0 FR mostly; audio licence per clip | Usable but small, and every sentence needs a human read. | Verify |

**Ruled out, with reasons worth remembering.** MAFAND-MT, MasakhaNER and Lelapa's
Inkuba datasets are **CC-BY-NC**: non-commercial means non-commercial, and a paid
app cannot use them, not even to mine. JW300 was removed from OPUS after a legal
audit. The Bible and the Quran are large and aligned and therefore tempting, and
they fail on both register and rights. Common Voice isiXhosa exists but holds
about 0.04 hours, which is nothing. There is **no isiXhosa Universal Dependencies
treebank**, and **no Norwegian–isiXhosa material of any kind**, so Norwegian is
produced through English as a pivot and there is no point looking again.

### 2.2 The sentence bottleneck has a price, not a source

The surveys agree on the conclusion that matters: **publishable, conversational,
recorded isiXhosa sentences do not exist under a commercial licence.** Every large
aligned corpus is either the wrong register or the wrong licence. We have eight
sentences and an A2 course wants roughly nine hundred.

So sentences are commissioned, not found. Reported South African market rates, to
be confirmed by quote rather than trusted:

| Item | Reported band |
|---|---|
| Translation or authoring | R1.50–R2.50 per source word, roughly R15–R30 for a short sentence |
| Studio voice recording | R490–R1 000 per hour, plus retakes and editing |

That puts a first block of a few hundred conversational sentences with audio in
the low tens of thousands of rand. It is the cheapest part of this project and the
one everything else waits on. Candidate suppliers named by the surveys include the
Stellenbosch University Language Centre, which does both translation and
recording, and the African language departments at UWC, Rhodes and UCT.

---

## 3. Licence consequences, stated plainly

- **CC-BY-SA on the seed lexicon** means: the lexeme/sentence *data* we
  derive from isixhosa.click must be redistributable under CC-BY-SA. That is
  fine — and arguably good: publish `molo`'s validated lexicon back under
  CC-BY-SA, and contribute corrections upstream. It does **not** infect the
  app code, the UI, the audio we record, or the curriculum design. Keep the
  lexicon export separable so this stays clean.
- **Forvo audio** is licensed by Forvo for the plan in force. Attribution
  ("Pronunciation by Forvo") on any surface that plays a tier-2 asset.
  Forvo's terms also forbid systematic bulk extraction; the backfill is
  targeted (missing published lexemes only), rate-limited, and logged.
- **Speaker consent** is a product asset. `consent_scope = commercial` is
  required before any tier-1 audio is served in a paid tier. Record consent
  in the dashboard, store the signed text, never infer it.
- **Research speech corpora** (NCHLT/Lwazi) are for evaluating ASR. If
  anyone proposes publishing them to learners, the answer is no until a
  licence says otherwise in writing.

`ingest_runs.licence` and per-row `licence` make all of this queryable:
`molo content stats --by licence`.

**We discharge share-alike with a command, not a promise.** `molo content
export --live` writes every lexeme, gloss and sentence whose `licence` is
CC-BY-SA-4.0 to a directory, with a README that credits isixhosa.click, links
the licence, and states the changes we made (learner-facing glosses, Norwegian
glosses and notes, editorial review). Audio, the curriculum and the app are
not in it and are not covered by that licence. The internal export retains every status for editorial reuse. `molo content
export --published --live --out apps/web/public/lexicon-data` instead queries
only published lexemes, sentences and glosses, and writes `lexicon.tgz`
plus a manifest with the headword count and SHA-256. No option on the public
repository function can include drafts. Every live Alchemy deploy builds
this public package from its stage database before the web build; `/lexicon`
links it without requiring an account. A zero-headword package is valid and
says so. Re-deploy after content changes to refresh the downloadable snapshot.
Audio, identities and curriculum never enter either export.

---

## 4. Register policy

**Target register: contemporary urban conversational isiXhosa** — Cape Town
and Eastern Cape, the way people actually greet, ask, joke and complain today.
Standard orthography; everyday lexis; loanwords where speakers use them.

- Government/news corpora: *mine*, never *model*. A sentence that reads like a
  cabinet statement fails review.
- Deep/rural forms: recorded as `register = rural` for culture cards and
  recognition, not for production drills in A1–A2.
- Dialect: note it on the speaker and the lexeme; do not pretend there is one
  isiXhosa. Learners in Cape Town will hear township isiXhosa; the course
  should not make that sound wrong.
- Editors have the final say. Register disputes go to the review note, not
  to a Slack argument.

---

## 5. Audio tiers

| Tier | Source | Publishable to learners | Notes |
|---|---|---|---|
| **1** | Native speaker recorded through the dashboard or in a session, with consent | **yes** | The standard. Minimal-pair click sets **must** be tier 1 from one speaker per set. |
| **2** | Forvo, native, licensed under the plan in force | **yes**, with attribution | Backfill only. Single recordings, variable quality; editors reject noisy ones. |
| **3** | TTS | **no** | Exists for editor comparison and internal tooling only. |

**Processing** (all tiers): `xh-audio` → −16 LUFS integrated, ≤ −1 dBTP,
48 kHz, Opus 48 kbps for delivery, FLAC master retained, manifest with
sha256. No asset is served without a manifest.

**Bare clicks.** Besides words and phrases, the studio records each of the
fifteen clicks on its own (c, x, q and their aspirated, nasal, voiced and
voiced-nasal variants; `CLICK_SOUNDS` in `packages/core`). These are
`audio_assets` rows with `target_kind = 'click'` against fixed ids, tier 1
only (the API and the repository both refuse anything else), and they enter
`in_review` and need a second editor's approval like every other asset. They
are what the onboarding clicks slide and the click drills will play. The one
learner read so far is `GET /clicks` (`learnerRepo.publishedClickAudio`):
published tier-1 takes only, one per click, and an empty list until an editor
approves one. The phone's "Meet the clicks" slide plays the plain c, x and q
from it and shows no play button for a click without one; there is no
placeholder and no TTS. `test:integrity` asserts that drafts, takes in review,
retired takes and a hand-published tier-3 row never appear.

**Tone.** isiXhosa tone is not in the orthography. Tier-1 recording briefs
ask speakers for natural citation tone; editors may annotate `tone_pattern`
from the recording. Do not ask an LLM for tone.

---

## 6. TTS and ASR engine candidates — status as of 2026-09

Verify before relying on any of these; this section will rot.

- **Lelapa AI — Vulavula** (South Africa). Credible, isiXhosa in its MT model
  (Lelapa-X-Glot) and its speech-to-text. Product focus is B2B contact-centre
  transcription; commercially launched isiZulu-first with other languages
  "coming soon." **isiXhosa TTS: not verified.** Evaluate STT for §6 of
  ARCHITECTURE; do not plan on TTS.
- **Google Cloud TTS.** Google Translate has had a synthesised isiXhosa voice
  for years; **confirm `xh-ZA` in the Cloud TTS supported-voices list**
  before writing an adapter. If present, it is the tier-3 default.
- **Meta MMS-TTS.** Open weights, covers isiXhosa, quality mediocre. Fallback
  tier 3; runs on the operator's own hardware if needed.
- **Machine translation as a suggestion source — built 2026-09-20.** Google
  Cloud Translation (Basic, v2 REST, API key `GOOGLE_TRANSLATE_API_KEY`)
  sits behind `molo content gloss --provider google` as a second machine
  beside the LLM drafter. It translates the human English gloss to Norwegian
  and nothing else: never from isiXhosa (its xh→en is weak and its xh→nb goes
  through English), never into it (non-negotiable 1), and it produces the
  gloss only, no usage or contrastive note. With `--live`, every opinion is
  stored in the editor-only `gloss_suggestions` table, unique per word,
  source language and provenance (`google-translate-v2`). Ordinary drafting
  also creates an `ai_draft` canonical gloss when none exists, with provenance
  in its revision entry; an existing human or AI gloss is never overwritten.
  `--compare --live` stores only the second opinion, keeping the canonical
  draft intact, and still prints the comparison. Without `--live` neither
  mode calls Google or writes. The lexeme editor shows the suggestion below
  each gloss with an agree/differs chip using `sameGloss` normalization.
  Suggestions have no publication status and learner queries never read the
  table; publishing still requires the normal canonical-gloss review. Agreement
  is a reason to read fast, disagreement a reason to read slowly. USD 20 per
  million characters, 500 k a month free; a unit is a few hundred characters.
  The consumer site (translate.google.com) is not used: automated access
  breaks its terms and gives no provenance to record.
- **ASR for learner clips:** Meta MMS-1B (NCHLT/Lwazi fine-tunes), Whisper
  v3 Turbo multilingual, Vulavula STT. All trained on native speech. Treat as
  advisory (ARCHITECTURE §6). The long-term answer is a click classifier
  trained on our own consented learner clips.

---

## 7. Editorial workflow

1. **Ingest** (`molo content ingest isixhosa-click --live`) → `draft` rows,
   licence and source set, dry-run report reviewed first.
2. **Curate** — `molo content rank --live` sets `frequency_rank` from the
   spoken/written corpus blend (ARCHITECTURE section 2.3), then `molo content
   curate --live` fills `curriculum/spine.json` with words, corpus sentences
   and the exercises that need no recording, all as `draft`, and sets
   `cefr_band` on the words it assigns. Both are dry runs without `--live`
   and both are idempotent. The dry run's gap table — which skill could not
   find its words, which situation has no usable sentence — is what tells an
   editor what has to be written or commissioned. An editor then revises the
   two files in `curriculum/` and re-runs.
3. **Gloss** — `en` and `nb` glosses. LLM may draft → `ai_draft`; editor
   edits and promotes. A missing `nb` gloss blocks publish.
4. **Record** — batch recorder, tier 1, speaker consent on file. Or Forvo
   backfill for what is missing, tier 2.
5. **Review** — four-eyes (an admin may approve their own work; it is
   logged as such); approve in dashboard. Publish gate runs. Slack
   notified.
6. **Assemble** — sentences from published lexemes with `xh-morph` surface
   forms; exercises reference only published entities; unit published last.
7. **Retire** — never delete; `retired` with a note, revision logged.

Weekly: `molo content stats` and `molo audio missing` to Slack `#molo`.

---

## 8. What "good" looks like in Unit 1

Greetings and the click set, because that is what a learner in Cape Town
uses on day one and what every other app gets wrong or skips:

- *Molo / Molweni* · *Unjani? / Ndiphilile, enkosi* · *Ndingu…* · *Igama lam
  ngu…* · *Uxolo* · *Enkosi (kakhulu)* · *Ewe / Hayi* · *Sala kakuhle /
  Hamba kakuhle* · numbers 1–10 · the classroom/market nouns that carry
  classes 1/2, 3/4, 5/6, 7/8, 9/10.
- Click drills: c vs x vs q in minimal pairs, then aspirated (ch, xh, qh) and
  nasal (nc, nx, nq), one speaker, tier 1.
- One culture card: why *Molo* to one person and *Molweni* to several is not
  optional politeness.

If Unit 1 cannot be recorded to this standard, the project has learned the
most important thing it could learn, cheaply. That is Phase 0's job.


### Vuk'uzenzele: a mining report, never rows (2026-09-04)

The DSFSI Vuk'uzenzele corpus (government magazine, 11 languages, **CC BY 4.0**,
doi:10.5281/zenodo.7598539, github.com/dsfsi/vukuzenzele-nlp) is used for
vocabulary evidence only. `molo content mine vukuzenzele --dir <folder>` reads
the isiXhosa text the operator downloaded, reports lexicon coverage and the
frequent forms the lexicon lacks, and can write that shortlist as CSV for the
tutor. It writes nothing to the database: government prose is not a model of
how people talk, and a word enters the lexicon only through an editor.


### Several voices per word (2026-09-04)

`audio_assets` holds one row per recording, so a word or phrase can carry
any number of published voices; `speakers` now records `gender` and
`age_group` (child, teen, adult, elder). Learner surfaces receive every
published voice (`voices`, tier 1 before tier 2) with the speaker's name,
gender and age group, ordered by the learner's `preferred_voice` (any,
female, male, child, or one speaker), and a switch to hear another voice.
The studio queue accepts `speaker=<id>` so "missing" becomes "not yet
recorded by this speaker", which is how a second and third voice are
collected for words that already have one. The publish gate is unchanged:
one tier-1 or tier-2 voice is enough.


### One lexicon per language, one course over it (2026-09-04)

The product is modelled so a second target language is possible one day
(isiZulu is the one the operator has in mind). **Nothing about isiXhosa's
primacy changes, no second course exists, and not one word of isiZulu was
added.** What changed is where a row lives:

- **A lexeme and a sentence belong to a *language*.** They carry
  `target_lang` (→ `languages.code`, `xh` for everything that exists), and
  their natural keys are per language. A word's noun class, its plural and
  its recording are facts about isiXhosa, not about a syllabus, so they do
  not move when the curriculum around them does.
- **A unit belongs to a *course*.** A course (`courses`) is a curriculum
  over a language: a slug, a target language, a title key, an order, a
  default flag and the same status spine. One row exists — isiXhosa — and
  every unit was backfilled to it.
- **Two courses over one language would share one lexicon**, which is the
  point of having a lexicon. A course is editorial sequencing; the lexicon is
  the asset.

For editors this changes almost nothing today: the content grid, the
recorder, the review queue and every publish gate behave exactly as before.
The curriculum page has a course selector that defaults to isiXhosa, so a
unit is always created in a named course rather than an implied one, and the
lexeme grid can be narrowed to a language (`?targetLang=`). The learner-facing
picker in Settings is deliberately **disabled** with "more languages later".

**The morphology rule.** `xh-morph` is isiXhosa's generator. The publish gate
now asks which generator a row's *language* uses; isiXhosa maps to
`xh-morph` and every other language maps to nothing. A language with no
generator has no morphology-dependent publishing: a noun publishes only on an
editor's explicit plural link, and a sentence only when every unverifiable
surface form is marked irregular with a note. No second generator was
written, and the golden files were not touched. If a second course is ever
started, budget the generator, the validated lexicon and the tutor sessions
before the app work — see docs/ARCHITECTURE.md section 2.6.
