/**
 * The path as the page needs it: the server's view of the curriculum with
 * the learner's state on it, or — for a guest, who has no server state —
 * the same curriculum with what this browser remembers laid over the top.
 * The rules themselves (which node is current, when a chest opens, how the
 * path winds) live in @molo/core so mobile draws the same thing.
 */

import {
  buildPath,
  guestFinishedUnits,
  lockedUnitIds,
  XP,
  type PathRow,
  type PathUnitInput,
} from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useFakeState, useTuning } from "~/dev/knobs.tsx";

import { claimChest, getPath } from "./api.ts";
import { readGuest, recordGuestChest } from "./guest.ts";
import { useMe } from "./session.tsx";

export const PATH_KEY = ["path"] as const;

export interface LearningPath {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly rows: readonly PathRow[];
  /**
   * False when a `slug` was asked for and no published unit answers to it —
   * a draft unit, a retired one, a typo. The page must treat that as an
   * error, not as an empty course.
   */
  readonly found: boolean;
  readonly chestXp: number;
  /** Opens a chest: server-side for a learner, on the device for a guest. */
  readonly claim: (skillId: string) => void;
  readonly claiming: string | null;
}

/**
 * `slug` narrows the path to one unit (the unit page); without it the whole
 * course is strung together (the home page).
 */
export function useLearningPath(slug?: string): LearningPath {
  const me = useMe();
  const qc = useQueryClient();
  const tuning = useTuning();
  const fake = useFakeState();
  const path = useQuery({ queryKey: PATH_KEY, queryFn: getPath });
  const signedIn = !!me.data;
  const guest = me.isPending || signedIn ? null : readGuest();

  const claimed = useMutation({
    mutationFn: async (skillId: string) => {
      if (guest) {
        recordGuestChest(skillId);
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

  const units = path.data?.units ?? [];
  // The chest's XP is the server's answer; the knobs panel's is a display
  // override on top of it, which is why it wins here and nowhere else.
  const chestXp =
    tuning.xp.skillChest !== XP.skillChest
      ? tuning.xp.skillChest
      : (path.data?.chestXp ?? XP.skillChest);
  // A fabricated "unit finished" crowns every lesson of one unit, exactly
  // as the guest overlay below crowns the ones held in local storage.
  const fakeFinished = fake.finishedUnitSlug;

  // A guest's lessons live in localStorage, so their crowns, their unit
  // locks and their chests are all computed here from the same copy.
  const guestLessons = new Set(guest?.lessons.map((l) => l.lessonId) ?? []);
  const guestChests = new Set(guest?.chests ?? []);
  const guestLocked = guest
    ? lockedUnitIds([...units], guestFinishedUnits([...units], guest.lessons))
    : null;

  const inputs: PathUnitInput[] = units
    .filter((u) => slug === undefined || u.slug === slug)
    .map((u) => ({
      id: u.id,
      slug: u.slug,
      titleKey: u.titleKey,
      cefrBand: u.cefrBand,
      locked: fakeFinished === u.slug ? false : guestLocked ? guestLocked.has(u.id) : u.locked,
      prerequisiteSlug: u.prerequisiteSlug,
      prerequisiteTitleKey: u.prerequisiteTitleKey,
      skills: u.skills.map((s) => ({
        id: s.id,
        slug: s.slug,
        titleKey: s.titleKey,
        kind: s.kind,
        chestClaimed: guest ? guestChests.has(s.id) : s.chestClaimed,
        lessons: s.lessons.map((l) => ({
          id: l.id,
          order: l.order,
          kind: l.kind,
          estimatedMinutes: l.estimatedMinutes,
          exerciseCount: l.exerciseCount,
          crownLevel:
            fakeFinished === u.slug
              ? Math.max(1, l.crownLevel)
              : guest
                ? guestLessons.has(l.id)
                  ? 1
                  : 0
                : l.crownLevel,
        })),
      })),
    }));

  // No node is shut for the guest wall on web: a guest past their free
  // lesson still walks the path and meets `SaveProgressWall` inside the
  // lesson, which is where it has always been.
  const rows = buildPath(inputs, { chestXp });

  return {
    isPending: path.isPending || me.isPending,
    isError: path.isError,
    rows,
    found: slug === undefined || units.some((u) => u.slug === slug),
    chestXp,
    // `mutate`, not `mutateAsync`: a refused claim (a chest someone else
    // already took, an offline moment) must not become an unhandled
    // rejection. The next read of the path is the truth either way.
    claim: (skillId: string) => claimed.mutate(skillId),
    claiming: claimed.isPending ? (claimed.variables ?? null) : null,
  };
}
