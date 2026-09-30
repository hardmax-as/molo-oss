/**
 * `molo content gloss` — draft the missing source-language glosses in bulk.
 *
 * The editor dashboard has had a per-lexeme "draft with AI" button since the
 * assist endpoint landed. For the roughly four hundred words the curriculum
 * teaches, that is four hundred clicks, and the Norwegian column is empty for
 * every one of them, so nothing can pass the publish gate. This is the same
 * call in a loop.
 *
 * What keeps it inside the rules in the project rules:
 *
 *   - **It never writes isiXhosa.** The model is given a word the lexicon
 *     already holds and its human English gloss, and asked for English and
 *     Norwegian *about* it. The system prompt in `packages/content/assist.ts`
 *     says so in terms; the isiXhosa on the row is not touched.
 *   - **Everything lands as `ai_draft`,** through the same repository the
 *     endpoint uses. No learner can see an `ai_draft`, and only an editor in
 *     the dashboard can move one on.
 *   - **A human gloss is never overwritten.** A word an editor has already
 *     glossed in the target language is not a candidate, and a word with no
 *     human *English* gloss is not either: there would be nothing to
 *     translate from but another draft.
 *   - **It costs money, so it is a dry run without `--live`,** and it reports
 *     what it would spend before it spends it.
 *
 * It is slow — one request per word, in order — and it is resumable, which
 * matters more: a word a model has already drafted is not a candidate on the
 * next run, so an interrupted pass is continued by running the same command
 * again. `--redraft` is how you deliberately redo them.
 *
 * **A second machine is a second opinion, not a second truth.** `--provider
 * google` asks Cloud Translation instead of the LLM, for the pair it is good
 * at (English to Norwegian) and never from or into isiXhosa. `--compare`
 * fetches its suggestion for the words a model has already drafted and prints
 * the two side by side, writing nothing: agreement is a reason to read fast,
 * disagreement a reason to read slowly. Both land as `ai_draft` like the LLM's
 * rows when they are written, with the engine's name in the revision entry.
 *
 * **The API key is optional.** `--export` writes the prompts to a file and
 * sends nothing; `--import` reads the answers back and writes them through
 * the same checks. Anything can sit in between — another agent, a translator,
 * a paid API later — and the pipeline does not depend on whichever vendor
 * holds a key this month. What the import will not do is trust the file: the
 * lexeme has to exist, it has to still have no human gloss in this language,
 * and a gloss that is just the isiXhosa lemma echoed back is refused.
 */

import { existsSync, readFileSync } from "node:fs";

import { Command, Options } from "@effect/cli";
import {
  loadCurriculum,
  planAssist,
  planCuration,
  planTranslate,
  runAssist,
  runTranslate,
  sameGloss,
  spokenXhosaGu,
  TRANSLATE_PROVENANCE,
  validateSpine,
  type AssistRequest,
} from "@molo/content";
import type { Db } from "@molo/db";
import {
  actorForRef,
  curationLexicon,
  editorRepo,
  glossSuggestionsRepo,
  lexemesMissingGloss,
  unitExerciseLexemeIds,
  type MissingGlossRow,
} from "@molo/db";
import { Effect, Option } from "effect";

type SourceLang = "en" | "nb";

import { envVar, fail, gate, kv, out, table, withDb } from "../context.ts";
import { molo, type Globals } from "../root.ts";
import { corpusPath, CORPUS_XML } from "./curate.ts";

/** Very rough: the report says so, and it is only there to prevent a surprise. */
function approxTokens(req: AssistRequest): number {
  return Math.ceil((req.system.length + req.user.length) / 4);
}

const asActor = Options.text("as").pipe(
  Options.withDefault("dev-admin@molo.local"),
  Options.withDescription("Editor or admin whose name goes on the rows"),
);

