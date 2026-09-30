import type { SourceLang } from "./content.ts";

/** Editor-only machine opinion, separate from the one canonical gloss per language. */
export interface GlossSuggestion {
  readonly id: string;
  readonly lexemeId: string;
  readonly sourceLang: SourceLang;
  readonly provenance: string;
  readonly gloss: string;
  readonly createdAt: string;
}

export type NewGlossSuggestion = Pick<
  GlossSuggestion,
  "lexemeId" | "sourceLang" | "provenance" | "gloss"
>;
