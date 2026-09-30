import { runHeat, runIsWorthSaying, type LessonHeartsView } from "@molo/core";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { XpChip } from "~/ui/XpChip.tsx";

import { LessonHearts } from "./LessonHearts.tsx";

/**
 * The lesson strip: the thin progress bar (the one allowed bar), the run of
 * right answers, a live XP chip and, on the right, the hearts. On a run the
 * bar takes the colour of "right" and says how long the run is; below
 * `RUN_MIN_TO_SHOW` it says
 * nothing at all, because a counter that celebrates everything celebrates
 * nothing. Same rule, same numbers as the web app (@molo/core).
 *
 * It takes only numbers, so the runner drives it from a real lesson and the
 * developer gallery can show it at three and at seven without playing one.
 */
export function LessonStrip({
  index,
  total,
  xp,
  run,
  hearts,
}: {
  index: number;
  total: number;
  xp: number;
  run: number;
  /** What the hearts say (`lessonHeartsView`); left out, the strip shows none. */
  hearts?: LessonHeartsView | undefined;
}) {
  const t = useT();
  const rules = useTuning().run;
  const heat = runHeat(run, rules);
  const onARun = runIsWorthSaying(run, rules);
  const label = t(heat === "hot" ? "lesson.run.onFire" : "lesson.run.inARow", { count: run });
  return (
    <View className="mb-5">
      <View className="flex-row items-center gap-3">
        <View
          className="h-3 flex-1 overflow-hidden rounded-full bg-sand-deep"
          accessibilityRole="progressbar"
          accessibilityLabel={
            onARun
              ? `${t("lesson.progress", { done: index, total })} — ${label}`
              : t("lesson.progress", { done: index, total })
          }
          accessibilityValue={{ min: 0, max: total, now: index }}
        >
          <Animated.View
            className={`h-full rounded-full ${onARun ? "bg-sea" : "bg-sun"}`}
            style={{ width: `${Math.round((index / Math.max(1, total)) * 100)}%` }}
          />
        </View>
        <XpChip xp={xp} glass />
        {hearts && <LessonHearts view={hearts} />}
      </View>
      {onARun && (
        <Text
          className="mt-1 text-right font-body-bold text-xs uppercase text-sea-deep"
          testID="run-counter"
        >
          {label}
        </Text>
      )}
    </View>
  );
}
