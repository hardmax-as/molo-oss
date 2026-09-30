import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AccountData } from "~/components/AccountData.tsx";
import { AccountSettings } from "~/components/AccountSettings.tsx";
import { ConnectedAccounts } from "~/components/ConnectedAccounts.tsx";
import { PreviewSwitch } from "~/components/EditorPreview.tsx";
import { LeagueSettings } from "~/components/LeagueSettings.tsx";
import { LegalLinks } from "~/components/LegalLinks.tsx";
import { useProgress } from "~/components/ProgressStrip.tsx";
import { useDevAccess } from "~/dev/access.ts";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { apiUrl } from "~/lib/api-url.ts";
import { getCourses, putPrefs } from "~/lib/api.ts";
import { formatBytes } from "~/lib/download-logic.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { openSupport, SUPPORT_EMAIL } from "~/lib/legal.ts";
import { useModes } from "~/lib/modes.tsx";
import { flushPendingReviews, pendingReviewCount } from "~/lib/offline.ts";
import { resetOnboarding } from "~/lib/onboarding.ts";
import { usePlus } from "~/lib/plus.tsx";
import { usePrefs } from "~/lib/prefs.tsx";
import { usePush } from "~/lib/push.tsx";
import { useMe, useSignOut } from "~/lib/session.tsx";
import { deleteDownload, useDownloads } from "~/lib/use-downloads.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { haptic } from "~/ui/haptics.ts";
import { MenuSelect } from "~/ui/MenuSelect.tsx";
import { useMotion } from "~/ui/motion.ts";
import { voicePreference, VOICE_PREFERENCES } from "~/ui/native-ui.ts";
import { Screen } from "~/ui/Screen.tsx";
import { Segmented } from "~/ui/Segmented.tsx";
import { useSfx } from "~/ui/sfx.tsx";
import { Switch } from "~/ui/Switch.tsx";

/**
 * A labelled switch row. The label is also the switch's accessible name, and
 * the hint — where there is one — sits under it rather than inside the name.
 */
function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  testID,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
      <View className="flex-1">
        <Text className="font-body-semibold text-base text-ink">{label}</Text>
        {hint === undefined ? null : <Text className="font-body text-sm text-mist">{hint}</Text>}
      </View>
      <Switch
        label={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled ?? false}
        {...(testID ? { testID } : {})}
      />
    </View>
  );
}

