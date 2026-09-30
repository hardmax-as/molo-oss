import type { ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { haptic } from "./haptics.ts";
import { colors, timing } from "./theme.ts";

export type ButtonVariant = "sun" | "sea" | "indigo" | "cloud" | "coral" | "ghost";

const faces: Record<ButtonVariant, { bg: string; edge: string; text: string }> = {
  sun: { bg: colors.sun, edge: colors.sunDeep, text: colors.ink },
  // White text sits on the deep faces, never on the base swatch (WCAG 1.4.3).
  sea: { bg: colors.seaDeep, edge: colors.seaEdge, text: colors.cloud },
  indigo: { bg: colors.indigo, edge: colors.indigoDeep, text: colors.cloud },
  cloud: { bg: colors.cloud, edge: colors.cloudDeep, text: colors.ink },
  coral: { bg: colors.coralDeep, edge: colors.coralEdge, text: colors.cloud },
  ghost: { bg: "transparent", edge: "transparent", text: colors.indigo },
};

const EDGE = 3;

/**
 * The docs/DESIGN.md button: rounded-2xl, a 3 px darker bottom edge that
 * collapses on press (scale 0.97, 90 ms). Big enough for a thumb.
 */
export function Button({
  label,
  onPress,
  variant = "sun",
  disabled = false,
  size = "md",
  full = false,
  icon,
  style,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const face = faces[variant];
  const pressed = useSharedValue(0);
  const inner = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * EDGE }, { scale: 1 - pressed.value * 0.03 }],
  }));
  const pad = size === "lg" ? "px-6 py-4" : size === "sm" ? "px-3 py-2" : "px-5 py-3";
  const textSize = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: timing.press });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: timing.press });
      }}
      onPress={() => {
        void haptic.tap();
        onPress();
      }}
      style={[{ opacity: disabled ? 0.45 : 1, alignSelf: full ? "stretch" : "flex-start" }, style]}
    >
      <View style={{ backgroundColor: face.edge, borderRadius: 16, paddingBottom: EDGE }}>
        <Animated.View
          style={[
            { backgroundColor: face.bg, borderRadius: 16 },
            // A white face on a white card would be invisible but for the
            // bottom lip, which reads as a cut-off box: give it an outline.
            variant === "cloud"
              ? { borderWidth: 1, borderColor: colors.cloudDeep }
              : { borderWidth: 0 },
            inner,
          ]}
          className={`flex-row items-center justify-center gap-2 ${pad}`}
        >
          {icon}
          <Text className={`font-display ${textSize}`} style={{ color: face.text }}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}
