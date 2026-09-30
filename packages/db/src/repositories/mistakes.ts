/**
 * "Practise mistakes": the words a learner answered wrong in a lesson.
 *
 * Like every learner-facing read in this package, the open list filters on
 * `lexemes.status = 'published'` unconditionally — a word that has been
 * retired or pulled back into review must stop appearing, even though the
 * mistake row still exists. There is no parameter that widens it.
 *
 * The open list is also scoped to the learner's enrolled course through its
 * target language, for the same reason review cards are: a mistake is about
 * a word, and a word belongs to a language (ARCHITECTURE section 2.6).
 */

import type { ExerciseType } from "@molo/core";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import { learnerMistakes } from "../schema/learners.ts";
import { lexemes } from "../schema/lexicon.ts";

const PUBLISHED = "published" as const;

export interface MistakeRow {
  readonly lexemeId: string;
  readonly exerciseType: ExerciseType;
  readonly timesWrong: number;
  readonly lastWrongAt: Date;
}

export interface MistakeInput {
  readonly lexemeId: string;
  readonly exerciseType: ExerciseType;
}

export function mistakesRepo(db: Db) {
  return {
    /**
     * Records wrong answers. Only lexemes the caller has already restricted
     * to the lesson's own published words reach here; the insert is
     * idempotent per (learner, lexeme, type): a repeat bumps the counter and
     * reopens a cleared row.
     */
    async record(
      userId: string,
      entries: readonly MistakeInput[],
      now = new Date(),
    ): Promise<number> {
      if (entries.length === 0) return 0;
      const unique = new Map<string, MistakeInput>();
      for (const e of entries) unique.set(`${e.lexemeId}:${e.exerciseType}`, e);
      const rows = [...unique.values()];
      const published = await db
        .select({ id: lexemes.id })
        .from(lexemes)
        .where(
          and(
            inArray(
              lexemes.id,
              rows.map((r) => r.lexemeId),
            ),
            eq(lexemes.status, PUBLISHED),
          ),
        );
      const allowed = new Set(published.map((p) => p.id));
      const values = rows
        .filter((r) => allowed.has(r.lexemeId))
        .map((r) => ({
          userId,
          lexemeId: r.lexemeId,
          exerciseType: r.exerciseType,
          timesWrong: 1,
          lastWrongAt: now,
          clearedAt: null,
          updatedAt: now,
        }));
      if (values.length === 0) return 0;
      await db
        .insert(learnerMistakes)
        .values(values)
        .onConflictDoUpdate({
          target: [learnerMistakes.userId, learnerMistakes.lexemeId, learnerMistakes.exerciseType],
          set: {
            timesWrong: sql`${learnerMistakes.timesWrong} + 1`,
            lastWrongAt: now,
            clearedAt: null,
            updatedAt: now,
          },
        });
      return values.length;
    },

    /** Open mistakes on published words in one language, most recently missed first. */
    async open(userId: string, limit = 30, targetLang?: string): Promise<MistakeRow[]> {
      const rows = await db
        .select({
          lexemeId: learnerMistakes.lexemeId,
          exerciseType: learnerMistakes.exerciseType,
          timesWrong: learnerMistakes.timesWrong,
          lastWrongAt: learnerMistakes.lastWrongAt,
        })
        .from(learnerMistakes)
        .innerJoin(lexemes, eq(lexemes.id, learnerMistakes.lexemeId))
        .where(
          and(
            eq(learnerMistakes.userId, userId),
            isNull(learnerMistakes.clearedAt),
            eq(lexemes.status, PUBLISHED),
            ...(targetLang === undefined ? [] : [eq(lexemes.targetLang, targetLang)]),
          ),
        )
        .orderBy(desc(learnerMistakes.timesWrong), asc(learnerMistakes.lastWrongAt))
        .limit(limit);
      return rows;
    },

    /**
     * Just the words with an open mistake, unlimited, for the lesson's
     * "tricky" badge. Same published and language filter as `open`, and the
     * same consequence: a retired word stops being called tricky.
     */
    async openLexemeIds(userId: string, targetLang?: string): Promise<Set<string>> {
      const rows = await db
        .select({ lexemeId: learnerMistakes.lexemeId })
        .from(learnerMistakes)
        .innerJoin(lexemes, eq(lexemes.id, learnerMistakes.lexemeId))
        .where(
          and(
            eq(learnerMistakes.userId, userId),
            isNull(learnerMistakes.clearedAt),
            eq(lexemes.status, PUBLISHED),
            ...(targetLang === undefined ? [] : [eq(lexemes.targetLang, targetLang)]),
          ),
        );
      return new Set(rows.map((r) => r.lexemeId));
    },

    /** How many open mistakes on published words in this language the learner has. */
    async openCount(userId: string, targetLang?: string): Promise<number> {
      const [row] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(learnerMistakes)
        .innerJoin(lexemes, eq(lexemes.id, learnerMistakes.lexemeId))
        .where(
          and(
            eq(learnerMistakes.userId, userId),
            isNull(learnerMistakes.clearedAt),
            eq(lexemes.status, PUBLISHED),
            ...(targetLang === undefined ? [] : [eq(lexemes.targetLang, targetLang)]),
          ),
        )) as [{ n: number }];
      return row.n;
    },

    /**
     * One answer in a mistakes session. Right clears every open row for the
     * word (a learner who knows it does not need it filed under three
     * exercise types); wrong bumps the counter. Returns null when there was
     * nothing open to act on.
     */
    async resolve(
      userId: string,
      lexemeId: string,
      correct: boolean,
      opts: { exerciseType?: ExerciseType | undefined; now?: Date } = {},
    ): Promise<{ cleared: boolean; timesWrong: number } | null> {
      const now = opts.now ?? new Date();
      const where = and(
        eq(learnerMistakes.userId, userId),
        eq(learnerMistakes.lexemeId, lexemeId),
        isNull(learnerMistakes.clearedAt),
        ...(opts.exerciseType ? [eq(learnerMistakes.exerciseType, opts.exerciseType)] : []),
      );
      const updated = correct
        ? await db
            .update(learnerMistakes)
            .set({ clearedAt: now, updatedAt: now })
            .where(where)
            .returning({ timesWrong: learnerMistakes.timesWrong })
        : await db
            .update(learnerMistakes)
            .set({
              timesWrong: sql`${learnerMistakes.timesWrong} + 1`,
              lastWrongAt: now,
              updatedAt: now,
            })
            .where(where)
            .returning({ timesWrong: learnerMistakes.timesWrong });
      if (updated.length === 0) return null;
      return {
        cleared: correct,
        timesWrong: Math.max(...updated.map((r) => r.timesWrong)),
      };
    },
  };
}

export type MistakesRepo = ReturnType<typeof mistakesRepo>;
