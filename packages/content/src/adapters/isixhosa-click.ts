/**
 * isixhosa.click adapter (CONTENT.md section 2): fetches the CSV backups
 * from GitHub, parses them and normalises them into one object per lexeme.
 * Pure input side; writing rows is `@molo/db`'s `loadLexicon`.
 *
 * Port of scripts/spike/ingest_isixhosa_click.ts (Phase 0), which stays as
 * the standalone record of what the spike ran.
 *
 * Network: api.github.com (resolve ref) and raw.githubusercontent.com (five
 * CSVs) only. `readLocalCsvs` makes no network calls.
 */

import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REPO = "IsiXhosa-click/database";
export const FILES = [
  "words.csv",
  "examples.csv",
  "linked_words.csv",
  "user_attributions.csv",
  "users.csv",
] as const;
export type CsvName = (typeof FILES)[number];

const SOURCE = "isixhosa.click" as const;
const LICENCE = "CC-BY-SA-4.0" as const;
const STATUS = "draft" as const;

const HEADERS: Record<CsvName, readonly string[]> = {
  "words.csv": [
    "word_id",
    "english",
    "xhosa",
    "part_of_speech",
    "xhosa_tone_markings",
    "infinitive",
    "is_plural",
    "is_inchoative",
    "is_informal",
    "transitivity",
    "followed_by",
    "noun_class",
    "note",
  ],
  "examples.csv": ["example_id", "word_id", "english", "xhosa"],
  "linked_words.csv": ["link_id", "link_type", "first", "second"],
  "user_attributions.csv": ["word_id", "user_id"],
  "users.csv": ["user_id", "username"],
};

/** isixhosa.click part-of-speech to molo `pos` (ARCHITECTURE section 2.2). */
const POS_MAP: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adjective: "adj",
  adverb: "adv",
  relative: "relative",
  preposition: "prep",
  conjunction: "conj",
  interjection: "interj",
  ideophone: "ideophone",
};

/** Labels accepted for `noun_class` (ARCHITECTURE section 2.2: 1 to 15 plus 1a/2a). */
const NOUN_CLASSES = new Set([
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
  "11",
  "12",
  "13",
  "14",
  "15",
]);

const LINK_TYPES = new Set([
  "related",
  "alternate_use",
  "plural_or_singular",
  "confusable",
  "antonym",
]);
const TRANSITIVITY = new Set(["", "transitive", "intransitive", "ambitransitive"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provenance carried on every row. No timestamp here on purpose: re-running
 * against the same upstream commit must produce a byte-identical file. */
export interface Snapshot {
  repo: string;
  commit: string | null;
  commit_date: string | null;
  from: "github" | "local";
}

interface WordRow {
  word_id: number;
  english: string;
  xhosa: string;
  pos: string;
  tone_markings: string;
  infinitive: string;
  is_plural: boolean;
  is_inchoative: boolean;
  is_informal: boolean;
  transitivity: string;
  followed_by: string;
  noun_class: string | null;
  note: string;
}

export interface Sense {
  word_id: number;
  /** English gloss exactly as the source has it. Source data, not an ai_draft. */
  en: string;
  note?: string;
  informal?: true;
  inchoative?: true;
  transitivity?: string;
  followed_by?: string;
}

export interface Example {
  word_id: number;
  example_id: number;
  xh: string;
  en: string;
}

type LinkKind = "plural_of" | "antonym" | "see_also";

export interface Link {
  /** ARCHITECTURE section 2.2 `lexeme_links.kind`. */
  kind: LinkKind;
  /** `out`: this lexeme is the source of the edge. `in`: the target is (used for plural_of). */
  direction: "out" | "in";
  /** The isixhosa.click link type, kept verbatim so nothing is lost in the mapping. */
  source_kind: string;
  lemma: string;
  pos: string;
  noun_class: string | null;
  word_ids: number[];
}

export interface Lexeme {
  lemma: string;
  pos: string;
  noun_class: string | null;
  is_plural: boolean;
  infinitive: string | null;
  tone_markings: string[];
  senses: Sense[];
  examples: Example[];
  linked: Link[];
  attribution: string[];
  source: typeof SOURCE;
  source_ref: string;
  snapshot: Snapshot;
  licence: typeof LICENCE;
  status: typeof STATUS;
}

export interface Unparsed {
  file: CsvName;
  row: number;
  reason: string;
}

export interface BuildSummary {
  snapshot: Snapshot;
  rows_in: Record<CsvName, number>;
  unparsed: { count: number; samples: Unparsed[] };
  lexemes_out: number;
  senses_merged: number;
  lemma_case_normalised: number;
  examples: { in: number; attached: number; orphaned: number };
  links: {
    in: number;
    attached: number;
    collapsed: number;
    orphaned: number;
    by_kind: Record<string, number>;
  };
  attribution: { lexemes_with_attribution: number; unknown_user_ids: number };
  by_pos: Record<string, number>;
  by_noun_class: Record<string, number>;
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180: quoted fields, doubled quotes, embedded newlines, CRLF)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) throw new Error("unterminated quoted field at end of input");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parses a CSV into records keyed by header; verifies the header matches exactly. */
export function toRecords(name: CsvName, text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new Error(`${name}: empty file`);
  const expected = HEADERS[name];
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    throw new Error(
      `${name}: header changed upstream.\n  expected: ${expected.join(",")}\n  got:      ${header.join(",")}`,
    );
  }
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as string[];
    if (row.length === 1 && row[0] === "") continue; // trailing blank line
    if (row.length !== expected.length) {
      throw new Error(
        `${name}: row ${r + 1} has ${row.length} fields, expected ${expected.length}`,
      );
    }
    const rec: Record<string, string> = {};
    expected.forEach((h, i) => {
      rec[h] = row[i] as string;
    });
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function githubJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "molo-spike-ingest" },
  });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function resolveCommit(ref: string): Promise<{ sha: string; date: string | null }> {
  const data = (await githubJson(
    `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`,
  )) as {
    sha?: string;
    commit?: { committer?: { date?: string } };
  };
  if (!data.sha) throw new Error(`could not resolve ref ${ref} in ${REPO}`);
  return { sha: data.sha, date: data.commit?.committer?.date ?? null };
}

