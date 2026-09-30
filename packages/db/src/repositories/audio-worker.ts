import { sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";

/**
 * The asset an earlier run already made from this studio upload, if any.
 * Cloudflare Queues deliver at least once: a worker that inserted the row but
 * died before its ack sees the same message again, and must not add a second
 * row for the same take. The upload key is unique per upload (a fresh job id).
 */
export async function audioAssetForUpload(db: Db, uploadKey: string): Promise<string | null> {
  const [row] = await db
    .select({ id: audioAssets.id })
    .from(audioAssets)
    .where(sql`${audioAssets.provenance} ->> 'uploadKey' = ${uploadKey}`)
    .limit(1);
  return row?.id ?? null;
}
