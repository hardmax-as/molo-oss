/**
 * Grammar notes, read the way a learner reads them (docs/GRAMMAR.md).
 *
 * Every query in this file appends `status = 'published'` to the note **and**
 * to its body, unconditionally, exactly as `learner.ts` does for everything
 * else. There is no parameter that widens it. A note whose English body is
 * still `ai_draft` is invisible even when the note row itself is published,
 * because the body is the sentence that makes the claim.
 *
 * Cells carry no status of their own — the note governs them — but a cell
 * pointing at an unpublished lexeme or recording is dropped here as well, so
 * a half-approved note degrades into a smaller table rather than leaking a
 * word the learner may not see.
 */

import type { GrammarCellRole, SourceLang } from "@molo/core";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";
import { lessons, skills, units } from "../schema/curriculum.ts";
import { grammarNoteBodies, grammarNoteCells, grammarNotes } from "../schema/grammar.ts";
import { xpEvents } from "../schema/learners.ts";
import { lexemes } from "../schema/lexicon.ts";

const PUBLISHED = "published" as const;

export interface PublishedGrammarCell {
  readonly id: string;
  readonly role: GrammarCellRole;
  readonly order: number;
  readonly rowLabel: string;
  readonly colKey: string;
  readonly surfaceForm: string;
  readonly morphemes: readonly string[];
  readonly lexemeId: string | null;
  readonly audioAssetId: string | null;
}

export interface PublishedGrammarNote {
  readonly id: string;
  readonly slug: string;
  readonly skillId: string;
  readonly order: number;
  readonly rowHeaderKey: string;
  readonly sourceLang: SourceLang;
  readonly title: string;
  readonly rule: string;
  readonly correction: string;
  readonly cells: readonly PublishedGrammarCell[];
}

export interface GrammarReferenceRow extends PublishedGrammarNote {
  readonly unitSlug: string;
  readonly unitTitleKey: string;
  readonly skillTitleKey: string;
  readonly unlocked: boolean;
}