export const gloss = Command.make(
  "gloss",
  {
    as: asActor,
    // The two the assist prompt is written for. A third source language
    // means a change in packages/content/assist.ts, not a flag here.
    lang: Options.choice("lang", ["nb", "en"] as const).pipe(
      Options.withDefault("nb" as const),
      Options.withDescription("Source language to draft"),
    ),
    limit: Options.integer("limit").pipe(
      Options.withDefault(0),
      Options.withDescription("Stop after this many words (0 means all of them)"),
    ),
    all: Options.boolean("all").pipe(
      Options.withDescription(
        "Every lexeme, not only the ones the curriculum teaches. Much more expensive",
      ),
    ),
    redraft: Options.boolean("redraft").pipe(
      Options.withDescription("Also redo words a model has already drafted"),
    ),
    unit: Options.text("unit").pipe(
      Options.optional,
      Options.withDescription(
        "Only the words one unit teaches, by slug. The natural batch size: an editor reviews a unit, not an alphabet",
      ),
    ),
    exportTo: Options.file("export").pipe(
      Options.optional,
      Options.withDescription(
        "Write the prompts to this file instead of sending them; needs no API key",
      ),
    ),
    importFrom: Options.file("import", { exists: "yes" }).pipe(
      Options.optional,
      Options.withDescription("Read drafts back from a file and write them as ai_draft"),
    ),
    provider: Options.choice("provider", ["anthropic", "google"] as const).pipe(
      Options.withDefault("anthropic" as const),
      Options.withDescription(
        "Which machine drafts: the LLM (glosses and notes) or Cloud Translation (the gloss only, English to Norwegian)",
      ),
    ),
    compare: Options.boolean("compare").pipe(
      Options.withDescription(
        "With --provider google: store its suggestion beside the existing draft for editor comparison (--live required)",
      ),
    ),
  },
  ({ as, lang, limit, all, redraft, unit, exportTo, importFrom, provider, compare }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const exportPath = Option.getOrUndefined(exportTo);
      const importPath = Option.getOrUndefined(importFrom);
      if (exportPath && importPath)
        return yield* fail("--export and --import are two different jobs; run one at a time");
      if (compare && provider !== "google")
        return yield* fail("--compare is the Google path's job: add --provider google");
      if (provider === "google" && exportPath)
        return yield* fail(
          "--export writes the LLM's prompts; there is nothing to export for Google",
        );
      if (provider === "google" && lang !== "nb")
        return yield* fail(
          "the Google path translates English to Norwegian only: an English gloss comes from isixhosa.click or an editor, never from machine translation of isiXhosa",
        );

      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          if (importPath) return yield* importDrafts(g, db, as, lang, importPath);
          const lexicon = yield* Effect.promise(() => curationLexicon(db));

          // Which words are we drafting for? The curriculum's, by default,
          // which is the set that actually blocks a publish.
          let ids: string[];
          if (all) {
            ids = lexicon.map((l) => l.id);
          } else {
            const xmlPath = corpusPath(CORPUS_XML);
            if (!existsSync(xmlPath))
              return yield* fail(
                `the Gothenburg spoken corpus is missing at ${xmlPath}; --all glosses the whole lexicon instead`,
              );
            const { spine, themes } = loadCurriculum();
            const problems = validateSpine(spine, themes);
            if (problems.length > 0) return yield* fail(problems.join("\n"));
            const corpus = spokenXhosaGu.parseCorpus(readFileSync(xmlPath, "utf8"));
            const plan = planCuration(spine, themes, [...lexicon], corpus);
            const unitSlug = Option.getOrUndefined(unit);
            const skills = unitSlug
              ? plan.skills.filter((sk) => sk.unitSlug === unitSlug)
              : plan.skills;
            if (unitSlug && skills.length === 0)
              return yield* fail(
                `no unit "${unitSlug}"; the spine has ${[...new Set(plan.skills.map((sk) => sk.unitSlug))].join(", ")}`,
              );
            // The plan's words, and every word the unit's exercises actually
            // use: after a reconciliation the two differ, and both block a publish.
            const used = yield* Effect.promise(() => unitExerciseLexemeIds(db, unitSlug));
            ids = [
              ...new Set([...skills.flatMap((sk) => sk.words.map((w) => w.lexemeId)), ...used]),
            ];
          }

          const missingAll = yield* Effect.promise(() => lexemesMissingGloss(db, lang, ids));
          const missing = redraft ? missingAll : missingAll.filter((m) => !m.hasAiDraft);
          const todo = limit > 0 ? missing.slice(0, limit) : missing;

          if (provider === "google") {
            const scope = all
              ? "the whole lexicon"
              : (Option.getOrUndefined(unit) ?? "the words the curriculum teaches");
            // Comparison wants the drafted words, drafting wants the undrafted ones.
            const drafted = missingAll.filter((m) => m.hasAiDraft);
            const rows = compare ? (limit > 0 ? drafted.slice(0, limit) : drafted) : todo;
            return yield* translateDrafts(g, db, as, {
              scope,
              considered: ids.length,
              rows,
              compare,
            });
          }

          const requests = todo.map((m) => ({ row: m, req: requestFor(m, lang) }));
          const tokens = requests.reduce((n, r) => n + approxTokens(r.req), 0);
          const summary = {
            scope: all
              ? "the whole lexicon"
              : (Option.getOrUndefined(unit) ?? "the words the curriculum teaches"),
            language: lang,
            considered: ids.length,
            no_human_gloss_in_this_language: missingAll.length,
            already_drafted_by_a_model: missingAll.filter((m) => m.hasAiDraft).length,
            to_draft: todo.length,
            model: requests[0]?.req.model ?? "(nothing to send)",
            approx_input_tokens: tokens,
          };

          yield* out(g, { summary, sample: requests[0]?.req ?? null }, () => {
            kv(summary);
            if (todo.length > 0) {
              console.log("\nfirst ten:");
              table(
                todo.slice(0, 10).map((m) => ({
                  lemma: m.lemma,
                  pos: m.pos,
                  class: m.nounClassLabel ?? "",
                  english: m.sourceGlossEn ?? "",
                  redraft: m.hasAiDraft ? "yes" : "",
                })),
              );
              console.log(
                "\nevery row is written as ai_draft; an editor still has to read each one.",
              );
            }
          });
          if (todo.length === 0) return;

          // The export route exists because the request does not have to be
          // sent from here. Anything can answer it — another agent, a
          // translator, a paid API later — and `--import` is the one audited
          // way back in. That keeps the pipeline from depending on whichever
          // vendor happens to hold a key this month.
          if (exportPath) {
            const doc = {
              note: "Answer every word. Reply with one JSON object per word: {lexemeId, gloss, usage_note, contrastive_note, confidence, caveat}. confidence is high | medium | low and caveat is anything an editor should double-check, or an empty string — they are not stored, they decide which rows get read hardest. Never write isiXhosa; the lemma is given so you can refer to it, not translate into it.",
              model_the_prompt_was_written_for: requests[0]?.req.model ?? null,
              language: lang,
              system: requests[0]?.req.system ?? "",
              words: requests.map(({ row, req }) => ({
                lexemeId: row.id,
                lemma: row.lemma,
                pos: row.pos,
                nounClass: row.nounClassLabel,
                english: row.sourceGlossEn,
                prompt: req.user,
              })),
            };
            yield* Effect.promise(() => Bun.write(exportPath, JSON.stringify(doc, null, 2)));
            yield* out(g, { exported: todo.length, file: exportPath }, () =>
              kv({
                exported: todo.length,
                file: exportPath,
                next: `answer it, then: molo content gloss --lang ${lang} --import <answers> --live`,
              }),
            );
            return;
          }

          const apply = yield* gate(
            g,
            `send ${todo.length} requests to ${summary.model} and write ${todo.length} ai_draft ${lang} glosses`,
          );
          if (!apply) return;

          const key = envVar("ANTHROPIC_API_KEY");
          if (!key) return yield* fail("ANTHROPIC_API_KEY is not set");
          const actor = yield* Effect.promise(() => actorForRef(db, as));
          if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
          if (!actor.roles.some((r) => r === "editor" || r === "admin"))
            return yield* fail(`user ${as} has no editorial role`);
          const repo = editorRepo(db, actor);

          let written = 0;
          const failures: { lemma: string; reason: string }[] = [];
          for (const { row, req } of requests) {
            const result = yield* Effect.promise(() => runAssist(key, req));
            if (!result.ok) {
              failures.push({ lemma: row.lemma, reason: result.reason });
              continue;
            }
            const draft = result.draft[lang];
            if (!draft || !draft.gloss.trim()) {
              failures.push({ lemma: row.lemma, reason: `model returned no ${lang} gloss` });
              continue;
            }
            yield* Effect.promise(() =>
              repo.upsertGloss(row.id, {
                sourceLang: lang,
                gloss: draft.gloss,
                usageNote: draft.usage_note || null,
                contrastiveNote: draft.contrastive_note || null,
                origin: "llm",
              }),
            );
            written++;
          }
          yield* out(g, { written, failed: failures.length, failures }, () => {
            kv({ written, failed: failures.length });
            if (failures.length > 0) table(failures);
          });
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Draft the missing glosses for one source language as ai_draft (--live spends the API budget)",
  ),
);

