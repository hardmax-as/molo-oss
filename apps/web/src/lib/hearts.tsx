import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { applyToHearts } from "~/dev/knobs.ts";
import { useFakeState, useTuning } from "~/dev/knobs.tsx";

import { getHearts, loseHeart, type HeartsState } from "./api.ts";
import { useMe } from "./session.tsx";

/** Guests have no hearts: the pacing applies to accounts, which is also the upsell moment. */
export function useHearts() {
  const me = useMe();
  const qc = useQueryClient();
  const tuning = useTuning();
  const fake = useFakeState();
  const q = useQuery({
    queryKey: ["hearts"],
    queryFn: getHearts,
    enabled: !!me.data,
    staleTime: 15_000,
    // The cache holds what the server said; the knobs panel decorates it on
    // the way to the screen and never on the way back (`~/dev/knobs.ts`).
    select: (state: HeartsState) => applyToHearts(state, tuning, fake),
  });
  const lose = useMutation({
    mutationFn: loseHeart,
    onSuccess: (state: HeartsState) => {
      qc.setQueryData(["hearts"], state);
      void qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
  const state = me.data ? q.data : null;
  return {
    state: state ?? null,
    signedIn: !!me.data,
    /** True when a lesson must stop: signed in, not unlimited, none left. */
    blocked: !!state && !state.unlimited && state.hearts <= 0,
    lose: () => (me.data ? lose.mutateAsync() : Promise.resolve(null)),
  };
}
