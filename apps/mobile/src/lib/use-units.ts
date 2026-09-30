import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getUnits } from "./api.ts";
import { cacheUnitList, cachedUnitList, type UnitList } from "./offline.ts";

/**
 * The published units, network first and the device's last copy when the
 * network fails. A learner in airplane mode therefore still sees the path,
 * and with it the units they downloaded, instead of an error with nothing
 * under it.
 */
export function fetchUnitList(): Promise<UnitList> {
  return getUnits().then(
    (fresh) => {
      void cacheUnitList(fresh);
      return fresh;
    },
    (e: unknown) =>
      cachedUnitList().then((cached) => {
        if (cached) return cached;
        throw e;
      }),
  );
}

/** One definition, so the home and unit screens and a prefetch share an entry. */
export function unitListQueryOptions() {
  return queryOptions({ queryKey: ["units"] as const, queryFn: fetchUnitList });
}

/**
 * The unit list, drawn at once from the copy the device kept last time while
 * the network answers (docs/CACHING.md section 2.0), so the home screen never
 * opens on an empty path.
 */
export function useUnitList() {
  const stored = useQuery({
    queryKey: ["units-stored"],
    queryFn: cachedUnitList,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const list = stored.data ?? undefined;
  const placeholderData = useCallback(() => list, [list]);
  return useQuery({ ...unitListQueryOptions(), placeholderData });
}
