import { useQuery } from "@tanstack/react-query";

import { getAudioBacklog } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

/**
 * "3 recordings waiting to be processed". Uploads go through a queue that a
 * scheduled worker drains every few minutes, so right after a session the
 * review queue can look empty while the takes are still on their way. The
 * number is the queue's own backlog; when it is unknown or zero this renders
 * nothing.
 */
export function AudioBacklogNote({ className = "" }: { className?: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["audio-backlog"],
    queryFn: getAudioBacklog,
    refetchInterval: 60_000,
    retry: false,
  });
  const waiting = q.data?.waiting ?? 0;
  if (!waiting) return null;
  return (
    <p
      role="status"
      className={`rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ${className}`}
    >
      <span className="font-semibold">{t("edit.audioBacklog.waiting", { count: waiting })}</span>
      <span className="block text-xs text-amber-800">{t("edit.audioBacklog.hint")}</span>
    </p>
  );
}
