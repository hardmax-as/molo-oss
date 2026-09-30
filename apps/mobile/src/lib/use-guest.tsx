import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  clearGuest,
  EMPTY_GUEST,
  guestMustSignUp,
  guestXp,
  readGuest,
  recordGuestLesson,
  type GuestLesson,
  type GuestProgress,
} from "./guest.ts";
import { useMe } from "./session.tsx";

export const GUEST_KEY = ["guest"] as const;

/**
 * The device-side guest progress as a query, so every screen sees the same
 * copy and a recorded lesson shows up on the home banner right away.
 * `walled` is the account wall: a guest with the free lesson behind them.
 */
export function useGuest() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: GUEST_KEY, queryFn: readGuest, staleTime: Infinity });
  const progress: GuestProgress = q.data ?? EMPTY_GUEST;
  const record = useCallback(
    async (lesson: GuestLesson, missed: readonly string[] = []) => {
      const next = await recordGuestLesson(lesson, missed);
      qc.setQueryData(GUEST_KEY, next);
      return next;
    },
    [qc],
  );
  const clear = useCallback(async () => {
    await clearGuest();
    qc.setQueryData(GUEST_KEY, EMPTY_GUEST);
  }, [qc]);
  const isGuest = !me.isPending && !me.data;
  return {
    /** Still reading the session or the device: nothing should be decided yet. */
    isPending: me.isPending || q.isPending,
    isGuest,
    progress,
    xp: guestXp(progress),
    lessons: progress.lessons.length,
    /** A guest who has finished the free lesson: review, leagues and Plus show the wall. */
    walled: isGuest && progress.lessons.length > 0,
    /** Whether this particular lesson is behind the wall (finished ones replay freely). */
    mustSignUp: (lessonId: string) => isGuest && guestMustSignUp(progress, lessonId),
    record,
    clear,
  };
}
