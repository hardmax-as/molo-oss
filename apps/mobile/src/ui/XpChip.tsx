import { Text, View } from "react-native";

import { useCountUp } from "./count-up.ts";
import { Glass } from "./Glass.tsx";
import { useMotion } from "./motion.ts";
import { colors } from "./theme.ts";

/**
 * "+12 XP" chip whose number counts up (800 ms) whenever it grows. `glass`
 * floats it on Liquid Glass (iOS 26) for the lesson strip; elsewhere, and
 * on other platforms, it is the solid pill. `sm` and `align="center"` are for
 * a row of chips (the compact progress strip), where it must match the hearts
 * chip's height and sit on the same centre line.
 */
export function XpChip({
  xp,
  size = "md",
  signed = true,
  tone = "sun",
  glass = false,
  align = "start",
}: {
  xp: number;
  size?: "sm" | "md" | "lg" | "xl";
  signed?: boolean;
  tone?: "sun" | "cloud";
  glass?: boolean;
  align?: "start" | "center";
}) {
  const m = useMotion();
  const shown = useCountUp(xp, undefined, m.reduced);
  const text =
    size === "xl"
      ? "text-5xl"
      : size === "lg"
        ? "text-2xl"
        : size === "sm"
          ? "text-sm"
          : "text-base";
  const pad =
    size === "xl"
      ? "px-6 py-3"
      : size === "lg"
        ? "px-4 py-2"
        : size === "sm"
          ? "px-2 py-0.5"
          : "px-3 py-1";
  const self = align === "center" ? "self-center" : "self-start";
  const bg = tone === "cloud" ? "bg-cloud" : "bg-sun";
  const tint = tone === "cloud" ? colors.cloud : colors.sun;
  const label = `${signed ? "+" : ""}${xp} XP`;
  const inner = (
    <Text className={`font-display-bold text-ink ${text}`}>
      {signed ? "+" : ""}
      {shown} XP
    </Text>
  );
  if (glass) {
    return (
      <Glass
        tint={tint}
        radius={999}
        fallbackStyle={{ backgroundColor: tint }}
        style={{ alignSelf: align === "center" ? "center" : "flex-start" }}
      >
        <View className={pad} accessibilityLabel={label}>
          {inner}
        </View>
      </Glass>
    );
  }
  return (
    <View className={`${self} rounded-full ${bg} ${pad}`} accessibilityLabel={label}>
      {inner}
    </View>
  );
}
