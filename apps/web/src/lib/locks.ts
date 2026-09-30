import { guestFinishedUnits, lockedUnitIds, type UnitSummary } from "@molo/core";
import { useQuery } from "@tanstack/react-query";

import { getUnits } from "./api.ts";
import { readGuest } from "./guest.ts";
import { useMe } from "./session.tsx";

export interface UnitLock {
  readonly locked: boolean;
  readonly prerequisiteTitleKey: string | null;
  readonly prerequisiteSlug: string | null;
}

const OPEN: UnitLock = { locked: false, prerequisiteTitleKey: null, prerequisiteSlug: null };

/**
 * Which units are locked behind a prerequisite. The server has already
 * decided for a signed-in learner; a guest has no server state, so the same
 * rule from @molo/core runs over the lessons kept in localStorage.
 */
export function useUnitLocks() {
  const me = useMe();
  const units = useQuery({ queryKey: ["units"], queryFn: getUnits });
  const list: UnitSummary[] = [...(units.data?.units ?? [])];
  const guest = me.isPending || me.data ? null : readGuest();
  const locked = guest
    ? lockedUnitIds(list, guestFinishedUnits(list, guest.lessons))
    : new Set(list.filter((u) => u.locked).map((u) => u.id));
  return {
    isPending: units.isPending || me.isPending,
    units: list,
    lockOf(unit: { id: string } | undefined): UnitLock {
      const summary = unit ? list.find((u) => u.id === unit.id) : undefined;
      if (!unit || !summary) return OPEN;
      return {
        locked: locked.has(unit.id),
        prerequisiteTitleKey: summary.prerequisiteTitleKey,
        prerequisiteSlug: summary.prerequisiteSlug,
      };
    },
  };
}
