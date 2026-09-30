import type { AudioRef } from "@molo/core";

/**
 * Recordings a note's cells may point at, keyed by `audioAssetId`. Both
 * sources of a note hand the same map: `/units/:slug` folds them into the
 * unit's own `audioAssets`, and `/grammar` returns its own. A cell whose id
 * is absent has no published recording, and the component says so.
 */
export type GrammarAudio = Readonly<Record<string, AudioRef>>;