export async function fetchCsvs(sha: string): Promise<Record<CsvName, string>> {
  const out = {} as Record<CsvName, string>;
  for (const f of FILES) {
    const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${f}`;
    const res = await fetch(url, { headers: { "User-Agent": "molo-spike-ingest" } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    out[f] = await res.text();
  }
  return out;
}

export async function readLocalCsvs(dir: string): Promise<Record<CsvName, string>> {
  const out = {} as Record<CsvName, string>;
  for (const f of FILES) {
    const file = Bun.file(join(dir, f));
    if (!(await file.exists())) throw new Error(`--from: ${join(dir, f)} does not exist`);
    out[f] = await file.text();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function parseBool(v: string, field: string): boolean {
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`${field}: expected true|false, got ${JSON.stringify(v)}`);
}

function parseId(v: string, field: string): number {
  if (!/^\d+$/.test(v)) throw new Error(`${field}: expected integer id, got ${JSON.stringify(v)}`);
  return Number(v);
}

/**
 * Citation-form normalisation: trim, collapse whitespace, and lower-case a
 * leading capital when the next letter is lower-case ("Igama" becomes "igama").
 * Internal capitals ("isiXhosa", "iKapa") are untouched.
 */
export function normaliseLemma(raw: string): { lemma: string; caseChanged: boolean } {
  const s = raw.trim().replace(/\s+/g, " ");
  const first = s[0];
  const second = s[1];
  if (
    first !== undefined &&
    second !== undefined &&
    /\p{Lu}/u.test(first) &&
    /\p{Ll}/u.test(second)
  ) {
    return { lemma: first.toLowerCase() + s.slice(1), caseChanged: true };
  }
  return { lemma: s, caseChanged: false };
}

function parseWordRow(rec: Record<string, string>): WordRow {
  const g = (k: string): string => (rec[k] ?? "").trim();
  const xhosa = g("xhosa");
  if (xhosa === "") throw new Error("xhosa is empty");
  const srcPos = g("part_of_speech");
  const pos = POS_MAP[srcPos];
  if (pos === undefined) throw new Error(`unknown part_of_speech ${JSON.stringify(srcPos)}`);
  const nc = g("noun_class");
  let noun_class: string | null = null;
  if (pos === "noun") {
    if (!NOUN_CLASSES.has(nc))
      throw new Error(`noun with invalid noun_class ${JSON.stringify(nc)}`);
    noun_class = nc;
  } else if (nc !== "") {
    throw new Error(`non-noun (${srcPos}) with noun_class ${JSON.stringify(nc)}`);
  }
  const transitivity = g("transitivity");
  if (!TRANSITIVITY.has(transitivity))
    throw new Error(`unknown transitivity ${JSON.stringify(transitivity)}`);
  return {
    word_id: parseId(g("word_id"), "word_id"),
    english: g("english"),
    xhosa,
    pos,
    tone_markings: g("xhosa_tone_markings"),
    infinitive: g("infinitive"),
    is_plural: parseBool(g("is_plural"), "is_plural"),
    is_inchoative: parseBool(g("is_inchoative"), "is_inchoative"),
    is_informal: parseBool(g("is_informal"), "is_informal"),
    transitivity,
    followed_by: g("followed_by"),
    noun_class,
    note: g("note"),
  };
}

function lexemeKey(
  lemma: string,
  pos: string,
  nounClass: string | null,
  isPlural: boolean,
): string {
  return `${lemma} ${pos} ${nounClass ?? ""} ${isPlural ? 1 : 0}`;
}

function mapLink(
  sourceKind: string,
  self: Lexeme,
  other: Lexeme,
): { kind: LinkKind; direction: "out" | "in" } {
  switch (sourceKind) {
    case "plural_or_singular":
      if (other.is_plural && !self.is_plural) return { kind: "plural_of", direction: "in" };
      if (self.is_plural && !other.is_plural) return { kind: "plural_of", direction: "out" };
      return { kind: "see_also", direction: "out" }; // plurality flags disagree; keep the edge, lose no data
    case "antonym":
      return { kind: "antonym", direction: "out" };
    default:
      // related, confusable, alternate_use (cross-lexeme only; same-lexeme ones collapse)
      return { kind: "see_also", direction: "out" };
  }
}

function collator(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function build(
  csvs: Record<CsvName, string>,
  snapshot: Snapshot,
): { lexemes: Lexeme[]; summary: BuildSummary } {
  const unparsed: Unparsed[] = [];
  const rowsIn = {} as Record<CsvName, number>;

  const records = {} as Record<CsvName, Record<string, string>[]>;
  for (const f of FILES) {
    records[f] = toRecords(f, csvs[f]);
    rowsIn[f] = records[f].length;
  }

  // --- users ---
  const users = new Map<number, string>();
  records["users.csv"].forEach((rec, i) => {
    try {
      users.set(parseId(rec["user_id"] ?? "", "user_id"), (rec["username"] ?? "").trim());
    } catch (e) {
      unparsed.push({ file: "users.csv", row: i + 2, reason: (e as Error).message });
    }
  });

  // --- words to lexemes (merge senses by lemma + pos + class + plurality) ---
  const byKey = new Map<string, Lexeme>();
  const byWordId = new Map<number, Lexeme>();
  let caseNormalised = 0;
  let wordsParsed = 0;

  records["words.csv"].forEach((rec, i) => {
    let w: WordRow;
    try {
      w = parseWordRow(rec);
    } catch (e) {
      unparsed.push({
        file: "words.csv",
        row: i + 2,
        reason: `word_id=${rec["word_id"] ?? "?"}: ${(e as Error).message}`,
      });
      return;
    }
    wordsParsed++;
    const { lemma, caseChanged } = normaliseLemma(w.xhosa);
    if (caseChanged) caseNormalised++;
    const key = lexemeKey(lemma, w.pos, w.noun_class, w.is_plural);
    let lex = byKey.get(key);
    if (!lex) {
      lex = {
        lemma,
        pos: w.pos,
        noun_class: w.noun_class,
        is_plural: w.is_plural,
        infinitive: null,
        tone_markings: [],
        senses: [],
        examples: [],
        linked: [],
        attribution: [],
        source: SOURCE,
        source_ref: "",
        snapshot,
        licence: LICENCE,
        status: STATUS,
      };
      byKey.set(key, lex);
    }
    if (w.infinitive !== "" && lex.infinitive === null) lex.infinitive = w.infinitive;
    if (w.tone_markings !== "" && !lex.tone_markings.includes(w.tone_markings))
      lex.tone_markings.push(w.tone_markings);
    const sense: Sense = { word_id: w.word_id, en: w.english };
    if (w.note !== "") sense.note = w.note;
    if (w.is_informal) sense.informal = true;
    if (w.is_inchoative) sense.inchoative = true;
    if (w.transitivity !== "") sense.transitivity = w.transitivity;
    if (w.followed_by !== "") sense.followed_by = w.followed_by;
    lex.senses.push(sense);
    byWordId.set(w.word_id, lex);
  });

  // --- examples ---
  let examplesAttached = 0;
  let examplesOrphaned = 0;
  records["examples.csv"].forEach((rec, i) => {
    try {
      const wordId = parseId(rec["word_id"] ?? "", "word_id");
      const exampleId = parseId(rec["example_id"] ?? "", "example_id");
      const lex = byWordId.get(wordId);
      if (!lex) {
        examplesOrphaned++;
        return;
      }
      const xh = (rec["xhosa"] ?? "").trim();
      const en = (rec["english"] ?? "").trim();
      if (xh === "" && en === "") throw new Error("empty example");
      lex.examples.push({ word_id: wordId, example_id: exampleId, xh, en });
      examplesAttached++;
    } catch (e) {
      unparsed.push({ file: "examples.csv", row: i + 2, reason: (e as Error).message });
    }
  });

  // --- links ---
  let linksAttached = 0;
  let linksCollapsed = 0;
  let linksOrphaned = 0;
  const linksByKind: Record<string, number> = {};
  records["linked_words.csv"].forEach((rec, i) => {
    try {
      const type = (rec["link_type"] ?? "").trim();
      if (!LINK_TYPES.has(type)) throw new Error(`unknown link_type ${JSON.stringify(type)}`);
      const a = byWordId.get(parseId(rec["first"] ?? "", "first"));
      const b = byWordId.get(parseId(rec["second"] ?? "", "second"));
      if (!a || !b) {
        linksOrphaned++;
        return;
      }
      if (a === b) {
        linksCollapsed++;
        return;
      }
      const pairs: ReadonlyArray<readonly [Lexeme, Lexeme]> = [
        [a, b],
        [b, a],
      ];
      for (const [self, other] of pairs) {
        const { kind, direction } = mapLink(type, self, other);
        const dup = self.linked.find(
          (l) =>
            l.kind === kind &&
            l.direction === direction &&
            l.source_kind === type &&
            l.lemma === other.lemma &&
            l.pos === other.pos &&
            l.noun_class === other.noun_class,
        );
        if (dup) continue;
        self.linked.push({
          kind,
          direction,
          source_kind: type,
          lemma: other.lemma,
          pos: other.pos,
          noun_class: other.noun_class,
          word_ids: other.senses.map((s) => s.word_id),
        });
        linksByKind[kind] = (linksByKind[kind] ?? 0) + 1;
      }
      linksAttached++;
    } catch (e) {
      unparsed.push({ file: "linked_words.csv", row: i + 2, reason: (e as Error).message });
    }
  });

  // --- attribution ---
  let unknownUsers = 0;
  records["user_attributions.csv"].forEach((rec, i) => {
    try {
      const lex = byWordId.get(parseId(rec["word_id"] ?? "", "word_id"));
      const name = users.get(parseId(rec["user_id"] ?? "", "user_id"));
      if (!lex) return;
      if (name === undefined) {
        unknownUsers++;
        return;
      }
      if (!lex.attribution.includes(name)) lex.attribution.push(name);
    } catch (e) {
      unparsed.push({ file: "user_attributions.csv", row: i + 2, reason: (e as Error).message });
    }
  });

  // --- finalise ---
  const lexemes = [...byKey.values()];
  const byPos: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  for (const lex of lexemes) {
    lex.senses.sort((x, y) => x.word_id - y.word_id);
    lex.examples.sort((x, y) => x.example_id - y.example_id);
    lex.linked.sort((x, y) => collator(x.kind, y.kind) || collator(x.lemma, y.lemma));
    lex.attribution.sort(collator);
    lex.source_ref = `words.csv:word_id=${lex.senses.map((s) => s.word_id).join(",")}`;
    byPos[lex.pos] = (byPos[lex.pos] ?? 0) + 1;
    if (lex.noun_class !== null) byClass[lex.noun_class] = (byClass[lex.noun_class] ?? 0) + 1;
  }
  lexemes.sort(
    (x, y) =>
      collator(x.lemma, y.lemma) ||
      collator(x.pos, y.pos) ||
      collator(x.noun_class ?? "", y.noun_class ?? "") ||
      Number(x.is_plural) - Number(y.is_plural),
  );

  return {
    lexemes,
    summary: {
      snapshot,
      rows_in: rowsIn,
      unparsed: { count: unparsed.length, samples: unparsed.slice(0, 20) },
      lexemes_out: lexemes.length,
      senses_merged: wordsParsed - lexemes.length,
      lemma_case_normalised: caseNormalised,
      examples: {
        in: rowsIn["examples.csv"],
        attached: examplesAttached,
        orphaned: examplesOrphaned,
      },
      links: {
        in: rowsIn["linked_words.csv"],
        attached: linksAttached,
        collapsed: linksCollapsed,
        orphaned: linksOrphaned,
        by_kind: linksByKind,
      },
      attribution: {
        lexemes_with_attribution: lexemes.filter((l) => l.attribution.length > 0).length,
        unknown_user_ids: unknownUsers,
      },
      by_pos: byPos,
      by_noun_class: byClass,
    },
  };
}

/** Fetches the snapshot at `ref` (default master) and builds the lexeme list. */
export async function fetchAndBuild(
  ref = "master",
): Promise<{ lexemes: Lexeme[]; summary: BuildSummary }> {
  const { sha, date } = await resolveCommit(ref);
  const csvs = await fetchCsvs(sha);
  return build(csvs, { repo: REPO, commit: sha, commit_date: date, from: "github" });
}

/** Builds from a directory holding the five CSVs; no network. */
export async function buildFromDir(
  dir: string,
): Promise<{ lexemes: Lexeme[]; summary: BuildSummary }> {
  const csvs = await readLocalCsvs(dir);
  return build(csvs, { repo: REPO, commit: null, commit_date: null, from: "local" });
}
