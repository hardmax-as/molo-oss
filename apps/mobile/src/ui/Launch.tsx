import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";
import { Sunbird } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";

/**
 * The app's first second. The native splash (expo-splash-screen, the same
 * artwork) hides as soon as the fonts are ready, and this takes over on the
 * same sand background: the sunbird arrives, the wordmark settles, the whole
 * thing lifts off. The web app does the same in apps/web/src/components/Launch.tsx.
 *
 * Three rules keep it from being in the way:
 *
 * - `pointerEvents="none"`, so a learner who knows where they are going is
 *   never blocked by it;
 * - once per launch, not once per screen — the flag is module scope, which
 *   in React Native means "for the life of this JS runtime", so coming back
 *   from the background does not replay it;
 * - nothing at all when the OS asks for reduced motion (docs/DESIGN.md).
 */
let greeted = false;

const HOLD_MS = 820;

export function Launch({ force = false }: { force?: boolean } = {}) {
  const t = useT();
  const m = useMotion();
  // `force` is the developer gallery replaying the greeting on demand; the
  // app itself never passes it, so the once-per-launch rule is untouched.
  const [visible, setVisible] = useState(() => force || (!greeted && !m.reduced));
  const y = useSharedValue(28);
  const scale = useSharedValue(0.86);
  const wordmark = useSharedValue(0);

  useEffect(() => {
    // Even when it is skipped, the app has been launched once: a learner who
    // turns reduce-motion off mid-session should not get a greeting for it.
    if (!force) greeted = true;
    if (!visible) return;
    y.value = withSpring(0, { damping: 14, stiffness: 180, mass: 0.7 });
    scale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.7 });
    wordmark.value = withDelay(
      160,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
    const id = setTimeout(() => setVisible(false), HOLD_MS);
    return () => clearTimeout(id);
  }, [visible, force, y, scale, wordmark]);

  const birdStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: scale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 10 }],
  }));

  if (!visible) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(340)}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-sand"
      accessibilityRole="progressbar"
      accessibilityLabel={t("a11y.launch")}
      testID="launch"
    >
      <Animated.View style={birdStyle}>
        <Sunbird pose="hello" size={160} animate={false} />
      </Animated.View>
      <Animated.View style={wordStyle}>
        <View>
          <Text className="font-display-bold text-4xl text-indigo">{t("app.name")}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
