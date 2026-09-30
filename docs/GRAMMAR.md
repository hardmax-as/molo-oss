# GRAMMAR — what we teach, how we show it, and what we may not claim yet

Two external research reports on grammar landed on 2026-09-05: one on how
language apps present grammar and what second-language research says about it,
one on what an A1 to A2 isiXhosa syllabus actually contains. This document is
what we concluded, what it changes in the code, and the line we will not cross.

The reports were not of equal quality, and where they disagreed the better
sourced one won. Section 5 says which claims we rejected and why.

---

## 1. The decision: we teach grammar explicitly

**Molo states its rules.** A short worked example, then the rule in a sentence or
two, then the drill, then a correction that names the pattern when a learner gets
it wrong. A reference page stays available for anyone who wants to go back to it.

This is a deliberate departure from the largest app in the category, and the
evidence for it is strong enough to be worth writing down.

- **Adults do not learn like children.** Under implicit teaching, adults notice
  and verbalise rules anyway. Withholding the explanation does not produce
  child-like acquisition; it produces a private, often wrong, rule. For a concord
  system that is dangerous, because a wrong self-invented rule about agreement
  corrupts every sentence the learner builds afterwards.
- **Explicit instruction helps most where rules are complex.** Norris and Ortega's
  meta-analysis of focused instruction found explicit types more effective than
  implicit ones, with the advantage largest for complex structures. Concord is a
  complex structure by any definition.
- **The apps praised for hard grammar explain it; the ones learners fault do
  not.** LingoDeer and Babbel put the explanation next to or before the exercise.
  Rosetta Stone, Pimsleur and Memrise are the ones learners of difficult
  languages say leave them lost.
- **Duolingo is the wrong model here, for a specific reason.** Its own position
  is that it combines implicit teaching with explicit tips, guidebooks and
  grammar skills. But those are unevenly distributed: the smaller courses, built
  by volunteers, largely never got them, and its newest explanation feature did
  not cover courses of isiXhosa's type at launch. **isiXhosa on Duolingo would be
  an outlying course**, which is exactly the category where its grammar support
  is thinnest. Copying Duolingo's marketing would mean inheriting its worst
  learner experience, not its best.

### Why a concord language settles the argument

Spanish gender is a two-way choice, it mostly touches articles and adjectives,
and a learner can limp along getting it wrong. isiXhosa agreement is a fifteen-way
system that appears on the verb in the learner's **first sentence** and cascades
into possessives, adjectives, demonstratives and relatives. There is no sentence
you can build while postponing it.

The cautionary case is Duolingo's Swahili course, which shares the concord
system. It is widely judged to leave noun-class agreement un-automatic even after
a learner finishes the whole thing. Where its tips do exist, they resort to
explicit class tables anyway. **Treat that as the specification of what not to
do.**

### The four things an A1 learner must be told, not left to infer

1. Nouns come in classes, and the class is usually visible in the prefix.
2. The verb carries a subject concord that agrees with the subject's class. This
   is shown on the very first sentence.
3. The present tense has a long form with `-ya-`, which drops before an object.
4. Plurals are made by class pairing, not by a suffix.

Everything else can be met as a pattern first. These four cannot, because getting
them wrong is not a mistake in one sentence; it is a mistake in all of them.

### How a rule is shown when tone is not written

Tone in isiXhosa is phonemic and the orthography does not mark it. That has a
consequence for every rule we write: **the audio is part of the rule, not an
illustration of it.**

- Never present a written paradigm as complete. Every cell has its recording.
- Where two words differ only in tone, say so and let the learner hear the
  difference. Do not pretend the spelling carries it.
- Split words into their morphemes visually, so the learner sees concord and root
  as separate things. The writing hides structure; the split reveals it, and the
  audio supplies what the writing omits.

---

## 2. The syllabus we are checking ourselves against

Neither report could copy a table of contents out of the two standard teaching
grammars, so this order is triangulated from several university and course
outlines rather than taken from one authority. Treat it as the shape to argue
with, not as scripture.

**A1.** Clicks and sounds. Greetings and introducing yourself. Noun classes,
starting with 1 and 2. Subject concord and the present tense with `-ya-`.
Singular and plural pairing. Simple questions. The imperative.

