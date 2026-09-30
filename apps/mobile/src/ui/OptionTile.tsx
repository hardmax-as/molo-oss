import { useEffect, type ReactNode } from "react";
import { Pressable, type AccessibilityActionEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { haptic } from "./haptics.ts";
import { useMotion } from "./motion.ts";
import { colors } from "./theme.ts";
import { runTileAction, tileAccessibilityActions, type TilePlayAction } from "./tile-a11y.ts";

export type TileState = "" | "picked" | "right" | "wrong";

/**
 * The feedback motion from docs/DESIGN.md as a hook, so any tile shape can
 * use it: picked lifts slightly, right flashes sea, wrong shakes three
 * times by 6 px. Returns the animated style and the colours to paint.
 */
export function useTileFeedback(state: TileState) {
  const m = useMotion();
  const shake = useSharedValue(0);
  const lift = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (state === "wrong" && !m.reduced) {
      shake.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-4, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
    if (state === "right" && !m.reduced) {
      flash.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0.35, { duration: 500 }),
      );
      lift.value = withSequence(withSpring(1.04, { damping: 8 }), withSpring(1, { damping: 12 }));
    }
    if (state === "picked") lift.value = withSpring(1.02, { damping: 12 });
    if (state === "") lift.value = withSpring(1, { damping: 12 });
  }, [state, m.reduced, shake, lift, flash]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: lift.value === 0 ? 1 : lift.value }],
  }));
  const border =
    state === "right"
      ? colors.sea
      : state === "wrong"
        ? colors.coral
        : state === "picked"
          ? colors.indigo
          : colors.cloudDeep;
  const background = state === "right" ? "#E3F6F1" : state === "wrong" ? "#FCE9E9" : colors.cloud;
  return { style, border, background };
}

/**
 * A big, thumb-sized option with the feedback motion built in. `fill`
 * makes the tile stretch to its parent (rows that must stay aligned).
 */
export function OptionTile({
  state,
  onPress,
  disabled,
  children,
  selected,
  accessibilityLabel,
  className = "",
  fill = false,
  testID,
  playAction,
}: {
  /** The tile's clip, offered to screen readers as a "play" action (see tile-a11y.ts). */
  playAction?: TilePlayAction | undefined;
  state: TileState;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  selected?: boolean;
  accessibilityLabel?: string;
  className?: string;
  fill?: boolean;
  testID?: string;
}) {
  const fb = useTileFeedback(state);
  const press = () => {
    void haptic.tap();
    onPress();
  };
  const actions = tileAccessibilityActions(playAction);
  return (
    <Animated.View style={[fb.style, fill ? { flex: 1 } : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        {...(actions
          ? {
              accessibilityActions: actions,
              onAccessibilityAction: (e: AccessibilityActionEvent) =>
                runTileAction(e.nativeEvent.actionName, {
                  press: () => {
                    if (!disabled) press();
                  },
                  playAction,
                }),
            }
          : {})}
        disabled={disabled}
        testID={testID}
        onPress={press}
        style={{
          borderRadius: 20,
          borderWidth: 2,
          borderBottomWidth: 4,
          borderColor: fb.border,
          backgroundColor: fb.background,
        }}
        className={`min-h-14 px-4 py-4 ${fill ? "flex-1" : ""} ${className}`}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
