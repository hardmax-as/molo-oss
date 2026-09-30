import { registrationCountry } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AgeFields } from "~/components/AgeFields.tsx";
import { LegalLinks } from "~/components/LegalLinks.tsx";
import { showAgeStep, submitAgeStep } from "~/lib/age-step.ts";
import { useAnnounce } from "~/lib/announce.ts";
import { confirmAge } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { flushPendingOnboarding } from "~/lib/onboarding.ts";
import { useMe, useSignOut } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";

/**
 * "Your birth year and country": the one screen a one-tap Apple or Google
 * account sees before anything else. The same fields, rule and copy as the
 * sign-up form; nothing else is asked (no name or e-mail again after Apple,
 * App Review 4.8 and 5.1.1). The API refuses every other route until this is
 * accepted, so this screen is a courtesy over a rule the server enforces.
 *
 * Below the minimum age the server deletes the account at once; the screen
 * then says so until the learner closes it, which clears the device.
 */
export function AgeGate() {
  const me = useMe();
  // Kept here, above the step, so the deletion notice outlives the account:
  // once the server has deleted it, `/me` answers null.
  const [deleted, setDeleted] = useState<Deleted>(null);
  if (!showAgeStep(me.data) && !deleted) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      testID="age-gate"
    >
      <AgeStep deleted={deleted} onDeleted={setDeleted} onClosed={() => setDeleted(null)} />
    </View>
  );
}

type Deleted = "under13" | "under18ZA" | null;

function AgeStep({
  deleted,
  onDeleted,
  onClosed,
}: {
  deleted: Deleted;
  onDeleted: (reason: Deleted) => void;
  onClosed: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [age, setAge] = useState(() => ({
    birthYear: "",
    country: registrationCountry(getLocales()[0]?.regionCode) as string,
    ageReached: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAnnounce(error);
  useAnnounce(deleted ? `${t(`age.errors.${deleted}`)} ${t("age.deleted")}` : null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await submitAgeStep(
        { ...age, birthYear: Number(age.birthYear) },
        { confirm: confirmAge, afterConfirmed: flushPendingOnboarding },
      );
      if (outcome.kind === "confirmed") await qc.invalidateQueries({ queryKey: ["me"] });
      else if (outcome.kind === "deleted") onDeleted(outcome.reason);
      else
        setError(
          outcome.reason === "generic"
            ? t("auth.errors.generic")
            : t(`age.errors.${outcome.reason}`),
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand" testID="age-step">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
          <Card tone="indigo" index={0}>
            <Text accessibilityRole="header" className="font-display-bold text-2xl text-sun">
              {t("age.stepTitle")}
            </Text>
            <Text className="mt-1 font-body text-sm text-cloud/80">{t("age.stepBody")}</Text>
          </Card>
          {deleted ? (
            <Card index={1}>
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="gap-3"
                testID="age-step-deleted"
              >
                <Text className="font-body-semibold text-base text-ink">
                  {t(`age.errors.${deleted}`)}
                </Text>
                <Text className="font-body text-sm text-ink">{t("age.deleted")}</Text>
                <Button
                  label={t("common.close")}
                  variant="sun"
                  full
                  onPress={() => void signOut().finally(onClosed)}
                  testID="age-step-close"
                />
              </View>
            </Card>
          ) : (
            <Card index={1}>
              <View className="gap-3">
                <AgeFields value={age} onChange={setAge} />
                {error && (
                  <Text
                    className="font-body-semibold text-coral-deep"
                    accessibilityLiveRegion="polite"
                  >
                    {error}
                  </Text>
                )}
                <Button
                  label={t("age.stepContinue")}
                  variant="sun"
                  size="lg"
                  full
                  disabled={busy}
                  onPress={() => void submit()}
                  testID="age-step-continue"
                />
                <LegalLinks accept />
                <Button
                  label={t("nav.signOut")}
                  variant="cloud"
                  size="sm"
                  disabled={busy}
                  onPress={() => void signOut()}
                  testID="age-step-sign-out"
                />
              </View>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
