/**
 * Forvo adapter (CONTENT.md section 2, tier-2 audio backfill). Pure input
 * side: builds the request, parses the response, picks the pronunciation
 * worth keeping. Downloading, processing with xh-audio and writing the
 * `audio_assets` row are the CLI's job (`molo audio forvo`), which is
 * dry-run by default because every call costs API quota.
 *
 * Endpoint shape verified against Forvo's documentation
 * (api.forvo.com/documentation/word-pronunciations) and the mucsi96/forvo
 * client's recorded responses; the field list below is tolerant on purpose
 * and must be confirmed with a real key before the first live run
 * (the library notes).
 *
 * Licence: every asset from here carries `licence: "forvo-api"` and the
 * attribution "Pronunciation by Forvo" on any surface that plays it.
 */

import { Either, Schema } from "effect";

export const FORVO_BASE = "https://apifree.forvo.com";
/** Forvo uses ISO 639-1 codes; isiXhosa is `xh`. */
export const FORVO_LANGUAGE_XH = "xh";
export const FORVO_LICENCE = "forvo-api" as const;
export const FORVO_ATTRIBUTION = "Pronunciation by Forvo";

export interface ForvoRequest {
  readonly key: string;
  readonly word: string;
  readonly language?: string;
  /** Only pronunciations rated at least this high. */
  readonly minRate?: number;
  readonly limit?: number;
  readonly order?: "rate-desc" | "rate-asc" | "date-desc" | "date-asc";
}

/** Path-segment style URL; the word is encoded, the key sits in the path (never log the result raw). */
export function buildUrl(req: ForvoRequest): string {
  const parts = [
    "key",
    req.key,
    "format",
    "json",
    "action",
    "word-pronunciations",
    "word",
    encodeURIComponent(req.word.trim()),
    "language",
    req.language ?? FORVO_LANGUAGE_XH,
    "order",
    req.order ?? "rate-desc",
  ];
  if (req.minRate !== undefined) parts.push("rate", String(req.minRate));
  if (req.limit !== undefined) parts.push("limit", String(req.limit));
  return `${FORVO_BASE}/${parts.join("/")}/`;
}

/** The same URL with the key replaced, for logs and dry runs. */
export function redactKey(url: string): string {
  return url.replace(/\/key\/[^/]+\//, "/key/<redacted>/");
}

const Item = Schema.Struct({
  id: Schema.Union(Schema.Number, Schema.String),
  word: Schema.String,
  pathmp3: Schema.String,
  original: Schema.optional(Schema.String),
  pathogg: Schema.optional(Schema.String),
  username: Schema.optional(Schema.String),
  sex: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  langname: Schema.optional(Schema.String),
  rate: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  num_votes: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  num_positive_votes: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  hits: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  addtime: Schema.optional(Schema.String),
  standard_pronunciation: Schema.optional(
    Schema.Union(Schema.Number, Schema.String, Schema.Boolean),
  ),
});

const ResponseSchema = Schema.Struct({
  attributes: Schema.optional(
    Schema.Struct({ total: Schema.optional(Schema.Union(Schema.Number, Schema.String)) }),
  ),
  items: Schema.Array(Item),
});

export interface Pronunciation {
  readonly id: string;
  readonly word: string;
  readonly original: string;
  readonly mp3Url: string;
  readonly oggUrl: string | null;
  readonly username: string;
  readonly sex: string | null;
  readonly country: string | null;
  readonly rate: number;
  readonly votes: number;
  readonly positiveVotes: number;
  readonly standard: boolean;
}

const num = (v: number | string | undefined, fallback = 0): number => {
  if (v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Parses a Forvo JSON body. Returns an error string for anything that is not the documented envelope. */
export function parsePronunciations(body: unknown): Either.Either<Pronunciation[], string> {
  if (typeof body === "string") {
    // Forvo answers errors as a JSON array of strings, e.g. ["Limit/day reached."]
    return Either.left(body);
  }
  if (Array.isArray(body) && body.every((x) => typeof x === "string")) {
    return Either.left(`forvo error: ${(body as string[]).join("; ")}`);
  }
  const decoded = Schema.decodeUnknownEither(ResponseSchema)(body);
  if (Either.isLeft(decoded))
    return Either.left(`unexpected forvo response: ${String(decoded.left)}`);
  return Either.right(
    decoded.right.items.map((i) => ({
      id: String(i.id),
      word: i.word,
      original: i.original ?? i.word,
      mp3Url: i.pathmp3,
      oggUrl: i.pathogg ?? null,
      username: i.username ?? "unknown",
      sex: i.sex ?? null,
      country: i.country ?? null,
      rate: num(i.rate),
      votes: num(i.num_votes),
      positiveVotes: num(i.num_positive_votes),
      standard:
        i.standard_pronunciation === true ||
        i.standard_pronunciation === 1 ||
        i.standard_pronunciation === "1" ||
        i.standard_pronunciation === "true",
    })),
  );
}

export interface PickOptions {
  /** ISO country name as Forvo reports it; South African recordings first. */
  readonly preferCountry?: string;
  /** Skip anything rated below this (negative ratings mean listeners flagged it). */
  readonly minRate?: number;
}

/**
 * Chooses one pronunciation: never negatively rated, South Africa first,
 * then the standard flag, then rating, then votes. Returns null when nothing
 * qualifies, which for isiXhosa will be common (CONTENT.md: expect misses).
 */
export function pickBest(
  items: readonly Pronunciation[],
  opts: PickOptions = {},
): Pronunciation | null {
  const minRate = opts.minRate ?? 0;
  const country = (opts.preferCountry ?? "South Africa").toLowerCase();
  const ok = items.filter((p) => p.rate >= minRate);
  if (ok.length === 0) return null;
  const score = (p: Pronunciation) =>
    (p.country?.toLowerCase() === country ? 1000 : 0) +
    (p.standard ? 100 : 0) +
    p.rate * 10 +
    Math.min(p.votes, 9);
  return [...ok].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Provenance stored on the audio_assets row: enough to attribute and to audit. */
export function provenanceFor(p: Pronunciation, requestUrl: string): Record<string, unknown> {
  return {
    source: "forvo",
    forvoId: p.id,
    username: p.username,
    country: p.country,
    sex: p.sex,
    rate: p.rate,
    votes: p.votes,
    original: p.original,
    request: redactKey(requestUrl),
    attribution: FORVO_ATTRIBUTION,
    fetchedAt: new Date().toISOString(),
  };
}

/** Minimal fetch signature so tests and Workers can inject their own. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchResult {
  readonly url: string;
  readonly items: Pronunciation[];
}

/** One API call. `fetchImpl` is injectable so tests never touch the network. */
export async function fetchPronunciations(
  req: ForvoRequest,
  fetchImpl: FetchLike = fetch,
): Promise<Either.Either<FetchResult, string>> {
  const url = buildUrl(req);
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) return Either.left(`forvo ${res.status} for ${redactKey(url)}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return Either.left(`forvo returned non-JSON for ${redactKey(url)}`);
  }
  const parsed = parsePronunciations(body);
  return Either.isLeft(parsed)
    ? Either.left(parsed.left)
    : Either.right({ url, items: parsed.right });
}
