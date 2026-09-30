/**
 * The one place the header's numbers are read, so there is one place a
 * developer override can be applied to them.
 *
 * The server's own response is what is cached: the overrides are put on
 * afterwards, on the way to the screen, and never on the way back. Nothing
 * a knob does is ever sent anywhere, and the next response from the API
 * arrives untouched and is decorated the same way (`~/dev/knobs.ts`).
 */

import type { ProgressResponse } from "@molo/core";
import { useQuery } from "@tanstack/react-query";

import { applyToProgress } from "~/dev/knobs.ts";
import { useFakeState, useTuning } from "~/dev/knobs.tsx";

import { getProgress } from "./api.ts";
import { useMe } from "./session.tsx";

export const PROGRESS_KEY = ["progress"] as const;

export function useProgress() {
  const me = useMe();
  const tuning = useTuning();
  const fake = useFakeState();
  return useQuery({
    queryKey: PROGRESS_KEY,
    queryFn: getProgress,
    enabled: !!me.data,
    staleTime: 30_000,
    // `select` runs on the cached value, so the override applies to a
    // response written by a lesson as well as to one that was fetched.
    select: (p: ProgressResponse) => applyToProgress(p, tuning, fake),
  });
}
