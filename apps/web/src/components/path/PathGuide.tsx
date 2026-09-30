import { Crane } from "~/components/illustrations/Crane.tsx";
import { useT } from "~/lib/i18n.tsx";

/**
 * The crane is the mentor (docs/DESIGN.md "Illustration"), so it stands
 * beside the node the learner is being pointed at. The bubble is not
 * chatter: it appears on the very first visit and after a long absence,
 * and never again in between (`lib/path-guide.ts` keeps the date).
 */
export function PathGuide({ speak }: { speak: "first" | "back" | null }) {
  const t = useT();
  const line = speak === "first" ? t("onboarding.ready.body") : t("lesson.keepGoing");
  return (
    <div className="pointer-events-none flex select-none items-end gap-1">
      {speak !== null && (
        <p
          role="status"
          className="w-44 shrink-0 rounded-2xl rounded-br-sm bg-cloud px-3 py-2 text-sm font-semibold text-indigo shadow-card"
        >
          {line}
        </p>
      )}
      {/* The drawing is decoration: the bubble beside it carries the words. */}
      <span className="block shrink-0">
        <Crane pose={speak === "first" ? "hello" : "think"} size={92} />
      </span>
      <span className="sr-only">{t("path.guide.name")}</span>
    </div>
  );
}
