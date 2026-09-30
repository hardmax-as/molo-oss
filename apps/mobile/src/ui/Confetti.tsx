import { useEffect, useMemo } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useMotion } from "./motion.ts";
import { confettiPalette } from "./theme.ts";

interface Particle {
  readonly color: string;
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
  readonly spin: number;
  readonly delay: number;
  readonly round: boolean;
}

/** Deterministic per index so a burst looks the same twice; no Math.random in render. */
export function makeParticles(count: number, seed = 7): Particle[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, (_, i) => ({
    color: confettiPalette[i % confettiPalette.length] ?? "#fff",
    angle: -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.4,
    distance: 140 + rand() * 220,
    size: 6 + rand() * 8,
    spin: (rand() - 0.5) * 720,
    delay: rand() * 120,
    round: rand() > 0.6,
  }));
}

function Piece({
  p,
  burst,
  originX,
  originY,
}: {
  p: Particle;
  burst: number;
  originX: number;
  originY: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (burst === 0) return;
    t.value = 0;
    t.value = withDelay(
      p.delay,
      withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );
  }, [burst, p.delay, t]);
  const style = useAnimatedStyle(() => {
    const dx = Math.cos(p.angle) * p.distance * t.value;
    // Up first, then gravity pulls it down.
    const dy = Math.sin(p.angle) * p.distance * t.value + 260 * t.value * t.value;
    return {
      opacity: t.value === 0 ? 0 : 1 - Math.max(0, t.value - 0.7) / 0.3,
      transform: [{ translateX: dx }, { translateY: dy }, { rotate: `${p.spin * t.value}deg` }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: originX,
          top: originY,
          width: p.size,
          height: p.round ? p.size : p.size * 0.6,
          borderRadius: p.round ? p.size / 2 : 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

/**
 * A Reanimated confetti burst. Bump `burst` to fire; nothing renders until
 * then. Skipped entirely when the OS asks for reduced motion.
 */
export function Confetti({ burst, count = 36 }: { burst: number; count?: number }) {
  const m = useMotion();
  const particles = useMemo(() => makeParticles(count), [count]);
  const { width, height } = Dimensions.get("window");
  if (!m.particles || burst === 0) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0" style={{ zIndex: 50 }}>
      {particles.map((p, i) => (
        <Piece key={i} p={p} burst={burst} originX={width / 2} originY={height * 0.45} />
      ))}
    </View>
  );
}
