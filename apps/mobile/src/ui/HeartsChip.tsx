import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

import { heartsLabel, type HeartsState } from "~/lib/hearts-format.ts";
import { useT } from "~/lib/i18n.tsx";
import { usePlus } from "~/lib/plus.tsx";
import { Glass } from "~/ui/Glass.tsx";
import { haptic } from "~/ui/haptics.ts";
import { colors } from "~/ui/theme.ts";

/**
 * Heart count for the strip; infinity for Plus. Tapping opens the Plus screen.
 * `glass` renders the chip as an interactive Liquid Glass pill (iOS 26) when
 * it stands on its own rather than inside the glass strip.
 */
export function HeartsChip({
  state,
  size = "md",
  glass = false,
}: {
  state: HeartsState;
  size?: "sm" | "md";
  glass?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { localPlus } = usePlus();
  const unlimited = state.unlimited || localPlus;
  const label = heartsLabel(state, localPlus);
  const empty = !unlimited && state.hearts === 0;
  const text = unlimited ? "text-sun" : empty ? "text-cloud" : "text-coral-deep";
  const bg = unlimited ? "bg-indigo" : empty ? "bg-coral-deep" : "bg-coral/15";
  const tint = unlimited ? colors.indigo : empty ? colors.coralDeep : "rgba(232, 93, 93, 0.15)";
  const chip = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unlimited
          ? t("hearts.unlimited")
          : t("hearts.count", { hearts: state.hearts, max: state.max })
      }
      onPress={() => {
        void haptic.tap();
        router.push("/plus");
      }}
      className={`flex-row items-center gap-1 rounded-full px-2 ${size === "sm" ? "py-0.5" : "py-1"} ${glass ? "" : bg}`}
      testID="hearts-chip"
    >
      <Text className={`${size === "sm" ? "text-sm" : "text-base"} ${text}`}>♥</Text>
      <Text className={`font-display-bold ${size === "sm" ? "text-sm" : "text-base"} ${text}`}>
        {label}
      </Text>
    </Pressable>
  );
  if (!glass) return chip;
  return (
    <Glass interactive tint={tint} radius={999} fallbackStyle={{ backgroundColor: tint }}>
      {chip}
    </Glass>
  );
}
