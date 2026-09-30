import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { expoUi } from "./native-ui.ts";
import { colors } from "./theme.ts";

export interface SheetProps {
  visible: boolean;
  /** The learner swiped it away or tapped the scrim. Treat it as the "later" button. */
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
}

/**
 * A card that comes up from the bottom over what the learner was doing: a
 * SwiftUI sheet with real detents on iOS, a Material 3 `ModalBottomSheet` on
 * Android. Both give the drag-to-dismiss and the scrim that React Native's
 * `Modal` cannot.
 *
 * The two snap points are deliberate. Fitting the sheet to its content clips
 * a card taller than the sheet instead of scrolling it, and a React Native
 * `ScrollView` inside a fit-to-content sheet measures as nothing, so the sheet
 * needs a height of its own: it opens at three quarters and drags up to full,
 * with the card scrolling inside. This is also the one shape Android can
 * honour — its `ModalBottomSheet` has exactly a partial and an expanded state
 * (the library notes), which a fraction below 1 plus `'full'` map onto. The
 * other documented limit: on iOS swipe-dismiss and scrim-tap cannot be
 * separated, so both land on `onDismiss`.
 *
 * Where `ExpoUI` is not linked the children render in place — which is exactly
 * how these cards behaved before, so nothing disappears on a JS-only build.
 */
export function Sheet({ visible, onDismiss, children, testID }: SheetProps) {
  const ui = expoUi();
  if (!ui) return visible ? <View {...(testID ? { testID } : {})}>{children}</View> : null;
  const { BottomSheet, RNHostView } = ui;
  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onDismiss}
      containerColor={colors.cloud}
      contentPadding={{ top: 8, bottom: 20, left: 20, right: 20 }}
      snapPoints={[{ fraction: 0.75 }, "full"]}
      {...(testID ? { testID } : {})}
    >
      {/* The sheet is its own view controller, outside the React Native
          surface, so touches reach React Native content there only through an
          RNHostView. Without it every button in the sheet was drawn but dead
          (library notes). */}
      <RNHostView>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, alignSelf: "stretch" },
  content: { flexGrow: 1, justifyContent: "center" },
});
