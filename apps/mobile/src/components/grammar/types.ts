import type { AudioRef } from "@molo/core";

/**
 * Recordings a note's cells may point at, keyed by `audioAssetId`. The unit
 * payload already carries them in `audioAssets`, so a lesson hands that map
 * straight through. An id that is absent has no published recording, and the
 * cell says so.
 */
export type GrammarAudio = Readonly<Record<string, AudioRef>>;
