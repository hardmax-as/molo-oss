/**
 * LLM assist for editors (ARCHITECTURE section 7): drafts glosses, usage
 * notes and contrastive notes for a lexeme. Output is always `ai_draft`,
 * never touches an existing human gloss, and the model is told in no
 * uncertain terms not to write isiXhosa (the project rules non-negotiable 1):
 * it only ever produces English and Norwegian about a word the lexicon
 * already has.
 *
 * Calling a paid API: the endpoint is inert unless ANTHROPIC_API_KEY is
 * bound, and `dryRun` returns the exact request without sending it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Either, Schema } from "effect";

export const ASSIST_MODEL = "claude-opus-5";

export interface AssistInput {
  readonly lemma: string;
  readonly pos: string;
  readonly nounClass: string | null;
  readonly infinitive: string | null;
  readonly register: string;
  /** The upstream English gloss(es), human-written source data. */
  readonly sourceGlossEn: string | null;
  readonly sourceNote: string | null;
  /** Example sentences from the source, with their English. Shown as context only. */
  readonly examples: ReadonlyArray<{ readonly xh: string; readonly en: string }>;
  /** Languages that already have a human gloss; suggestions for them are returned but never saved. */
  readonly existing: ReadonlyArray<"en" | "nb">;
}

const LangDraft = Schema.Struct({
  gloss: Schema.String,
  usage_note: Schema.String,
  contrastive_note: Schema.String,
});

export const AssistDraft = Schema.Struct({
  en: LangDraft,
  nb: LangDraft,
  confidence: Schema.Literal("high", "medium", "low"),
  caveat: Schema.String,
});
export type AssistDraft = typeof AssistDraft.Type;

const decodeDraft = Schema.decodeUnknownEither(AssistDraft);

/** JSON Schema for structured output; mirrors AssistDraft exactly. */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["en", "nb", "confidence", "caveat"],
  properties: {
    en: langSchema(),
    nb: langSchema(),
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    caveat: { type: "string" },
  },
} as const;

function langSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["gloss", "usage_note", "contrastive_note"],
    properties: {
      gloss: { type: "string" },
      usage_note: { type: "string" },
      contrastive_note: { type: "string" },
    },
  } as const;
}

export const SYSTEM_PROMPT = `You draft dictionary glosses for Molo, an isiXhosa course for English and Norwegian (bokmål) speakers. A human isiXhosa editor reviews everything you write; your output is saved as "ai_draft" and can never reach a learner unreviewed.

Rules you must follow:
- Never write any isiXhosa. Do not propose spellings, plurals, concords, tone, pronunciation, example sentences or corrections to the lemma. You are given an isiXhosa word and its existing English meaning; your job is only the English and Norwegian side.
- gloss: a short learner-facing gloss (one to four words), the most common everyday sense first. Keep the register of the source gloss. For a plural noun, gloss it as a plural. For a verb stem, gloss the infinitive ("to eat").
- usage_note: one short sentence a beginner needs, or an empty string. Mention the isiXhosa word only by copying it verbatim from the input.
- contrastive_note: for "en", a note on what an English speaker tends to get wrong with this kind of word (stress vs tone, plural marking by prefix, etc.), or empty. For "nb", the same for a Norwegian speaker: lean on tonelag (bønder/bønner) for tone, and on Norwegian noun gender and definite suffixes for noun-class contrasts, or empty.
- Norwegian is bokmål, natural and modern, the way a Norwegian textbook would gloss it.
- confidence: how sure you are that the gloss is the everyday meaning, given only the source data. caveat: anything the editor should double-check, or empty.`;

export function buildUserPrompt(input: AssistInput): string {
  const lines = [
    `Lemma (isiXhosa, copy verbatim if you refer to it): ${input.lemma}`,
    `Part of speech: ${input.pos}${input.nounClass ? ` (noun class ${input.nounClass})` : ""}`,
    input.infinitive ? `Infinitive as written in the source: ${input.infinitive}` : null,
    `Register: ${input.register}`,
    `Source English gloss (human-written, isixhosa.click): ${input.sourceGlossEn ?? "(none)"}`,
    input.sourceNote ? `Source note: ${input.sourceNote}` : null,
    input.examples.length > 0
      ? `Example sentences from the source (context only; do not modify or reuse):\n${input.examples
          .slice(0, 4)
          .map((e) => `- ${e.xh}\n  ${e.en}`)
          .join("\n")}`
      : null,
    input.existing.length > 0
      ? `A human gloss already exists for: ${input.existing.join(", ")}. Still draft it for comparison; it will not overwrite theirs.`
      : null,
    `Return JSON matching the schema.`,
  ];
  return lines.filter((l): l is string => !!l).join("\n");
}

export interface AssistRequest {
  readonly model: string;
  readonly system: string;
  readonly user: string;
}

export function planAssist(input: AssistInput): AssistRequest {
  return { model: ASSIST_MODEL, system: SYSTEM_PROMPT, user: buildUserPrompt(input) };
}

export type AssistResult =
  | {
      readonly ok: true;
      readonly draft: AssistDraft;
      readonly usage: { input: number; output: number };
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Just the call signature. The global `fetch` differs between the runtimes
 * this module is compiled for — Bun's carries a `preconnect` method that the
 * Workers one does not — and the SDK only ever calls it, so a test double
 * should not have to satisfy either shape.
 */
export type FetchLike = (url: string | Request | URL, init?: RequestInit) => Promise<Response>;

/** Sends the request. Costs money; callers gate on the key being present. */
export async function runAssist(
  apiKey: string,
  req: AssistRequest,
  fetchImpl?: FetchLike,
): Promise<AssistResult> {
  const client = new Anthropic({
    apiKey,
    ...(fetchImpl ? { fetch: fetchImpl as typeof fetch } : {}),
  });
  const response = await client.messages.create({
    model: req.model,
    max_tokens: 4096,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: req.user }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  });
  if (response.stop_reason === "refusal") {
    return { ok: false, reason: `model refused (${response.stop_details?.category ?? "unknown"})` };
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "model returned no JSON" };
  }
  const decoded = decodeDraft(parsed);
  if (Either.isLeft(decoded))
    return { ok: false, reason: `draft does not match schema: ${String(decoded.left)}` };
  return {
    ok: true,
    draft: decoded.right,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
