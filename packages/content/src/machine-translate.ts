/**
 * Machine translation as a second source of gloss *suggestions*
 * (docs/CONTENT.md section 6). Google's Cloud Translation "Basic" endpoint,
 * reached over REST with an API key: the project already exists for OAuth
 * and the free tier covers the whole lexicon many times over.
 *
 * What it is for: a cheap, independent opinion beside the LLM draft, on the
 * pair where it is strong — English to Norwegian. What it is not for: isiXhosa.
 * It never receives isiXhosa as a source to translate *from*, and it is never
 * asked to write it (the project rules non-negotiable 1), because a translation
 * engine is blind to concord and tone in exactly the way an LLM is. The
 * language type here admits `en` and `nb` only, so a new caller cannot pass
 * `xh` on either side without changing this file.
 *
 * Costs money: `--live` in the CLI, and the plan reports characters and the
 * estimated price before anything is sent.
 */

import { Either, Schema } from "effect";

import type { FetchLike } from "./assist.ts";

/** What a row's revision entry records when this module wrote it. */
export const TRANSLATE_PROVENANCE = "google-translate-v2" as const;

/** List price, USD per million characters, Cloud Translation Basic (2026-09). */
export const TRANSLATE_USD_PER_MILLION_CHARS = 20;

/** The endpoint's own limit on `q` segments per request. */
export const TRANSLATE_MAX_SEGMENTS = 128;
/** Well under the request-size limit; keeps a failed batch small. */
export const TRANSLATE_MAX_CHARS = 20_000;

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

/** Our source-language codes against the engine's. Norwegian is `no` there. */
export const TRANSLATE_LANG: Record<"en" | "nb", string> = { en: "en", nb: "no" };

export interface TranslateItem {
  readonly id: string;
  readonly text: string;
}

export interface TranslateBatch {
  readonly from: "en" | "nb";
  readonly to: "en" | "nb";
  readonly items: ReadonlyArray<TranslateItem>;
}

export interface TranslatePlan {
  readonly batches: ReadonlyArray<TranslateBatch>;
  readonly segments: number;
  readonly chars: number;
  readonly approxUsd: number;
}

/**
 * Splits the work into requests the endpoint accepts and prices it. Empty
 * texts are dropped here rather than sent: the engine would echo them and
 * the caller would write an empty draft.
 */
export function planTranslate(
  items: ReadonlyArray<TranslateItem>,
  from: "en" | "nb",
  to: "en" | "nb",
): TranslatePlan {
  if (from === to) throw new Error("nothing to translate: source and target are the same");
  const live = items.filter((i) => i.text.trim() !== "");
  const batches: TranslateBatch[] = [];
  let current: TranslateItem[] = [];
  let currentChars = 0;
  for (const item of live) {
    const len = item.text.length;
    if (
      current.length > 0 &&
      (current.length >= TRANSLATE_MAX_SEGMENTS || currentChars + len > TRANSLATE_MAX_CHARS)
    ) {
      batches.push({ from, to, items: current });
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += len;
  }
  if (current.length > 0) batches.push({ from, to, items: current });
  const chars = live.reduce((n, i) => n + i.text.length, 0);
  return {
    batches,
    segments: live.length,
    chars,
    approxUsd: (chars / 1_000_000) * TRANSLATE_USD_PER_MILLION_CHARS,
  };
}

const TranslateResponse = Schema.Struct({
  data: Schema.Struct({
    translations: Schema.Array(
      Schema.Struct({
        translatedText: Schema.String,
        detectedSourceLanguage: Schema.optional(Schema.String),
      }),
    ),
  }),
});
const decodeResponse = Schema.decodeUnknownEither(TranslateResponse);

export type TranslateResult =
  | { readonly ok: true; readonly translations: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly reason: string };

/** Sends one batch. Costs money; callers gate on the key being present. */
export async function runTranslate(
  apiKey: string,
  batch: TranslateBatch,
  fetchImpl: FetchLike = fetch,
): Promise<TranslateResult> {
  if (batch.items.length === 0) return { ok: true, translations: new Map() };
  const url = new URL(ENDPOINT);
  url.searchParams.set("key", apiKey);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: batch.items.map((i) => i.text),
        source: TRANSLATE_LANG[batch.from],
        target: TRANSLATE_LANG[batch.to],
        format: "text",
      }),
    });
  } catch (e) {
    return { ok: false, reason: `request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!response.ok) {
    // The body carries Google's error message; the key itself is in the URL
    // and must not be echoed, so only the status and the message are kept.
    const text = await response.text().catch(() => "");
    const message = text.match(/"message":\s*"([^"]*)"/)?.[1] ?? text.slice(0, 200);
    return { ok: false, reason: `HTTP ${response.status}: ${message}` };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, reason: "engine returned no JSON" };
  }
  const decoded = decodeResponse(parsed);
  if (Either.isLeft(decoded))
    return { ok: false, reason: `response does not match schema: ${String(decoded.left)}` };
  const out = decoded.right.data.translations;
  if (out.length !== batch.items.length)
    return {
      ok: false,
      reason: `engine returned ${out.length} translations for ${batch.items.length} segments`,
    };
  const translations = new Map<string, string>();
  batch.items.forEach((item, i) => {
    const text = out[i]?.translatedText.trim() ?? "";
    if (text !== "") translations.set(item.id, text);
  });
  return { ok: true, translations };
}

/**
 * Whether two glosses say the same thing, for the editor's comparison table.
 * Case, surrounding whitespace and a trailing full stop are not a
 * disagreement; anything else is left to the editor to judge.
 */
export function sameGloss(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[.!]+$/u, "")
      .replace(/\s+/g, " ");
  return norm(a) === norm(b);
}