**A2.** Object concord. Possessives. Adjectival and relative concord.
Demonstratives. Past, future and perfect. **Negation taught paired with each
tense rather than as one block**, because it changes the final vowel and
interacts with the tense. Numbers as enumeratives. Locatives. Copulatives.

**Deferred past A2.** Enumerative and quantitative concords in full, relative
clauses in depth, the subjunctive, the full copulative paradigm.

Two of those deserve a warning. **Copulatives are not a simple verb "to be"**:
isiXhosa has existential, identificative and descriptive copulatives, each with
its own concords and tenses. And **negation is the genuinely hard part of the
verb**, which is why it is taught with each tense rather than saved up.

---

## 3. What this changes in the code

**The rule table is short by three classes.** isiXhosa is conventionally
described as having fifteen noun classes. `crates/xh-morph/rules/noun_classes.toml`
covers 1 to 10 plus 1a and 2a: twelve. Classes 11, 14 and 15 are missing, and the
locative classes 16 to 18 are absent by a decision nobody wrote down. The header
now says so.

**A prefix does not determine a class.** `um-` is class 1 or class 3; `i-` is
class 5 or class 9. Our generator is not exposed to this, because it takes the
class as an argument and never infers it — the editor sets it on the lexeme. But
anyone who assumes the prefix is enough will be wrong, and the rule file now says
so where somebody adding a rule will read it.

**Cape Town speech is merging classes, and Cape Town is our declared register.**
Class 3 concords are increasingly replaced by class 1 concords, and there is a
reported incipient merger of 11 into 5. Our content rule says modern urban
isiXhosa as spoken in Cape Town and the Eastern Cape today. So for class 3 the
textbook answer and the register answer may differ, and the tutor has to be asked
which form a learner should be taught and whether the other should be accepted.
Golden cases for this are now in the file.

**The goldens do not cover every class they claim to.** Ten cases across eight
classes; 2a, 4, 8 and 10 had none. Cases have been added so a tutor session
covers the table it is meant to validate.

---

## 4. The line we will not cross

**No learner-facing grammar material may be built on the unvalidated rule table.**

This is the question we sent out, and the better report's answer is
unambiguous. Our finite-state guarantee protects against *inflectional* error
given a correct rule table: a form is generated correctly or refused. It cannot
detect a *wrong rule*. If the class 3 concord is entered wrongly, the engine will
generate wrong forms confidently and forever, and the publish gate will not catch
it, because the gate asks whether a form could be generated, not whether the rule
behind it is true.

Every value in that table is a claim taken from grammatical descriptions and
written down by an agent. No native speaker has checked one of them. That is why
every class is `validated = false`, why the golden test is red on purpose, and
why the publish gate treats an unvalidated class as "cannot generate".

**A model may draft the explanation. It may not be published.** On 2026-09-05 the
operator decided that grammar notes should be written rather than left blank, and
the status machine already had the right shape for it: a drafted note is an
`ai_draft`, which no learner-facing surface can query and which cannot reach
`published` without an editor reading it. That is stronger than a label saying
"not reviewed", because it is enforced in code rather than by whoever remembers
to look. The same three rules apply as to any drafted content: the explanation is
in English and Norwegian, every isiXhosa word in an example comes from the
lexicon verbatim and every inflected form is one the engine actually generates,
and the row carries the caveat that the table underneath it is unvalidated, so
the editor knows they are checking two things at once — whether the explanation
is clear, and whether the claim is true.

Two consequences follow, and they are already true in the code:

- No exercise that depends on a generated form reaches a learner. The curation
  run produced zero concord exercises for exactly this reason.
- **The grammar notes in `curriculum/spine.json` rest on the same unvalidated
  table.** They are editor-facing English, they are marked as needing a tutor's
  eye in the file's own header, and none of them has been turned into
  learner-facing copy. That must stay true until the table is signed off.

The gate we already apply to content should extend upstream to the rule table
itself. A class is validated when a native speaker has given its forms in a
session and someone has recorded who and when.

---

## 5. What we rejected, and why

The two reports disagreed on the question that mattered most.

| Claim | Report A | Report B | What we do |
|---|---|---|---|
| Is it safe to build on the unvalidated table? | No. The finite-state guarantee protects form, not description. Validate class by class first. | "I stor grad trygt" — largely safe, since the approach is affix-based. | **Report A.** It is the one with the argument, and it is right about what the guarantee does and does not cover. |
| Which teaching grammar to buy | Kirsch and Skorge, *Complete Xhosa* | "Complete Xhosa … forf. f.eks. Helen Eaton" | **Report A.** The second attributes the book to someone who does not appear to have written it. |

