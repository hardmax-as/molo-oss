import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Heart, Infinity as InfinityIcon } from "lucide-react";

import { ProgressRing } from "~/components/ui/ProgressRing.tsx";
import { StreakFlame } from "~/components/ui/StreakFlame.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useProgress } from "~/lib/progress.ts";
import { useMe } from "~/lib/session.tsx";

/** Level, daily-goal ring and streak for the signed-in learner; the one place gamification is always visible. */
export function ProgressStrip() {
  const t = useT();
  const me = useMe();
  const p = useProgress();
  if (!me.data || !p.data) return null;
  const goal = Math.max(1, p.data.dailyGoalXp);
  const ratio = p.data.xpToday / goal;
  const reached = p.data.xpToday >= goal;
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 pb-2 text-sm text-indigo">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo px-3 py-1 font-display font-semibold text-white">
        <Sparkles size={14} className="text-sun" aria-hidden />
        {t("gamification.level", { level: p.data.level })}
      </span>
      <Link
        to="/plus"
        className={`flex min-h-6 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${p.data.hearts.unlimited ? "bg-indigo text-sun" : p.data.hearts.hearts === 0 ? "bg-coral/15 text-coral-deep" : "bg-coral/10 text-coral-deep"}`}
        aria-label={
          p.data.hearts.unlimited
            ? t("hearts.unlimited")
            : t("hearts.count", { hearts: p.data.hearts.hearts, max: p.data.hearts.max })
        }
      >
        <Heart size={14} className="fill-current" aria-hidden />
        {p.data.hearts.unlimited ? <InfinityIcon size={14} aria-hidden /> : p.data.hearts.hearts}
      </Link>
      <StreakFlame
        days={p.data.streak.current}
        size={24}
        label={`${t("gamification.streak", { count: p.data.streak.current })}${p.data.streak.freezeAvailable ? ` · ${t("gamification.freezeReady")}` : ""}`}
      />
      <span className="inline-flex items-center gap-2">
        {/* Decorative: the text beside it already reads "40 / 50 XP today". */}
        <ProgressRing value={ratio} size={34} stroke={5} tone={reached ? "sun" : "sea"}>
          <span className="text-[10px] font-bold">{Math.min(100, Math.round(ratio * 100))}</span>
        </ProgressRing>
        <span className={reached ? "font-semibold text-sea-deep" : "text-indigo/80"}>
          {reached
            ? t("gamification.goalReached")
            : t("gamification.xpToday", { xp: p.data.xpToday, goal: p.data.dailyGoalXp })}
        </span>
      </span>
      <Link
        to="/review"
        className={`ml-auto inline-flex min-h-6 items-center rounded-full px-3 py-1 text-xs font-semibold ${p.data.dueCount > 0 ? "bg-sun text-indigo" : "border border-mist-soft bg-cloud text-mist"}`}
      >
        {t("review.title")} · {p.data.dueCount}
      </Link>
    </div>
  );
}
