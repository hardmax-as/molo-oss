import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Args, Command, Options } from "@effect/cli";
import { isixhosaClick, vukuzenzele } from "@molo/content";
import { formatContentReport, type LexiconPackageManifest } from "@molo/core";
import {
  actorForRef,
  contentReport,
  contentStats,
  editorRepo,
  loadLexicon,
  planLexicon,
  schema,
  shareAlikeExport,
  publishedShareAlikeExport,
  type EntityKind,
} from "@molo/db";
import { Effect, Option } from "effect";

import { envVar, fail, gate, kv, out, table, tryPromise, withDb } from "../context.ts";
import { molo } from "../root.ts";
import { curationCommands } from "./curate.ts";
import { gloss } from "./gloss.ts";
import { grammar } from "./grammar.ts";
import { reconcileUnit1 } from "./reconcile.ts";
import { culture, linkSentences, sentenceRequests } from "./tutor.ts";

const ADAPTERS = ["isixhosa-click", "vukuzenzele", "forvo"] as const;

const ingest = Command.make(
  "ingest",
  {
    adapter: Args.choice(ADAPTERS.map((a) => [a, a] as const)).pipe(
      Args.withDescription("Source adapter"),
    ),
    ref: Options.text("ref").pipe(
      Options.withDefault("master"),
      Options.withDescription("git ref of the upstream backup repo"),
    ),
    from: Options.directory("from").pipe(
      Options.optional,
      Options.withDescription("Read CSVs from a local directory; no network"),
    ),
  },
  ({ adapter, ref, from }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (adapter !== "isixhosa-click") {
        return yield* fail(
          `${adapter}: adapter not implemented yet (CONTENT.md section 2 lists what it needs; vukuzenzele is grammar-mining only, forvo is the tier-2 backfill consumer)`,
        );
      }
      const built = yield* tryPromise(
        () =>
          Option.isSome(from)
            ? isixhosaClick.buildFromDir(from.value)
            : isixhosaClick.fetchAndBuild(ref),
        "ingest",
      );
      const rows = built.lexemes as unknown as Parameters<typeof loadLexicon>[2];
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const classes = yield* Effect.promise(() =>
            db.select({ label: schema.nounClasses.label }).from(schema.nounClasses),
          );
          const plan = planLexicon("isixhosa-click", rows, new Set(classes.map((c) => c.label)));
          yield* out(g, { plan, summary: built.summary }, () => {
            console.log("isixhosa.click ingest plan");
            kv({
              commit: built.summary.snapshot.commit ?? "(local files)",
              rows_in: built.summary.rows_in["words.csv"],
              lexemes: plan.rowsIn,
              nouns_without_known_class: plan.nounsWithoutKnownClass,
              links: plan.links,
              licence: plan.licence,
              unparsed: built.summary.unparsed.count,
            });
          });
          const apply = yield* gate(
            g,
            `insert ${plan.rowsIn} lexemes as draft (existing lemma/pos/class rows are skipped)`,
          );
          if (!apply) return;
          const result = yield* Effect.promise(() => loadLexicon(db, "isixhosa-click", rows));
          yield* out(
            g,
            {
              created: result.created,
              skipped: result.skipped,
              links: result.linksCreated,
              ingestRunId: result.ingestRunId,
            },
            () => {
              kv({
                created: result.created,
                skipped: result.skipped,
                links: result.linksCreated,
                ingest_run: result.ingestRunId,
              });
            },
          );
        }),
      );
    }),
).pipe(
  Command.withDescription("Ingest a corpus adapter as draft/ai_draft rows (dry-run by default)"),
);

const stats = Command.make("stats", { by: Options.text("by").pipe(Options.optional) }, ({ by }) =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const s = yield* Effect.promise(() => contentStats(db));
        yield* out(g, s, () => {
          const wanted = Option.getOrUndefined(by);
          const section = (title: string, rec: Record<string, number>) => {
            console.log(title);
            table(Object.entries(rec).map(([k, n]) => ({ key: k, count: n })));
            console.log();
          };
          if (wanted === "licence") return section("lexemes by licence", s.lexemes.byLicence);
          section("lexemes by status", s.lexemes.byStatus);
          section("lexemes by CEFR band", s.lexemes.byBand);
          section("lexemes by source", s.lexemes.bySource);
          section("glosses by language:status", s.glosses.byLangAndStatus);
          section("audio by tier", s.audio.byTier);
          section("audio by status", s.audio.byStatus);
          section("sentences by status", s.sentences.byStatus);
          section("exercises by type", s.exercises.byType);
          section("units by status", s.units.byStatus);
          kv({
            review_queue: s.reviewQueue,
            published_lexemes_without_tier12_audio: s.publishedLexemesWithoutTier12Audio,
          });
        });
      }),
    );
  }),
).pipe(Command.withDescription("Counts by status, band, audio tier, source language, licence"));