export function grammarRepo(db: Db) {
  /**
   * The cells of the given notes, minus any that point at content the
   * learner may not see yet. `lexeme_id` and `audio_asset_id` are checked
   * against `published` rather than trusted, because a note can be approved
   * before every recording it wants exists.
   */
  async function cellsFor(
    noteIds: readonly string[],
  ): Promise<Map<string, PublishedGrammarCell[]>> {
    const out = new Map<string, PublishedGrammarCell[]>();
    if (noteIds.length === 0) return out;
    const rows = await db
      .select({
        id: grammarNoteCells.id,
        noteId: grammarNoteCells.grammarNoteId,
        role: grammarNoteCells.role,
        order: grammarNoteCells.order,
        rowLabel: grammarNoteCells.rowLabel,
        colKey: grammarNoteCells.colKey,
        surfaceForm: grammarNoteCells.surfaceForm,
        morphemes: grammarNoteCells.morphemes,
        lexemeId: grammarNoteCells.lexemeId,
        audioAssetId: grammarNoteCells.audioAssetId,
      })
      .from(grammarNoteCells)
      .where(inArray(grammarNoteCells.grammarNoteId, [...noteIds]))
      .orderBy(asc(grammarNoteCells.order));

    const lexemeIds = [...new Set(rows.flatMap((r) => (r.lexemeId ? [r.lexemeId] : [])))];
    const audioIds = [...new Set(rows.flatMap((r) => (r.audioAssetId ? [r.audioAssetId] : [])))];
    const publishedLexemes =
      lexemeIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              await db
                .select({ id: lexemes.id })
                .from(lexemes)
                .where(and(inArray(lexemes.id, lexemeIds), eq(lexemes.status, PUBLISHED)))
            ).map((r) => r.id),
          );
    const publishedAudio =
      audioIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              await db
                .select({ id: audioAssets.id })
                .from(audioAssets)
                .where(and(inArray(audioAssets.id, audioIds), eq(audioAssets.status, PUBLISHED)))
            ).map((r) => r.id),
          );

    for (const r of rows) {
      // A cell whose word is not published is not shown at all: the word
      // itself is the claim. A cell whose *recording* is not published keeps
      // its form and loses its audio, and the component says so.
      if (r.lexemeId && !publishedLexemes.has(r.lexemeId)) continue;
      const list = out.get(r.noteId) ?? [];
      list.push({
        id: r.id,
        role: r.role,
        order: r.order,
        rowLabel: r.rowLabel,
        colKey: r.colKey,
        surfaceForm: r.surfaceForm,
        morphemes: r.morphemes,
        lexemeId: r.lexemeId,
        audioAssetId: r.audioAssetId && publishedAudio.has(r.audioAssetId) ? r.audioAssetId : null,
      });
      out.set(r.noteId, list);
    }
    return out;
  }

  /** Skills with at least one finished lesson, from the append-only `xp_events`. */
  async function startedSkillIds(userId: string): Promise<Set<string>> {
    const rows = await db
      .selectDistinct({ skillId: lessons.skillId })
      .from(xpEvents)
      .innerJoin(lessons, eq(lessons.id, xpEvents.refId))
      .where(and(eq(xpEvents.userId, userId), eq(xpEvents.refKind, "lesson")));
    return new Set(rows.map((r) => r.skillId));
  }

  return {
    /**
     * Every published note these skills teach, in one language, in order. A
     * skill may teach more than one rule; the client decides which of them
     * stops the learner (`pickGrammarNote` in `@molo/core`).
     */
    async notesForSkills(
      skillIds: readonly string[],
      sourceLang: SourceLang,
    ): Promise<Map<string, PublishedGrammarNote[]>> {
      const out = new Map<string, PublishedGrammarNote[]>();
      if (skillIds.length === 0) return out;
      const rows = await db
        .select({
          id: grammarNotes.id,
          slug: grammarNotes.slug,
          skillId: grammarNotes.skillId,
          order: grammarNotes.order,
          rowHeaderKey: grammarNotes.rowHeaderKey,
          title: grammarNoteBodies.title,
          rule: grammarNoteBodies.rule,
          correction: grammarNoteBodies.correction,
        })
        .from(grammarNotes)
        .innerJoin(
          grammarNoteBodies,
          and(
            eq(grammarNoteBodies.grammarNoteId, grammarNotes.id),
            eq(grammarNoteBodies.sourceLang, sourceLang),
            eq(grammarNoteBodies.status, PUBLISHED),
          ),
        )
        .where(
          and(inArray(grammarNotes.skillId, [...skillIds]), eq(grammarNotes.status, PUBLISHED)),
        )
        .orderBy(asc(grammarNotes.order));
      const cells = await cellsFor(rows.map((r) => r.id));
      for (const r of rows) {
        const list = out.get(r.skillId) ?? [];
        list.push({
          id: r.id,
          slug: r.slug,
          skillId: r.skillId,
          order: r.order,
          rowHeaderKey: r.rowHeaderKey,
          sourceLang,
          title: r.title,
          rule: r.rule,
          correction: r.correction ?? "",
          cells: cells.get(r.id) ?? [],
        });
        out.set(r.skillId, list);
      }
      return out;
    },

    /**
     * Every published note of one course, for the reference page. `unlocked`
     * is this learner's own state: they have finished at least one lesson in
     * the note's skill, which is the same `xp_events` record the path reads.
     * A guest has no rows there, so everything comes back locked and the
     * client overlays what the device remembers.
     */
    async referenceFor(
      courseId: string,
      sourceLang: SourceLang,
      userId: string | null,
    ): Promise<GrammarReferenceRow[]> {
      const rows = await db
        .select({
          id: grammarNotes.id,
          slug: grammarNotes.slug,
          skillId: grammarNotes.skillId,
          order: grammarNotes.order,
          rowHeaderKey: grammarNotes.rowHeaderKey,
          title: grammarNoteBodies.title,
          rule: grammarNoteBodies.rule,
          correction: grammarNoteBodies.correction,
          unitSlug: units.slug,
          unitTitleKey: units.titleKey,
          unitOrder: units.order,
          skillTitleKey: skills.titleKey,
          skillOrder: skills.order,
        })
        .from(grammarNotes)
        .innerJoin(
          grammarNoteBodies,
          and(
            eq(grammarNoteBodies.grammarNoteId, grammarNotes.id),
            eq(grammarNoteBodies.sourceLang, sourceLang),
            eq(grammarNoteBodies.status, PUBLISHED),
          ),
        )
        .innerJoin(skills, and(eq(skills.id, grammarNotes.skillId), eq(skills.status, PUBLISHED)))
        .innerJoin(
          units,
          and(
            eq(units.id, skills.unitId),
            eq(units.status, PUBLISHED),
            eq(units.courseId, courseId),
          ),
        )
        .where(eq(grammarNotes.status, PUBLISHED))
        .orderBy(asc(units.order), asc(skills.order), asc(grammarNotes.order));

      const cells = await cellsFor(rows.map((r) => r.id));
      const startedSkills = userId ? await startedSkillIds(userId) : new Set<string>();
      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        skillId: r.skillId,
        order: r.order,
        rowHeaderKey: r.rowHeaderKey,
        sourceLang,
        title: r.title,
        rule: r.rule,
        correction: r.correction ?? "",
        cells: cells.get(r.id) ?? [],
        unitSlug: r.unitSlug,
        unitTitleKey: r.unitTitleKey,
        skillTitleKey: r.skillTitleKey,
        unlocked: startedSkills.has(r.skillId),
      }));
    },
  };
}

export type GrammarRepo = ReturnType<typeof grammarRepo>;
