import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import {
  createAnimatedComponent,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useMotion } from "./motion.ts";
import { colors } from "./theme.ts";

const AnimatedCircle = createAnimatedComponent(Circle);

/**
 * Progress is a ring, never a thin bar (docs/DESIGN.md). `value` is 0..1;
 * the arc eases to its new length whenever it changes.
 */
export function ProgressRing({
  value,
  size = 64,
  stroke = 8,
  color = colors.sea,
  track = colors.sandDeep,
  children,
  accessibilityLabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  const m = useMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, value)), { duration: m.reduced ? 0 : 600 });
  }, [value, m.reduced, progress]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">{children}</View>
    </View>
  );
}
