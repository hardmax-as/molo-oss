import {
  AUDIO_TARGET_KINDS,
  AUDIO_TIERS,
  CEFR_BANDS,
  CONSENT_SCOPES,
  EXERCISE_TYPES,
  GRAMMAR_CELL_ROLES,
  LINK_KINDS,
  REGISTERS,
  ROLES,
  SKILL_KINDS,
  SOURCE_LANGUAGES,
  STATUSES,
} from "@molo/core";
import { pgEnum } from "drizzle-orm/pg-core";

// Postgres enums are seeded from the value sets in @molo/core so the
// database and the domain can never disagree about a vocabulary.

export const statusEnum = pgEnum("content_status", STATUSES);
export const roleEnum = pgEnum("user_role", ROLES);
export const sourceLangEnum = pgEnum("source_lang", SOURCE_LANGUAGES);
export const cefrBandEnum = pgEnum("cefr_band", CEFR_BANDS);
export const registerEnum = pgEnum("register", REGISTERS);
export const linkKindEnum = pgEnum("link_kind", LINK_KINDS);
export const audioTierEnum = pgEnum("audio_tier", AUDIO_TIERS);
export const audioTargetKindEnum = pgEnum("audio_target_kind", AUDIO_TARGET_KINDS);
export const consentScopeEnum = pgEnum("consent_scope", CONSENT_SCOPES);
export const skillKindEnum = pgEnum("skill_kind", SKILL_KINDS);
export const exerciseTypeEnum = pgEnum("exercise_type", EXERCISE_TYPES);
export const grammarCellRoleEnum = pgEnum("grammar_cell_role", GRAMMAR_CELL_ROLES);
export const cardStateEnum = pgEnum("card_state", ["new", "learning", "review", "relearning"]);
export const entityKindEnum = pgEnum("entity_kind", [
  "lexeme",
  "gloss",
  "sentence",
  "sentence_gloss",
  "audio_asset",
  "exercise",
  "lesson",
  "skill",
  "unit",
  "speaker",
  "grammar_note",
  "grammar_note_body",
  // A bare click from CLICK_SOUNDS (packages/core): no table of its own, so
  // only a note in the studio refers to one (entity_id is the click's id).
  "click",
]);

export const LEAGUE_TIERS = ["bronze", "silver", "gold", "sapphire", "ruby"] as const;
export const leagueTierEnum = pgEnum("league_tier", LEAGUE_TIERS);
export const LEAGUE_OUTCOMES = ["promoted", "stayed", "demoted"] as const;
export const leagueOutcomeEnum = pgEnum("league_outcome", LEAGUE_OUTCOMES);

/** Coarse voice description for choosing among several recordings of the same word. */
export const AGE_GROUPS = ["child", "teen", "adult", "elder"] as const;
export const ageGroupEnum = pgEnum("age_group", AGE_GROUPS);
