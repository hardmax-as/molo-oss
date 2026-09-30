import {
  GOLDEN_CLASS_PAIRS,
  GOLDEN_CLASSES,
  applyGoldenAnswers,
  goldenAnswerOf,
  goldenKey,
  goldenPairOf,
  isValidatedGolden,
  parseGoldenKey,
  type GoldenAnswerView,
  type GoldenCase,
  type GoldenVerdict,
  type PutGoldenAnswer,
} from "@molo/core";

import { listLexemes, morphPreview } from "./api.ts";

/** The existing editor morph preview; never requested before tutor input. */
export async function checkGoldenForm(c: GoldenCase): Promise<GoldenVerdict> {
  if (!c.expected.trim()) throw new Error("A tutor form is required before checking");
  const { lexemes } = await listLexemes({ q: c.lemma, class: c.class, pos: "noun", limit: 200 });
  const exact = lexemes.filter((l) => l.lemma === c.lemma && l.nounClass === c.class);
  if (exact.length !== 1) return "unavailable";
  const result = await morphPreview(exact[0]!.id);
  if (!result.applicable) return "unavailable";
  const form = result.forms.find((f) => f.form === c.form);
  if (!form || form.surface === null || form.error !== null) return "unavailable";
  return form.surface === c.expected ? "agrees" : "differs";
}

const PAIR_FORMS = new Set<GoldenCase["form"]>(["plural", "singular"]);

/**
 * Display order: the locatives after everything else, then by class pair
 * (1/2, 1a/2a, 3/4 …), the singular class before the plural one, and in each
 * class the pair question (its plural, or its singular) before the concords.
 */
export function orderedGoldens(cases: readonly GoldenCase[]): GoldenCase[] {
  const rank = new Map<string, number>(GOLDEN_CLASSES.map((cls, i) => [cls, i]));
  const pairRank = (c: GoldenCase) => GOLDEN_CLASS_PAIRS.indexOf(goldenPairOf(c.class));
  return cases
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(a.c.form === "locative") - Number(b.c.form === "locative") ||
        pairRank(a.c) - pairRank(b.c) ||
        (rank.get(a.c.class) ?? Infinity) - (rank.get(b.c.class) ?? Infinity) ||
        Number(PAIR_FORMS.has(b.c.form)) - Number(PAIR_FORMS.has(a.c.form)) ||
        a.i - b.i,
    )
    .map(({ c }) => c);
}

/** The first case, in display order, that is not ready to export; null when all are. */
export function nextUnfinished(cases: readonly GoldenCase[]): GoldenCase | null {
  return orderedGoldens(cases).find((c) => !isValidatedGolden(c)) ?? null;
}

/** Ready and total per class pair, for the jump list. */
export function pairProgress(
  cases: readonly GoldenCase[],
): { pair: readonly [string, string]; ready: number; count: number }[] {
  return GOLDEN_CLASS_PAIRS.map((pair) => {
    const inPair = cases.filter((c) => (pair as readonly string[]).includes(c.class));
    return { pair, ready: inPair.filter(isValidatedGolden).length, count: inPair.length };
  });
}

/**
 * Answers the server holds for cards the sheet no longer asks (the plural of
 * a plural, the plural of isiXhosa). Read-only: the tutor sees what she
 * wrote, nothing is lost, and `molo morph goldens pull` lists them as
 * skipped.
 */
export function earlierAnswers(
  cases: readonly GoldenCase[],
  saved: Iterable<GoldenAnswerView>,
): (GoldenAnswerView & {
  lemma: string;
  class: GoldenCase["class"];
  caseForm: GoldenCase["form"];
})[] {
  const onSheet = new Set(cases.map(goldenKey));
  const byKey = new Map<string, GoldenAnswerView>();
  for (const a of saved) {
    if (onSheet.has(a.caseId) || (!a.form.trim() && !a.notes.trim())) continue;
    if (parseGoldenKey(a.caseId)) byKey.set(a.caseId, a);
  }
  // `form` on an answer is what the tutor wrote; the card's own form is `caseForm`.
  const asCases = [...byKey.keys()].map((k) => ({
    ...parseGoldenKey(k)!,
    expected: "",
    validated_by: "",
    validated_on: "",
    irregular: false,
    note: "",
  }));
  return orderedGoldens(asCases).map((c) => ({
    ...byKey.get(goldenKey(c))!,
    lemma: c.lemma,
    class: c.class,
    caseForm: c.form,
  }));
}

/** On a singular card: what the tutor wrote on the old plural-of-a-plural card for the same word. */
export function oldCardAnswer(
  c: GoldenCase,
  saved: ReadonlyMap<string, GoldenAnswerView>,
): string | null {
  if (c.form !== "singular") return null;
  const old = saved.get(goldenKey({ lemma: c.lemma, class: c.class, form: "plural" }));
  return old?.form.trim() || null;
}

/**
 * The session's tutor name or date, entered once at the top, flows into
 * every card that is still empty or still carries the previous session
 * value. A card someone changed by hand keeps its own value.
 */
export function applySessionDefault(
  cases: readonly GoldenCase[],
  field: "validated_by" | "validated_on",
  previous: string,
  next: string,
): GoldenCase[] {
  return cases.map((c) => (c[field] === "" || c[field] === previous ? { ...c, [field]: next } : c));
}

/**
 * What the sheet shows: the checked-in cases, then what the server has
 * saved, then anything typed here that has not reached the server yet
 * (the offline fallback). The newest word wins.
 */
export function mergeGoldenSources(
  sheet: readonly GoldenCase[],
  saved: readonly PutGoldenAnswer[],
  pending: Readonly<Record<string, GoldenCase>>,
): GoldenCase[] {
  return applyGoldenAnswers(sheet, saved).map((c) => pending[goldenKey(c)] ?? c);
}

/**
 * Whether a card has to be sent. A card the server already holds is sent
 * whenever it differs; one it does not is sent only once the tutor has
 * written something on it, so a name filled in from the top does not create
 * sixty empty rows.
 */
export function goldenNeedsSave(
  card: GoldenCase,
  original: GoldenCase | undefined,
  saved: PutGoldenAnswer | undefined,
): boolean {
  const mine = goldenAnswerOf(card);
  if (saved)
    return (
      mine.form.trim() !== saved.form ||
      mine.irregular !== saved.irregular ||
      mine.notes !== saved.notes ||
      mine.tutorName.trim() !== saved.tutorName ||
      mine.validatedOn !== saved.validatedOn
    );
  return (
    mine.form.trim() !== "" ||
    mine.irregular !== (original?.irregular ?? false) ||
    mine.notes !== (original?.note ?? "")
  );
}
