import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";

import { Button } from "./Button.tsx";
import { useMotion } from "./motion.ts";
import { confettiPalette } from "./theme.ts";

function RingDot({ i, total }: { i: number; total: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      200 + i * 30,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [i, t]);
  const angle = (i / total) * Math.PI * 2;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value * 0.8,
    transform: [
      { translateX: Math.cos(angle) * 40 * (1 + t.value * 2.2) },
      { translateY: Math.sin(angle) * 40 * (1 + t.value * 2.2) },
      { scale: 1 - t.value * 0.5 },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: confettiPalette[i % confettiPalette.length],
        },
        style,
      ]}
    />
  );
}

/** Full-screen indigo sky; the new level scales in with a ring of particles (docs/DESIGN.md). */
export function LevelUp({ level, onClose }: { level: number; onClose: () => void }) {
  const t = useT();
  const m = useMotion();
  const pulse = useSharedValue(0.6);
  useEffect(() => {
    pulse.value = withSpring(1, { damping: 8, stiffness: 120 });
  }, [pulse]);
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View
      entering={FadeIn.duration(m.enter)}
      exiting={FadeOut.duration(150)}
      className="absolute inset-0 items-center justify-center bg-indigo px-8"
      style={{ zIndex: 60 }}
      accessibilityViewIsModal
    >
      <Pressable
        className="absolute inset-0"
        onPress={onClose}
        accessibilityLabel={t("common.close")}
      />
      <View className="items-center">
        <View className="h-40 w-40 items-center justify-center">
          {m.particles &&
            Array.from({ length: 14 }, (_, i) => <RingDot key={i} i={i} total={14} />)}
          <Animated.View entering={ZoomIn.duration(400)} style={numberStyle}>
            <Text className="font-display-bold text-8xl text-sun">{level}</Text>
          </Animated.View>
        </View>
        <Text className="mt-4 font-display text-3xl text-cloud">{t("gamification.levelUp")}</Text>
        <Text className="mb-8 mt-2 text-center font-body text-base text-cloud/80">
          {t("gamification.levelUpBody", { level })}
        </Text>
        <Button label={t("lesson.continue")} variant="sun" size="lg" onPress={onClose} />
      </View>
    </Animated.View>
  );
}