const report = Command.make(
  "report",
  {
    slack: Options.boolean("slack").pipe(
      Options.withDescription("Post to SLACK_WEBHOOK_URL (needs --live); otherwise print"),
    ),
  },
  ({ slack }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const r = yield* Effect.promise(() => contentReport(db));
          const text = formatContentReport(r);
          yield* out(g, { text, report: r }, () => console.log(text));
          if (!slack) return;
          const hook = envVar("SLACK_WEBHOOK_URL");
          if (!hook) return yield* fail("SLACK_WEBHOOK_URL is not set (molo doctor)");
          const apply = yield* gate(g, "post the report to Slack");
          if (!apply) return;
          const res = yield* tryPromise(
            () =>
              fetch(hook, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text }),
              }),
            "slack webhook",
          );
          if (!res.ok) return yield* fail(`slack webhook answered ${res.status}`);
          console.log("posted to Slack");
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Weekly numbers: content by status, publish blockers, audio queue, learner activity; --slack to post",
  ),
);

const KINDS: readonly EntityKind[] = [
  "lexeme",
  "gloss",
  "sentence",
  "sentence_gloss",
  "audio_asset",
  "exercise",
  "lesson",
  "skill",
  "unit",
];

const promote = Command.make(
  "promote",
  {
    id: Args.text({ name: "id" }),
    kind: Options.choice("kind", KINDS).pipe(Options.withDefault("lexeme" as EntityKind)),
    to: Options.text("to").pipe(Options.withDefault("in_review")),
    as: Options.text("as").pipe(
      Options.withDefault("dev_editor"),
      Options.withDescription("User id acting as editor"),
    ),
  },
  ({ id, kind, to, as }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (to === "published") {
        return yield* fail(
          "molo content promote cannot publish. the project rules, first section: " +
            '"No learner ever sees content that a human isiXhosa editor has not approved." ' +
            "Publishing happens in the dashboard review queue (four eyes, publish gate), never from the CLI.",
        );
      }
      if (to !== "in_review")
        return yield* fail(`promote only moves draft/ai_draft to in_review (got --to ${to})`);
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const actor = yield* Effect.promise(() => actorForRef(db, as));
          if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
          if (!actor.roles.some((r) => r === "editor" || r === "admin"))
            return yield* fail(`user ${as} has no editorial role`);
          const apply = yield* gate(g, `move ${kind} ${id} to in_review as ${as}`);
          if (!apply) return;
          const result = yield* Effect.promise(() =>
            editorRepo(db, actor).transitionEntity({ kind, id, to: "in_review" }),
          );
          yield* out(g, result, () =>
            console.log(result.ok ? `${kind} ${id} -> in_review` : `refused: ${result.reason}`),
          );
          if (!result.ok) process.exitCode = 1;
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "draft/ai_draft -> in_review. Never -> published; that is dashboard-only.",
  ),
);

/** Vocabulary mining over a downloaded corpus; a report, never a write. */
const mineCmd = Command.make(
  "mine",
  {
    corpus: Args.choice([["vukuzenzele", "vukuzenzele"]] as const, { name: "corpus" }),
    dir: Options.directory("dir").pipe(
      Options.withDescription("Folder of *.txt isiXhosa files (recursive)"),
    ),
    top: Options.integer("top").pipe(Options.withDefault(100)),
    minCount: Options.integer("min-count").pipe(Options.withDefault(3)),
    outFile: Options.file("out").pipe(
      Options.optional,
      Options.withDescription("Write the shortlist as CSV"),
    ),
  },
  ({ dir, top, minCount, outFile }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const lemmas = yield* Effect.promise(async () => {
            const rows = await db.select({ lemma: schema.lexemes.lemma }).from(schema.lexemes);
            return new Set(rows.map((r) => r.lemma.toLowerCase()));
          });
          let files = 0;
          const texts = (function* () {
            for (const t of vukuzenzele.readCorpusDir(dir)) {
              files++;
              yield t;
            }
          })();
          const mining = vukuzenzele.mine(texts, lemmas, { top, minCount });
          const csvPath = Option.getOrUndefined(outFile);
          if (csvPath) yield* Effect.promise(() => Bun.write(csvPath, vukuzenzele.toCsv(mining)));
          yield* out(
            g,
            { files, ...mining, licence: vukuzenzele.LICENCE, citation: vukuzenzele.CITATION },
            () => {
              kv({
                files,
                tokens: mining.tokens,
                distinct_forms: mining.distinctForms,
                lexicon_lemmas: lemmas.size,
                coverage: `${(mining.coverage * 100).toFixed(1)}%`,
                licence: vukuzenzele.LICENCE,
                csv: csvPath ?? "(none)",
              });
              console.log("\nmost frequent forms not in the lexicon (tutor shortlist):");
              table(mining.missing.slice(0, 40));
            },
          );
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Mine a downloaded corpus for vocabulary evidence; prints coverage and a shortlist, writes nothing",
  ),
);

/**
 * The share-alike half of the bargain: isixhosa.click gives us its dictionary
 * under CC BY-SA 4.0, so the lexemes, glosses and sentences we derive from it
 * go back out under the same licence, with credit and a note that we changed
 * things. Writes data only — no audio, no learner rows, no editor identities.
 */
