import type { ReactNode } from "react";
import { ScrollView } from "react-native";

/**
 * Root of every tab screen, including loading, empty and error states: a
 * ScrollView that starts under the transparent large-title header (the
 * inset adjustment is what lets the title collapse) and ends above the tab
 * bar. Plain Views placed here would sit under the header instead, and a
 * field inside one would end up behind the keyboard.
 */
export function Screen({
  children,
  gap = "gap-4",
  testID,
}: {
  children: ReactNode;
  gap?: "gap-4" | "gap-6";
  testID?: string;
}) {
  return (
    <ScrollView
      className="flex-1 bg-sand"
      contentInsetAdjustmentBehavior="automatic"
      // A focused field inside a tab screen (the delete-account confirm, say)
      // must clear the keyboard; iOS does it from the scroll insets.
      automaticallyAdjustKeyboardInsets
      contentContainerClassName={`p-5 pb-12 ${gap}`}
      keyboardShouldPersistTaps="handled"
      {...(testID ? { testID } : {})}
    >
      {children}
    </ScrollView>
  );
}
