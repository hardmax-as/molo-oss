import { decodeQueueMessage } from "@molo/core";
import { Either } from "effect";

import type { Bindings } from "./env.ts";

/**
 * Worker-side queue consumers (ingest, forvo-backfill). The audio-process
 * queue has no worker consumer on purpose: xh-audio is a native binary, so
 * a Bun worker (`molo audio worker`) pulls that queue over the Queues REST
 * API, processes locally and posts results back through the editor API.
 *
 * Both handlers below decode the message with Effect Schema and acknowledge
 * unknown or malformed messages so they do not poison the queue; the
 * adapters themselves arrive with workstream E (the CLI owns ingest) and
 * Phase 3 (Forvo backfill).
 */
export async function queue(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
  for (const msg of batch.messages) {
    const decoded = decodeQueueMessage(msg.body);
    if (Either.isLeft(decoded)) {
      console.error(`[queue:${batch.queue}] malformed message ${msg.id}: ${String(decoded.left)}`);
      msg.ack();
      continue;
    }
    const m = decoded.right;
    switch (m.kind) {
      case "ingest.run":
        console.log(
          `[queue:${batch.queue}] ingest ${m.adapter} requested by ${m.requestedBy} (live=${m.live}); run \`molo content ingest ${m.adapter}\` on the operator side (${env.ENVIRONMENT})`,
        );
        msg.ack();
        break;
      case "forvo.backfill":
        // Forvo calls cost quota and the result goes through xh-audio (native), so the
        // operator-side CLI does the work: `molo audio forvo --lemma <lemma> --live`.
        console.log(
          `[queue:${batch.queue}] forvo backfill requested for ${m.lemma} (${m.lexemeId}) by ${m.requestedBy}; run \`molo audio forvo --lemma ${m.lemma} --live\` (${env.ENVIRONMENT})`,
        );
        msg.ack();
        break;
      case "audio.process":
        // Should not arrive here (pull consumer), but never poison the queue.
        console.warn(
          `[queue:${batch.queue}] audio.process delivered to the worker; retrying for the pull consumer`,
        );
        msg.retry();
        break;
    }
  }
}
