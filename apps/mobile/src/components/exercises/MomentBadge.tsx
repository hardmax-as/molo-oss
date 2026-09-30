import type { ExerciseMoment } from "@molo/core/lesson";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";
import { badgeFor } from "~/lib/moment.ts";
import { useMotion } from "~/ui/motion.ts";

/**
 * One line above the prompt saying what kind of moment this is: a word the
 * learner has never met (the sun) or one they have missed before (the
 * coral), per docs/DESIGN.md. What to draw comes from `badgeFor`, which the
 * Jest suite covers; this file only paints it.
 */
export function MomentBadge({ moment }: { moment: ExerciseMoment | null }) {
  const t = useT();
  const m = useMotion();
  const badge = badgeFor(moment);
  if (!badge) return null;
  const sun = badge.tone === "sun";
  return (
    <Animated.View entering={FadeInDown.duration(m.enter)} className="mb-3 flex-row">
      <View
        className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${
          sun ? "bg-sun/20" : "bg-coral/15"
        }`}
        testID="moment-badge"
      >
        <View className={`h-2 w-2 rounded-full ${sun ? "bg-sun" : "bg-coral"}`} />
        <Text
          className={`font-body-bold text-xs uppercase ${sun ? "text-ochre-deep" : "text-coral-deep"}`}
        >
          {t(badge.labelKey)}
        </Text>
      </View>
    </Animated.View>
  );
}
