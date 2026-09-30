import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "./haptics.ts";
import { expoUiMenu } from "./native-ui.ts";

export interface MenuSelectOption<T extends string> {
  value: T;
  /** Already translated: every string on this screen comes from packages/i18n. */
  label: string;
}

export interface MenuSelectProps<T extends string> {
  /** The name of the field, for the screen reader; the trigger shows the choice. */
  label: string;
  options: readonly MenuSelectOption<T>[];
  selected: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * One choice out of several, where the labels are too long for a segmented
 * control: our own trigger opens the platform's menu — a `UIMenu` on iOS, a
 * Material 3 dropdown on Android — with a checkmark on the current choice.
 *
 * The trigger stays a React Native view on purpose. It keeps our palette and
 * type, and it keeps the accessible name and value under our control, which
 * `@expo/ui`'s own `Picker` does not offer on either platform
 * (the library notes). Without `ExpoUI` the options render as chips, the way
 * this screen chose a language before.
 */
export function MenuSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  testID,
}: MenuSelectProps<T>) {
  const current = options.find((o) => o.value === selected) ?? options[0];
  const module = expoUiMenu();
  if (!module || !current) {
    return (
      <View className="flex-row flex-wrap gap-2" {...(testID ? { testID } : {})}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === selected }}
            onPress={() => {
              void haptic.tap();
              onChange(option.value);
            }}
            className={`min-h-11 justify-center rounded-full border-2 px-4 ${
              option.value === selected ? "border-indigo bg-indigo" : "border-cloud-deep bg-cloud"
            }`}
          >
            <Text
              className={`font-body-bold text-sm ${option.value === selected ? "text-cloud" : "text-ink"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }
  const { MenuView } = module;
  return (
    <MenuView
      actions={options.map((option) => ({
        id: option.value,
        title: option.label,
        state: option.value === selected ? "on" : "off",
      }))}
      onPressAction={({ nativeEvent }) => {
        const next = options.find((o) => o.value === nativeEvent.event);
        if (!next || next.value === selected) return;
        void haptic.tap();
        onChange(next.value);
      }}
      style={styles.trigger}
      {...(testID ? { testID } : {})}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current.label }}
        className="min-h-11 flex-row items-center justify-between gap-2 self-start rounded-full border-2 border-cloud-deep bg-cloud px-4"
      >
        <Text className="font-body-bold text-sm text-ink">{current.label}</Text>
        <Text className="font-body-bold text-sm text-mist">▾</Text>
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({ trigger: { alignSelf: "flex-start" } });
