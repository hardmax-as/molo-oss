# xh-morph

A rule-based isiXhosa noun-class and concord generator. Given a lemma, its
noun class and the form you want, it returns the surface form or a typed
error. It never guesses.

This is the anti-hallucination organ of Molo (see the project rules). Concord
and inflection come from the rule table in this crate, which is held to
forms a native speaker has signed off. Nothing here comes from a language
model, and nothing here may reach a learner until the goldens for its class
pass.

## Status: scaffold, unvalidated

The rule table (`rules/noun_classes.toml`) covers classes 1 to 10 with 1a and
2a, and five forms: plural, singular, subject concord, object concord, possessive
concord. A sixth, the locative, has no rule: `generate` returns `NoRule` for it,
and the golden file collects the tutor's locatives before one is written. Every value in it is marked `validated = false`. The values were
written from standard grammatical descriptions by the agent that scaffolded
the crate and **have not been checked by a native speaker**. The golden file
(`golden/classes_1_10.toml`) has ten placeholder cases with empty expected
forms. `cargo test` therefore fails, and that is the correct state of this
crate until the tutor session fills them in.

## Layout

```text
crates/xh-morph/
  rules/noun_classes.toml     the rule table, editor-readable, compiled into the crate
  golden/classes_1_10.toml    tutor-validated forms; the only place surface forms are asserted
  src/lib.rs                  generate(), Form, MorphError
  src/rules.rs                table parsing, validation, strip and attach
  tests/golden.rs             loads the goldens and asserts each one
```

## The rule table, for editors

The table is TOML. One `[[class]]` block per noun class. You do not need to
read Rust to change it, but you do need a golden case for every change (see
below).

```toml
[[class]]
label = "5"
description = "Singular; very mixed. The full prefix ili- surfaces before monosyllabic stems, i- elsewhere."
prefix = "i(li)-"
strip = ["ili-", "i-"]
attach = [{ when = "monosyllabic", form = "ili-" }, { when = "default", form = "i-" }]
plural = "6"
subject_concord = "li-"
object_concord = "-li-"
possessive_concord = "la-"
validated = false
notes = "..."
```

| Field | Meaning |
|---|---|
| `label` | The class label as used in the lexicon: `"1"`, `"1a"`, `"2"`, `"2a"`, `"3"` … `"10"`. |
| `description` | Free text for editors. Not used by the code. |
| `prefix` | The citation prefix the way grammars print it. Display only. |
| `strip` | The surface prefixes the generator recognises on a lemma of this class and removes to get the stem. Tried in order, so list the longest first. |
| `attach` | How a stem becomes a noun of this class. Rules are tried in order; the first whose `when` holds wins. The last rule must be `when = "default"`. |
| `plural` | Label of the plural class this singular class pairs with. |
| `singular` | Label of the singular class this plural class pairs with. A class has one or the other, never both. The table refuses to load if the pairing is not symmetric. |
| `subject_concord` | The concord this class puts on a verb when the noun is the subject. Written with a trailing hyphen: `u-`. |
| `object_concord` | The concord this class puts inside a verb when the noun is the object. Written with hyphens both sides: `-m-`. |
| `possessive_concord` | The concord a noun of this class takes when it is the possessed head (the "of" concord). Written with a trailing hyphen: `wa-`. |
| `validated` | `true` only after the goldens for this class pass and a tutor has signed them off. |
| `notes` | Anything the next editor needs to know. Examples in notes are marked `# unverified example` until a golden covers them. |

### Conditions

`when` can be one of:

| Condition | Holds when |
|---|---|
| `default` | always |
| `monosyllabic` | the stem contains exactly one vowel letter (a, e, i, o, u) |
| `vowel_initial` | the stem begins with a vowel letter |

That vocabulary is deliberately tiny. If a class needs a condition that is
not here, that is a code change with a golden case, not a workaround in the
table.

### Hyphens

Hyphens in `strip`, `attach.form` and the concords are there to make the
table readable; matching and joining ignore them. One exception: when the
chosen prefix ends in a vowel, the stem begins with a vowel, and the rule
that fired was not a `vowel_initial` rule, the generator joins them with a
hyphen. That mirrors how isixhosa.click writes loanwords (`i-orenji`,
`ii-orenji`, `ama-orenji`). Whether this course wants that convention is a
question for the tutor, like everything else in the table.

### Classes 9 and 10

Grammars write the class 9 prefix as *iN-* (in-/im-) and class 10 as *iiN-*.
In this table the nasal stays with the stem: class 9 strips only `i-`, so
`inja` yields the stem `nja` and class 10 attaches `izi-` (monosyllabic
stem) or `ii-` (otherwise) in front of it. This is a modelling convenience
so that the stem carries whatever nasal the word actually has, not a claim
about isiXhosa phonology. It reproduces the plural pairs in the source data
(`inja/izinja`, `intombi/iintombi`, `into/izinto`, `indlu/izindlu`).

## The golden file, for the tutor session

`golden/classes_1_10.toml` is a list of `[[case]]` blocks:

