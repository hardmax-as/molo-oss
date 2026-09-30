/**
 * `review_cards` and `review_log` belong to this package (ARCHITECTURE
 * section 4): nothing else writes them. A session is due cards plus a
 * capped number of new cards; nothing in gamification may reorder or drop
 * due cards.
 *
 * A session is scoped to the learner's enrolled course through its target
 * language: a card is about a word, a word belongs to a language, and a
 * course is a curriculum over a language (ARCHITECTURE section 2.6). Two
 * courses over the same language therefore share the learner's schedule for
 * a word, which is what a learner would expect; a course in another
 * language never appears in the session.
 */

import { schema, type Db } from "@molo/db";
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";

import type { Fsrs, FsrsCard, NextState, Rating } from "./fsrs.ts";

const DAY_MS = 86_400_000;

export interface CardRow {
  readonly id: string;
  readonly userId: string;
  readonly lexemeId: string | null;
  readonly sentenceId: string | null;
  readonly stability: number;
  readonly difficulty: number;
  readonly dueAt: Date;
  readonly lastReviewAt: Date | null;
  readonly reps: number;
  readonly lapses: number;
  readonly state: FsrsCard["state"];
}

export function rowToFsrs(row: CardRow): FsrsCard {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    due_at_ms: row.dueAt.getTime(),
    last_review_at_ms: row.lastReviewAt ? row.lastReviewAt.getTime() : null,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
  };
}

const cardColumns = {
  id: schema.reviewCards.id,
  userId: schema.reviewCards.userId,
  lexemeId: schema.reviewCards.lexemeId,
  sentenceId: schema.reviewCards.sentenceId,
  stability: schema.reviewCards.stability,
  difficulty: schema.reviewCards.difficulty,
  dueAt: schema.reviewCards.dueAt,
  lastReviewAt: schema.reviewCards.lastReviewAt,
  reps: schema.reviewCards.reps,
  lapses: schema.reviewCards.lapses,
  state: schema.reviewCards.state,
};

/**
 * Creates `new` cards for lexemes the user has none for. Only published
 * lexemes get cards: a learner must never be scheduled to review a draft.
 */
export async function ensureCards(
  db: Db,
  userId: string,
  lexemeIds: readonly string[],
  now = new Date(),
): Promise<number> {
  if (lexemeIds.length === 0) return 0;
  const published = await db
    .select({ id: schema.lexemes.id })
    .from(schema.lexemes)
    .where(and(inArray(schema.lexemes.id, [...lexemeIds]), eq(schema.lexemes.status, "published")));
  if (published.length === 0) return 0;
  const existing = await db
    .select({ lexemeId: schema.reviewCards.lexemeId })
    .from(schema.reviewCards)
    .where(
      and(
        eq(schema.reviewCards.userId, userId),
        inArray(
          schema.reviewCards.lexemeId,
          published.map((p) => p.id),
        ),
      ),
    );
  const have = new Set(existing.map((e) => e.lexemeId));
  const missing = published.filter((p) => !have.has(p.id));
  if (missing.length === 0) return 0;
  await db
    .insert(schema.reviewCards)
    .values(missing.map((p) => ({ userId, lexemeId: p.id, dueAt: now, state: "new" as const })))
    .onConflictDoNothing();
  return missing.length;
}

/**
 * Restricts cards to words in one language. A correlated EXISTS rather than
 * a join, so the shape of the outer query (and its `count(*)`) is unchanged
 * and cards whose target is not a lexeme are not silently dropped.
 */
function inLanguage(targetLang: string | undefined, db: Db) {
  if (targetLang === undefined) return [];
  return [
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.lexemes)
        .where(
          and(
            eq(schema.lexemes.id, schema.reviewCards.lexemeId),
            eq(schema.lexemes.targetLang, targetLang),
          ),
        ),
    ),
  ];
}

export interface Session {
  readonly due: CardRow[];
  readonly fresh: CardRow[];
  readonly dueTotal: number;
}

