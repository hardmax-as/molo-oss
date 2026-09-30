import type { UnitSummary } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { getLearningPath, getReviewSession } from "./api.ts";
import { useLang } from "./i18n.tsx";
import { flushPendingReviews, pendingReviewsSettled } from "./offline.ts";
import { prefetchNextUnit, prefetchReviewSession } from "./prefetch-logic.ts";
import { useMe } from "./session.tsx";
import { useGuest } from "./use-guest.tsx";
import { PATH_KEY } from "./use-path.ts";
import { fetchUnitForDevice, unitQueryKey } from "./use-unit.ts";

/** The home screen's own reads go first; the prefetch follows once it has settled. */
const SETTLE_MS = 300;

/**
 * Each time the home screen comes into view: fetch the unit that holds the
 * next lesson, so the unit screen and the lesson in it open with nothing to
 * wait for, and — signed in — the review session, so the Review tab opens
 * on a card. Idempotent: whatever is already fresh in memory is not asked
 * for again (`prefetch-logic.ts`).
 */
export function usePrefetchFromHome(units: readonly UnitSummary[] | undefined): void {
  const qc = useQueryClient();
  const { lang } = useLang();
  const me = useMe();
  const guest = useGuest();
  const signedIn = !!me.data;
  const known = !me.isPending && !guest.isPending && (signedIn || units !== undefined);
  const lessons = guest.progress.lessons;
  useFocusEffect(
    useCallback(() => {
      if (!known) return undefined;
      const timer = setTimeout(() => {
        void prefetchNextUnit(
          qc,
          {
            signedIn,
            path: { queryKey: [...PATH_KEY], queryFn: getLearningPath },
            units: units ?? [],
            guestLessons: lessons,
          },
          (slug) => ({
            queryKey: [...unitQueryKey(slug, lang)],
            queryFn: () => fetchUnitForDevice(slug, lang),
          }),
        );
        if (signedIn) {
          void prefetchReviewSession(qc, {
            session: {
              queryKey: ["review-session", lang],
              queryFn: () => getReviewSession(lang),
            },
            flush: flushPendingReviews,
            queueEmpty: pendingReviewsSettled,
          });
        }
      }, SETTLE_MS);
      return () => clearTimeout(timer);
    }, [known, signedIn, lang, units, lessons, qc]),
  );
}
