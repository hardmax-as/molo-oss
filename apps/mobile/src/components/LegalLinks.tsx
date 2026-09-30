import { Pressable, Text, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { openLegal } from "~/lib/legal.ts";

function LinkText({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      testID={testID}
      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      className="min-h-9 justify-center"
    >
      <Text className="font-body-semibold text-sm text-indigo underline">{label}</Text>
    </Pressable>
  );
}

/**
 * Privacy policy and terms. `accept` prefixes the sentence used on sign-in
 * and onboarding ("By continuing you accept the … and the …"); without it
 * the two links stand alone, as in settings. Each link is a full-height
 * touch target even though the text is small.
 */
export function LegalLinks({ accept = false }: { accept?: boolean }) {
  const t = useT();
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-1">
      {accept && <Text className="font-body text-sm text-mist">{t("legal.accept")}</Text>}
      <LinkText
        label={t("legal.privacy")}
        onPress={() => void openLegal("privacy")}
        testID="legal-privacy"
      />
      <Text className="font-body text-sm text-mist">{accept ? t("legal.and") : "·"}</Text>
      <LinkText
        label={t("legal.terms")}
        onPress={() => void openLegal("terms")}
        testID="legal-terms"
      />
    </View>
  );
}