Report B carried several rows marked "ingen spesifikk kilde funnet" and still
stated them as fact. It is kept for its syllabus detail, which broadly matches,
and not relied on anywhere a source was missing.

---

## 6. What was built, and what it may say

The presentation in section 1 exists on both clients. A grammar note is a
content row like any other: it belongs to a **skill**, carries a body per
source language, runs the same status machine, and a learner surface queries
`published` only — on the note *and* on its body, so an unreviewed Norwegian
translation cannot ride in behind an approved English one.

- **Before the drill:** `GrammarNote` on web and mobile — a worked example,
  the rule in a sentence or two, then a paradigm in which every cell carries
  its own play button and a cell with no recording says so. Shown once,
  skippable, and remembered per device (`grammar-seen`), so a learner who has
  read a rule is not stopped by it again.
- **After a mistake:** the note's title and its `correction` render inside
  the check bar's existing live region, so the verdict and the pattern are
  one polite announcement.
- **Morphemes:** `MorphemeSplit` draws a word as its parts from the row's own
  `morphemes` — the same shape the Gothenburg corpus gives per token — and
  draws a word whole when nothing has segmented it. It never invents a split.
- **A reference page:** `/grammar` on web, the same screen under the learn
  stack on mobile, listing the rules the learner has unlocked and counting
  the ones still ahead.

### What the notes say, and why they are drafts

`curriculum/grammar-notes.json` holds three A1 rules — nouns come in classes,
one and more than one, the verb agrees with the class. The English and
Norwegian were written by an agent, so `molo content grammar` loads every note
and every body at **`ai_draft`**: the status the machine already has for
content a model wrote, which no learner surface can query and which has no
code path to `published` that does not pass a human editor.

**No isiXhosa is written in that file.** A cell names a lemma, the class it
should be in, and which form is wanted; `packages/content/src/grammar.ts`
resolves it against the lexicon (a citation form, matched verbatim, class
checked) or `xh-morph` (anything inflected), and drops the cell when neither
can answer. Morphemes are split only where the class's own declared prefix
provably starts the string.

Every note carries a `caveat` on the row naming what the reviewer is
validating beyond the prose, because section 4 has not moved: the table is
`validated = false` on every class, so each prefix, pairing and concord in
those notes is an unchecked claim. Publishing one answers two questions at
once, and the editor's form says so in warning colours.

**What is deliberately absent**, and stays absent until the table grows: the
present tense with `-ya-` (item 3 of the four things an A1 learner must be
told) — the rule table holds no verb morphology at all, so there is nothing to
build it on; classes 11, 14, 15 and the locatives; and where in a word a
concord attaches, since the table gives the morpheme and not its position.
Object and possessive concords are in the table and were left for a later
pass. Classes 2a, 4 and 8 are missing from the subject-concord table only
because the seed lexicon has no word in them.

## 7. What is still open
- **The three notes need a tutor.** They are `ai_draft` and invisible; the
  session that validates the rule table validates them too.
- **Classes 11, 14 and 15** are absent from the rule table. Adding them means
  writing more unvalidated claims, so they wait for the tutor session that
  validates the twelve we have.
- **The mergers** need a decision from a speaker, not from us: teach the textbook
  form, teach the Cape Town form, or teach one and accept both.
- **Gaps the YouTube cross-check found** ([research/youtube-2026-09.md](research/youtube-2026-09.md)).
  None of these is built, and none may be until a speaker confirms the rule:
  - *Vowel coalescence in possessives.* When the possessive -a meets a possessor
    beginning with i or u, the vowels merge. `xh-morph` has no rule for it, so
    it can only produce possessives with a pronoun possessor, which is what the
    goldens use today.
  - *First- and second-person concords.* The rule table covers the noun
    classes only, so nothing yet generates "I", "you" or "we" forms.
  - *Locatives* (classes 16–18). Unit 4–5 "locations" will need them.
  - *When -ya- drops.* §1 item 3 says it drops "before an object". Whether an
    object concord inside the verb counts is tutor question Y04.
