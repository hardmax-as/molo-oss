import { Schema } from "effect";

export const GOLDEN_CLASSES = [
  "1",
  "1a",
  "2",
  "2a",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
export const GOLDEN_FORMS = [
  "plural",
  "singular",
  "subject_concord",
  "object_concord",
  "possessive",
  /**
   * The noun as a place: "at, in, to or from" it, one whole word. xh-morph has
   * no locative rule yet; the tutor's answers come first (SP19 in the school
   * dictionary describes the pattern).
   */
  "locative",
] as const;
export const GoldenCase = Schema.Struct({
  lemma: Schema.NonEmptyString,
  class: Schema.Literal(...GOLDEN_CLASSES),
  form: Schema.Literal(...GOLDEN_FORMS),
  expected: Schema.String,
  validated_by: Schema.String,
  validated_on: Schema.String,
  irregular: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  note: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type GoldenCase = typeof GoldenCase.Type;
export type GoldenVerdict = "agrees" | "differs" | "unavailable";
export const GoldenFile = Schema.Struct({
  schema_version: Schema.Literal(1),
  case: Schema.Array(GoldenCase),
});
export const decodeGoldenFile = Schema.decodeUnknownSync(GoldenFile);
export const goldenKey = (c: Pick<GoldenCase, "lemma" | "class" | "form">): string =>
  JSON.stringify([c.lemma, c.class, c.form]);

export function isValidatedGolden(c: GoldenCase): boolean {
  return (
    !!c.expected.trim() &&
    !!c.validated_by.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.validated_on) &&
    !Number.isNaN(Date.parse(c.validated_on)) &&
    new Date(c.validated_on).toISOString().slice(0, 10) === c.validated_on
  );
}

/** Only serializes human input; it never calls or copies a generator. */
export function goldenToml(cases: readonly GoldenCase[]): string {
  const quoted = (s: string) => JSON.stringify(s);
  return (
    "schema_version = 1\n\n" +
    cases
      .map((c) =>
        [
          "[[case]]",
          `lemma = ${quoted(c.lemma)}`,
          `class = ${quoted(c.class)}`,
          `form = ${quoted(c.form)}`,
          ...(["expected", "validated_by", "validated_on"] as const).map(
            (k) => `${k} = ${quoted(c[k])}${c[k] === "" ? " # TUTOR-VALIDATE" : ""}`,
          ),
          `irregular = ${c.irregular}`,
          `note = ${quoted(c.note)}`,
        ].join("\n"),
      )
      .join("\n\n") +
    "\n"
  );
}

/** Refuse incomplete/ambiguous imports before changing any case. */
export function mergeGoldens(
  current: readonly GoldenCase[],
  incoming: readonly GoldenCase[],
): GoldenCase[] {
  const seen = new Set<string>();
  for (const c of incoming) {
    if (!isValidatedGolden(c))
      throw new Error(
        `Golden case ${goldenKey(c)} needs expected, validated_by and a valid validated_on date`,
      );
    if (seen.has(goldenKey(c))) throw new Error(`Duplicate golden case ${goldenKey(c)}`);
    seen.add(goldenKey(c));
  }
  const merged = new Map(current.map((c) => [goldenKey(c), c]));
  if (merged.size !== current.length) throw new Error("The golden file contains duplicate keys");
  for (const c of incoming) merged.set(goldenKey(c), c);
  return [...merged.values()];
}

// ---- pairs, and what `molo morph goldens pull` may take ---------------------

/** The singular/plural class pairs the sheet is grouped by. */
export const GOLDEN_CLASS_PAIRS = [
  ["1", "2"],
  ["1a", "2a"],
  ["3", "4"],
  ["5", "6"],
  ["7", "8"],
  ["9", "10"],
] as const satisfies readonly (readonly [GoldenCase["class"], GoldenCase["class"]])[];
export type GoldenClassPair = (typeof GOLDEN_CLASS_PAIRS)[number];

/** Classes that are themselves plurals: a "plural" case on one asks for the plural of a plural. */
export const GOLDEN_PLURAL_CLASSES: readonly GoldenCase["class"][] = GOLDEN_CLASS_PAIRS.map(
  ([, plural]) => plural,
);

/** The pair a class belongs to, singular side first. */
export function goldenPairOf(cls: GoldenCase["class"]): GoldenClassPair {
  return GOLDEN_CLASS_PAIRS.find((p) => (p as readonly string[]).includes(cls))!;
}

/** The class on the other side of the pair: what a plural or singular card asks for. */
export function goldenOtherClass(cls: GoldenCase["class"]): GoldenCase["class"] {
  const [singular, plural] = goldenPairOf(cls);
  return cls === singular ? plural : singular;
}

/**
 * Singular lemmas with no plural at all, such as the name of the language
 * itself: asking for their plural is a card nobody can answer.
 */
export const GOLDEN_NO_PLURAL: readonly string[] = ["isiXhosa"];

export type GoldenPullSkip =
  /** A plural asked of a plural class, or of a noun with no plural. */
  | "plural_of_a_plural"
  /** A singular asked of a singular class. */
  | "singular_of_a_singular"
  /**
   * A concord answered on the old card, which read as a pronoun question.
   * An answer given through a sentence frame (its note has a
   * `GOLDEN_FRAME_SENTENCE` line) is taken.
   */
  | "concord_before_frames"
  /**
   * Two forms in one answer ("zz-one/ zz-two"). The golden test compares
   * one generated form, so the tutor picks one and the other goes in the
   * note; until then the card stays on the server.
   */
  | "several_forms";

/** An answer holding more than one form: a slash, comma, semicolon or " or ". */
export const goldenHasSeveralForms = (answer: string): boolean =>
  /[/,;]|\sor\s/i.test(answer.trim());

/**
 * The line a sentence-frame answer writes into the card's note: the whole
 * sentence the tutor said, and the part she marked as agreeing with the noun.
 */
export const GOLDEN_FRAME_SENTENCE = /^Sentence: .+ \(agreement: [^)]+\)$/m;

/**
 * Whether a saved answer may be pulled into the golden file, and if not,
 * why. Only the other side of a class pair is taken for now: the plural of
 * a singular-class noun, or the singular of a plural-class noun. The tutor
 * said the plural-of-a-plural cards made no sense, and she read "subject
 * concord" as a pronoun, so those answers are kept on the server and
 * reported, never merged. A concord answer is taken only when she gave it
 * through a sentence frame. A locative is taken as she wrote it. An empty
 * form is never merged either; that is
 * `isValidatedGolden`'s job and it stays so.
 */
export function goldenPullSkip(
  c: Pick<GoldenCase, "lemma" | "class" | "form">,
  /** The saved answer's note, where a sentence-frame answer keeps its sentence. */
  answerNote = "",
  /** The saved answer itself; only its shape is looked at, never its content. */
  answer = "",
): GoldenPullSkip | null {
  const pluralClass = GOLDEN_PLURAL_CLASSES.includes(c.class);
  let asked: GoldenPullSkip | null;
  if (c.form === "plural")
    asked = pluralClass || GOLDEN_NO_PLURAL.includes(c.lemma) ? "plural_of_a_plural" : null;
  else if (c.form === "singular") asked = pluralClass ? null : "singular_of_a_singular";
  else if (c.form === "locative") asked = null;
  else asked = GOLDEN_FRAME_SENTENCE.test(answerNote) ? null : "concord_before_frames";
  if (asked) return asked;
  return goldenHasSeveralForms(answer) ? "several_forms" : null;
}

// ---- the server copy (golden_answers) --------------------------------------

/**
 * A case key parsed back into its parts, or null when it is not one. The
 * server accepts an answer only for a key of this shape, so a row can never
 * name a class or a form the sheet does not have.
 */
export function parseGoldenKey(key: string): Pick<GoldenCase, "lemma" | "class" | "form"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [lemma, cls, form] = parsed as unknown[];
  if (typeof lemma !== "string" || lemma.trim() === "" || lemma.length > 200) return null;
  if (!(GOLDEN_CLASSES as readonly unknown[]).includes(cls)) return null;
  if (!(GOLDEN_FORMS as readonly unknown[]).includes(form)) return null;
  const out = { lemma, class: cls as GoldenCase["class"], form: form as GoldenCase["form"] };
  // Only the canonical spelling of a key: `goldenKey` must round-trip.
  return goldenKey(out) === key ? out : null;
}

