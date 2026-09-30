# Editor guide

For the people who make Molo's content true: the isiXhosa tutor and the
editors. Everything here happens in the dashboard at `/edit`; you never
need a terminal. The one rule that shapes every screen:

> No learner ever sees content that a human isiXhosa editor has not approved.

A row moves `draft → in review → published`. You cannot publish your own
work (a second editor approves), and the app refuses to publish anything
that is not complete. The one exception is an admin, who may approve their
own work; the history then says that no second editor did. The "What is missing" panel on every editor page tells
you exactly what stands in the way.

## The tabs

| Tab | What it is for |
|---|---|
| **Today** | What needs doing, in two columns — to write and to record — with a third block for everything the app is refusing to publish and why. Every number is a link to the rows it counted. This is what `/edit` opens on. |
| **Content** | The lexicon grid: search by lemma, filter by status, part of speech, noun class, missing gloss or missing audio. "New lexeme" creates a draft. Tick rows to act on several at once. |
| **Curriculum** | Units → skills → lessons → exercises. Create any of them inline; each row has "Send to review", "Approve", "Reject" and "Delete draft". Exercises open in their own editor. |
| **Sentences** | Build sentences from words that already exist in the lexicon. xh-morph checks each word's form; it never fills anything in for you. |
| **Write sentences** | For the tutor: English sentences a beginner needs, each with the words it should use. Type the isiXhosa; it becomes a draft sentence. See "Write the sentences" below. |
| **Culture cards** | For the tutor: short notes on how isiXhosa is used, drafted by a model, each with the claims to confirm. See "Check the culture cards" below. |
| **Review queue** | Everything waiting for a second pair of eyes, oldest first. Claim an item so two people do not review the same row. |
| **Studio** | The recording queue: every word and phrase that still lacks native audio, one after another, with record, play-back and upload on one screen. Requires the speaker's consent record. |
| **Golden forms** | The tutor's sheet of validated noun-class forms. Every card saves itself to the server; the operator turns them into the TOML that unlocks each class in xh-morph. |

When a new version of Molo is deployed while an editor page is open, a yellow
box above the page says so, with **Refresh**. It never refreshes by itself:
finish the card or the take you are on first. It checks every few minutes and whenever
you come back to the tab.

## What needs doing

**Today** is the first screen, and it is a work queue rather than a set of
numbers to admire. Nothing on it is decoration: every figure is rows you can
open, and clicking it takes you to the list already filtered to them.

- **To write** names skills whose lessons hold no sentence yet, with the unit
  each belongs to, then counts words missing a Norwegian gloss, an English
  one or both, exercises built on content that is not published, and
  sentences short of a translation.
- **To record** breaks the words with no native recording down by unit, so a
  session can be one unit long, and clicking a unit opens the studio already
  filtered to it. Under that: takes that are recorded and waiting for a
  second editor, and how many speakers have consent on file — a session
  cannot start without one, so that figure turns red at zero.
