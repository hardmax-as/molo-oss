import { S3Client } from "bun";

import { envVar } from "../context.ts";
import type { EnvName } from "../root.ts";
import { bucketNames } from "./s3-buckets.ts";

export { bucketNames } from "./s3-buckets.ts";

/**
 * Object storage from the Bun side: MinIO locally, R2 over its S3 endpoint
 * elsewhere. The Worker reaches the same buckets through its R2 bindings.
 */
export interface S3Config {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBucket: string;
  readonly privateBucket: string;
}

export const S3_VARS = {
  local: ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
  remote: ["R2_S3_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
} as const;

export function s3Config(env: EnvName): S3Config | null {
  const [e, k, s] = env === "local" ? S3_VARS.local : S3_VARS.remote;
  const endpoint = envVar(e);
  const accessKeyId = envVar(k);
  const secretAccessKey = envVar(s);
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey, ...bucketNames(env) };
}

export function s3Client(cfg: S3Config, bucket: string): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    bucket,
    // MinIO and R2 both want path-style with a custom endpoint.
    virtualHostedStyle: false,
  });
}
