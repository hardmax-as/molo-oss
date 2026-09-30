/**
 * The mistakes session's queue. Pure, so it runs under Jest without the
 * network: the screen holds the queue in state and the server is told about
 * each answer separately.
 *
 * A word is served once per session whatever the answer. Right clears it on
 * the server; wrong leaves the row open, so it comes back in the *next*
 * session rather than looping inside this one.
 */

export interface MistakeItem {
  readonly lexemeId: string;
  readonly exerciseType: string;
  readonly timesWrong: number;
  readonly lastWrongAt: string;
}

/** Most-missed first, then the oldest miss — the same order the server serves. */
export function orderQueue<T extends MistakeItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => b.timesWrong - a.timesWrong || a.lastWrongAt.localeCompare(b.lastWrongAt),
  );
}

export interface AnswerResult<T extends MistakeItem> {
  readonly queue: T[];
  /** True when this answer cleared the word (a right answer on an open mistake). */
  readonly cleared: boolean;
}

/** Applies one answer: the word leaves this session either way. */
export function applyAnswer<T extends MistakeItem>(
  queue: readonly T[],
  lexemeId: string,
  correct: boolean,
): AnswerResult<T> {
  const present = queue.some((m) => m.lexemeId === lexemeId);
  return {
    queue: queue.filter((m) => m.lexemeId !== lexemeId),
    cleared: present && correct,
  };
}
