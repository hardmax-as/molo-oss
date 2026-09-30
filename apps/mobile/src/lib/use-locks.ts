import { guestFinishedUnits, lockedUnitIds, type UnitSummary } from "@molo/core";

import { useGuest } from "./use-guest.tsx";

export interface UnitLock {
  readonly locked: boolean;
  readonly prerequisiteTitleKey: string | null;
  readonly prerequisiteSlug: string | null;
}

const OPEN: UnitLock = { locked: false, prerequisiteTitleKey: null, prerequisiteSlug: null };

/**
 * Which units are locked behind a prerequisite. The server has already
 * decided for a signed-in learner; a guest has no server state, so the same
 * rule from @molo/core runs over the lessons kept on the device.
 */
export function useUnitLocks(units: readonly UnitSummary[]) {
  const guest = useGuest();
  const list = [...units];
  const locked = guest.isGuest
    ? lockedUnitIds(list, guestFinishedUnits(list, guest.progress.lessons))
    : new Set(list.filter((u) => u.locked).map((u) => u.id));
  return {
    lockOf(unit: { id: string }): UnitLock {
      const summary = list.find((u) => u.id === unit.id);
      if (!summary) return OPEN;
      return {
        locked: locked.has(unit.id),
        prerequisiteTitleKey: summary.prerequisiteTitleKey,
        prerequisiteSlug: summary.prerequisiteSlug,
      };
    },
  };
}