/** The same input the dashboard's button builds, from a row rather than a request. */
function requestFor(m: MissingGlossRow, lang: SourceLang): AssistRequest {
  return planAssist({
    lemma: m.lemma,
    pos: m.pos,
    nounClass: m.nounClassLabel,
    infinitive: m.infinitive,
    register: m.register,
    sourceGlossEn: m.sourceGlossEn,
    sourceNote: m.sourceNoteEn,
    examples: [],
    // Anything but the language being drafted is left alone. `existing` is
    // what stops the model rewriting a gloss a person wrote.
    existing: (["en", "nb"] as const).filter((l) => l !== lang),
  });
}

/**
 * The Google path: Cloud Translation from the human English gloss to
 * Norwegian. One request per batch rather than per word, priced in
 * characters, and the only thing it can produce is the gloss itself: a
 * translation engine has no opinion on usage or on what a Norwegian speaker
 * should watch out for, so those columns stay empty for an editor.
 *
 * With `compare` it fetches the suggestion for words a model has already
 * drafted and stores a separate suggestion, leaving the canonical gloss alone. The
 * table is the point: it costs cents and tells the editor which of a unit's
 * words two independent machines agree on.
 */
function translateDrafts(
  g: Globals,
  db: Db,
  as: string,
  input: {
    scope: string;
    considered: number;
    rows: readonly MissingGlossRow[];
    compare: boolean;
  },
) {
  return Effect.gen(function* () {
    const { rows, compare } = input;
    const plan = planTranslate(
      rows.map((r) => ({ id: r.id, text: r.sourceGlossEn ?? "" })),
      "en",
      "nb",
    );
    const summary = {
      provider: TRANSLATE_PROVENANCE,
      mode: compare ? "compare (suggestions only)" : "draft and suggestion",
      scope: input.scope,
      language: "nb",
      considered: input.considered,
      words: rows.length,
      requests: plan.batches.length,
      characters: plan.chars,
      approx_cost_usd: Number(plan.approxUsd.toFixed(4)),
    };
    yield* out(g, { summary }, () => {
      kv(summary);
      if (rows.length > 0) {
        console.log("\nfirst ten:");
        table(
          rows.slice(0, 10).map((m) => ({
            lemma: m.lemma,
            english: m.sourceGlossEn ?? "",
            ...(compare ? { drafted: m.aiDraftGloss ?? "" } : {}),
          })),
        );
        if (!compare)
          console.log(
            "\nsuggestions are stored separately; only missing canonical glosses become ai_draft.",
          );
      }
    });
    if (rows.length === 0) return;

    const apply = yield* gate(
      g,
      compare
        ? `send ${plan.chars} characters in ${plan.batches.length} requests to Cloud Translation and store ${rows.length} editor-only suggestions`
        : `send ${plan.chars} characters in ${plan.batches.length} requests to Cloud Translation and store ${rows.length} suggestions plus missing ai_draft nb glosses`,
    );
    if (!apply) return;

    const actor = yield* Effect.promise(() => actorForRef(db, as));
    if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
    if (!actor.roles.some((r) => r === "editor" || r === "admin"))
      return yield* fail(`user ${as} has no editorial role`);
    const repo = glossSuggestionsRepo(db, actor);

    const key = envVar("GOOGLE_TRANSLATE_API_KEY");
    if (!key) return yield* fail("GOOGLE_TRANSLATE_API_KEY is not set");

    const suggestions = new Map<string, string>();
    const failures: { batch: number; reason: string }[] = [];
    for (const [i, batch] of plan.batches.entries()) {
      const result = yield* Effect.promise(() => runTranslate(key, batch));
      if (!result.ok) {
        failures.push({ batch: i + 1, reason: result.reason });
        continue;
      }
      for (const [id, text] of result.translations) suggestions.set(id, text);
    }
    const byId = new Map(rows.map((r) => [r.id, r]));

    let written = 0;
    let suggestionsWritten = 0;
    const skipped: { lemma: string; reason: string }[] = [];
    for (const row of rows) {
      const suggested = suggestions.get(row.id);
      if (!suggested) {
        skipped.push({ lemma: row.lemma, reason: "engine returned no gloss" });
        continue;
      }
      const copiedLemma = suggested.toLowerCase() === row.lemma.toLowerCase();
      const result = yield* Effect.promise(() =>
        repo.record(
          {
            lexemeId: row.id,
            sourceLang: "nb",
            gloss: suggested,
            provenance: TRANSLATE_PROVENANCE,
          },
          !compare && !copiedLemma,
        ),
      );
      suggestionsWritten++;
      if (result.draftCreated) written++;
      else if (!compare)
        skipped.push({
          lemma: row.lemma,
          reason: copiedLemma
            ? "the gloss is the isiXhosa lemma"
            : "a canonical gloss already exists; suggestion saved only",
        });
    }

    if (compare) {
      const compared = [...suggestions].map(([id, google]) => {
        const row = byId.get(id)!;
        const drafted = row.aiDraftGloss ?? "";
        return {
          lemma: row.lemma,
          english: row.sourceGlossEn ?? "",
          drafted,
          google,
          agree: sameGloss(drafted, google),
        };
      });
      const agree = compared.filter((c) => c.agree).length;
      yield* out(
        g,
        {
          suggestionsWritten,
          compared: compared.length,
          agree,
          differ: compared.length - agree,
          rows: compared,
          failures,
        },
        () => {
          kv({
            suggestionsWritten,
            compared: compared.length,
            agree,
            differ: compared.length - agree,
          });
          if (compared.length > 0) {
            console.log("\nread these slowly — the two machines differ:");
            table(
              compared
                .filter((c) => !c.agree)
                .map((c) => ({
                  lemma: c.lemma,
                  english: c.english,
                  drafted: c.drafted,
                  google: c.google,
                })),
            );
          }
          if (failures.length > 0) table(failures);
        },
      );
      return;
    }

    yield* out(
      g,
      { written, suggestionsWritten, skipped: skipped.length, failures, rows: skipped },
      () => {
        kv({
          written,
          suggestionsWritten,
          skipped: skipped.length,
          failed_requests: failures.length,
        });
        if (skipped.length > 0) table(skipped);
        if (failures.length > 0) table(failures);
      },
    );
  });
}

