import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

import { LegalMarkdown } from "~/components/LegalMarkdown.tsx";
import { useLang, useT } from "~/lib/i18n.tsx";
import { attributions, libraries } from "~/lib/licences.ts";

function Library({ library }: { library: (typeof libraries.libraries)[number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View className="border-b border-mist-soft py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        className="min-h-12 justify-center"
      >
        <Text className="font-body-semibold text-base text-indigo">
          {library.name} {library.version}
        </Text>
        <Text className="font-body text-sm text-mist">{library.licence}</Text>
      </Pressable>
      {expanded &&
        library.notices.map((notice, i) => (
          <Text selectable key={i} className="mt-3 font-body text-xs text-ink">
            {notice.text}
          </Text>
        ))}
    </View>
  );
}

export default function Licences() {
  const { lang } = useLang();
  const t = useT();
  const [search, setSearch] = useState("");
  const matches = libraries.libraries.filter((library) =>
    library.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <FlatList
      className="flex-1 bg-sand"
      contentContainerClassName="p-5 pb-12"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      data={matches}
      keyExtractor={(library) => `${library.name}@${library.version}`}
      renderItem={({ item }) => <Library library={item} />}
      ListHeaderComponent={
        <View className="gap-4">
          <LegalMarkdown source={attributions.markdown[lang]} />
          <Text accessibilityRole="header" className="mt-4 font-display text-xl text-indigo">
            {t("licences.libraries")}
          </Text>
          <TextInput
            accessibilityLabel={t("licences.search")}
            placeholder={t("licences.search")}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-xl border border-mist-soft p-3 font-body text-ink"
            testID="licences-search"
          />
        </View>
      }
      ListEmptyComponent={
        <Text className="py-4 font-body text-ink">{t("licences.noResults")}</Text>
      }
    />
  );
}
