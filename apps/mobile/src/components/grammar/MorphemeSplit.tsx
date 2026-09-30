import { displayMorphemes } from "@molo/core";
import { Text, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";

/**
 * A word shown as its parts (docs/GRAMMAR.md section 1). The parts come from
 * the row and are never composed here: a word with nothing segmented is
 * drawn whole, which is honest, rather than split on a guess.
 *
 * VoiceOver would read the boxes as unrelated syllables, so the group takes
 * one label saying the word and then its parts, and the boxes themselves are
 * hidden from the accessibility tree.
 */
export function MorphemeSplit({
  surfaceForm,
  morphemes,
  size = "md",
}: {
  surfaceForm: string;
  morphemes: readonly string[];
  size?: "sm" | "md" | "lg";
}) {
  const t = useT();
  const parts = displayMorphemes(morphemes);
  const text = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size];
  const pad = { sm: "px-1.5 py-0.5", md: "px-2 py-1", lg: "px-3 py-1.5" }[size];

  if (parts.length < 2) {
    return <Text className={`font-display text-indigo ${text}`}>{surfaceForm}</Text>;
  }
  return (
    <View
      className="flex-row flex-wrap items-center gap-1"
      accessible
      accessibilityLabel={t("grammar.morphemes", { word: surfaceForm, parts: parts.join(", ") })}
    >
      {parts.map((part, i) => (
        <View
          key={`${part}-${i}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // The first part is the piece that agrees, the rest is the root:
          // two tones, so the boundary reads without a legend.
          className={`rounded-xl ${pad} ${i === 0 ? "bg-sea-soft" : "bg-sand-deep"}`}
        >
          <Text className={`font-display ${text} ${i === 0 ? "text-sea-deep" : "text-indigo"}`}>
            {part}
          </Text>
        </View>
      ))}
    </View>
  );
}
