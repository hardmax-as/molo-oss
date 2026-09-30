import type { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { Platform } from "react-native";

import { colors, fonts } from "./theme.ts";

type StackScreenOptions = Exclude<
  NonNullable<ComponentProps<typeof Stack>["screenOptions"]>,
  (...args: never[]) => unknown
>;

/**
 * Native stack headers the way iOS 26 draws them: a transparent bar the
 * system renders in Liquid Glass, a large title that collapses on scroll and
 * the bare chevron as back button. On iOS 18 and earlier the blur effect
 * stands in for the glass. The header background otherwise comes from the
 * navigation theme's `card` colour (sand), which is what Android and modals
 * show. Screens that scroll need `contentInsetAdjustmentBehavior="automatic"`
 * on their ScrollView so content starts under the header and the large title
 * collapses.
 */
/** iOS 26 and later draw Liquid Glass; older iOS gets the blur fallbacks. */
export const liquidGlassOS =
  Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;

export const stackOptions: StackScreenOptions = {
  headerLargeTitle: true,
  headerTransparent: Platform.OS === "ios",
  // On iOS 26 the header already has the system scroll-edge effect; adding a blur on top overlaps it.
  ...(Platform.OS === "ios" && !liquidGlassOS
    ? { headerBlurEffect: "systemChromeMaterialLight" as const }
    : {}),
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerTintColor: colors.indigo,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 18, color: colors.indigo },
  headerLargeTitleStyle: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.indigo },
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.sand },
};

/** Modals (sign-in, Plus) keep a compact opaque header in the sand colour. */
export const modalOptions: StackScreenOptions = {
  presentation: "modal",
  headerLargeTitle: false,
  headerTransparent: false,
};