const DateOrEmpty = Schema.String.pipe(
  Schema.filter((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s) || "a date as YYYY-MM-DD"),
);

/** `PUT /edit/goldens`: one card, as the tutor left it. Every text is human input. */
export const PutGoldenAnswer = Schema.Struct({
  caseId: Schema.String.pipe(
    Schema.filter((k) => parseGoldenKey(k) !== null || "not a golden case key"),
  ),
  /** The tutor's answer, in isiXhosa. May be empty: "leave it empty if unsure". */
  form: Schema.String.pipe(Schema.maxLength(200)),
  irregular: Schema.Boolean,
  notes: Schema.String.pipe(Schema.maxLength(4000)),
  tutorName: Schema.String.pipe(Schema.maxLength(200)),
  validatedOn: DateOrEmpty,
});
export type PutGoldenAnswer = typeof PutGoldenAnswer.Type;

/** One saved card, with who saved it last and when. */
export interface GoldenAnswerView extends PutGoldenAnswer {
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly updatedAt: string;
}

/** The server's answers laid over the checked-in sheet; a case with no answer stays as it is. */
export function applyGoldenAnswers(
  cases: readonly GoldenCase[],
  answers: readonly PutGoldenAnswer[],
): GoldenCase[] {
  const byKey = new Map(answers.map((a) => [a.caseId, a]));
  return cases.map((c) => {
    const a = byKey.get(goldenKey(c));
    return a
      ? {
          ...c,
          expected: a.form,
          irregular: a.irregular,
          note: a.notes,
          validated_by: a.tutorName,
          validated_on: a.validatedOn,
        }
      : c;
  });
}

/** A card as the server stores it. */
export function goldenAnswerOf(c: GoldenCase): PutGoldenAnswer {
  return {
    caseId: goldenKey(c),
    form: c.expected,
    irregular: c.irregular,
    notes: c.note,
    tutorName: c.validated_by,
    validatedOn: c.validated_on,
  };
}
