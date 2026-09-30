import type { GrammarNoteView } from "@molo/core";
import { createContext, useContext, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";

/**
 * The correction that names the pattern after a wrong answer
 * (docs/GRAMMAR.md section 1).
 *
 * Carried in context for the same reason the exercise id is: only the runner
 * knows which rule this lesson drills, and only the check bar needs it, so
 * none of the ten exercise widgets is touched.
 *
 * It renders **inside the bar**, which is already
 * `accessibilityLiveRegion="polite"`, so the verdict and the pattern are one
 * announcement rather than two, and it adds no pressable, so the bar's
 * scroll-to-Continue behaviour is unchanged.
 */
const PatternContext = createContext<GrammarNoteView | null>(null);

export function CurrentPattern({
  note,
  children,
}: {
  note: GrammarNoteView | null;
  children: ReactNode;
}) {
  return <PatternContext.Provider value={note}>{children}</PatternContext.Provider>;
}

export function useCurrentPattern(): GrammarNoteView | null {
  return useContext(PatternContext);
}

/** Under "Not quite." Both lines are the note's own published text. */
export function PatternCorrection({ onDark = false }: { onDark?: boolean }) {
  const t = useT();
  const note = useCurrentPattern();
  if (!note) return null;
  const fg = onDark ? "text-cloud" : "text-ink";
  return (
    <View className="mt-2" testID="grammar-correction">
      <Text className={`font-body-semibold text-xs uppercase opacity-70 ${fg}`}>
        {t("grammar.patternLabel")}
      </Text>
      <Text className={`font-display text-base ${fg}`}>{note.title}</Text>
      {note.correction !== "" && (
        <Text className={`mt-0.5 font-body text-sm ${fg}`}>{note.correction}</Text>
      )}
    </View>
  );
}
