import {
  ageEligibility,
  registrationCountry,
  SOCIAL_PROVIDER_NAMES,
  type SocialProvider,
} from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { AgeFields } from "~/components/AgeFields.tsx";
import { LegalLinks } from "~/components/LegalLinks.tsx";
import { SocialSignIn, type SocialProblem } from "~/components/SocialSignIn.tsx";
import { useAnnounce } from "~/lib/announce.ts";
import { getAuthProviders } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";
import { flushPendingOnboarding } from "~/lib/onboarding.ts";
import { visibleSocialProviders } from "~/lib/social-auth-logic.ts";
import { signInWithApple, signInWithGoogle, socialErrorMessage } from "~/lib/social-auth.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Sunbird } from "~/ui/Mascots.tsx";
import { colors } from "~/ui/theme.ts";
import { useToast } from "~/ui/Toast.tsx";

type Mode = "signin" | "signup";
type Provider = SocialProvider;

/**
 * Sign in: Apple and Google when the server has their credentials
 * (`GET /auth/providers`), then email + password. `?mode=signup` opens the
 * form on the create-account side. Lessons finished as a guest are replayed
 * onto the account by the root layout once the session appears.
 */
export default function AuthScreen() {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [age, setAge] = useState(() => ({
    birthYear: "",
    country: registrationCountry(getLocales()[0]?.regionCode) as string,
    ageReached: false,
  }));
  const ageDeclaration = { ...age, birthYear: Number(age.birthYear) };
  function validateAge() {
    const result = ageEligibility(ageDeclaration);
    if (!result.ok) throw new Error(t(`age.errors.${result.reason}`));
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A social refusal renders under the social buttons, where the learner tapped.
  const [problem, setProblem] = useState<SocialProblem | null>(null);
  // Set after a sign-up that needs email verification; shown until the person signs in.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // A refusal has to reach a screen reader on iOS too, where the live
  // region on the message below announces nothing.
  useAnnounce(error);
  useAnnounce(problem?.message);
  const [busy, setBusy] = useState(false);
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: getAuthProviders,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const enabled: Record<Provider, boolean> = {
    apple: providers.data?.apple ?? false,
    google: providers.data?.google ?? false,
  };
  // Dev builds keep the buttons visible without credentials so the screen can be designed; they toast.
  // On iOS Google never shows without Apple (App Store guideline 4.8).
  const show: Record<Provider, boolean> = visibleSocialProviders(Platform.OS, enabled, __DEV__);
  const anySocial = show.apple || show.google;

  async function finishSignIn() {
    // Choices made as a guest during onboarding follow the learner to the
    // server. A new Apple/Google account still owes the age step, which the
    // root layout shows next; the API refuses this until then and the age
    // step flushes it again once the account is confirmed.
    await flushPendingOnboarding();
    await qc.invalidateQueries({ queryKey: ["me"] });
    router.dismissTo("/");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") validateAge();
      const r =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name, ...ageDeclaration })
          : await authClient.signIn.email({ email, password });
      if (r.error) {
        if (r.error.code === "AGE_REQUIREMENT") throw new Error(t("age.errors.invalid"));
        // Production requires a verified address; the server has just (re)sent the link.
        if (r.error.code === "EMAIL_NOT_VERIFIED") throw new Error(t("auth.errors.unverified"));
        throw new Error(r.error.message ?? t("auth.errors.invalid"));
      }
      // No session yet means the address must be verified first; sign in again afterwards.
      if (mode === "signup" && !r.data?.token) {
        setSentTo(email);
        setMode("signin");
        setPassword("");
        return;
      }
      await finishSignIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: Provider) {
    if (!enabled[provider]) {
      toast.show(t("auth.providerOff", { provider: SOCIAL_PROVIDER_NAMES[provider] }));
      return;
    }
    setBusy(true);
    setError(null);
    setProblem(null);
    try {
      if (mode === "signup") {
        const result = ageEligibility(ageDeclaration);
        if (!result.ok) {
          setProblem({ provider, message: t(`age.errors.${result.reason}`) });
          return;
        }
      }
      const declaration = mode === "signup" ? ageDeclaration : undefined;
      const r =
        provider === "apple"
          ? await signInWithApple(declaration)
          : await signInWithGoogle(declaration);
      if (r === "signed-in") await finishSignIn();
    } catch (e) {
      setProblem({
        provider,
        message: t(socialErrorMessage(e), { provider: SOCIAL_PROVIDER_NAMES[provider] }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sentTo) return;
    setBusy(true);
    try {
      const r = await authClient.sendVerificationEmail({ email: sentTo });
      if (r.error) throw new Error(r.error.message ?? t("auth.errors.generic"));
      toast.show(t("auth.resent"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "min-h-12 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3 font-body text-base text-ink";
  const ready = !!email && password.length >= 10 && (mode === "signin" || name.trim().length > 0);
  const signup = mode === "signup";
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-sand"
    >
      <Stack.Screen options={{ title: signup ? t("auth.signUp") : t("auth.signIn") }} />
      <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
        <Card tone="indigo" index={0}>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="font-display-bold text-2xl text-sun">{t("auth.welcome")}</Text>
              <Text className="mt-1 font-body text-sm text-cloud/80">
                {signup ? t("auth.signUpBody") : t("auth.welcomeBody")}
              </Text>
            </View>
            <Sunbird pose="hello" size={88} surface="dark" />
          </View>
        </Card>
        {sentTo && (
          <Card tone="sand" index={1}>
            <View accessibilityRole="summary" accessibilityLiveRegion="polite" className="gap-3">
              <Text className="font-display-bold text-lg text-indigo">{t("auth.checkInbox")}</Text>
              <Text className="font-body text-sm text-ink">
                {t("auth.verifySent", { email: sentTo })}
              </Text>
              <View className="flex-row">
                <Button
                  label={t("auth.resend")}
                  variant="cloud"
                  size="sm"
                  disabled={busy}
                  onPress={() => void resend()}
                />
              </View>
            </View>
          </Card>
        )}
        {signup && (
          <Card index={1}>
            <AgeFields value={age} onChange={setAge} />
          </Card>
        )}
        {anySocial && (
          <Card index={sentTo ? 2 : 1}>
            <SocialSignIn
              signup={signup}
              busy={busy}
              show={show}
              problem={problem}
              onPress={(provider) => void social(provider)}
            />
          </Card>
        )}
        <Card index={anySocial ? 2 : 1}>
          <View className="gap-3">
            {signup && (
              <View>
                <Text className="mb-1 font-body-semibold text-sm text-mist">{t("auth.name")}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  textContentType="name"
                  accessibilityLabel={t("auth.name")}
                  className={field}
                  testID="name"
                  placeholderTextColor={colors.mistSoft}
                />
              </View>
            )}
            <View>
              <Text className="mb-1 font-body-semibold text-sm text-mist">{t("auth.email")}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                accessibilityLabel={t("auth.email")}
                className={field}
                testID="email"
                placeholderTextColor={colors.mistSoft}
              />
            </View>
            <View>
              <Text className="mb-1 font-body-semibold text-sm text-mist">
                {t("auth.password")}
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={signup ? "new-password" : "current-password"}
                textContentType={signup ? "newPassword" : "password"}
                accessibilityLabel={t("auth.password")}
                accessibilityHint={t("auth.passwordHint")}
                className={field}
                testID="password"
                placeholderTextColor={colors.mistSoft}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (ready && !busy) void submit();
                }}
              />
              <Text className="mt-1 font-body text-xs text-mist">{t("auth.passwordHint")}</Text>
            </View>
            {error && (
              <Text className="font-body-semibold text-coral-deep" accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}
            <Button
              label={signup ? t("auth.signUp") : t("auth.signIn")}
              variant="sun"
              size="lg"
              full
              disabled={busy || !ready}
              onPress={() => void submit()}
              testID="submit-auth"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode(signup ? "signin" : "signup");
                setProblem(null);
                setError(null);
              }}
              className="min-h-11 justify-center py-2"
              testID="toggle-mode"
            >
              <Text className="text-center font-body-semibold text-base text-indigo underline">
                {signup ? t("auth.switchToSignIn") : t("auth.switchToSignUp")}
              </Text>
            </Pressable>
            <LegalLinks accept />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
