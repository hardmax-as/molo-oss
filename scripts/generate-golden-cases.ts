import { readFile, writeFile } from "node:fs/promises";

import { decodeGoldenFile } from "../packages/core/src/golden.ts";

const input = new URL("../crates/xh-morph/golden/classes_1_10.toml", import.meta.url);
const output = new URL("../packages/testkit/golden/cases.json", import.meta.url);
const parsed = decodeGoldenFile(Bun.TOML.parse(await readFile(input, "utf8")));
const json = JSON.stringify(parsed, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== json)
    throw new Error("Golden JSON is stale; run bun scripts/generate-golden-cases.ts --live");
  console.log(`${parsed.case.length} golden cases: TOML and JSON agree`);
} else if (process.argv.includes("--live")) {
  await writeFile(output, json);
  console.log(`Wrote ${parsed.case.length} golden cases`);
} else {
  console.log(
    `Dry run: would generate ${parsed.case.length} golden cases. Use --live to write or --check to verify.`,
  );
}
