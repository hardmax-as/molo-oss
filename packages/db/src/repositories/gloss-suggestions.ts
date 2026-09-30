import type { Actor, GlossSuggestion, NewGlossSuggestion } from "@molo/core";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { contentRevisions } from "../schema/editorial.ts";
import { glosses, glossSuggestions } from "../schema/lexicon.ts";
import { assertEditorial } from "./roles.ts";

/** The only suggestion reader/writer. Learner repositories never import this module. */
export function glossSuggestionsRepo(db: Db, actor: Actor) {
  assertEditorial(actor);
  return {
    async forLexeme(lexemeId: string): Promise<GlossSuggestion[]> {
      assertEditorial(actor);
      const rows = await db
        .select()
        .from(glossSuggestions)
        .where(eq(glossSuggestions.lexemeId, lexemeId))
        .orderBy(asc(glossSuggestions.sourceLang), asc(glossSuggestions.provenance));
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },

    /** Store the opinion, optionally creating a canonical AI draft only if none exists. */
    async record(input: NewGlossSuggestion, createDraft = false) {
      assertEditorial(actor);
      const gloss = input.gloss.trim();
      const provenance = input.provenance.trim();
      if (!gloss || !provenance) throw new Error("gloss and provenance are required");
      return db.transaction(async (tx) => {
        const [suggestion] = await tx
          .insert(glossSuggestions)
          .values({
            lexemeId: input.lexemeId,
            sourceLang: input.sourceLang,
            provenance,
            gloss,
          })
          .onConflictDoUpdate({
            target: [
              glossSuggestions.lexemeId,
              glossSuggestions.sourceLang,
              glossSuggestions.provenance,
            ],
            set: { gloss },
          })
          .returning({ id: glossSuggestions.id });
        if (!suggestion) throw new Error("suggestion insert failed");
        if (!createDraft) return { id: suggestion.id, draftCreated: false };
        // Concurrent editor work wins: an existing canonical gloss is never overwritten.
        const [draft] = await tx
          .insert(glosses)
          .values({
            lexemeId: input.lexemeId,
            sourceLang: input.sourceLang,
            gloss,
            status: "ai_draft",
            createdBy: actor.id,
          })
          .onConflictDoNothing({ target: [glosses.lexemeId, glosses.sourceLang] })
          .returning({ id: glosses.id });
        if (draft)
          await tx.insert(contentRevisions).values({
            entityKind: "gloss",
            entityId: draft.id,
            actorId: actor.id,
            diff: {
              upsert: {
                sourceLang: input.sourceLang,
                gloss,
                usageNote: null,
                contrastiveNote: null,
                origin: "llm",
                provenance,
              },
            },
          });
        return { id: suggestion.id, draftCreated: !!draft };
      });
    },
  };
}