/**
 * Read drafts back and write them as `ai_draft`.
 *
 * This is the half that has to be strict, because the file came from
 * somewhere this command did not watch. Every row is checked against the
 * database rather than trusted: the lexeme has to exist, it has to still have
 * no human gloss in this language, and the text has to be non-empty and not
 * simply the isiXhosa lemma echoed back. Whatever wrote the file, it lands as
 * a draft an editor still has to read.
 */
function importDrafts(g: Globals, db: Db, as: string, lang: SourceLang, path: string) {
  return Effect.gen(function* () {
    const raw = yield* Effect.promise(() => Bun.file(path).text());
    const parsed = parseDrafts(raw);
    if (parsed.length === 0) return yield* fail(`no drafts found in ${path}`);

    const candidates = yield* Effect.promise(() =>
      lexemesMissingGloss(
        db,
        lang,
        parsed.map((d) => d.lexemeId),
      ),
    );
    const byId = new Map(candidates.map((c) => [c.id, c]));

    const accepted: { row: MissingGlossRow; draft: ImportedDraft }[] = [];
    const rejected: { lexemeId: string; reason: string }[] = [];
    for (const d of parsed) {
      const row = byId.get(d.lexemeId);
      if (!row) {
        // Either the id is not ours, or a human has glossed it since the
        // export. Both mean "do not write", and the difference does not
        // change what happens.
        rejected.push({ lexemeId: d.lexemeId, reason: "unknown, or a human has glossed it since" });
        continue;
      }
      if (!d.gloss.trim()) {
        rejected.push({ lexemeId: d.lexemeId, reason: "empty gloss" });
        continue;
      }
      if (d.gloss.trim().toLowerCase() === row.lemma.toLowerCase()) {
        rejected.push({ lexemeId: d.lexemeId, reason: "the gloss is the isiXhosa lemma" });
        continue;
      }
      accepted.push({ row, draft: d });
    }

    const flagged = accepted.filter(
      (a) => (a.draft.confidence && a.draft.confidence !== "high") || a.draft.caveat,
    );
    const summary = {
      file: path,
      language: lang,
      in_the_file: parsed.length,
      accepted: accepted.length,
      rejected: rejected.length,
      flagged_by_the_answerer: flagged.length,
    };
    yield* out(g, { summary, rejected, sample: accepted.slice(0, 10) }, () => {
      kv(summary);
      if (accepted.length > 0) {
        console.log("\nfirst ten:");
        table(
          accepted.slice(0, 10).map((a) => ({
            lemma: a.row.lemma,
            english: a.row.sourceGlossEn ?? "",
            [lang]: a.draft.gloss,
          })),
        );
      }
      if (flagged.length > 0) {
        // The reading order, not a rejection: these are written like the rest.
        console.log("\nread these first — the answerer was not confident:");
        table(
          flagged.slice(0, 25).map((a) => ({
            lemma: a.row.lemma,
            english: a.row.sourceGlossEn ?? "",
            [lang]: a.draft.gloss,
            confidence: a.draft.confidence ?? "",
            caveat: a.draft.caveat ?? "",
          })),
        );
      }
      if (rejected.length > 0) {
        console.log("\nnot written:");
        table(rejected.slice(0, 20));
      }
    });
    if (accepted.length === 0) return;

    const apply = yield* gate(g, `write ${accepted.length} ai_draft ${lang} glosses`);
    if (!apply) return;
    const actor = yield* Effect.promise(() => actorForRef(db, as));
    if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
    if (!actor.roles.some((r) => r === "editor" || r === "admin"))
      return yield* fail(`user ${as} has no editorial role`);
    const repo = editorRepo(db, actor);
    for (const { row, draft } of accepted) {
      yield* Effect.promise(() =>
        repo.upsertGloss(row.id, {
          sourceLang: lang,
          gloss: draft.gloss,
          usageNote: draft.usage_note || null,
          contrastiveNote: draft.contrastive_note || null,
          origin: "llm",
        }),
      );
    }
    yield* out(g, { written: accepted.length }, () => kv({ written: accepted.length }));
  });
}

