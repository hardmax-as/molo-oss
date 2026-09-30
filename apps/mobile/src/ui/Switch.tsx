import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import { Platform, Switch as RNSwitch, StyleSheet } from "react-native";

import { expoUi, expoUiSwiftUiModifiers } from "./native-ui.ts";
import { colors } from "./theme.ts";

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** The row's visible text. It is also the switch's accessible name — never a bare toggle. */
  label: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * The platform's own switch: a SwiftUI `Toggle` on iOS, a Material 3 `Switch`
 * on Android, and React Native's `Switch` wherever `ExpoUI` is not linked.
 *
 * The wrapper exists so the app never imports `@expo/ui` directly and so the
 * accessible name survives the crossing. The two toolkits label a switch in
 * different places (the library notes): SwiftUI takes an `accessibilityLabel`
 * modifier, Jetpack Compose exposes none, so on Android the name, role and
 * checked state are set on the `Host` view — a React Native view either way.
 */
export function Switch({ value, onValueChange, label, disabled = false, testID }: SwitchProps) {
  const ui = expoUi();
  if (!ui) {
    return (
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.sea, false: colors.cloudDeep }}
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        {...(testID ? { testID } : {})}
      />
    );
  }
  const { Host, Switch: NativeSwitch } = ui;
  const ios = Platform.OS === "ios";
  const swiftUi = ios ? expoUiSwiftUiModifiers() : null;
  const modifiers: ModifierConfig[] = swiftUi ? [swiftUi.accessibilityLabel(label)] : [];
  return (
    <Host
      matchContents
      // Tints the SwiftUI toggle and seeds the Material palette the Compose
      // switch draws its "on" track from, so the control stays sea-green.
      seedColor={colors.sea}
      style={styles.host}
      {...(ios
        ? {}
        : {
            accessible: true,
            accessibilityRole: "switch" as const,
            accessibilityLabel: label,
            accessibilityState: { checked: value, disabled },
          })}
      {...(testID ? { testID } : {})}
    >
      <NativeSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        modifiers={modifiers}
      />
    </Host>
  );
}

/** 44 px keeps the WCAG 2.5.8 target the React Native switch had. */
const styles = StyleSheet.create({ host: { minHeight: 44, justifyContent: "center" } });