```toml
[[case]]
lemma = "inja"
class = "9"
form = "plural"
expected = ""              # TUTOR-VALIDATE
validated_by = ""          # TUTOR-VALIDATE
validated_on = ""          # TUTOR-VALIDATE
note = "isixhosa.click word_id=170 (dog)."
```

Rules of the file:

- `expected` is filled **in the tutor session, from the tutor**. Not from a
  dictionary, a grammar, a website, or a model. If you are not sure where a
  form came from, leave it empty.
- A filled `expected` must have `validated_by` and `validated_on`. The test
  refuses a form nobody has put their name to.
- An empty `expected` fails the test on purpose. The crate must not look
  green while a rule is unchecked.
- If the tutor says a word is irregular, write the real form and add
  `irregular = true`. The test then expects the generator to *disagree*,
  which documents the exception for the editor tooling (ARCHITECTURE §2.5:
  irregulars are editor-marked, never generated).
- Conventions for `expected`: plural is the whole word; subject and
  possessive concords are written with a trailing hyphen (`u-`, `wa-`);
  object concords with hyphens both sides (`-m-`).

Coverage target before Phase 1 promotes this crate: at least one case per
class: its pair form (plural or singular) and each concord, plus every irregular the tutor knows
in the top 300.

### Questions for the first tutor session

A scratch comparison of this table against the 336 in-scope singular/plural
pairs in the isixhosa.click data (its `plural_or_singular` links) agreed on
304. The disagreements are the questions to bring, not rules to write:

- **Class 1, vowel coalescence:** the source pairs `umfundisi` with
  `abefundisi`, not `abafundisi`. Is that an irregular, or a rule about stems
  that trigger *a + i → e*? Class 2 has no vowel-initial rule at all yet.
- **Class 3 with a bare `u-`:** the source has `unyaka` (year) pairing with
  `iminyaka`. The table only strips `um-` for class 3, so it refuses this
  lemma. Is there a `u-` allomorph before nasal stems, and which words take it?
- **Class 5 irregulars:** `iliso` → `amehlo`, `igxalaba` → `amagxa`. Confirm
  and record as `irregular = true`.
- **Class 9 nouns with class 6 plurals:** `indoda` → `amadoda`,
  `inkwenkwe` → `amakhwenkwe`. These need a per-lexeme `plural_of` link, not
  a class rule; confirm the lexicon should mark them.
- **Aspiration in plurals:** the source has `icaphaza` pairing with both
  `amacaphaza` and `amachaphaza`. Which is right?
- **Multi-word lemmas:** `igumbi lokulala` → `amagumbi okulala`. The
  qualifier changes with the class too. Out of scope for this crate; confirm
  that multi-word entries stay out of the concord generator and are handled
  as sentences.
- **The hyphen convention** for vowel-initial loan stems, see above.

Each of these should end the session as a filled golden case, an
`irregular = true` case, or a written note that it is out of scope.

## Adding or changing a rule

1. Change the table.
2. Add at least one golden case that the change is needed for, with
   `validated_by`.
3. `cargo test`. If the table now generates a form the tutor did not give,
   the table is wrong, not the golden.

A pull request that changes `rules/` without touching `golden/` is rejected
on principle.

## API

```rust
use xh_morph::{Form, MorphError, generate};

generate("inja", "9", Form::Plural)          // -> Ok(String) or Err(MorphError)
generate("inja", "9", Form::SubjectConcord)  // "i-"  (once validated)
generate("inja", "9", Form::ObjectConcord)   // "-yi-"
generate("inja", "9", Form::Possessive)      // "ya-"
```

`generate` never infers the class from the lemma. The class comes from the
lexicon row. A lemma that does not start with a prefix its class recognises
is a `PrefixMismatch` error; a plural class asked for a plural is
`NoPluralPairing`; a class outside 1 to 10 is `UnknownClass`; the locative is
`NoRule`. Callers treat
every error as "do not generate this exercise", never as "make something up".

`generate_with(&table, ...)` runs against an explicit `RuleTable`, for tests
and for previewing a proposed table in the editor dashboard later.

## WASM

Behind the `wasm` feature the crate exports `generate(lemma, class, form)`,
`can_generate_plural(lemma, class)` and `rule_table_json()` through
`wasm-bindgen`:

```bash
cargo build --release -p xh-morph --target wasm32-unknown-unknown --features wasm
wasm-bindgen --target web --out-dir crates/xh-morph/pkg target/wasm32-unknown-unknown/release/xh_morph.wasm
```

`can_generate_plural` is the function the publish gate asks. It answers
`true` only when the class is `validated = true` in the rule table *and*
generation succeeds. Every class is unvalidated today, so it answers `false`
for everything, and that is correct: the WASM binding refuses to vouch for a
form no tutor has signed off, even when the rules would produce one.
`generate` itself still runs for editor previews and reports the same typed
errors as the native API, as JS strings.

## Running

```bash
cargo fmt --check
cargo clippy -- -D warnings
cargo test            # golden test fails until the goldens are filled; unit tests pass
```

## Out of scope for this crate today

Classes 11, 14, 15, a locative rule (the golden cases come first), adjective
and relative concords, verb
morphology, tone. See `docs/PLAN.md` Phase 5.
