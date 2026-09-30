import { join } from "node:path";

import { Args, Command } from "@effect/cli";
import { goldenAnswersForExport } from "@molo/db";
import { Effect } from "effect";

import { fail, out, tryPromise, withDb } from "../context.ts";
import { molo } from "../root.ts";
import { formatSkipped, importGoldens, pullGoldens } from "../services/goldens.ts";
import { MORPH_BUILD_HINT, loadMorph } from "../services/morph.ts";
import { repoRoot } from "../services/repo-paths.ts";

const FORMS = [
  "plural",
  "singular",
  "subject_concord",
  "object_concord",
  "possessive",
  "locative",
] as const;

const gen = Command.make(
  "gen",
  {
    lemma: Args.text({ name: "lemma" }),
    cls: Args.text({ name: "class" }),
    form: Args.choice(FORMS.map((f) => [f, f] as const)),
  },
  ({ lemma, cls, form }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const morph = yield* Effect.promise(loadMorph);
      if (!morph) return yield* fail(MORPH_BUILD_HINT);
      const result = Effect.try({
        try: () => morph.generate(lemma, cls, form),
        catch: (e) => new Error(String(e)),
      });
      const r = yield* result.pipe(Effect.either);
      const validated = morph.canGeneratePlural(lemma, cls);
      if (r._tag === "Left") {
        yield* out(g, { ok: false, error: r.left.message }, () =>
          console.log(`error: ${r.left.message}`),
        );
        process.exitCode = 1;
        return;
      }
      yield* out(
        g,
        { ok: true, lemma, class: cls, form, surface: r.right, classValidated: validated },
        () => {
          console.log(r.right);
          if (!validated)
            console.log("(class not tutor-validated; the publish gate will not accept this form)");
        },
      );
    }),
).pipe(Command.withDescription("Exercise xh-morph: print the form or the error"));

const table = Command.make("table", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const morph = yield* Effect.promise(loadMorph);
    if (!morph) return yield* fail(MORPH_BUILD_HINT);
    const json = JSON.parse(morph.ruleTableJson()) as unknown;
    yield* out(g, json, () => console.log(JSON.stringify(json, null, 2)));
  }),
).pipe(Command.withDescription("Print the rule table as JSON"));

const importCommand = Command.make(
  "import",
  { file: Args.text({ name: "file.toml" }) },
  ({ file }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const root = repoRoot();
      const result = yield* tryPromise(
        () =>
          importGoldens(
            file,
            join(root, "crates/xh-morph/golden/classes_1_10.toml"),
            join(root, "packages/testkit/golden/cases.json"),
            g.live,
          ),
        "import goldens",
      );
      yield* out(g, result, () => {
        console.log(
          `${result.dryRun ? "Dry run: would merge" : "Merged"} ${result.received} validated cases; ${result.changed} changes; ${result.skipped.length} skipped. ${result.dryRun ? "Use --live to write." : "Run the golden tests to review disagreements."}`,
        );
        for (const line of formatSkipped(result.skipped)) console.log(line);
      });
    }),
).pipe(
  Command.withDescription(
    "Merge tutor-validated TOML cases; --live writes the golden file and session JSON",
  ),
);
/**
 * The tutor's answers saved on /edit/goldens, merged exactly as an imported
 * TOML is: only complete cards (answer, name, date), nothing composed. The
 * database is only read; `--live` writes the two local files, which then go
 * through a reviewed PR like any other golden change.
 */
const pullCommand = Command.make("pull", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const root = repoRoot();
    const answers = yield* withDb(g, (db) =>
      tryPromise(() => goldenAnswersForExport(db), "read golden answers"),
    );
    const result = yield* tryPromise(
      () =>
        pullGoldens(
          answers,
          join(root, "crates/xh-morph/golden/classes_1_10.toml"),
          join(root, "packages/testkit/golden/cases.json"),
          g.live,
        ),
      "pull goldens",
    );
    yield* out(g, result, () => {
      console.log(
        `${answers.length} cards saved on the server (${g.env}); ${result.received} complete, ${result.incomplete} without an answer, name or date${result.unknownCases ? `, ${result.unknownCases} for cases not on the sheet` : ""}, ${result.skipped.length} skipped. ` +
          (result.received === 0
            ? "Nothing to merge."
            : `${result.dryRun ? "Dry run: would merge" : "Merged"} ${result.received}; ${result.changed} changes. ${result.dryRun ? "Use --live to write." : "Run the golden tests to review disagreements."}`),
      );
      // Kept on the server, never merged.
      for (const line of formatSkipped(result.skipped)) console.log(line);
    });
  }),
).pipe(
  Command.withDescription(
    "Merge the tutor's complete answers from the server (/edit/goldens); reads the database, --live writes the golden file and session JSON",
  ),
);
const goldens = Command.make("goldens", {}).pipe(
  Command.withSubcommands([importCommand, pullCommand]),
);

export const morph = Command.make("morph", {}).pipe(
  Command.withDescription("The noun-class generator"),
  Command.withSubcommands([gen, table, goldens]),
);
