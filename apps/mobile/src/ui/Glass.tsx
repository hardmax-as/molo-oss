import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

/**
 * True on iOS 26+ built with the glass API. Everywhere else `Glass` renders
 * the caller's fallback (a solid card), so nothing here changes on Android
 * or older iOS. Evaluated once: availability does not change at runtime.
 */
export const liquidGlass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

/**
 * A Liquid Glass surface with a palette tint (docs/DESIGN.md), or the
 * fallback style when glass is unavailable. `interactive` is for tappable
 * chips only: it adds the press highlight the system gives glass buttons.
 * Never fade a GlassView out with `opacity: 0`; unmount it instead.
 */
export function Glass({
  tint,
  interactive = false,
  radius = 24,
  style,
  fallbackStyle,
  children,
  testID,
}: {
  tint?: string;
  interactive?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  if (!liquidGlass) {
    return (
      <View
        style={[{ borderRadius: radius, overflow: "hidden" }, fallbackStyle, style]}
        {...(testID ? { testID } : {})}
      >
        {children}
      </View>
    );
  }
  return (
    <GlassView
      glassEffectStyle="regular"
      isInteractive={interactive}
      style={[{ borderRadius: radius }, style]}
      {...(tint ? { tintColor: tint } : {})}
      {...(testID ? { testID } : {})}
    >
      {children}
    </GlassView>
  );
}