const NOTICE = (counts: {
  lexemes: number;
  sentences: number;
  when: string;
}) => `# Molo lexicon export

This directory is the isiXhosa lexicon data behind Molo, offered under the
same licence it came from.

- ${counts.lexemes} lexemes with their glosses, ${counts.sentences} sentences.
- Exported ${counts.when}.

## Credit

The lexicon is derived from **isixhosa.click** (https://isixhosa.click), a
student-led isiXhosa-English dictionary hosted by the Department of Computer
Science at the University of Cape Town and part-funded by SADiLaR, published
under the Creative Commons Attribution-ShareAlike 4.0 International licence
(https://creativecommons.org/licenses/by-sa/4.0/).

## Changes made

The entries have been adapted. Glosses are rewritten for learners, Norwegian
glosses and usage notes are added, contrastive notes for English and
Norwegian speakers are new, entries carry a review status, and some entries
were corrected or dropped by our isiXhosa editors.

## Licence

This data is distributed under **CC BY-SA 4.0**. You may share and adapt it,
with credit to isixhosa.click and to Molo, and under the same licence.

Nothing else in Molo is covered by this licence: the app, its design, the
mascots, the curriculum, the exercises and the audio recordings are not part
of this export.

## Files

- lexemes.jsonl — one lexeme per line, with its glosses.
- sentences.jsonl — one sentence per line, with its translations.
- sources.json — which upstream source each row came from.
- LICENSE.txt — the data licence and its canonical legal text.
- README.md — attribution, changes and package scope.
`;

const exportCmd = Command.make(
  "export",
  {
    published: Options.boolean("published").pipe(
      Options.withDescription("Export published content only; required for the public web package"),
    ),
    out: Options.text("out").pipe(
      Options.withDefault("export/lexicon"),
      Options.withDescription("Directory to write the CC BY-SA data package into"),
    ),
  },
  ({ out: dir, published }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const data = yield* Effect.promise(() =>
            published ? publishedShareAlikeExport(db) : shareAlikeExport(db),
          );
          const counts = {
            lexemes: data.lexemes.length,
            sentences: data.sentences.length,
            when: new Date().toISOString().slice(0, 10),
          };
          const apply = yield* gate(
            g,
            `write ${counts.lexemes} lexemes and ${counts.sentences} sentences to ${dir} under CC BY-SA 4.0`,
          );
          if (!apply) {
            yield* out(g, { ...counts, sources: data.sources, dir }, () => {
              table(
                data.sources.map((s) => ({
                  source: s.source,
                  licence: s.licence,
                  lexemes: s.lexemes,
                })),
              );
            });
            return;
          }
          yield* tryPromise(async () => {
            await mkdir(dir, { recursive: true });
            await writeFile(
              join(dir, "lexemes.jsonl"),
              data.lexemes.map((l) => JSON.stringify(l)).join("\n") + "\n",
            );
            await writeFile(
              join(dir, "sentences.jsonl"),
              data.sentences.map((s) => JSON.stringify(s)).join("\n") + "\n",
            );
            await writeFile(
              join(dir, "sources.json"),
              JSON.stringify(data.sources, null, 2) + "\n",
            );
            await writeFile(join(dir, "README.md"), NOTICE(counts));
            await writeFile(
              join(dir, "LICENSE.txt"),
              "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)\n\nhttps://creativecommons.org/licenses/by-sa/4.0/legalcode\n\nThe lexicon data is offered as-is, without warranties. See README.md for attribution and changes. Audio, curriculum and application code are excluded.\n",
            );
            // Explicit filenames keep an old archive or unrelated files out of the package.
            execFileSync(
              "tar",
              [
                "-czf",
                "lexicon.tgz",
                "lexemes.jsonl",
                "sentences.jsonl",
                "sources.json",
                "README.md",
                "LICENSE.txt",
              ],
              { cwd: dir },
            );
            const archive = await readFile(join(dir, "lexicon.tgz"));
            const manifest: LexiconPackageManifest = {
              schemaVersion: 1,
              publishedOnly: published,
              headwords: counts.lexemes,
              sentences: counts.sentences,
              exportedAt: counts.when,
              licence: "CC-BY-SA-4.0",
              archive: "lexicon.tgz",
              bytes: archive.byteLength,
              sha256: createHash("sha256").update(archive).digest("hex"),
            };
            // Last: a failed export never advertises an incomplete archive.
            await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
          }, "writing the export");
          yield* out(g, { ...counts, dir, sources: data.sources }, () =>
            kv({
              dir,
              lexemes: counts.lexemes,
              sentences: counts.sentences,
              licence: "CC BY-SA 4.0",
            }),
          );
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Write the CC BY-SA lexicon data package the licence obliges us to share (--live)",
  ),
);

export const content = Command.make("content", {}).pipe(
  Command.withDescription("Ingest adapters, statistics, frequency ranking, curation, promotion"),
  Command.withSubcommands([
    ingest,
    stats,
    report,
    exportCmd,
    mineCmd,
    promote,
    grammar,
    ...curationCommands,
    reconcileUnit1,
    gloss,
    sentenceRequests,
    linkSentences,
    culture,
  ]),
);
