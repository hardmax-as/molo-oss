import { readFile, writeFile } from "node:fs/promises";

import {
  applyGoldenAnswers,
  decodeGoldenFile,
  goldenKey,
  goldenPullSkip,
  goldenToml,
  isValidatedGolden,
  mergeGoldens,
  type GoldenCase,
  type GoldenPullSkip,
  type PutGoldenAnswer,
} from "@molo/core";

export interface GoldenSkipped {
  readonly caseId: string;
  readonly reason: GoldenPullSkip;
  /** The tutor's answer, kept where it is and printed so nobody wonders where it went. */
  readonly form: string;
}

const SKIP_LABEL: Record<GoldenPullSkip, string> = {
  plural_of_a_plural: "plural of a plural",
  singular_of_a_singular: "singular of a singular",
  concord_before_frames: "concord, asked before the sentence frames",
  several_forms: "two forms in one answer; the tutor picks one",
};

/** One line per skipped answer, for the operator. */
export function formatSkipped(skipped: readonly GoldenSkipped[]): string[] {
  return skipped.map((s) => {
    const [lemma, cls, form] = JSON.parse(s.caseId) as [string, string, string];
    return `  skipped: ${SKIP_LABEL[s.reason]}  ${lemma} (class ${cls}, ${form})${s.form ? `  answer: ${s.form}` : ""}`;
  });
}

/**
 * All validation and parsing finish before any writes. No database or morph
 * engine involved. The same filter as `pull` applies: a downloaded TOML holds
 * every validated card, including the ones pull holds back.
 */
export async function importGoldens(
  input: string,
  target: string,
  jsonTarget: string,
  live: boolean,
) {
  const source = await readFile(input, "utf8");
  const all = decodeGoldenFile(Bun.TOML.parse(source)).case;
  if (!all.length) throw new Error("The import contains no validated cases");
  const skipped: GoldenSkipped[] = [];
  const incoming = all.filter((c) => {
    const reason = goldenPullSkip(c, c.note, c.expected);
    if (reason) skipped.push({ caseId: goldenKey(c), reason, form: c.expected });
    return reason === null;
  });
  if (!incoming.length) {
    const total = decodeGoldenFile(Bun.TOML.parse(await readFile(target, "utf8"))).case.length;
    return { dryRun: !live, received: 0, changed: 0, total, skipped };
  }
  return { ...(await mergeIntoGoldenFiles(incoming, target, jsonTarget, live)), skipped };
}

/**
 * `molo morph goldens pull`: the tutor's answers saved on /edit/goldens,
 * laid over the checked-in sheet. Only complete cards (answer, name, date)
 * are merged, exactly as a downloaded TOML would be; the rest are counted and
 * left for the next session. The answers are the tutor's typing, never a
 * generator's output, and the golden tests still decide what they mean.
 *
 * Only the other side of a class pair is merged (`goldenPullSkip`): the
 * plural of a singular-class noun or the singular of a plural-class one,
 * and a concord answered through a sentence frame. An answer to a
 * plural-of-a-plural card or to an old concord card is listed as skipped,
 * with its reason, and stays on the server untouched.
 */
export async function pullGoldens(
  answers: readonly PutGoldenAnswer[],
  target: string,
  jsonTarget: string,
  live: boolean,
) {
  const current = decodeGoldenFile(Bun.TOML.parse(await readFile(target, "utf8"))).case;
  const byKey = new Map(current.map((c) => [goldenKey(c), c]));
  const known = answers.filter((a) => byKey.has(a.caseId));
  const skipped: GoldenSkipped[] = [];
  const pullable = known.filter((a) => {
    const reason = goldenPullSkip(byKey.get(a.caseId)!, a.notes, a.form);
    if (reason) skipped.push({ caseId: a.caseId, reason, form: a.form });
    return reason === null;
  });
  const laid = applyGoldenAnswers(current, pullable);
  const touched = new Set(pullable.map((a) => a.caseId));
  const answered = laid.filter((c) => touched.has(goldenKey(c)));
  const complete = answered.filter(isValidatedGolden);
  const base = {
    onServer: answers.length,
    unknownCases: answers.length - known.length,
    skipped,
    incomplete: answered.length - complete.length,
  };
  if (!complete.length)
    return { ...base, dryRun: !live, received: 0, changed: 0, total: current.length };
  return { ...base, ...(await mergeIntoGoldenFiles(complete, target, jsonTarget, live)) };
}

async function mergeIntoGoldenFiles(
  incoming: readonly GoldenCase[],
  target: string,
  jsonTarget: string,
  live: boolean,
) {
  const original = await readFile(target, "utf8");
  const current = decodeGoldenFile(Bun.TOML.parse(original)).case;
  const merged = mergeGoldens(current, incoming);
  const byKey = new Map(current.map((c) => [goldenKey(c), c]));
  const changed = incoming.filter(
    (c) => JSON.stringify(byKey.get(goldenKey(c))) !== JSON.stringify(c),
  ).length;
  const header = original.slice(0, original.search(/^schema_version\s*=/m));
  const json = JSON.stringify({ schema_version: 1, case: merged }, null, 2) + "\n";
  if (live) {
    if (changed) await writeFile(target, header + goldenToml(merged));
    await writeFile(jsonTarget, json);
  }
  return { dryRun: !live, received: incoming.length, changed, total: merged.length };
}
