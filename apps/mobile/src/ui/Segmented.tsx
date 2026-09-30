import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "./haptics.ts";
import { expoUiSegmentedControl, segmentIndex, segmentValue } from "./native-ui.ts";
import { colors } from "./theme.ts";

export interface SegmentedOption<T extends string> {
  value: T;
  /** Already translated: every string on this screen comes from packages/i18n. */
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  selected: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * A one-of-few choice: a `UISegmentedControl` on iOS, a Material 3 segmented
 * button row on Android, and our chips wherever `ExpoUI` is not linked.
 *
 * Two or three short options only — a segmented control divides its width
 * evenly, so long labels shrink to nothing. Use {@link MenuSelect} beyond that.
 */
export function Segmented<T extends string>({
  options,
  selected,
  onChange,
  testID,
}: SegmentedProps<T>) {
  const values = options.map((o) => o.value);
  const module = expoUiSegmentedControl();
  if (!module) {
    return (
      <View className="flex-row gap-2" {...(testID ? { testID } : {})}>
        {options.map((option) => (
          <Chip
            key={option.value}
            active={option.value === selected}
            label={option.label}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    );
  }
  const { SegmentedControl } = module;
  return (
    <SegmentedControl
      values={options.map((o) => o.label)}
      selectedIndex={segmentIndex(values, selected)}
      // `onValueChange` hands back the label; the index is the only thing that
      // maps back to our value without matching translated strings.
      onChange={({ nativeEvent }) => {
        const next = segmentValue(values, nativeEvent.selectedSegmentIndex);
        if (next === null || next === selected) return;
        void haptic.tap();
        onChange(next);
      }}
      // Android and web only; iOS segmented pickers take the host's tint.
      tintColor={colors.sun}
      style={styles.control}
      {...(testID ? { testID } : {})}
    />
  );
}

/** The fallback segment: the pill this screen used before `@expo/ui`. */
function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        void haptic.tap();
        onPress();
      }}
      className={`min-h-11 justify-center rounded-full border-2 px-4 ${active ? "border-indigo bg-indigo" : "border-cloud-deep bg-cloud"}`}
    >
      <Text className={`font-body-bold text-sm ${active ? "text-cloud" : "text-ink"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ control: { minHeight: 44 } });
