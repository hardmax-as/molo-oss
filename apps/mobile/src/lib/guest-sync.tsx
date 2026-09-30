import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "~/ui/Toast.tsx";

import { accountReady } from "./age-step.ts";
import { importProgress } from "./api.ts";
import { clearGuest, EMPTY_GUEST, readGuest } from "./guest.ts";
import { useT } from "./i18n.tsx";
import { useMe } from "./session.tsx";
import { GUEST_KEY } from "./use-guest.tsx";

/** After sign-up or sign-in: replay the guest lessons on the server once, then forget the local copy. */
export function useSyncGuestProgress() {
  const me = useMe();
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const busy = useRef(false);
  useEffect(() => {
    // A one-tap account replays nothing until it is past the age step.
    if (!accountReady(me.data) || busy.current) return;
    busy.current = true;
    const run = async () => {
      try {
        const g = await readGuest();
        if (g.lessons.length === 0 && g.chests.length === 0) return;
        const r = await importProgress({
          lessons: g.lessons.map(({ lessonId, correct, total, today }) => ({
            lessonId,
            correct,
            total,
            today,
          })),
          chests: g.chests,
        });
        await clearGuest();
        qc.setQueryData(GUEST_KEY, EMPTY_GUEST);
        qc.setQueryData(["progress"], r.progress);
        if (r.imported > 0) toast.show(t("guest.synced", { count: r.imported }), "sea");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["progress"] }),
          qc.invalidateQueries({ queryKey: ["hearts"] }),
          qc.invalidateQueries({ queryKey: ["review-session"] }),
          qc.invalidateQueries({ queryKey: ["crown"] }),
          qc.invalidateQueries({ queryKey: ["path"] }),
        ]);
      } catch {
        // the copy stays on the device and is retried on the next sign-in
      } finally {
        busy.current = false;
      }
    };
    void run();
  }, [me.data, qc, t, toast]);
}
