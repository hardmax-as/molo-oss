import { Pressable, Text, View } from "react-native";

/**
 * The onboarding's step counter and Skip. It sits above the slides in the
 * z-order (MOL-66): on the first slide the sunbird, the title and the
 * greeting are tall enough to spill out of the centred slide on a phone,
 * and anything drawn later in the tree takes the touch. The slide area
 * now clips as well, so this is belt and braces.
 */
export function OnboardingHeader({
  stepLabel,
  skipLabel,
  onSkip,
}: {
  stepLabel: string;
  skipLabel: string;
  onSkip: () => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between px-5 py-2"
      style={{ zIndex: 10, elevation: 10 }}
    >
      <Text className="font-body-semibold text-sm text-mist">{stepLabel}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onSkip}
        hitSlop={8}
        className="min-h-11 justify-center px-3"
        testID="onboarding-skip"
      >
        <Text className="font-body-bold text-base text-indigo">{skipLabel}</Text>
      </Pressable>
    </View>
  );
}
