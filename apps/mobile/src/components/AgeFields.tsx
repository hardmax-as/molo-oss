import { Text, TextInput, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { MenuSelect } from "~/ui/MenuSelect.tsx";
import { Switch } from "~/ui/Switch.tsx";

export interface AgeFieldsValue {
  birthYear: string;
  country: string;
  ageReached: boolean;
}

export function AgeFields({
  value,
  onChange,
}: {
  value: AgeFieldsValue;
  onChange: (value: AgeFieldsValue) => void;
}) {
  const t = useT();
  const minimum = value.country === "ZA" ? 18 : 13;
  const boundary =
    value.country !== "" && Number(value.birthYear) === new Date().getUTCFullYear() - minimum;
  return (
    <View className="gap-3">
      <Text className="font-display-bold text-lg text-indigo">{t("age.title")}</Text>
      <Text className="font-body text-xs text-mist">{t("age.privacy")}</Text>
      <Text className="font-body-semibold text-sm text-mist">{t("age.birthYear")}</Text>
      <TextInput
        value={value.birthYear}
        onChangeText={(birthYear) => onChange({ ...value, birthYear, ageReached: false })}
        keyboardType="number-pad"
        maxLength={4}
        autoComplete="birthdate-year"
        accessibilityLabel={t("age.birthYear")}
        testID="birth-year"
        className="min-h-12 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3 font-body text-base text-ink"
      />
      <Text className="font-body-semibold text-sm text-mist">{t("age.country")}</Text>
      <MenuSelect
        label={t("age.country")}
        selected={value.country}
        onChange={(country) => onChange({ ...value, country, ageReached: false })}
        options={[
          { value: "", label: t("age.chooseCountry") },
          { value: "ZA", label: t("age.southAfrica") },
          { value: "NO", label: t("age.norway") },
          { value: "OTHER", label: t("age.otherCountry") },
        ]}
        testID="country"
      />
      {boundary && (
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 font-body text-sm text-ink">
            {t("age.confirmAge", { age: minimum })}
          </Text>
          <Switch
            label={t("age.confirmAge", { age: minimum })}
            value={value.ageReached}
            onValueChange={(ageReached) => onChange({ ...value, ageReached })}
            testID="age-reached"
          />
        </View>
      )}
    </View>
  );
}
