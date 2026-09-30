import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { goldenToml, type GoldenCase } from "@molo/core";
import { expect, it } from "vitest";

it("parses real TOML, dry-runs without writes, imports idempotently and refuses incomplete attribution", () => {
  const dir = mkdtempSync(join(tmpdir(), "molo-goldens-"));
  const target = join(dir, "golden.toml"),
    input = join(dir, "tutor.toml"),
    json = join(dir, "cases.json"),
    runner = join(dir, "run.ts");
  const blank: GoldenCase = {
    lemma: "zz-source",
    class: "1",
    form: "plural",
    expected: "",
    validated_by: "",
    validated_on: "",
    irregular: false,
    note: "fixture",
  };
  const human = {
    ...blank,
    expected: "zz-tutor",
    validated_by: "Test tutor",
    validated_on: "2026-09-21",
    note: 'Tutor says "keep"\nsecond line',
  };
  const service = fileURLToPath(new URL("./goldens.ts", import.meta.url));
  const run = (live: boolean) => {
    writeFileSync(
      runner,
      `import { importGoldens } from ${JSON.stringify(service)}; console.log(JSON.stringify(await importGoldens(${[input, target, json, live].map((x) => JSON.stringify(x)).join(",")})));`,
    );
    return spawnSync("bun", [runner], { encoding: "utf8" });
  };
  try {
    const original = "# Preserve the tutor instructions.\n" + goldenToml([blank]);
    writeFileSync(target, original);
    writeFileSync(input, goldenToml([human]));
    writeFileSync(json, "untouched");
    const dry = run(false);
    expect(dry.status, dry.stderr).toBe(0);
    expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true, changed: 1 });
    expect(readFileSync(target, "utf8")).toBe(original);
    expect(readFileSync(json, "utf8")).toBe("untouched");
    const live = run(true);
    expect(live.status, live.stderr).toBe(0);
    const after = readFileSync(target, "utf8");
    expect(after).toContain("# Preserve the tutor instructions.");
    expect(JSON.parse(readFileSync(json, "utf8")).case).toEqual([human]);
    expect(JSON.parse(run(true).stdout)).toMatchObject({ changed: 0 });
    expect(readFileSync(target, "utf8")).toBe(after);
    writeFileSync(input, goldenToml([{ ...human, validated_by: "" }]));
    expect(run(true).status).not.toBe(0);
    expect(readFileSync(target, "utf8")).toBe(after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it("pulls the server's complete answers into the TOML, counts the incomplete ones, and dry-runs by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "molo-goldens-pull-"));
  const target = join(dir, "golden.toml"),
    json = join(dir, "cases.json"),
    runner = join(dir, "run.ts");
  const blank = (lemma: string): GoldenCase => ({
    lemma,
    class: "1",
    form: "plural",
    expected: "",
    validated_by: "",
    validated_on: "",
    irregular: false,
    note: "fixture",
  });
  const answers = [
    {
      caseId: JSON.stringify(["zz-a", "1", "plural"]),
      form: "zz-tutor-a",
      irregular: true,
      notes: "zz note",
      tutorName: "Test tutor",
      validatedOn: "2026-09-26",
    },
    // Unsure: no answer yet. Stays on the sheet, never exported.
    {
      caseId: JSON.stringify(["zz-b", "1", "plural"]),
      form: "",
      irregular: false,
      notes: "",
      tutorName: "Test tutor",
      validatedOn: "2026-09-26",
    },
    // A case the checked-in sheet does not have.
    {
      caseId: JSON.stringify(["zz-unknown", "1", "plural"]),
      form: "zz-x",
      irregular: false,
      notes: "",
      tutorName: "Test tutor",
      validatedOn: "2026-09-26",
    },
  ];
  const service = fileURLToPath(new URL("./goldens.ts", import.meta.url));
  const run = (live: boolean) => {
    writeFileSync(
      runner,
      `import { pullGoldens } from ${JSON.stringify(service)}; console.log(JSON.stringify(await pullGoldens(${[answers, target, json, live].map((x) => JSON.stringify(x)).join(",")})));`,
    );
    return spawnSync("bun", [runner], { encoding: "utf8" });
  };
  try {
    const original = goldenToml([blank("zz-a"), blank("zz-b")]);
    writeFileSync(target, original);
    writeFileSync(json, "untouched");
    const dry = run(false);
    expect(dry.status, dry.stderr).toBe(0);
    expect(JSON.parse(dry.stdout)).toMatchObject({
      dryRun: true,
      onServer: 3,
      unknownCases: 1,
      incomplete: 1,
      received: 1,
      changed: 1,
    });
    expect(readFileSync(target, "utf8")).toBe(original);
    expect(readFileSync(json, "utf8")).toBe("untouched");
    const live = run(true);
    expect(live.status, live.stderr).toBe(0);
    const after = readFileSync(target, "utf8");
    expect(after).toContain('expected = "zz-tutor-a"');
    expect(after).toContain('validated_by = "Test tutor"');
    expect(after).toContain("irregular = true");
    expect(after).not.toContain("zz-unknown");
    const cases = JSON.parse(readFileSync(json, "utf8")).case as GoldenCase[];
    expect(cases.find((c) => c.lemma === "zz-b")?.expected).toBe("");
    expect(JSON.parse(run(true).stdout)).toMatchObject({ changed: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it("pulls only plurals of singular classes and framed concords, lists plural-of-a-plural and old concord answers as skipped, and never merges an empty form", () => {
  const dir = mkdtempSync(join(tmpdir(), "molo-goldens-skip-"));
  const target = join(dir, "golden.toml"),
    json = join(dir, "cases.json"),
    runner = join(dir, "run.ts");
  const card = (lemma: string, cls: GoldenCase["class"], form: GoldenCase["form"]): GoldenCase => ({
    lemma,
    class: cls,
    form,
    expected: "",
    validated_by: "",
    validated_on: "",
    irregular: false,
    note: "fixture",
  });
  const sheet = [
    card("zz-one", "1", "plural"),
    card("zz-seven", "7", "plural"),
    card("zz-two", "2", "plural"),
    card("zz-six", "6", "plural"),
    card("isiXhosa", "7", "plural"),
    card("zz-one", "1", "subject_concord"),
    card("zz-nine", "9", "plural"),
    // Already signed off in the checked-in file: an empty answer must not undo it.
    {
      ...card("zz-three", "3", "plural"),
      expected: "zz-kept",
      validated_by: "Earlier",
      validated_on: "2026-09-01",
    },
    card("zz-one", "1", "object_concord"),
  ];
  const answer = (c: GoldenCase, form: string, notes = "") => ({
    caseId: JSON.stringify([c.lemma, c.class, c.form]),
    form,
    irregular: false,
    notes,
    tutorName: "Test tutor",
    validatedOn: "2026-09-27",
  });
  const answers = [
    answer(sheet[0]!, "zz-ones"),
    answer(sheet[1]!, "zz-sevens"),
    answer(sheet[2]!, "zz-two-again"),
    answer(sheet[3]!, "zz-six-again"),
    answer(sheet[4]!, "zz-language-plural"),
    answer(sheet[5]!, "zz-he"),
    answer(sheet[6]!, "   "),
    answer(sheet[7]!, ""),
    // Given through a sentence frame: taken. Placeholder text, not isiXhosa.
    answer(sheet[8]!, "-zz-", "Sentence: zz yy (agreement: zz)"),
  ];
  const service = fileURLToPath(new URL("./goldens.ts", import.meta.url));
  writeFileSync(
    runner,
    `import { pullGoldens } from ${JSON.stringify(service)}; console.log(JSON.stringify(await pullGoldens(${[answers, target, json, true].map((x) => JSON.stringify(x)).join(",")})));`,
  );
  try {
    writeFileSync(target, goldenToml(sheet));
    const live = spawnSync("bun", [runner], { encoding: "utf8" });
    expect(live.status, live.stderr).toBe(0);
    const result = JSON.parse(live.stdout) as {
      received: number;
      incomplete: number;
      skipped: { caseId: string; reason: string }[];
    };
    expect(result.received).toBe(3);
    expect(result.incomplete).toBe(2);
    expect(result.skipped.map((s) => [JSON.parse(s.caseId)[0], s.reason]).sort()).toEqual([
      ["isiXhosa", "plural_of_a_plural"],
      ["zz-one", "concord_before_frames"],
      ["zz-six", "plural_of_a_plural"],
      ["zz-two", "plural_of_a_plural"],
    ]);
    const cases = JSON.parse(readFileSync(json, "utf8")).case as GoldenCase[];
    const expected = (lemma: string, form = "plural") =>
      cases.find((c) => c.lemma === lemma && c.form === form)?.expected;
    expect(expected("zz-one")).toBe("zz-ones");
    expect(expected("zz-seven")).toBe("zz-sevens");
    for (const lemma of ["zz-two", "zz-six", "isiXhosa", "zz-nine"])
      expect(expected(lemma)).toBe("");
    expect(expected("zz-one", "subject_concord")).toBe("");
    expect(expected("zz-one", "object_concord")).toBe("-zz-");
    expect(expected("zz-three")).toBe("zz-kept");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it("prints each skipped answer with its reason, in the words the operator reads", async () => {
  const { formatSkipped } = await import("./goldens.ts");
  expect(
    formatSkipped([
      {
        caseId: JSON.stringify(["zz-two", "2", "plural"]),
        reason: "plural_of_a_plural",
        form: "zz-x",
      },
      {
        caseId: JSON.stringify(["zz-one", "1", "subject_concord"]),
        reason: "concord_before_frames",
        form: "",
      },
    ]),
  ).toEqual([
    "  skipped: plural of a plural  zz-two (class 2, plural)  answer: zz-x",
    "  skipped: concord, asked before the sentence frames  zz-one (class 1, subject_concord)",
  ]);
});

it("applies the same filter to an imported TOML as to a pull", () => {
  const dir = mkdtempSync(join(tmpdir(), "molo-goldens-import-skip-"));
  const target = join(dir, "golden.toml"),
    input = join(dir, "tutor.toml"),
    json = join(dir, "cases.json"),
    runner = join(dir, "run.ts");
  const card = (
    lemma: string,
    cls: GoldenCase["class"],
    form: GoldenCase["form"],
    expected = "",
  ): GoldenCase => ({
    lemma,
    class: cls,
    form,
    expected,
    validated_by: expected ? "Test tutor" : "",
    validated_on: expected ? "2026-09-27" : "",
    irregular: false,
    note: "fixture",
  });
  const service = fileURLToPath(new URL("./goldens.ts", import.meta.url));
  writeFileSync(
    runner,
    `import { importGoldens } from ${JSON.stringify(service)}; console.log(JSON.stringify(await importGoldens(${[input, target, json, true].map((x) => JSON.stringify(x)).join(",")})));`,
  );
  try {
    writeFileSync(
      target,
      goldenToml([card("zz-one", "1", "plural"), card("zz-two", "2", "plural")]),
    );
    writeFileSync(
      input,
      goldenToml([
        card("zz-one", "1", "plural", "zz-ones"),
        card("zz-two", "2", "plural", "zz-twos"),
      ]),
    );
    const live = spawnSync("bun", [runner], { encoding: "utf8" });
    expect(live.status, live.stderr).toBe(0);
    const result = JSON.parse(live.stdout) as { received: number; skipped: { reason: string }[] };
    expect(result.received).toBe(1);
    expect(result.skipped.map((s) => s.reason)).toEqual(["plural_of_a_plural"]);
    const cases = JSON.parse(readFileSync(json, "utf8")).case as GoldenCase[];
    expect(cases.find((c) => c.lemma === "zz-two")?.expected).toBe("");
    expect(cases.find((c) => c.lemma === "zz-one")?.expected).toBe("zz-ones");

    // Everything skipped, one card even incomplete: no throw, no write.
    const before = readFileSync(target, "utf8");
    writeFileSync(json, "untouched");
    writeFileSync(
      input,
      goldenToml([
        card("zz-two", "2", "plural", "zz-twos"),
        { ...card("zz-six", "6", "plural"), expected: "zz-sixes" },
      ]),
    );
    const skippedOnly = spawnSync("bun", [runner], { encoding: "utf8" });
    expect(skippedOnly.status, skippedOnly.stderr).toBe(0);
    expect(JSON.parse(skippedOnly.stdout)).toMatchObject({ received: 0, changed: 0, total: 2 });
    expect(readFileSync(target, "utf8")).toBe(before);
    expect(readFileSync(json, "utf8")).toBe("untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
