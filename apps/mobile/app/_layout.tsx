import { QueryClientProvider } from "@tanstack/react-query";
import { setAudioModeAsync } from "expo-audio";
import { usePathname, useRootNavigationState } from "expo-router";
import { DefaultTheme, router, Stack, ThemeProvider } from "expo-router";

// NativeWind: the Tailwind layers are registered by importing the stylesheet for its side effect.
// oxlint-disable-next-line import/no-unassigned-import
import "../global.css";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AgeGate } from "~/components/AgeStep.tsx";
import { PreviewBanner } from "~/components/EditorPreview.tsx";
import { hydrateKnobs, KnobsBanner } from "~/dev/knobs.tsx";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { showAgeStep } from "~/lib/age-step.ts";
import { useSyncGuestProgress } from "~/lib/guest-sync.tsx";
import { useT } from "~/lib/i18n.tsx";
import { I18nProvider } from "~/lib/i18n.tsx";
import { closeModal } from "~/lib/modal-close.ts";
import { ModesProvider } from "~/lib/modes.tsx";
import { PlusProvider } from "~/lib/plus.tsx";
import { PrefsProvider } from "~/lib/prefs.tsx";
import { configurePurchases } from "~/lib/purchases.ts";
import { PushProvider, usePushDeepLink } from "~/lib/push.tsx";
import { createQueryClient } from "~/lib/query-client.ts";
import { initSentry, wrapWithSentry } from "~/lib/sentry.ts";
import { useMe } from "~/lib/session.tsx";
import { usePreview } from "~/lib/use-preview.ts";
import { useAppFonts } from "~/ui/fonts.ts";
import { Launch } from "~/ui/Launch.tsx";
import { SfxProvider } from "~/ui/sfx.tsx";
import { modalOptions, stackOptions } from "~/ui/stack-options.ts";
import { colors } from "~/ui/theme.ts";
import { ToastProvider } from "~/ui/Toast.tsx";

initSentry();
// RevenueCat: a no-op until EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY exist (docs/MONETISATION.md).
configurePurchases();
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * The navigation theme paints every native container (tab content, header
 * fallbacks, modal sheets) in the palette, so nothing flashes white while a
 * screen mounts.
 */
const theme: typeof DefaultTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    primary: colors.indigo,
    background: colors.sand,
    card: colors.sand,
    text: colors.ink,
    border: colors.cloudDeep,
    notification: colors.coral,
  },
};

/** "Close" in the modal bar: sheets can be swiped away, but a visible way out is expected too. */
function CloseButton() {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
      onPress={() => closeModal(router)}
      hitSlop={8}
      className="min-h-11 justify-center px-1"
      testID="modal-close"
    >
      <Text className="font-body-bold text-base text-indigo">{t("common.close")}</Text>
    </Pressable>
  );
}

/** Root stack: the tabs, first-run onboarding, and the sign-in and Plus modals. */
function Screens() {
  const t = useT();
  // Lessons finished as a guest follow the learner onto their new account, once.
  const preview = usePreview();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (navigation?.key && preview.enabled && pathname !== "/preview") router.replace("/preview");
  }, [navigation?.key, preview.enabled, pathname]);
  // A tapped streak reminder opens the review tab.
  usePushDeepLink();
  const me = useMe();
  const gated = showAgeStep(me.data);
  return (
    <View style={{ flex: 1 }}>
      <PreviewBanner />
      {!preview.enabled && <GuestSync />}
      {/* Hidden from screen readers while the age step covers it. */}
      <View
        style={{ flex: 1 }}
        importantForAccessibility={gated ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={gated}
      >
        <Stack screenOptions={stackOptions}>
          <Stack.Screen name="preview" options={{ title: t("preview.switch") }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="plus"
            options={{
              ...modalOptions,
              title: t("plus.title"),
              headerRight: () => <CloseButton />,
            }}
          />
          <Stack.Screen
            name="auth"
            options={{
              ...modalOptions,
              title: t("auth.signIn"),
              headerRight: () => <CloseButton />,
            }}
          />
          {/* The developer gallery. The screens themselves refuse to render
          without `useDevAccess()`, so a learner on a release build has
          nothing to reach even if a deep link points here. */}
          <Stack.Screen name="dev/index" options={{ title: DEV_STRINGS.title }} />
          <Stack.Screen name="dev/knobs" options={{ title: DEV_STRINGS.knobs.title }} />
          <Stack.Screen name="dev/[id]" options={{ headerLargeTitle: false, title: "" }} />
        </Stack>
      </View>
      {/* A one-tap Apple/Google account gives its birth year and country before
          anything else; the API refuses everything else until it has. */}
      <AgeGate />
    </View>
  );
}

function RootLayout() {
  // Content cache times and the learner-state rules: src/lib/query-client.ts.
  const [queryClient] = useState(createQueryClient);
  const fontsReady = useAppFonts();
  useEffect(() => {
    // Pronunciation is the product: play even with the ringer switch off.
    void setAudioModeAsync({ playsInSilentMode: true });
    // The developer knobs, read once so every later read is synchronous. On
    // a release build with no `admin` account this resolves to "nothing
    // overridden" and never applies anything (`~/dev/knobs.tsx`).
    void hydrateKnobs();
  }, []);
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <PrefsProvider>
            <ModesProvider>
              <PlusProvider>
                <PushProvider>
                  <SfxProvider>
                    <ToastProvider>
                      <ThemeProvider value={theme}>
                        <StatusBar style="dark" />
                        <Screens />
                        {/* The native splash hands over to this; it lifts off
                            on its own and never takes a tap with it. */}
                        <Launch />
                        {/* Renders only while a developer override is on. */}
                        <KnobsBanner />
                      </ThemeProvider>
                    </ToastProvider>
                  </SfxProvider>
                </PushProvider>
              </PlusProvider>
            </ModesProvider>
          </PrefsProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default wrapWithSentry(RootLayout);

function GuestSync() {
  useSyncGuestProgress();
  return null;
}
