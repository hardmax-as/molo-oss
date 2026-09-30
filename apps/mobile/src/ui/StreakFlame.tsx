import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { useMotion } from "./motion.ts";
import { colors } from "./theme.ts";

/**
 * The streak flame with a living flicker (2 s loop). `alive` is a streak
 * with today's activity; `atRisk` is a streak the learner has not extended
 * yet today (coral); zero is a grey ember. `pop` bumps the flame when the
 * day count grows.
 */
export function StreakFlame({
  size = 28,
  alive,
  atRisk = false,
  pop = 0,
}: {
  size?: number;
  alive: boolean;
  atRisk?: boolean;
  pop?: number;
}) {
  const m = useMotion();
  const flicker = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!alive || m.reduced) {
      flicker.value = 1;
      return;
    }
    flicker.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.94, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.03, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [alive, m.reduced, flicker]);
  useEffect(() => {
    if (pop === 0) return;
    scale.value = withSequence(withSpring(1.35, { damping: 6 }), withSpring(1, { damping: 10 }));
  }, [pop, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: flicker.value }, { scale: scale.value }],
  }));
  const fill = !alive ? colors.mistSoft : atRisk ? colors.coral : colors.sun;
  const core = !alive ? colors.cloudDeep : atRisk ? colors.coralDeep : colors.ochre;
  return (
    <Animated.View style={[{ width: size, height: size, transformOrigin: "50% 100%" }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 2c1 4 5 5 5 10.5A5 5 0 0 1 7 12.5c0-1.5.5-2.5 1.2-3.5.3 1.5 1.3 2.5 2.3 2.5C11.5 8 9.5 5 12 2z"
          fill={fill}
        />
        <Path d="M12 11c.8 2 2.5 2.5 2.5 5a2.5 2.5 0 0 1-5 0c0-1.7 1.4-2.2 2.5-5z" fill={core} />
      </Svg>
    </Animated.View>
  );
}
