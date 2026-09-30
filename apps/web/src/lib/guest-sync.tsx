import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { importProgress } from "./api.ts";
import { clearGuest, readGuest } from "./guest.ts";
import { useT } from "./i18n.tsx";
import { useMe } from "./session.tsx";

/** After sign-up or sign-in: replay the guest lessons on the server once, then forget the local copy. */
export function useSyncGuestProgress() {
  const me = useMe();
  const qc = useQueryClient();
  const t = useT();
  const busy = useRef(false);
  useEffect(() => {
    if (!me.data || busy.current) return;
    const g = readGuest();
    if (g.lessons.length === 0 && g.chests.length === 0) return;
    busy.current = true;
    const run = async () => {
      try {
        const r = await importProgress({
          lessons: g.lessons.map(({ lessonId, correct, total, today }) => ({
            lessonId,
            correct,
            total,
            today,
          })),
          chests: g.chests,
        });
        clearGuest();
        if (r.imported > 0) toast.success(t("guest.synced", { count: r.imported }));
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["progress"] }),
          qc.invalidateQueries({ queryKey: ["hearts"] }),
          qc.invalidateQueries({ queryKey: ["review-session"] }),
          qc.invalidateQueries({ queryKey: ["path"] }),
        ]);
      } catch {
        // the copy stays local and is retried on the next visit
      } finally {
        busy.current = false;
      }
    };
    void run();
  }, [me.data, qc, t]);
}
