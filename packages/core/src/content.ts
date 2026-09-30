/**
 * Content vocabulary shared by the database, the API and the clients.
 * Tables are defined in `packages/db`; these are the value sets and the
 * boundary schemas.
 */

import { Schema } from "effect";

export const SOURCE_LANGUAGES = ["en", "nb"] as const;
export type SourceLang = (typeof SOURCE_LANGUAGES)[number];
export const SourceLangSchema = Schema.Literal(...SOURCE_LANGUAGES);
export const TARGET_LANGUAGE = "xh" as const;

export const CEFR_BANDS = ["A1", "A2", "B1"] as const;
export type CefrBand = (typeof CEFR_BANDS)[number];
export const CefrBandSchema = Schema.Literal(...CEFR_BANDS);

export const REGISTERS = ["standard", "urban", "formal", "rural"] as const;
export type Register = (typeof REGISTERS)[number];
export const RegisterSchema = Schema.Literal(...REGISTERS);

/** Parts of speech as normalised by the ingest (Phase 0). Open-ended by design. */
export const KNOWN_POS = [
  "noun",
  "verb",
  "adj",
  "adv",
  "relative",
  "prep",
  "conj",
  "interj",
  "ideophone",
  "pronoun",
  "numeral",
] as const;
export type Pos = (typeof KNOWN_POS)[number];
export const PosSchema = Schema.Literal(...KNOWN_POS);

/** Noun class labels: 1 to 15 plus 1a and 2a (ARCHITECTURE section 2.2). */
export const NOUN_CLASS_LABELS = [
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
] as const;
export type NounClassLabel = (typeof NOUN_CLASS_LABELS)[number];
export const NounClassLabelSchema = Schema.Literal(...NOUN_CLASS_LABELS);

export const LINK_KINDS = ["synonym", "antonym", "plural_of", "derived_from", "see_also"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LinkKindSchema = Schema.Literal(...LINK_KINDS);

export const CONTENT_SOURCES = [
  "isixhosa.click",
  "vukuzenzele",
  "forvo",
  "editor",
  "tutor",
  "llm",
] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const LICENCES = [
  "CC-BY-SA-4.0",
  "CC-BY-4.0",
  "MIT",
  "forvo-api",
  "proprietary-molo",
] as const;
export type Licence = (typeof LICENCES)[number];
export const LicenceSchema = Schema.Literal(...LICENCES);

export const CONSENT_SCOPES = ["internal", "published", "commercial"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const SKILL_KINDS = ["vocab", "grammar", "pronunciation", "culture"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export const SkillKindSchema = Schema.Literal(...SKILL_KINDS);

/** Clicks the drills distinguish (ARCHITECTURE section 3). */
export const CLICKS = [
  "c",
  "x",
  "q",
  "ch",
  "xh",
  "qh",
  "nc",
  "nx",
  "nq",
  "gc",
  "gx",
  "gq",
  "ngc",
  "ngx",
  "ngq",
] as const;
export type Click = (typeof CLICKS)[number];
export const ClickSchema = Schema.Literal(...CLICKS);

export const Uuid = Schema.UUID;
export const Slug = Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
export const I18nKey = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+$/));
