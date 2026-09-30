import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useMotion } from "./motion.ts";

/** A cloud card that rises 12 px and fades in (220 ms, staggered 40 ms per index). */
export function Card({
  children,
  index = 0,
  className = "",
  style,
  tone = "cloud",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "cloud" | "indigo" | "sun" | "sand";
}) {
  const m = useMotion();
  const entering = m.reduced
    ? FadeIn.duration(m.enter)
    : FadeInDown.duration(m.enter)
        .delay(index * m.stagger)
        .withInitialValues({ transform: [{ translateY: 12 }] });
  const bg =
    tone === "indigo"
      ? "bg-indigo"
      : tone === "sun"
        ? "bg-sun"
        : tone === "sand"
          ? "bg-sand-deep"
          : "bg-cloud";
  return (
    <Animated.View
      entering={entering}
      className={`rounded-3xl p-5 ${bg} ${className}`}
      style={[
        {
          shadowColor: "#26264F",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