export default function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const me = useMe();
  const signOut = useSignOut();
  const router = useRouter();
  const qc = useQueryClient();
  const prefs = usePrefs();
  const plus = usePlus();
  const push = usePush();
  const modes = useModes();
  const sfx = useSfx();
  const motion = useMotion();
  const progress = useProgress();
  const devAccess = useDevAccess();
  const [goal, setGoal] = useState(50);
  useEffect(() => {
    if (progress.data) setGoal(progress.data.dailyGoalXp);
  }, [progress.data]);
  const reminders = me.data?.prefs?.reminderOptIn ?? false;
  const courses = useQuery({ queryKey: ["courses"], queryFn: getCourses, enabled: !!me.data });
  const voice = voicePreference(me.data?.prefs?.preferredVoice);
  const pending = useQuery({ queryKey: ["pending-reviews"], queryFn: pendingReviewCount });
  const downloads = useDownloads();
  const downloaded = [...downloads.ready.values()];
  const downloadedSize = downloaded.reduce((n, d) => n + d.bytes, 0);
  const save = useMutation({
    mutationFn: putPrefs,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["progress"] }),
        qc.invalidateQueries({ queryKey: ["unit"] }),
      ]),
  });
  const flush = useMutation({
    mutationFn: flushPendingReviews,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-reviews"] }),
  });
  const version = Constants.expoConfig?.version ?? "dev";

  return (
    <Screen>
      <PreviewSwitch />
      <Card index={0}>
        <Text className="mb-3 font-display text-lg text-indigo">{t("settings.account")}</Text>
        {me.data ? (
          <>
            <Text className="font-body-semibold text-base text-ink">
              {t("settings.signedInAs", { name: me.data.user.name })}
            </Text>
            <Text className="mb-4 font-body text-sm text-mist" testID="account-email">
              {me.data.user.email}
            </Text>
            <View className="items-start">
              <Button
                label={t("nav.signOut")}
                variant="cloud"
                onPress={() => void signOut().then(() => router.navigate("/"))}
                testID="sign-out"
              />
            </View>
          </>
        ) : (
          <>
            <Text className="mb-4 font-body text-sm text-mist">{t("auth.welcomeBody")}</Text>
            <View className="items-start">
              <Button
                label={t("nav.signIn")}
                variant="sun"
                onPress={() => router.push("/auth")}
                testID="sign-in"
              />
            </View>
          </>
        )}
      </Card>

      {/* Account comes first: name, e-mail, password, the league name and the
          ways to sign in, before anything about learning. */}
      {me.data && <AccountSettings name={me.data.user.name} email={me.data.user.email} />}
      {me.data?.leagueProfile && <LeagueSettings profile={me.data.leagueProfile} />}
      {me.data && <ConnectedAccounts />}

      {me.data && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void haptic.tap();
            router.push("/plus");
          }}
          className="flex-row items-center justify-between gap-3 rounded-3xl bg-indigo p-5"
          testID="settings-plus"
        >
          <View className="flex-1">
            <Text className="font-display text-lg text-cloud">{t("plus.title")}</Text>
            <Text className="font-body text-sm text-cloud/80">
              {plus.plan === "plus" ? t("plus.active") : t("plus.body")}
            </Text>
          </View>
          <View className="rounded-full bg-sun px-3 py-1">
            <Text className="font-body-bold text-xs text-indigo">
              {plus.plan === "plus" ? "∞" : t("plus.cta")}
            </Text>
          </View>
        </Pressable>
      )}

      <Card index={1}>
        <Text className="mb-3 font-display text-lg text-indigo">{t("settings.learning")}</Text>
        <Text className="mb-2 font-body-semibold text-sm text-mist">{t("common.language")}</Text>
        <View className="mb-4">
          <Segmented
            options={[
              { value: "en", label: t("common.en") },
              { value: "nb", label: t("common.nb") },
            ]}
            selected={lang}
            onChange={setLang}
            testID="ui-language"
          />
        </View>
        {me.data && (
          <>
            {/* One course exists, so the course is shown as a label: the
                enrolment plumbing is exercised rather than theoretical
                (docs/ARCHITECTURE.md section 2.6). No "more languages later"
                line in the app: store review reads a promise of future
                features as unfinished (Apple 2.1); the web keeps it. */}
            <Text className="mb-2 font-body-semibold text-sm text-mist">
              {t("settings.course")}
            </Text>
            {/* Not a Pressable: there is nothing to choose between yet, and
                a button that does nothing is worse than a label. */}
            <View className="mb-4 flex-row gap-2">
              {(courses.data?.courses ?? (me.data.course ? [me.data.course] : [])).map((course) => (
                <View
                  key={course.id}
                  className="min-h-11 justify-center rounded-full border-2 border-cloud-deep bg-cloud px-4 opacity-60"
                >
                  <Text className="font-body-bold text-sm text-ink">
                    {t(course.titleKey as never) || course.slug}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="mb-2 font-body-semibold text-sm text-mist">
              {t("settings.sourceLang")}
            </Text>
            <View className="mb-4">
              <Segmented
                options={[
                  { value: "en", label: t("common.en") },
                  { value: "nb", label: t("common.nb") },
                ]}
                selected={me.data.sourceLang}
                onChange={(sourceLang) => save.mutate({ sourceLang })}
                testID="source-language"
              />
            </View>
            <Text className="mb-1 font-body-semibold text-sm text-mist">{t("settings.voice")}</Text>
            <Text className="mb-2 font-body text-sm text-mist">{t("settings.voiceHint")}</Text>
            <View className="mb-4">
              <MenuSelect
                label={t("settings.voice")}
                options={VOICE_PREFERENCES.map((value) => ({
                  value,
                  label: t(
                    value === "female"
                      ? "settings.voiceFemale"
                      : value === "male"
                        ? "settings.voiceMale"
                        : value === "child"
                          ? "settings.voiceChild"
                          : "settings.voiceAny",
                  ),
                }))}
                selected={voice}
                onChange={(preferredVoice) => save.mutate({ preferredVoice })}
                testID="voice-select"
              />
            </View>
            <Text className="mb-2 font-body-semibold text-sm text-mist">
              {t("settings.dailyGoal")}
            </Text>
            <View className="mb-2 flex-row items-center gap-3">
              <Button
                label="−"
                variant="cloud"
                onPress={() => setGoal((g) => Math.max(10, g - 10))}
                accessibilityLabel={`${t("settings.dailyGoal")} −10`}
                style={{ minWidth: 48 }}
              />
              <Text
                className="w-16 text-center font-display-bold text-2xl text-ink"
                accessibilityLabel={`${t("settings.dailyGoal")}: ${goal}`}
              >
                {goal}
              </Text>
              <Button
                label="+"
                variant="cloud"
                onPress={() => setGoal((g) => Math.min(500, g + 10))}
                accessibilityLabel={`${t("settings.dailyGoal")} +10`}
                style={{ minWidth: 48 }}
              />
              <Button
                label={t("settings.save")}
                variant="sea"
                disabled={save.isPending || goal === progress.data?.dailyGoalXp}
                onPress={() => save.mutate({ dailyGoalXp: goal })}
              />
            </View>
            <SwitchRow
              label={t("settings.reminders")}
              value={reminders}
              onValueChange={(v) => save.mutate({ reminderOptIn: v })}
            />
            <SwitchRow
              label={t("settings.pushReminders")}
              hint={
                push.toggle.note === "simulator"
                  ? t("settings.pushSimulator")
                  : push.toggle.note === "denied"
                    ? t("settings.pushDenied")
                    : push.toggle.note === "failed"
                      ? t("settings.pushFailed")
                      : t("settings.pushRemindersHint")
              }
              value={push.toggle.on}
              disabled={push.busy || push.toggle.note === "simulator"}
              onValueChange={(v) => push.setEnabled(v)}
              testID="push-toggle"
            />
          </>
        )}
      </Card>

      <Card index={2}>
        <Text className="font-display text-lg text-indigo">{t("settings.modes")}</Text>
        <Text className="mb-3 font-body text-sm text-mist">{t("settings.modesHint")}</Text>
        <SwitchRow
          label={t("settings.listening")}
          value={modes.listening}
          onValueChange={(v) => modes.setMode("listening", v)}
          testID="listening-toggle"
        />
        <SwitchRow
          label={t("settings.speaking")}
          value={modes.speaking}
          onValueChange={(v) => modes.setMode("speaking", v)}
          testID="speaking-toggle"
        />
      </Card>

      <Card index={3}>
        <SwitchRow
          label={t("settings.sound")}
          hint={t("settings.soundHint")}
          value={prefs.sound}
          onValueChange={(v) => {
            prefs.setSound(v);
            if (v) sfx.play("tap");
          }}
          testID="sound-toggle"
        />
        {/* The OS setting is the default; this is the in-app override (WCAG 2.3.3). */}
        <SwitchRow
          label={t("settings.motion")}
          hint={t("settings.motionHint")}
          value={motion.reduced}
          onValueChange={(v) => prefs.setMotion(v)}
          testID="motion-toggle"
        />
      </Card>

      <Card index={4}>
        <Text className="font-display text-lg text-indigo">{t("settings.offline")}</Text>
        <Text className="mb-3 font-body text-sm text-mist">{t("settings.offlineHint")}</Text>
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 font-body-semibold text-sm text-ink">
            {t("settings.syncPending", { count: pending.data ?? 0 })}
          </Text>
          {(pending.data ?? 0) > 0 && (
            <Button label={t("common.retry")} variant="sea" onPress={() => flush.mutate()} />
          )}
        </View>
        {/* What a tourist checks before leaving the wifi: which units, and
            how much of the phone they are using. */}
        <View className="mt-4 gap-2 border-t border-sand-deep pt-4">
          <Text className="font-body-semibold text-sm text-ink">
            {downloaded.length === 0
              ? t("settings.downloadsNone")
              : t("settings.downloads", {
                  count: downloaded.length,
                  size: formatBytes(downloadedSize),
                })}
          </Text>
          {downloaded.length > 0 && (
            <View className="items-start">
              <Button
                label={t("settings.downloadsRemoveAll")}
                variant="ghost"
                size="sm"
                testID="downloads-remove-all"
                onPress={() => {
                  void haptic.light();
                  for (const d of downloaded) void deleteDownload(d.slug, d.lang);
                }}
              />
            </View>
          )}
        </View>
      </Card>

      {me.data && <AccountData />}

      {/* Developer: a development build, or an admin account. A learner on a
          release build never sees this row, and the screen behind it asks
          the same question again (docs/DESIGN.md "Developer gallery"). */}
      {devAccess && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={DEV_STRINGS.settingsRow}
          onPress={() => {
            void haptic.tap();
            router.push("/dev");
          }}
          className="min-h-12 rounded-3xl border-2 border-dashed border-mist-soft px-5 py-4"
          testID="settings-developer"
        >
          <Text className="font-display text-lg text-indigo">{DEV_STRINGS.settingsRow}</Text>
          <Text className="font-body text-sm text-mist">{DEV_STRINGS.settingsRowHint}</Text>
        </Pressable>
      )}

      <View className="mt-2 gap-3">
        <LegalLinks />
        <View className="items-center">
          <Button
            label={t("settings.support")}
            variant="ghost"
            onPress={() => void openSupport()}
            testID="settings-support"
          />
          <Text className="font-body text-xs text-mist" selectable>
            {SUPPORT_EMAIL}
          </Text>
        </View>
        <Button
          label={t("legal.licences")}
          variant="ghost"
          onPress={() => router.push("/settings/licences")}
          testID="settings-licences"
        />
        <View className="items-center">
          <Button
            label={t("settings.replayOnboarding")}
            variant="ghost"
            style={{ alignSelf: "center" }}
            onPress={() => void resetOnboarding().then(() => router.push("/welcome"))}
            testID="replay-onboarding"
          />
        </View>
        <Text className="text-center font-body text-xs text-mist">
          {t("settings.version", { version })}
          {__DEV__ ? ` · ${apiUrl()}` : ""}
        </Text>
      </View>
    </Screen>
  );
}
