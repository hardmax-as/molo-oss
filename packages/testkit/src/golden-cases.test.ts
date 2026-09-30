import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GOLDEN_CLASSES,
  GOLDEN_FORMS,
  GOLDEN_PLURAL_CLASSES,
  decodeGoldenFile,
  goldenKey,
  goldenPullSkip,
} from "@molo/core";
import { expect, it } from "vitest";

import sheet from "../golden/cases.json";

const root = fileURLToPath(new URL("../../..", import.meta.url));
it("keeps the generated session sheet in sync with the TOML source", () => {
  expect(
    execFileSync("bun", ["scripts/generate-golden-cases.ts", "--check"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toContain("TOML and JSON agree");
});
// The Phase 0 lexicon file is not part of the open-source snapshot.
const LEXICON = new URL("../../../spike/lexicon.draft.jsonl", import.meta.url);

it("covers every class/form", () => {
  const cases = decodeGoldenFile(sheet).case;
  expect(cases.length).toBeGreaterThanOrEqual(48);
  expect(new Set(cases.map(goldenKey)).size).toBe(cases.length);
  // Each class: the other side of its pair, and every concord.
  for (const cls of GOLDEN_CLASSES) {
    const pairForm = GOLDEN_PLURAL_CLASSES.includes(cls) ? "singular" : "plural";
    for (const form of [
      pairForm,
      ...GOLDEN_FORMS.filter((f) => f.endsWith("concord") || f === "possessive"),
    ])
      expect(
        cases.some((c) => c.class === cls && c.form === form),
        `${cls} ${form}`,
      ).toBe(true);
  }
  // Never a card the tutor cannot answer: no plural of a plural, no singular of a singular.
  for (const c of cases) expect(goldenPullSkip(c) ?? "", goldenKey(c)).not.toMatch(/_of_a_/);
});

it.skipIf(!existsSync(LEXICON))("retains exact lexicon provenance", () => {
  const cases = decodeGoldenFile(sheet).case;
  const lexicon = readFileSync(LEXICON, "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          lemma: string;
          noun_class: string | null;
          source_ref: string;
          senses: { en: string }[];
        },
    );
  for (const c of cases) {
    const source = lexicon.find((l) => l.lemma === c.lemma && l.noun_class === c.class);
    expect(source, goldenKey(c)).toBeDefined();
    expect(c.note).toContain(source!.source_ref);
    for (const gloss of source!.senses) expect(c.note).toContain(gloss.en);
  }
});
