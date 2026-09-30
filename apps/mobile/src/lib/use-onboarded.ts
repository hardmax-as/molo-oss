import { useQuery } from "@tanstack/react-query";

import { onboardedFrom } from "./onboarding-steps.ts";
import { localOnboarded } from "./onboarding.ts";
import { useMe } from "./session.tsx";

/**
 * The device flag lives in the query cache, not in component state. Home
 * used to read it once on mount, so a home screen that was already mounted
 * kept the old answer after onboarding finished (MOL-66). The welcome flow
 * sets it with `setQueryData` before navigating and invalidates it once the
 * write lands. "Show the intro again" pushes the welcome flow itself and
 * leaves the cached value alone, so home does not redirect there a second time.
 */
export const ONBOARDED_KEY = ["onboarded"] as const;

/**
 * Whether to show the welcome flow. Signed in: the server flag when the API
 * ships it, else the device flag. Guest: the device flag. `null` while
 * loading, so the home screen does not flash.
 */
export function useOnboarded(): boolean | null {
  const me = useMe();
  const local = useQuery({
    queryKey: ONBOARDED_KEY,
    queryFn: localOnboarded,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  if (me.isPending || local.isPending) return null;
  return onboardedFrom(!!me.data, me.data?.prefs?.onboardedAt, local.data ?? true);
}
