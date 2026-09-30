import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { applyToHearts } from "~/dev/knobs.ts";
import { useFakeState, useTuning } from "~/dev/knobs.tsx";

import { getHearts, loseHeart, type HeartsState } from "./api.ts";
import { heartsBlocked } from "./hearts-format.ts";
import { usePlus } from "./plus.tsx";
import { useMe } from "./session.tsx";

/**
 * Hearts for the signed-in learner (guests have none: the pacing applies to
 * accounts). `blocked` is what stops a lesson; a fresh in-app purchase
 * lifts it locally before the server's webhook arrives.
 */
export function useHearts() {
  const me = useMe();
  const qc = useQueryClient();
  const { localPlus } = usePlus();
  const tuning = useTuning();
  const fake = useFakeState();
  const q = useQuery({
    queryKey: ["hearts"],
    queryFn: getHearts,
    enabled: !!me.data,
    staleTime: 15_000,
  });
  const lose = useMutation({
    mutationFn: loseHeart,
    onSuccess: (state: HeartsState) => {
      qc.setQueryData(["hearts"], state);
      void qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
  // The developer knobs are a display override, so they decorate what the
  // server said rather than replacing it: `lose()` below still calls the
  // API, and the API still decides. See `~/dev/knobs.ts`.
  const raw = me.data ? (q.data ?? null) : null;
  const state = raw ? applyToHearts(raw, tuning, fake) : null;
  return {
    state,
    signedIn: !!me.data,
    blocked: heartsBlocked(state, localPlus),
    /**
     * One wrong answer; a no-op for guests and for Plus. Resolves to the
     * server's answer, or null when there was nothing to lose or the request
     * failed, so the lesson header can count on from what the server said.
     */
    lose: (): Promise<HeartsState | null> => {
      if (!me.data || localPlus || state?.unlimited) return Promise.resolve(null);
      return lose.mutateAsync().catch(() => null);
    },
  };
}
