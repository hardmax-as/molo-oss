import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { applyToProgress } from "~/dev/knobs.ts";
import { useFakeState, useTuning } from "~/dev/knobs.tsx";
import { getProgress, localToday, type ProgressResponse } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Glass } from "~/ui/Glass.tsx";
import { HeartsChip } from "~/ui/HeartsChip.tsx";
import { ProgressRing } from "~/ui/ProgressRing.tsx";
import { useSfx } from "~/ui/sfx.tsx";
import { StreakFlame } from "~/ui/StreakFlame.tsx";
import { colors } from "~/ui/theme.ts";
import { XpChip } from "~/ui/XpChip.tsx";

export function useProgress() {
  const me = useMe();
  const tuning = useTuning();
  const fake = useFakeState();
  return useQuery({
    queryKey: ["progress"],
    queryFn: getProgress,
    enabled: !!me.data,
    staleTime: 30_000,
    // The developer knobs, laid over the server's answer on the way out.
    // Nothing is sent back and the cache still holds what the API said, so
    // clearing an override restores the real numbers without a refetch.
    select: (p: ProgressResponse) => applyToProgress(p, tuning, fake),
  });
}

/**
 * Level, daily-goal ring, hearts and the streak flame, from GET /me/progress.
 * The review count lives on the Review tab badge, so the strip does not
 * repeat it. The flame pops and the `streak` sound plays when the day count
 * grows while the strip is on screen. Renders nothing for guests, even
 * while a stale progress query is still cached.
 */
export function ProgressStrip({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const sfx = useSfx();
  const me = useMe();
  const progress = useProgress();
  const p = me.data ? progress.data : undefined;
  const lastStreak = useRef<number | null>(null);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (!p) return;
    if (lastStreak.current !== null && p.streak.current > lastStreak.current) {
      setPop((n) => n + 1);
      sfx.play("streak");
    }
    lastStreak.current = p.streak.current;
  }, [p, sfx]);
  if (!p) return null;
  const alive = p.streak.lastActiveDate === localToday();
  const goal = Math.min(1, p.xpToday / Math.max(1, p.dailyGoalXp));
  const reached = p.xpToday >= p.dailyGoalXp;
  const body = (
    <>
      <ProgressRing
        value={goal}
        size={compact ? 44 : 56}
        stroke={compact ? 6 : 7}
        color={reached ? colors.sun : colors.sea}
        accessibilityLabel={t("gamification.levelRing", {
          level: p.level,
          xp: p.xpToday,
          goal: p.dailyGoalXp,
        })}
      >
        <Text className="font-display-bold text-sm text-ink">{p.level}</Text>
      </ProgressRing>
      <View className="flex-1" accessibilityElementsHidden>
        <Text className="font-display text-base text-ink" numberOfLines={1}>
          {t("gamification.level", { level: p.level })}
        </Text>
        <Text
          className={`font-body-semibold text-xs ${reached ? "text-sea-deep" : "text-mist"}`}
          numberOfLines={1}
        >
          {reached
            ? t("gamification.goalReached")
            : t("gamification.xpToday", { xp: p.xpToday, goal: p.dailyGoalXp })}
        </Text>
      </View>
      {p.hearts && <HeartsChip state={p.hearts} size={compact ? "sm" : "md"} glass={compact} />}
      <View
        className="flex-row items-center gap-1"
        accessible
        accessibilityLabel={
          alive || p.streak.current === 0
            ? t("gamification.streak", { count: p.streak.current })
            : `${t("gamification.streak", { count: p.streak.current })}. ${t("gamification.streakAtRisk")}`
        }
      >
        <StreakFlame
          alive={alive}
          atRisk={!alive && p.streak.current > 0}
          pop={pop}
          size={compact ? 22 : 28}
        />
        <Text className={`font-display-bold text-ink ${compact ? "text-sm" : "text-lg"}`}>
          {p.streak.current}
        </Text>
      </View>
      {compact && <XpChip xp={p.xpTotal} signed={false} size="sm" align="center" />}
    </>
  );
  if (compact) return <View className="flex-row items-center gap-3">{body}</View>;
  // Plus learners see when this week's streak freeze is unused; on its own line so the row keeps its width.
  const freezeReady = p.plan?.plan === "plus" && p.streak.freezeAvailable;
  // Liquid Glass card on iOS 26, the plain cloud card elsewhere.
  return (
    <Glass
      tint={colors.cloud}
      fallbackStyle={{ backgroundColor: colors.cloud }}
      style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}
      testID="progress-strip"
    >
      <View className="flex-row items-center gap-3">{body}</View>
      {freezeReady && (
        <Text className="font-body-semibold text-xs text-sea-deep" testID="freeze-ready">
          ❄︎ {t("gamification.freezeReady")}
        </Text>
      )}
    </Glass>
  );
}