- **Notes on words and sentences** lists the latest notes from the studio,
  on words, sentences and clicks, each linked to the page where the fix is
  made (a click's note opens that click in the studio). A note changes nothing by itself. The section is hidden while
  there are none.
- **Blocked from publishing** is the publish gate's own verdict, added up:
  "34 words need a recording, 12 need a Norwegian gloss, 8 sit in a noun
  class xh-morph cannot yet inflect", rather than finding out one row at a
  time. A count of zero is left off the page entirely — a queue of noughts
  is not a queue.

A figure that says twelve gives you twelve rows. If it ever does not, that is
a bug worth reporting: a test compares every number here against what the app
would actually refuse.

## Doing several rows at once

Tick the box at the start of a row in **Content**. Shift-click another box to
take everything in between; the box in the header takes the whole page. A bar
appears at the bottom of the screen with the count and four actions: **Send to
review**, **Send back to draft**, **Retire** and **Approve and publish**.
Everything is keyboard-operable — Tab to a box, Space to tick it, Shift-Space
for a range.

Sending back and retiring ask for a note, exactly as they do on a single row.
Publishing asks you to confirm.

**A batch is not a shortcut.** Each row is checked on its own, with the same
rules: you still cannot approve your own work, an AI draft still cannot jump
to published, and a row missing audio, a gloss or a validated class is still
refused. When the batch finishes, a panel lists every row: what moved, and for
anything that did not, exactly what stood in the way. Blocked rows are left
untouched — fix them and try again.

## A lexeme, start to finish

1. **Content → New lexeme.** Lemma exactly as the source spells it, part of
   speech, noun class for nouns, source and licence. It opens as a draft.
2. **Glosses.** English and Norwegian, short, everyday sense first. The
   contrastive note is where you warn a Norwegian speaker about tonelag or an
   English speaker about stress. "Draft glosses with AI" fills empty
   languages as an *AI draft* you must read and correct; it never writes
   isiXhosa and never overwrites a human gloss.
3. **Generated forms.** The panel on the right shows what xh-morph makes of
   the word (plural, concords). Until the tutor has validated the class, the
   panel says so and the forms do not count for publishing. If a form is
   wrong, that is a golden case to record, not something to edit here.
4. **Audio.** Record it (Recorder tab) or wait for the Forvo backfill. Tier 3
   (synthetic) audio never satisfies publishing.
5. **Send to review.** A second editor opens the review queue, listens,
   reads, and approves or rejects with a note. Approval publishes the lexeme
   and its draft glosses together.

## Golden forms

The **Goldens** tab records the tutor's validated forms and exports the
TOML cases used by xh-morph. Bring the unvalidated classes and the sentence
mismatches to the session; the tutor supplies the forms, and the operator
records the decision and its attribution.

The sheet is pre-loaded from the golden file and grouped by class pair: 1 and
2, 1a and 2a, 3 and 4, 5 and 6, 7 and 8, 9 and 10. Each noun card shows one side
of its pair and asks for the other: the plural of a singular-class word, or the
singular of a plural-class word ("Class 2 → class 1"). No card asks for the
plural of a word that is already plural. Answers the tutor gave on the old
plural-of-a-plural cards stay readable: under **Earlier answers to cards no
longer asked** at the bottom, and on the new singular card for the same word.
Nothing is ever filled in for the tutor: the answer is the tutor's.
Each case includes its lexicon source and gloss; the form, tutor and date
stay empty until you supply them. Enter the tutor’s form before choosing
**Compare with xh-morph**. Agreement is only a comparison, not approval; keep a
disagreement for discussion and record an irregular as below.

**The agreement (concord) cards are parked.** "Subject concord" reads too
easily as a question about pronouns, so those questions are being rebuilt as
sentence frames: a card shows an English sentence ("The tree is falling", "I
see the tree", "the child's tree", with -wa, -bona and umntwana). The tutor writes the whole sentence as she would say it,
selects the part that agrees with the noun and presses **Mark**; the card shows
what would be saved, and only **Use this** saves it, with her sentence kept in the
note. Until the operator switches this on (`GOLDEN_FRAMES_LIVE` in
`apps/web/src/lib/golden-frames.ts`, in a reviewed PR), the sheet shows a
"coming soon" box instead of the concord cards, with what agreement means by
example and any earlier concord answers, read-only. An admin can try the frames first at
`/edit/goldens?frames=preview`.

**Locatives** have their own section after the class pairs, with a link in
the jump list. Each card shows a noun and asks for the one word for "at, in, to
or from" it, as the tutor would say it. xh-morph has no locative rule yet: **Compare** says it cannot compare, and the
answers are what a rule will later be written against.

A box at the top says in plain words what to do: each card asks for one form
of a word, for example the plural; type the form you would say under **Your
answer (isiXhosa)**, and leave it empty if unsure. **Your name** and **Date**
are filled in from **This session**, entered once; a card you change by hand
keeps its own value. The class links under it jump to a class and show how many
of its cases are ready.

Each card saves itself to the server when you leave it, and says **Saving…**
then **Saved**, with who saved it last. A tutor can close the page and carry on
another day, on another device. If a save fails, the card says so in red with
**Try again**; what was typed stays in this browser and is sent again the next
time the page opens. The bar at the bottom of the screen stays in view: it
counts ready and remaining cases, **Next unfinished** takes you to the first
case still missing something, and it says whether every card is saved.

Only complete cards count: an answer, a name and a valid date. The operator runs
`molo morph goldens pull` (add `--env prod` for production) to see what the
server holds, then repeats it with `--live` to update the golden file and
generated session sheet, and runs the golden tests. The database is only read.
Of the pair cards, the pull takes only the other side of a pair: the plural of a
singular noun (classes 1, 1a, 3, 5, 7 and 9) or the singular of a plural noun
(classes 2, 2a, 4, 6, 8 and 10). An answer to an old card that asked for the plural of a
plural (and the plural of isiXhosa, which has none) or to a concord card is
listed as skipped, with the reason, and stays on the server: the concord cards
wait for the sentence frames. A locative answer is taken as she wrote it. An
empty answer is never merged.
`molo morph goldens import` applies the same rule to a downloaded file.
An admin also sees the TOML and a download at the bottom of the page, and
`molo morph goldens import <file.toml>` still merges a file. Repeating either
does not add duplicate cases. Unfinished cases continue to fail the gate.

### Tutor session agenda

1. **Goldens by class pair.** Work through one pair at a time. Ask for the
   other side of each noun first (plural or singular), then the other forms
   needed by the course. The locatives come last, in their own section.
   Record each confirmed form with the tutor's name, validation date and any
   conditions or usage notes. Leave uncertain cases unvalidated.
2. **Sentences flagged as mismatch by xh-morph.** Read each sentence and its
   token forms with the tutor. Establish whether the source text, tokenisation
   or generator rule needs correction. Record the tutor's decision; a mismatch
   is not permission to substitute a guessed form.
3. **Write the sentences.** Open **Write sentences** and choose the unit,
   `greet-and-introduce` first. Work down one skill at a time; see "Write the
   sentences" below.
4. **Check the culture cards.** Open **Culture cards** and go through the
   numbered claims on each card; see "Check the culture cards" below.
5. **Open editor questions.** Bring unresolved meanings, register, pronunciation
   and usage questions from the review notes. Record the answer against the
   relevant content row, or keep the question open if the tutor needs to check.
   The prioritised list is [tutor-questions.md](tutor-questions.md), including
   Y01–Y09 from the YouTube cross-check.
6. **The three mascots' isiXhosa names.** Show the tutor the illustrations and
   explain their roles from [DESIGN.md](DESIGN.md#illustration): the malachite
   sunbird is the voice, the African penguin is the learner, and the blue crane
   is the mentor. The tutor proposes the names during the session. The operator
   writes the agreed names into `packages/brand`, with the tutor's name and the
   date. Nobody proposes names beforehand; bring the pictures and roles only.

**Recording an irregular:** select **Irregular** on the golden case, enter the
tutor's exact form in **Form the tutor gave**, and record the lemma, class, requested form,
tutor's name, validation date and a note explaining the exception and when it
applies. Export the case for the operator to add to the golden files. For a
sentence token that the generator cannot check, mark the token irregular with
the same explanation in its note. An irregular is a recorded human decision,
not a way to silence a mismatch or bypass review.

## An exercise

Open **Curriculum**, find the lesson, "New exercise". For listen-and-pick
exercises the form does the work: pick the prompt word, pick the options,
mark the correct one. For other types you edit the JSON; the page validates
it as you type and the template shows every field. The "Referenced content"
list flags any word that is not yet published, because an exercise cannot
publish before its words do.

Order of publishing is bottom-up: words, then exercises, then the lesson, the
skill, the unit. The learner sees a unit only when the whole chain is
published.

The Curriculum page has a **Course** selector at the top. There is one
course — isiXhosa — and it is already chosen, so nothing changes for you.
It is there so that, if a second course is ever built, a new unit lands in
the curriculum you picked rather than in whichever one happened to be first.
Words and sentences are not per course: they belong to the language, and a
second course over isiXhosa would teach from the same lexicon you are
building now.

## A sentence

**Sentences → New sentence.** Type the isiXhosa exactly as it should read;
it is stored verbatim. Then build the word list underneath from the
lexicon, one token at a time, giving each the form it has in this sentence.
"Check with xh-morph" marks each token verified, unverified or mismatch. A
mismatch means the generator disagrees with you: either the sentence has a
typo or the rule table is wrong, and the tutor decides which. A form
xh-morph cannot check yet must be marked irregular with a note before the
sentence can publish. Add the English and Norwegian translations, then send
to review.

## Recording session (for a speaker)

Open **Studio**. Pick yourself as the speaker (an admin must have recorded
your consent once). The queue shows what needs a voice, most-used words
first: the isiXhosa large, the English and Norwegian under it, and "12 of
340" so you know where you are.

**A take that should not exist** (a test, a false start, the wrong word):
**Delete take** beside it removes it for good while it is unpublished; only
the person who uploaded it, or an admin, sees the button. Published audio is
never deleted, only retired.

**A note on any item.** Every word, sentence and click has a **Note** button
under its gloss, recorded or not. Write a line and press **Send note**: the
item stays where it is, nothing is skipped or changed, and the note shows
under **Notes on words and sentences** on **Today**.

**A word that is wrong.** Press **Skip**. A box asks what is wrong with it
("the gloss is wrong", "the prefix is missing"); write a line, or skip without
one. Skipped items move to the end of the list and stay skipped when you come
back, and the note lands in the word's history and under **Notes on words and
sentences** on **Today**, linked to the word. **Edit this word** under the
gloss opens the word's own page in a new tab if you would rather fix it
yourself. When only skipped items are left, the studio says so and offers
**Record the clicks**.

**The clicks on their own.** Choose **Clicks** under "To record" (on the phone,
**Clicks** at the bottom of the unit menu). The fifteen clicks come up one at a
time, the letter large and its kind under it ("The q click, aspirated"). Say
the click on its own, pause, and say it once more; nothing else goes in the
take. A plain click and its variants belong to the same sitting and the same
voice. Click takes have no page of their own, so an editor approves them here:
untick "Only missing audio" and press **Approve** next to a take in review.
The approver must be a different editor from the one who recorded it.

- Press the record button or the space bar, say the word once, press again.
- The take appears as a waveform, with its length and its loudest peak. A red
  warning means it clipped — move back from the microphone and record again.
  A yellow one means it was too quiet.
- Drag the two handles to cut silence off the start and the end, or use the
  arrow keys with a handle focused (Shift for bigger steps, Page Up/Down for
  half a second, Home/End for all the way). "Keeping N s" shows what is left.
  "Undo trim" puts it back.
- Nothing plays by itself. Press **Play take** (or P) to hear it — once you
  have trimmed, it plays exactly what will be uploaded. If you slipped, record
  again; only the last take uploads.
- **Recorded it in another app?** **Use a file** takes a WAV, M4A, MP3, FLAC or
  OGG file for the item on screen instead of the microphone. It gets the same
  waveform, trim and play, and uploads as a studio recording with the speaker
  chosen at the top.
- **A whole folder at once:** **Upload files**, then choose the files. Name
  each one after the word or letter it says (capitals and accents do not
  matter). The studio lists which file goes with which item, with a play
  button each, and which files it could not match, before anything is sent.
  A name that fits two items is never guessed; use **Use a file** on the
  right one.
- **Fixing a take later:** untick "Only missing audio" and open the item. Its
  takes are listed with their status; **Replace** lets you record a new one,
  use a file, or **Trim this take** to cut the saved one. When the new take is
  saved, a take still in review is sent back as replaced, with that note in its
  history. A published take stays live until an editor approves the new one.
- Upload, and the next item appears. A row shows "processing" for a minute
  while the audio is trimmed and normalised, then it lands in the review
  queue where another editor approves it.

Trimming here is a convenience, not the pipeline. The server still trims
silence and normalises loudness on everything it receives, so a take you did
not trim is not worse — you are only saving it the guesswork at the edges.
- Filters let you do one unit at a time, or only sentences. Your place is
  remembered if you close the tab.

You cannot publish your own recordings; that is by design.

## Who is reviewing what

The **Review queue** shows an assignee on every row. "Assign to me" claims it;
"Unassign" gives it back. **Show: All / Mine / Unassigned** narrows the list, so
you can work through your own pile or pick up what nobody has taken. An admin
can also hand a row to a named editor with the dropdown. Hovering the assignee
chip says when it was claimed and by whom, and every change is written to the
row's history.

Each row says what it is and who made it: a culture card by its title (it
opens the culture cards page), a sentence by its text (it opens the sentence),
and a recording by its word, with the speaker and a play button. A recording
is approved or sent back right on the row, since it has no page of its own.
A row you made says so, and its approve button is off: someone else approves
it.

Claiming a row does not review it. Approving is still a transition, and still
needs a second pair of eyes.

**Approve many at once.** Tick rows, or "Select everything you can approve",
then **Approve and publish selected**. Recordings and glosses go first, then
words and sentences, then exercises, lessons, skills and units, so one run
can publish a whole unit whose parts are ready. Each row still passes the
same publish check as a single approval; a row that cannot be published yet
stays in the queue with the reason written under it. A lesson, skill or unit publishes
once what you sent of it is published: parts still in draft do not hold it
back, and learners see them only when they are approved too.

## Write the sentences

A tutor session, not a desk job: the tutor types, an editor sits beside her.

**Write sentences** lists English sentences a beginner needs, grouped by
skill, each built around words that skill already teaches. The words are
shown with their English and Norwegian glosses; the grey line under the
sentence says who is speaking to whom. The English and Norwegian were
drafted by a model and loaded with `molo content sentence-requests`; the
isiXhosa is typed here by the tutor and nobody else.

For each card:

1. **Type the isiXhosa** exactly as you would say it. It is stored verbatim.
   Use the listed words if they fit; if a natural sentence needs other
   words, use them.
2. **If the English does not say what your sentence says, change the
   English** (under "Change the translation"). The English is a prompt, not a
   translation you must match. Leave the Norwegian alone unless you read
   Norwegian; an editor who does will check it.
3. **Save sentence.** It becomes a draft sentence with the provenance
   "tutor, *your name*, *date*", its English as your translation and its
   Norwegian as an AI draft. The card moves to **Written**, where **Send
   to review** puts it in the review queue for a second editor.
4. **A written sentence that was a slip or a test** can be taken back while
   it is still a draft with no recording: **Take back and rewrite** deletes
   it and puts the card back under "To write". The writer or an admin can.
5. **If a sentence does not work in isiXhosa**, choose **Set aside** and say
   why in a line. That note is what the next person reads. **Put back**
   undoes it.

A saved sentence still has the whole road of "A sentence" ahead of it.
**Record it** under a written sentence opens the Studio on phrases, on that
sentence: a sentence belongs to its request's unit from the moment it is
saved, so "Unit 1 + Phrases" lists what was written for Unit 1. **Translation
and words** opens the sentence builder, where each word is matched to the
lexicon and checked; that part can wait for an editor, the tutor only has to
write and say the sentence. A second editor approves both. Once it is published, the
operator runs `molo content sentence-requests --live` again and it turns
into a tap-the-words exercise in its skill, as a draft for an editor to
check.

## Check the culture cards

**Culture cards** are short notes shown between exercises: why you greet
before you ask, what the clicks are, whom you call mother. A model drafted
them in English and Norwegian (`molo content culture`), so each arrives as
an AI draft with a yellow box: **Confirm before approving**, a numbered list
of the exact claims the tutor is being asked to vouch for.

Go through the list one claim at a time:

- **True, as written:** leave it.
- **Nearly true:** correct the English text (and tell the editor, who
  corrects the Norwegian).
- **Not true, or not for Cape Town today:** strike the sentence that makes
  the claim. If the card has nothing left worth saying, send it back with a
  note, or leave it as a draft.
- **Needs an isiXhosa word the card does not have** (a clan name, a
  proverb): say the word; the editor adds it to the lexicon so it can be
  recorded. Nobody types it into the card text.

The isiXhosa words in a card come from the lexicon, and are listed under the
card with their status. **Add a word from the lexicon** searches the lexicon
and adds the row you pick; the cross beside a word removes it. There is no
way to type a word in: one the lexicon lacks is added there first. A card
cannot publish until each of its words is published with its recording.

**Preview** shows the card exactly as a learner sees it, in English and in
Norwegian, with what you have typed so far. Unsaved changes are marked; if
**Save** is greyed out, the line beside it says why (a language is empty, or
the card is published). Under the title, "Last edited by …" names who last
changed the card or its status, and when. When the text is right, **Save**,
then send it to review; a second editor approves it like any other exercise.

## Rejecting

Every rejection needs a note. Say what to change, not just that it is wrong;
the note lands in the row's history and in the creator's queue.

## What "AI draft" means

Anything the model produced enters as an AI draft with a purple badge. It is
a suggestion for you to check, never content. It cannot reach a learner
without a human moving it to review and a second human approving it.

## Second opinions on a gloss

On a word's page, under the glosses, you may see other glosses marked with
where they came from, such as a translation engine. They are opinions to
compare with, never the word's gloss, and nothing you do there is needed.

## From the phone

Editors and admins have a Review tab in the mobile app; learners never see it.
It shows the same review queue as the web dashboard, narrowed to words and glosses.
Open an item to read its lemma, noun class, English and Norwegian glosses with
recorded origin, listen to available audio and read revision notes. Approve asks
the server to apply the same role, four-eyes and publication checks as the web;
Send back requires a revision note. Nothing is published locally or queued for
later: a connection is required and a failed request must be refreshed before
retrying. Words and glosses are read-only here. Use the web dashboard for editing,
the curriculum tree and grids. Older glosses without an audit record show their origin as not recorded rather than guessing from their status.

### Recording session

From the phone's **Review** tab, open **Studio**, choose a speaker with recorded
consent, optionally choose a unit, and start the session. Each screen shows one
word or sentence with its gloss: allow microphone access, record, stop, listen,
and record again if needed. **Upload and continue** sends the take to the same
server queue as the web studio and advances only after acceptance. Keep the
shown job ID if you need to ask about processing; queued audio is not live or
approved. The xh-audio pipeline processes it on the server. **Skip** moves on
to the next item and **Previous item** goes back; any move discards the take on
screen, and a take can only be uploaded for the item it was recorded for. The
top line shows where you are ("12 of 340") and how many you recorded this
session. A connection is required: nothing is queued offline. Leaving the
screen, auto-lock, backgrounding the app or losing connectivity discards a take
that was not uploaded yet, but the session keeps its place: the speaker, the
unit and the item you were on come back when you return. If the list cannot be
loaded the screen says so and offers Retry; "Nothing left to record" only ever
means the queue is empty. Use the web studio for consent administration and
processing follow-up.

## Preview drafts

Editors and admins can turn on **Preview drafts** in Settings on the web or
phone. The banner stays visible throughout the preview; unpublished units,
lessons and exercises carry their status, and missing recordings are labelled
as missing. Open a unit and a lesson to try its exercise widgets. Answers,
completion and skips save nothing: no XP, hearts, streak, review scheduling or
progress changes. Preview requires a connection, is kept only for the current
account in memory, and is cleared on exit or sign-out. **Leave preview** returns
to the published-only path. This is a separate editorial view, not a way to
unlock unpublished lessons for learners.
