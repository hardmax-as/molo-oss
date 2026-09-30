import { Schema } from "effect";

import { Uuid } from "./content.ts";

/** Audio tiers (CONTENT.md section 5). Only tiers 1 and 2 may reach a learner. */
export const AUDIO_TIERS = ["1_native_studio", "2_native_forvo", "3_tts"] as const;
export type AudioTier = (typeof AUDIO_TIERS)[number];
export const AudioTierSchema = Schema.Literal(...AUDIO_TIERS);

export const PUBLISHABLE_TIERS: readonly AudioTier[] = ["1_native_studio", "2_native_forvo"];

export function isPublishableTier(tier: AudioTier): boolean {
  return PUBLISHABLE_TIERS.includes(tier);
}

// ---------------------------------------------------------------------------
// The boundary shape. It lives here rather than in `api.ts` so that anything
// carrying audio — a lexeme, a sentence, a paradigm cell — can name it without
// importing the whole API surface.
// ---------------------------------------------------------------------------

export const AgeGroupSchema = Schema.Literal("child", "teen", "adult", "elder");
export type AgeGroup = typeof AgeGroupSchema.Type;

/** Who is speaking, so a learner can choose among several recordings of the same word. */
export const SpeakerRef = Schema.Struct({
  id: Uuid,
  displayName: Schema.String,
  gender: Schema.NullOr(Schema.String),
  ageGroup: Schema.NullOr(AgeGroupSchema),
});
export type SpeakerRef = typeof SpeakerRef.Type;

export const AudioRef = Schema.Struct({
  id: Uuid,
  /** Time-limited URL served by the API; never a raw bucket key. */
  url: Schema.String,
  tier: AudioTierSchema,
  durationMs: Schema.Int,
  /** Set for tier-2 assets: the attribution text the surface must show. */
  attribution: Schema.NullOr(Schema.String),
  speaker: Schema.NullOr(SpeakerRef),
});
export type AudioRef = typeof AudioRef.Type;

/** `click` is a bare click from `CLICK_SOUNDS`, recorded on its own in the studio. */
export const AUDIO_TARGET_KINDS = ["lexeme", "sentence", "click_drill", "click"] as const;
export type AudioTargetKind = (typeof AUDIO_TARGET_KINDS)[number];

/** The `xh-audio` manifest, frozen here so Rust and TypeScript agree (ARCHITECTURE section 5). */
export const AudioManifest = Schema.Struct({
  schema_version: Schema.Literal(1),
  sha256: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/)),
  duration_ms: Schema.Int.pipe(Schema.positive()),
  lufs_integrated: Schema.Number,
  true_peak_dbtp: Schema.Number,
  sample_rate: Schema.Literal(48_000),
  channels: Schema.Literal(1),
  codec: Schema.Literal("opus"),
  bitrate_kbps: Schema.Int,
  master_codec: Schema.Literal("flac"),
  master_sha256: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/)),
  trimmed_leading_ms: Schema.Int,
  trimmed_trailing_ms: Schema.Int,
  source_filename: Schema.String,
  processed_at: Schema.String,
  tool: Schema.Struct({ name: Schema.Literal("xh-audio"), version: Schema.String }),
});
export type AudioManifest = typeof AudioManifest.Type;

/** Targets for processing (ARCHITECTURE section 5). */
export const AUDIO_TARGETS = {
  lufsIntegrated: -16,
  truePeakDbtpMax: -1,
  sampleRate: 48_000,
  opusBitrateKbps: 48,
  trimThresholdDbfs: -50,
  trimPadMs: 80,
} as const;