/** Due cards (learning/review/relearning past due) first, then up to `newLimit` new cards. */
export async function buildSession(
  db: Db,
  userId: string,
  opts: { now?: Date; newLimit?: number; dueLimit?: number; targetLang?: string } = {},
): Promise<Session> {
  const now = opts.now ?? new Date();
  const dueLimit = opts.dueLimit ?? 50;
  const newLimit = opts.newLimit ?? 10;
  const course = inLanguage(opts.targetLang, db);
  const isDue = and(
    eq(schema.reviewCards.userId, userId),
    ne(schema.reviewCards.state, "new"),
    lte(schema.reviewCards.dueAt, now),
    ...course,
  );
  const due = await db
    .select(cardColumns)
    .from(schema.reviewCards)
    .where(isDue)
    .orderBy(asc(schema.reviewCards.dueAt))
    .limit(dueLimit);
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reviewCards)
    .where(isDue)) as [{ n: number }];
  const fresh =
    newLimit > 0
      ? await db
          .select(cardColumns)
          .from(schema.reviewCards)
          .where(
            and(
              eq(schema.reviewCards.userId, userId),
              eq(schema.reviewCards.state, "new"),
              isNull(schema.reviewCards.lastReviewAt),
              ...course,
            ),
          )
          .orderBy(asc(schema.reviewCards.createdAt))
          .limit(newLimit)
      : [];
  return { due, fresh, dueTotal: n };
}

/**
 * Words this learner has met: one review card exists per published lexeme a
 * lesson has taught them (`ensureCards`), so the card count *is* the
 * words-learned figure the celebration milestones count against. Sentence
 * cards are not words and are excluded, and the count is scoped to the
 * enrolled course's language like every other read in this file.
 */
export async function learnedWordCount(
  db: Db,
  userId: string,
  opts: { targetLang?: string } = {},
): Promise<number> {
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reviewCards)
    .where(
      and(
        eq(schema.reviewCards.userId, userId),
        isNotNull(schema.reviewCards.lexemeId),
        ...inLanguage(opts.targetLang, db),
      ),
    )) as [{ n: number }];
  return n;
}

export async function dueCount(
  db: Db,
  userId: string,
  opts: { now?: Date; targetLang?: string } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reviewCards)
    .where(
      and(
        eq(schema.reviewCards.userId, userId),
        lte(schema.reviewCards.dueAt, now),
        ...inLanguage(opts.targetLang, db),
      ),
    )) as [{ n: number }];
  return n;
}

export interface ReviewOutcome {
  readonly card: CardRow;
  readonly next: NextState;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
}

/**
 * Applies one rating: fsrs next state, `review_cards` update, `review_log`
 * append, in one transaction. Refuses cards that are not the user's.
 */
export async function recordReview(
  db: Db,
  fsrs: Fsrs,
  userId: string,
  cardId: string,
  rating: Rating,
  now = new Date(),
): Promise<ReviewOutcome | null> {
  const [row] = await db
    .select(cardColumns)
    .from(schema.reviewCards)
    .where(and(eq(schema.reviewCards.id, cardId), eq(schema.reviewCards.userId, userId)))
    .limit(1);
  if (!row) return null;
  const next = fsrs.nextState(rowToFsrs(row), rating, now.getTime());
  const elapsedDays = row.lastReviewAt ? (now.getTime() - row.lastReviewAt.getTime()) / DAY_MS : 0;
  const scheduledDays = Math.max(0, (next.due_at_ms - now.getTime()) / DAY_MS);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.reviewCards)
      .set({
        stability: next.stability,
        difficulty: next.difficulty,
        dueAt: new Date(next.due_at_ms),
        lastReviewAt: new Date(next.last_review_at_ms),
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        updatedAt: now,
      })
      .where(eq(schema.reviewCards.id, cardId));
    await tx
      .insert(schema.reviewLog)
      .values({ cardId, rating, elapsedDays, scheduledDays, reviewedAt: now });
  });
  return { card: row, next, elapsedDays, scheduledDays };
}

/** Lexeme ids of every card in `state = review` with stability at or above the threshold, for unit crowns. */
export async function matureLexemeIds(
  db: Db,
  userId: string,
  lexemeIds: readonly string[],
  minStabilityDays: number,
): Promise<string[]> {
  if (lexemeIds.length === 0) return [];
  const rows = await db
    .select({ lexemeId: schema.reviewCards.lexemeId })
    .from(schema.reviewCards)
    .where(
      and(
        eq(schema.reviewCards.userId, userId),
        inArray(schema.reviewCards.lexemeId, [...lexemeIds]),
        eq(schema.reviewCards.state, "review"),
        sql`${schema.reviewCards.stability} >= ${minStabilityDays}`,
        notInArray(schema.reviewCards.state, ["new"]),
      ),
    );
  return rows.map((r) => r.lexemeId).filter((x): x is string => !!x);
}
