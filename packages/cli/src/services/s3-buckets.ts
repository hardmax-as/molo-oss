import { envVar } from "../context.ts";
import type { EnvName } from "../root.ts";

/**
 * Bucket names per target. Local is MinIO (`S3_BUCKET_*`, defaulting to the
 * compose buckets). Remote reads its own `R2_BUCKET_*` pair so the root
 * `.env` can hold both without one breaking the other, and defaults to the
 * names infra/alchemy.run.ts gives the stage: `molo-<kind>-<stage>`. A
 * per-PR preview stage (`preview-pr-N`) sets the R2 pair explicitly.
 */
export function bucketNames(env: EnvName): { publicBucket: string; privateBucket: string } {
  if (env === "local")
    return {
      publicBucket: envVar("S3_BUCKET_PUBLIC") ?? "molo-public",
      privateBucket: envVar("S3_BUCKET_PRIVATE") ?? "molo-private",
    };
  return {
    publicBucket: envVar("R2_BUCKET_PUBLIC") ?? `molo-public-${env}`,
    privateBucket: envVar("R2_BUCKET_PRIVATE") ?? `molo-private-${env}`,
  };
}
