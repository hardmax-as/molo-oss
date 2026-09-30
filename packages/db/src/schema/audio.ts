import type { AudioManifest } from "@molo/core";
import { index, integer, jsonb, pgTable, real, text, uuid } from "drizzle-orm/pg-core";

import { audioTargetKindEnum, audioTierEnum } from "./enums.ts";
import { speakers } from "./reference.ts";
import { id, statusColumns, timestamps } from "./shared.ts";

/**
 * One row per processed asset. `target_id` is polymorphic over
 * `target_kind` (lexeme, sentence, click_drill exercise); referential
 * integrity for it is enforced in the repository, not the database.
 */
export const audioAssets = pgTable(
  "audio_assets",
  {
    id: id(),
    /** Content-hashed: audio/<sha256>.opus */
    r2Key: text("r2_key").notNull(),
    targetKind: audioTargetKindEnum("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    speakerId: uuid("speaker_id").references(() => speakers.id),
    tier: audioTierEnum("tier").notNull(),
    durationMs: integer("duration_ms").notNull(),
    lufs: real("lufs").notNull(),
    peakDbfs: real("peak_dbfs").notNull(),
    sha256: text("sha256").notNull(),
    codec: text("codec").notNull(),
    sampleRate: integer("sample_rate").notNull(),
    licence: text("licence").notNull(),
    /** forvo id, tts model+version, recording session, ... */
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    /** The xh-audio manifest, verbatim. */
    manifest: jsonb("manifest").$type<AudioManifest>(),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    index("audio_assets_target_idx").on(t.targetKind, t.targetId),
    index("audio_assets_sha256_idx").on(t.sha256),
    index("audio_assets_status_idx").on(t.status),
  ],
);
