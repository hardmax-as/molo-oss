import { crownLevelOf } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { claimChest, getLearningPath } from "./api.ts";
import { recordGuestChest } from "./guest.ts";
import type { PathState } from "./path-model.ts";
import { useMe } from "./session.tsx";
import { useGuest } from "./use-guest.tsx";
import { GUEST_KEY } from "./use-guest.tsx";

export const PATH_KEY = ["path"] as const;

/**
 * This learner's state on the path: crown levels, opened chests and the
 * account wall. A signed-in learner gets it from `/path`; a guest has no
 * server state, so it comes from the device copy. Either way the shape is
 * the `PathState` the pure node model asks for.
 */
export function usePathState(unitLocked: boolean): {
  state: PathState;
  claim: (skillId: string) => void;
  claiming: string | null;
  offline: boolean;
} {
  const me = useMe();
  const guest = useGuest();
  const qc = useQueryClient();
  const signedIn = !!me.data;
  const path = useQuery({
    queryKey: PATH_KEY,
    queryFn: getLearningPath,
    enabled: signedIn,
    staleTime: 30_000,
  });

  const crowns = new Map<string, number>();
  const claimedSkills = new Set<string>();
  for (const u of path.data?.units ?? [])
    for (const s of u.skills) {
      if (s.chestClaimed) claimedSkills.add(s.id);
      for (const l of s.lessons) crowns.set(l.id, crownLevelOf(l.crownLevel));
    }
  const guestLessons = new Set(guest.progress.lessons.map((l) => l.lessonId));
  const guestChests = new Set(guest.progress.chests);

  const claimed = useMutation({
    mutationFn: async (skillId: string) => {
      if (!signedIn) {
        const next = await recordGuestChest(skillId);
        qc.setQueryData(GUEST_KEY, next);
        return;
      }
      await claimChest(skillId);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: PATH_KEY }),
        qc.invalidateQueries({ queryKey: ["progress"] }),
      ]);
    },
  });

  return {
    state: {
      crownOf: (lessonId) =>
        signedIn ? (crowns.get(lessonId) ?? 0) : guestLessons.has(lessonId) ? 1 : 0,
      chestClaimed: (skillId) => (signedIn ? claimedSkills.has(skillId) : guestChests.has(skillId)),
      lessonWalled: (lessonId) => guest.mustSignUp(lessonId),
      unitLocked,
    },
    claim: (skillId) => claimed.mutate(skillId),
    claiming: claimed.isPending ? (claimed.variables ?? null) : null,
    /** The path could not be read: crowns show as unfinished rather than wrong. */
    offline: signedIn && path.isError,
  };
}
