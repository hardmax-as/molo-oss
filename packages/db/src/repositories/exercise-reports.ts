/**
 * "Report this exercise" — the learner's side of the review loop.
 *
 * A report is a note, never a status change: nothing in here can publish,
 * retire or edit content, and nothing in here is read back by a learner
 * surface. An editor sees the open ones in the review queue and acts on
 * them through the ordinary transitions, with the ordinary four eyes.
 *
 * A learner may only report an exercise a lesson could actually have shown
 * them, so the insert checks `exercises.status = 'published'` — the same
 * unconditional filter every other learner-facing query carries.
 */

import type { ExerciseReportReason, ExerciseType, SourceLang, Status } from "@molo/core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import { exercises } from "../schema/curriculum.ts";
import { exerciseReports } from "../schema/editorial.ts";
import { RepoError } from "./errors.ts";

const PUBLISHED = "published" as const;

export interface ExerciseReportRow {
  readonly id: string;
  readonly exerciseId: string;
  readonly exerciseType: ExerciseType;
  readonly exerciseStatus: Status;
  readonly reason: ExerciseReportReason;
  readonly note: string | null;
  readonly sourceLang: SourceLang;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

export interface FileReportInput {
  readonly exerciseId: string;
  readonly reason: ExerciseReportReason;
  readonly note?: string | null | undefined;
  readonly sourceLang: SourceLang;
}

export function exerciseReportsRepo(db: Db) {
  return {
    /**
     * Files one report against a published exercise. Repeating the same
     * reason while the first is still open is not a second report: the
     * learner is told it is already with an editor instead of the queue
     * filling with duplicates from one frustrated tap.
     */
    async file(
      userId: string,
      input: FileReportInput,
      now = new Date(),
    ): Promise<{ id: string | null; alreadyReported: boolean }> {
      const [exercise] = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(eq(exercises.id, input.exerciseId), eq(exercises.status, PUBLISHED)))
        .limit(1);
      if (!exercise) throw new RepoError("not_found", "no published exercise with that id");

      const [existing] = await db
        .select({ id: exerciseReports.id })
        .from(exerciseReports)
        .where(
          and(
            eq(exerciseReports.exerciseId, input.exerciseId),
            eq(exerciseReports.userId, userId),
            eq(exerciseReports.reason, input.reason),
            isNull(exerciseReports.resolvedAt),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, alreadyReported: true };

      const [row] = await db
        .insert(exerciseReports)
        .values({
          exerciseId: input.exerciseId,
          userId,
          reason: input.reason,
          note: input.note?.trim() ? input.note.trim() : null,
          sourceLang: input.sourceLang,
          createdAt: now,
        })
        .returning({ id: exerciseReports.id });
      return { id: row?.id ?? null, alreadyReported: false };
    },

    /** The editor's list: open reports first, newest first, with the exercise they name. */
    async list(opts: { open?: boolean; limit?: number } = {}): Promise<ExerciseReportRow[]> {
      const openOnly = opts.open ?? true;
      return db
        .select({
          id: exerciseReports.id,
          exerciseId: exerciseReports.exerciseId,
          exerciseType: exercises.type,
          exerciseStatus: exercises.status,
          reason: sql<ExerciseReportReason>`${exerciseReports.reason}`,
          note: exerciseReports.note,
          sourceLang: exerciseReports.sourceLang,
          createdAt: exerciseReports.createdAt,
          resolvedAt: exerciseReports.resolvedAt,
        })
        .from(exerciseReports)
        .innerJoin(exercises, eq(exercises.id, exerciseReports.exerciseId))
        .where(openOnly ? isNull(exerciseReports.resolvedAt) : undefined)
        .orderBy(desc(exerciseReports.createdAt))
        .limit(opts.limit ?? 50);
    },

    /** How many reports are still waiting for an editor. The number on the queue's tab. */
    async openCount(): Promise<number> {
      const [row] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(exerciseReports)
        .where(isNull(exerciseReports.resolvedAt))) as [{ n: number }];
      return row.n;
    },

    /**
     * An editor has looked at it. Resolving a report says nothing about the
     * exercise: fixing the content is a separate, reviewed edit.
     */
    async resolve(
      editorId: string,
      reportId: string,
      resolved: boolean,
      now = new Date(),
    ): Promise<void> {
      const updated = await db
        .update(exerciseReports)
        .set(
          resolved
            ? { resolvedAt: now, resolvedBy: editorId }
            : { resolvedAt: null, resolvedBy: null },
        )
        .where(eq(exerciseReports.id, reportId))
        .returning({ id: exerciseReports.id });
      if (updated.length === 0) throw new RepoError("not_found", "no report with that id");
    },
  };
}

export type ExerciseReportsRepo = ReturnType<typeof exerciseReportsRepo>;
