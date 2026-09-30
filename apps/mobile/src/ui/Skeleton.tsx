import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ScrollView, View, type DimensionValue } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";

import { useMotion } from "./motion.ts";
import { Screen } from "./Screen.tsx";
import { colors } from "./theme.ts";

/**
 * What a learner screen shows in the rare case it has nothing to draw yet
 * (docs/CACHING.md section 2.0): the screen's own shape in quiet blocks, at
 * the sizes the real thing will take, so nothing jumps when it arrives. Most
 * screens never show it — they draw from memory or from the device's copy —
 * so it is the cold path, not the normal one.
 *
 * The blocks breathe together on one slow opacity loop; with reduced motion
 * (the OS setting or the one in Settings) they hold still. A screen reader
 * hears one "Loading" for the whole shape, not a list of empty boxes.
 */

const Pulse = createContext<SharedValue<number> | null>(null);

function usePulse(): SharedValue<number> {
  const m = useMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (m.reduced) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return undefined;
    }
    pulse.value = withRepeat(withTiming(0.55, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [m.reduced, pulse]);
  return pulse;
}

/** One block. Sizes are the real element's, so the screen does not shift when it arrives. */
export function Bone({
  width = "100%",
  height,
  radius = 12,
  tone = "sand",
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  /** `sand` on the sand page, `cloud` inside a card. */
  tone?: "sand" | "cloud";
}) {
  const pulse = useContext(Pulse);
  const style = useAnimatedStyle(() => ({ opacity: pulse ? pulse.value : 1 }));
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tone === "cloud" ? colors.sand : colors.sandDeep,
        },
        style,
      ]}
    />
  );
}

/** The one accessible element of a loading shape, and the loop its blocks share. */
function Shape({ children, testID }: { children: ReactNode; testID?: string }) {
  const t = useT();
  const pulse = usePulse();
  return (
    <Pulse.Provider value={pulse}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t("common.loading")}
        accessibilityState={{ busy: true }}
        className="gap-4"
        {...(testID ? { testID } : {})}
      >
        {children}
      </View>
    </Pulse.Provider>
  );
}

/** A white card as the real ones draw it, holding bones. */
function CardBone({ children, height }: { children?: ReactNode; height?: number }) {
  return (
    <View className="rounded-3xl bg-cloud p-5" style={height ? { minHeight: height } : undefined}>
      {children}
    </View>
  );
}

function UnitCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <CardBone key={i}>
          <View className="flex-row items-center gap-4">
            <Bone width={64} height={64} radius={32} tone="cloud" />
            <View className="flex-1 gap-2">
              <Bone width={56} height={12} radius={6} tone="cloud" />
              <Bone width="70%" height={22} radius={8} tone="cloud" />
            </View>
          </View>
          <View className="mt-4">
            <Bone width={120} height={48} radius={24} tone="cloud" />
          </View>
        </CardBone>
      ))}
    </>
  );
}

/** The greeting and the progress strip, while the app does not yet know who is signed in. */
export function HeaderSkeleton() {
  return (
    <Shape testID="header-loading">
      <Bone width="60%" height={18} radius={9} />
      <Bone height={56} radius={20} />
    </Shape>
  );
}

/** Unit cards on the home screen: the mastery ring, the band and title, and the start button. */
export function UnitCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Shape testID="units-loading">
      <UnitCards count={count} />
    </Shape>
  );
}

/** The whole home screen, before the app knows whether to show it or the welcome flow. */
export function HomeSkeleton() {
  return (
    <ScrollView
      className="flex-1 bg-sand"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 pb-10"
    >
      <Shape testID="home-loading">
        <Bone width="60%" height={18} radius={9} />
        <Bone height={56} radius={20} />
        <Bone width={140} height={28} radius={10} />
        <UnitCards count={3} />
      </Shape>
    </ScrollView>
  );
}

/** Where the path's nodes sit off the spine, in the same four-step S the real path winds. */
const WIND = [0, 56, 0, -56, 0];

/** A unit's stretch of path: the progress strip, the header line with its offline pill, then the winding nodes. */
export function UnitSkeleton() {
  return (
    <View className="flex-1 bg-sand px-5 pt-3">
      <Shape testID="unit-loading">
        <Bone height={40} radius={20} />
        <View className="min-h-11 flex-row items-center justify-between gap-3">
          <Bone width="45%" height={14} radius={7} />
          <Bone width={112} height={36} radius={18} />
        </View>
        <View className="items-center gap-6 pt-4">
          {WIND.map((x, i) => (
            <View key={i} style={{ transform: [{ translateX: x }] }}>
              <Bone width={i === 0 ? 92 : 76} height={i === 0 ? 92 : 76} radius={46} />
            </View>
          ))}
        </View>
      </Shape>
    </View>
  );
}

/** The recall card of the review and mistakes sessions, with its row of answer buttons. */
export function RecallSkeleton({ answers = 4 }: { answers?: number }) {
  return (
    <Screen>
      <Shape testID="recall-loading">
        <View className="flex-row items-center justify-between gap-3">
          <Bone width={64} height={14} radius={7} />
          <Bone width={140} height={14} radius={7} />
          <Bone width={56} height={28} radius={14} />
        </View>
        <CardBone height={280}>
          <View className="flex-row items-center gap-4">
            <Bone width={56} height={56} radius={28} tone="cloud" />
            <View className="flex-1 gap-2">
              <Bone width="60%" height={40} radius={10} tone="cloud" />
            </View>
          </View>
          <View className="mt-auto flex-row gap-2 pt-8">
            {Array.from({ length: answers }, (_, i) => (
              <View key={i} className="flex-1">
                <Bone height={48} radius={24} tone="cloud" />
              </View>
            ))}
          </View>
        </CardBone>
      </Shape>
    </Screen>
  );
}

/** The league: the cohort card, then the standings. */
export function LeagueSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Screen>
      <Shape testID="league-loading">
        <Bone height={150} radius={24} />
        <View className="gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <Bone key={i} height={52} radius={16} />
          ))}
        </View>
      </Shape>
    </Screen>
  );
}