export interface ImportedDraft {
  readonly lexemeId: string;
  readonly gloss: string;
  readonly usage_note?: string;
  readonly contrastive_note?: string;
  /**
   * The answerer's own read on the row. Not stored — `glosses` has no column
   * for it, and adding one is a schema decision nobody has taken — but
   * reported, because "which of these 379 did the model doubt" is the single
   * most useful thing an editor can be told before starting to read.
   */
  readonly confidence?: "high" | "medium" | "low";
  readonly caveat?: string;
}

/**
 * Accepts the three shapes a person or an agent plausibly hands back: a JSON
 * array, the exported document with the answers filled in under `words`, or
 * JSON Lines. Being liberal here costs nothing, because every row is checked
 * against the database afterwards anyway.
 */
export function parseDrafts(raw: string): readonly ImportedDraft[] {
  const text = raw.trim();
  if (text === "") return [];
  const asDraft = (v: unknown): ImportedDraft | null => {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    const id = o["lexemeId"] ?? o["lexeme_id"];
    if (typeof id !== "string" || typeof o["gloss"] !== "string") return null;
    const note = o["usage_note"] ?? o["usageNote"];
    const contrast = o["contrastive_note"] ?? o["contrastiveNote"];
    const conf = o["confidence"];
    const caveat = o["caveat"];
    return {
      lexemeId: id,
      gloss: o["gloss"],
      ...(typeof note === "string" ? { usage_note: note } : {}),
      ...(typeof contrast === "string" ? { contrastive_note: contrast } : {}),
      ...(conf === "high" || conf === "medium" || conf === "low" ? { confidence: conf } : {}),
      ...(typeof caveat === "string" && caveat.trim() ? { caveat } : {}),
    };
  };
  const fromList = (list: unknown[]): ImportedDraft[] =>
    list.map(asDraft).filter((d): d is ImportedDraft => d !== null);

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const doc: unknown = JSON.parse(text);
      if (Array.isArray(doc)) return fromList(doc);
      if (typeof doc === "object" && doc !== null) {
        const words = (doc as Record<string, unknown>)["words"];
        if (Array.isArray(words)) return fromList(words);
        const one = asDraft(doc);
        return one ? [one] : [];
      }
      return [];
    } catch {
      // Fall through: a file of JSON objects one per line also starts with `{`.
    }
  }
  const lines: ImportedDraft[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    try {
      const d = asDraft(JSON.parse(t));
      if (d) lines.push(d);
    } catch {
      continue;
    }
  }
  return lines;
}
