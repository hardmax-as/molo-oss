/**
 * A basic filter for names other learners can see (league display names and
 * the first-name fallback). It is a floor, not moderation: learners can also
 * report and hide a name, and reports reach the operator (docs/STORE-REVIEW-
 * CHECKLIST.md, Apple guideline 1.2). English and Norwegian terms only; the
 * isiXhosa and Afrikaans lists are for a speaker to supply, never for us to
 * guess.
 *
 * Three kinds of match, to keep the Scunthorpe problem small:
 *  - `CONTAINED`: long, unambiguous terms, matched anywhere in the name with
 *    separators removed ("f.u.c.k" is caught);
 *  - `WORDS`: short or ambiguous terms, matched only as a whole word, so
 *    "Cassandra", "Dickens" and "Nazira" pass;
 *  - `RESERVED`: whole names that would pass for staff.
 */

const CONTAINED = [
  "fuck",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "hitler",
  "cocksuck",
  "asshole",
  "bitch",
  "whore",
  "bastard",
  "dildo",
  "jizz",
  "kaffir",
  "kaffer",
  "pedophil",
  "paedophil",
  "pedofil",
  "rasshol",
  "jaevla",
  "javla",
] as const;

const WORDS = [
  "ass",
  "arse",
  "cock",
  "cunt",
  "cunts",
  "dick",
  "dicks",
  "fag",
  "fags",
  "kkk",
  "nazi",
  "nazis",
  "negro",
  "neger",
  "penis",
  "porn",
  "porno",
  "pussy",
  "rape",
  "rapist",
  "shit",
  "shitty",
  "slut",
  "sluts",
  "twat",
  "wank",
  "wanker",
  "hotnot",
  "coolie",
  "fitte",
  "kuk",
  "pikk",
  "hore",
  "faen",
  "homo",
  "sieg",
  "heil",
] as const;

const RESERVED = [
  "admin",
  "administrator",
  "moderator",
  "support",
  "official",
  "staff",
  "molo",
  "molo team",
  "team molo",
  "molo support",
  "hellomolo",
  "hardmax",
] as const;

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "8": "b",
};

/** Lower case, accents stripped, æ/ø spelled out, look-alike digits and symbols read as letters. */
export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[0-9!|@$]/g, (ch) => LEET[ch] ?? ch);
}

/**
 * False when a name should not be shown to other learners. Pure and cheap:
 * the API refuses such a display name at save time and hides such a name
 * (including an account-name fallback) in league standings.
 */
export function nameAllowed(name: string): boolean {
  const norm = normaliseName(name);
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  const whole = words.join(" ");
  if ((RESERVED as readonly string[]).includes(whole)) return false;
  const compact = words.join("");
  if (CONTAINED.some((term) => compact.includes(term))) return false;
  const set = new Set(words);
  return !WORDS.some((term) => set.has(term));
}
