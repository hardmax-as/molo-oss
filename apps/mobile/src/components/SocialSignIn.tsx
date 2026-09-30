import type { SocialProvider } from "@molo/core";
import * as AppleAuthentication from "expo-apple-authentication";
import { Text, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";

/** What went wrong with the last social attempt, shown under the button that was tapped. */
export interface SocialProblem {
  provider: SocialProvider;
  message: string;
}

/**
 * Apple and Google buttons with their own error slot directly below them, so
 * a refusal appears where the learner tapped rather than off-screen at the
 * top of the form (TestFlight 0.0.3: the no-account card rendered above the
 * fold while the buttons sat below it, and the learner saw nothing).
 */
export function SocialSignIn({
  signup,
  busy,
  show,
  problem,
  onPress,
}: {
  signup: boolean;
  busy: boolean;
  show: Record<SocialProvider, boolean>;
  problem: SocialProblem | null;
  onPress: (provider: SocialProvider) => void;
}) {
  const t = useT();
  return (
    <View className="gap-3">
      {show.apple && (
        // Apple's own button: the App Store expects it wherever Sign in with Apple is offered.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            signup
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={16}
          style={{ height: 52, width: "100%", opacity: busy ? 0.6 : 1 }}
          onPress={() => {
            if (!busy) onPress("apple");
          }}
          testID="sign-in-apple"
        />
      )}
      {show.google && (
        <Button
          label={t("auth.withGoogle")}
          variant="cloud"
          size="lg"
          full
          disabled={busy}
          icon={<Text className="font-display-bold text-xl text-indigo">G</Text>}
          onPress={() => onPress("google")}
          testID="sign-in-google"
        />
      )}
      {problem && (
        // Android reads the live region; iOS gets an explicit announcement from the screen.
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="gap-3 rounded-2xl bg-sand p-4"
          testID="social-error"
        >
          <Text className="font-body-semibold text-base text-ink">{problem.message}</Text>
        </View>
      )}
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-cloud-deep" />
        <Text className="font-body-semibold text-sm text-mist">{t("auth.or")}</Text>
        <View className="h-px flex-1 bg-cloud-deep" />
      </View>
    </View>
  );
}
