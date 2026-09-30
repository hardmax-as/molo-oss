import { createContext, useContext } from "react";

/**
 * Filled by the lesson screen with its ScrollView's `scrollToEnd`. The
 * check bar calls it when a verdict lands, so Continue is never hiding
 * below the fold after a tall exercise (class sort, a long sentence).
 */
export const LessonScrollContext = createContext<() => void>(() => undefined);

export function useLessonScroll() {
  return useContext(LessonScrollContext);
}
