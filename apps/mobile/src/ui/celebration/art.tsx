import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Path,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { useMotion } from "../motion.ts";
import { colors } from "../theme.ts";

/**
 * The drawings behind the end-of-lesson beats (docs/DESIGN.md "After a
 * lesson"), drawn to match apps/web/src/components/celebration/art.tsx so
 * one product shows one picture. All decorative: the words beside them
 * carry the meaning.
 */

const SPOKES = Array.from({ length: 12 }, (_, i) => i);

/** Sun rays behind the number; they turn slowly unless motion is reduced. */
export function Rays({ size = 272, tone = "sun" }: { size?: number; tone?: "sun" | "sea" }) {
  const m = useMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (m.reduced) return;
    spin.value = withRepeat(
      withTiming(360, { duration: 90_000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [m.reduced, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // Pale, not saturated: mid-opacity sun on deep indigo reads as brown mud,
  // where a near-cream tint reads as shafts of light.
  const colour = tone === "sea" ? "#9FEADC" : "#FFE3A3";
  const id = `celebrationRays${tone}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size }, style]}
    >
      <Svg width={size} height={size} viewBox="-100 -100 200 200">
        <Defs>
          {/* Faded at the rim, so the rays end in light rather than in an edge. */}
          <RadialGradient id={id} cx="0" cy="0" r="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={colour} stopOpacity={0.42} />
            <Stop offset="55%" stopColor={colour} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {SPOKES.map((i) => (
          <Polygon
            key={i}
            points="0,0 -7,-96 7,-96"
            fill={`url(#${id})`}
            opacity={i % 2 === 0 ? 1 : 0.5}
            transform={`rotate(${(i * 360) / SPOKES.length})`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** The milestone medal: a sun disc on a sea ribbon with the round number on it. */
export function Medal({ words, size = 150 }: { words: number; size?: number }) {
  return (
    <View pointerEvents="none">
      <Svg width={size} height={size * (140 / 120)} viewBox="0 0 120 140">
        <Path d="M32 6h20l14 34H46z" fill={colors.sea} />
        <Path d="M88 6H68L54 40h20z" fill={colors.seaDeep} />
        <Circle cx="60" cy="88" r="44" fill={colors.ochre} />
        <Circle cx="60" cy="84" r="42" fill={colors.sun} />
        <Circle
          cx="60"
          cy="84"
          r="33"
          fill="none"
          stroke={colors.ochre}
          strokeWidth="3"
          opacity={0.7}
        />
        <SvgText
          x="60"
          y="84"
          textAnchor="middle"
          fontFamily="Fredoka_700Bold"
          fontSize={words >= 100 ? 30 : 36}
          fill={colors.indigo}
        >
          {String(words)}
        </SvgText>
      </Svg>
    </View>
  );
}

/** The unit crown. `flawless` earns the higher tier: gold instead of sea, and it drops in harder. */
export function Crown({ flawless, size = 170 }: { flawless: boolean; size?: number }) {
  const m = useMotion();
  const drop = useSharedValue(m.reduced ? 1 : 0);
  useEffect(() => {
    if (m.reduced) {
      drop.value = 1;
      return;
    }
    drop.value = withSpring(1, { damping: 11, stiffness: 220 });
  }, [m.reduced, drop]);
  const style = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ scale: 0.5 + drop.value * 0.5 }, { translateY: (1 - drop.value) * -28 }],
  }));
  const body = flawless ? colors.sun : colors.sea;
  const edge = flawless ? colors.ochre : colors.seaDeep;
  return (
    <Animated.View pointerEvents="none" style={style}>
      <Svg width={size} height={size * (110 / 140)} viewBox="0 0 140 110">
        <Path d="M14 88 L4 22l34 26L70 8l32 40 34-26-10 66z" fill={body} />
        <Path d="M14 88h112l3 14H11z" fill={edge} />
        <Circle cx="4" cy="18" r="7" fill={edge} />
        <Circle cx="70" cy="4" r="7" fill={edge} />
        <Circle cx="136" cy="18" r="7" fill={edge} />
        <Circle cx="42" cy="66" r="6" fill={colors.sand} opacity={0.85} />
        <Circle cx="70" cy="60" r="7" fill={colors.sand} opacity={0.85} />
        <Circle cx="98" cy="66" r="6" fill={colors.sand} opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}
