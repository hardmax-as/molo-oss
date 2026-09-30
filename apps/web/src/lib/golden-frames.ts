/**
 * Concords by sentence frames (built, parked): instead of asking for a
 * "subject concord", a concord card shows an English sentence, the tutor
 * writes the whole sentence as she would say it, and marks the part that
 * agrees with the noun herself. That marked part, and nothing derived from
 * it without her say, becomes the card's answer.
 *
 * The frame verbs are common words: -wa "fall" and -bona "see", and
 * umntwana "child" as the owner in the possessive frame, because the
 * possessive concord follows the thing owned. The frames themselves are
 * English; no isiXhosa is written here.
 *
 * Off until the operator switches it on by setting `GOLDEN_FRAMES_LIVE` below
 * to true in a reviewed PR; an admin can look at it first with
 * `?frames=preview` on /edit/goldens.
 */
import { GOLDEN_PLURAL_CLASSES, type GoldenCase } from "@molo/core";

export type ConcordForm = Extract<
  GoldenCase["form"],
  "subject_concord" | "object_concord" | "possessive"
>;
export const CONCORD_FORMS: readonly ConcordForm[] = [
  "subject_concord",
  "object_concord",
  "possessive",
];
export const isConcordForm = (form: GoldenCase["form"]): form is ConcordForm =>
  (CONCORD_FORMS as readonly string[]).includes(form);

/**
 * The operator's switch. False: the tutor sees the concord questions as
 * "coming soon" and none of their cards. True: every editor gets the frames.
 */
export const GOLDEN_FRAMES_LIVE: boolean = false;

export function framesEnabled(
  isAdmin: boolean,
  preview: boolean,
  live: boolean = GOLDEN_FRAMES_LIVE,
): boolean {
  return live || (isAdmin && preview);
}

/**
 * English nouns for the lemmas whose first gloss would name the wrong thing
 * in a frame: "the Xhosa" reads as the people (class 2), not the language.
 */
const FRAME_NOUN: Readonly<Record<string, string>> = { isiXhosa: "Xhosa language" };

/**
 * The English noun the frame is built on: the lexicon's first English gloss,
 * carried in the case note ("gloss: people; humans."), unless `FRAME_NOUN`
 * names a better one. Null when there is neither; the card then asks
 * without a frame sentence.
 */
export function frameNoun(c: Pick<GoldenCase, "lemma" | "note">): string | null {
  const own = FRAME_NOUN[c.lemma];
  if (own) return own;
  const m = /gloss: ([^;.]+)/.exec(c.note);
  return m?.[1]?.trim() || null;
}

/** "the child's child" does not say which child is owned; those cards get another owner. */
const OWNER_WORDS = new Set(["child", "children"]);

/** Whether the noun is a plural class, so the English frame says "are". */
export const framePlural = (c: Pick<GoldenCase, "class">): boolean =>
  GOLDEN_PLURAL_CLASSES.includes(c.class);

/** The i18n key of the frame sentence for a card, and the noun that goes in it. */
export type FrameKey =
  | `edit.goldens.frames.sentence.${ConcordForm}.${"singular" | "plural"}`
  | "edit.goldens.frames.sentence.possessive.otherOwner";

export function frameFor(
  c: Pick<GoldenCase, "lemma" | "form" | "class" | "note">,
): { key: FrameKey; noun: string } | null {
  if (!isConcordForm(c.form)) return null;
  const noun = frameNoun(c);
  if (!noun) return null;
  if (c.form === "possessive" && OWNER_WORDS.has(noun.toLowerCase()))
    return { key: "edit.goldens.frames.sentence.possessive.otherOwner", noun };
  const n = framePlural(c) ? "plural" : "singular";
  return { key: `edit.goldens.frames.sentence.${c.form}.${n}` as const, noun };
}

/**
 * The marked part, written the way the golden file writes that concord:
 * a subject or possessive concord with a hyphen after (`xx-`), an object
 * concord with a hyphen on both sides (`-xx-`). Only hyphens are added, and
 * the tutor sees the result before she confirms it.
 */
export function concordFromMark(form: ConcordForm, marked: string): string {
  const bare = marked.trim().replace(/^-+|-+$/g, "");
  // A concord is part of one word; a selection across a space is a slip.
  if (!bare || /\s/.test(bare)) return "";
  return form === "object_concord" ? `-${bare}-` : `${bare}-`;
}

const SENTENCE_LINE = /^Sentence: .*$/m;

/**
 * Her sentence is kept in the card's note, where she can read it and where
 * `molo morph goldens pull` carries it into the golden file with the answer.
 * The line matches `GOLDEN_FRAME_SENTENCE`, which is how pull tells a frame
 * answer from one given on the old concord card.
 */
export function noteWithSentence(note: string, sentence: string, marked: string): string {
  const line = `Sentence: ${sentence.trim()} (agreement: ${marked.trim()})`;
  return SENTENCE_LINE.test(note)
    ? note.replace(SENTENCE_LINE, line)
    : [line, note.trim()].filter(Boolean).join("\n");
}

/** The sentence part of a line `noteWithSentence` wrote, or "". */
export function sentenceFromNote(note: string): string {
  const line = SENTENCE_LINE.exec(note)?.[0] ?? "";
  return line.replace(/^Sentence: /, "").replace(/ \(agreement: [^)]*\)$/, "");
}
