import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import Animated, {
  FadeIn,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AudioButton, useAudioControls } from "~/components/AudioButton.tsx";
import { LegalLinks } from "~/components/LegalLinks.tsx";
import { OnboardingHeader } from "~/components/OnboardingHeader.tsx";
import { DEMO_UNIT_SLUG } from "~/fixtures/demo-unit.ts";
import { getClickSounds, getWelcome } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useModes } from "~/lib/modes.tsx";
import {
  finishOnboarding,
  GOAL_PRESETS,
  nextStep,
  onboardingClickUrl,
  ONBOARDING_STEPS,
  type OnboardingChoices,
} from "~/lib/onboarding.ts";
import { usePrefs } from "~/lib/prefs.tsx";
import { useMe } from "~/lib/session.tsx";
import { ONBOARDED_KEY } from "~/lib/use-onboarded.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { haptic } from "~/ui/haptics.ts";
import { Crane, Penguin, Sunbird } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { clickColors, colors } from "~/ui/theme.ts";
import { runTileAction, tileAccessibilityActions } from "~/ui/tile-a11y.ts";

const CLICKS = ["c", "x", "q"] as const;

/** Roughly how long a daily goal takes: ten XP per correct answer, a few answers a minute. */
const minutesFor = (xp: number) => Math.max(2, Math.round(xp / 5));

function Dots({ index, total }: { index: number; total: number }) {
  return (
    <View
      className="flex-row justify-center gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === index ? 22 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === index ? colors.indigo : colors.cloudDeep,
          }}
        />
      ))}
    </View>
  );
}

/**
 * First-run onboarding: six slides, skippable at every step. Choices are
 * applied immediately where they are device-side (UI language, modes,
 * sound) and persisted at the end (server when signed in, device otherwise).
 * The sunbird greets, the crane explains the clicks, the penguin cheers.
 */
export default function WelcomeScreen() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const { lang, setLang } = useLang();
  const modes = useModes();
  const prefs = usePrefs();
  const sfx = useSfx();
  const m = useMotion();
  const welcome = useQuery({ queryKey: ["welcome"], queryFn: getWelcome, retry: 0 });
  // Published bare-click recordings; none (or a failed fetch) means no play buttons.
  const clickSounds = useQuery({ queryKey: ["clicks"], queryFn: getClickSounds, retry: 0 });
  const { controls, controlFor } = useAudioControls();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [goal, setGoal] = useState<number>(50);
  const [openClick, setOpenClick] = useState<(typeof CLICKS)[number] | null>(null);
  const lastMove = useRef(0);
  const finishing = useRef(false);
  const step = ONBOARDING_STEPS[index] ?? "hello";
  const total = ONBOARDING_STEPS.length;

  const choices: OnboardingChoices = {
    sourceLang: lang,
    dailyGoalXp: goal,
    listeningEnabled: modes.listening,
    speakingEnabled: modes.speaking,
  };

  function finish(to: "home" | "auth" | "lesson") {
    // Set before anything else, so a double tap cannot write or navigate twice.
    if (finishing.current) return;
    finishing.current = true;
    // The home screen reads this flag through the query cache. Mark it done
    // before navigating, so home can never bounce the learner back here, and
    // do not wait on the network (a slow /me or /prefs used to hold Skip up).
    qc.setQueryData(ONBOARDED_KEY, true);
    void finishOnboarding(choices, !!me.data).then(() =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ONBOARDED_KEY }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]),
    );
    // Guests start the first lesson right away; before anything is published, dev builds use the sample unit.
    const slug = welcome.data?.firstUnitSlug ?? (__DEV__ ? DEMO_UNIT_SLUG : null);
    if (to === "auth") router.replace({ pathname: "/auth", params: { mode: "signup" } });
    else if (to === "lesson" && slug)
      router.replace({ pathname: "/learn/[slug]", params: { slug } });
    else router.replace("/");
  }

  function go(dir: 1 | -1) {
    // Ignore a second tap while the slide is still moving (double taps, automation retries).
    const now = Date.now();
    if (now - lastMove.current < 350) return;
    lastMove.current = now;
    void haptic.tap();
    sfx.play("tap");
    const next = nextStep(index, dir);
    if (next === -1) {
      finish("home");
      return;
    }
    setDirection(dir);
    setIndex(next);
  }

  const entering = m.reduced
    ? FadeIn.duration(m.enter)
    : direction === 1
      ? SlideInRight.duration(260)
      : SlideInLeft.duration(260);
  const exiting = m.reduced
    ? undefined
    : direction === 1
      ? SlideOutLeft.duration(200)
      : SlideOutRight.duration(200);

  const switches = [
    {
      key: "listening",
      label: t("settings.listening"),
      value: modes.listening,
      set: (v: boolean) => modes.setMode("listening", v),
    },
    {
      key: "speaking",
      label: t("settings.speaking"),
      value: modes.speaking,
      set: (v: boolean) => modes.setMode("speaking", v),
    },
    {
      key: "sound",
      label: t("settings.sound"),
      value: prefs.sound,
      set: (v: boolean) => prefs.setSound(v),
    },
  ] as const;

  return (
    <SafeAreaView className="flex-1 bg-sand" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <OnboardingHeader
        stepLabel={t("onboarding.step", { n: index + 1, total })}
        skipLabel={t("onboarding.skip")}
        onSkip={() => finish("home")}
      />
      {/* MOL-66: the slide area clips, so a slide taller than the screen (the
          first one, with the bobbing sunbird) or one still sliding in can
          never cover the header's Skip and take its touch. */}
      <View className="flex-1 overflow-hidden px-5">
        <Animated.View
          key={step}
          entering={entering}
          {...(exiting ? { exiting } : {})}
          className="flex-1"
          pointerEvents="box-none"
        >
          {step === "hello" && (
            <ScrollView
              className="flex-1"
              contentContainerClassName="flex-grow items-center justify-center"
              showsVerticalScrollIndicator={false}
            >
              <Sunbird pose="hello" size={180} />
              <Text className="w-full text-center font-display-bold text-7xl text-indigo">
                {t("onboarding.hello.title")}
              </Text>
              {welcome.data?.greeting && (
                <View className="mt-4 flex-row items-center gap-3">
                  <AudioButton
                    url={welcome.data.greeting.audio?.url}
                    label={welcome.data.greeting.lemma}
                    attribution={welcome.data.greeting.audio?.attribution}
                  />
                  <Text className="font-body text-base text-mist">
                    {welcome.data.greeting.gloss}
                  </Text>
                </View>
              )}
              <Text className="mt-8 text-center font-body text-lg leading-7 text-ink">
                {t("onboarding.hello.body")}
              </Text>
            </ScrollView>
          )}

          {step === "language" && (
            <View className="flex-1 justify-center gap-4">
              <Text className="font-display text-3xl text-indigo">
                {t("onboarding.language.title")}
              </Text>
              <Text className="font-body text-base text-mist">{t("onboarding.language.body")}</Text>
              {(["en", "nb"] as const).map((l) => (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lang === l }}
                  onPress={() => {
                    void haptic.tap();
                    setLang(l);
                  }}
                  className={`flex-row items-center justify-between rounded-3xl border-2 px-5 py-5 ${lang === l ? "border-indigo bg-indigo" : "border-cloud-deep bg-cloud"}`}
                  style={{ borderBottomWidth: 5 }}
                  testID={`lang-${l}`}
                >
                  <Text
                    className={`font-display text-2xl ${lang === l ? "text-cloud" : "text-ink"}`}
                  >
                    {t(`common.${l}`)}
                  </Text>
                  {lang === l && <Text className="font-display text-2xl text-sun">✓</Text>}
                </Pressable>
              ))}
            </View>
          )}

          {step === "goal" && (
            <View className="flex-1 justify-center gap-4">
              <Text className="font-display text-3xl text-indigo">
                {t("onboarding.goal.title")}
              </Text>
              {GOAL_PRESETS.map((g) => (
                <Pressable
                  key={g.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: goal === g.xp }}
                  onPress={() => {
                    void haptic.tap();
                    setGoal(g.xp);
                  }}
                  className={`flex-row items-center justify-between rounded-3xl border-2 px-5 py-5 ${goal === g.xp ? "border-sun-deep bg-sun" : "border-cloud-deep bg-cloud"}`}
                  style={{ borderBottomWidth: 5 }}
                  testID={`goal-${g.key}`}
                >
                  <View>
                    <Text className="font-display text-2xl text-ink">
                      {t(`onboarding.goal.${g.key}`)}
                    </Text>
                    <Text className="font-body-semibold text-sm text-ink/70">
                      {t("onboarding.goal.minutes", { min: minutesFor(g.xp) })}
                    </Text>
                  </View>
                  <Text className="font-body-bold text-base text-ink">
                    {t("onboarding.goal.perDay", { xp: g.xp })}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {step === "where" && (
            <View className="flex-1 justify-center gap-4">
              <Text className="font-display text-3xl text-indigo">
                {t("onboarding.where.title")}
              </Text>
              <Text className="font-body text-base text-mist">{t("onboarding.where.body")}</Text>
              <Card>
                {switches.map((row) => (
                  <View
                    key={row.key}
                    className="min-h-12 flex-row items-center justify-between gap-3 py-1"
                  >
                    <Text className="flex-1 font-body-semibold text-lg text-ink">{row.label}</Text>
                    <Switch
                      value={row.value}
                      onValueChange={row.set}
                      trackColor={{ true: colors.sea, false: colors.cloudDeep }}
                      accessibilityLabel={row.label}
                      testID={`onboarding-${row.key}`}
                    />
                  </View>
                ))}
              </Card>
            </View>
          )}

          {step === "clicks" && (
            <View className="flex-1 justify-center gap-3">
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="font-display text-3xl text-indigo">
                    {t("onboarding.clicks.title")}
                  </Text>
                  <Text className="mt-1 font-body text-base text-mist">
                    {t("onboarding.clicks.body")}
                  </Text>
                </View>
                <Crane pose="listen" size={96} />
              </View>
              {CLICKS.map((c) => {
                // A published studio recording of the bare click, or nothing:
                // no placeholder and never TTS (audit M10).
                const url = onboardingClickUrl(clickSounds.data?.clicks, c);
                const playAction = url
                  ? {
                      label: t("onboarding.clicks.play", { click: c }),
                      play: () => controls.current.get(c)?.play(),
                    }
                  : undefined;
                const toggle = () => {
                  void haptic.light();
                  const opening = openClick !== c;
                  setOpenClick(opening ? c : null);
                  if (opening) playAction?.play();
                };
                const actions = tileAccessibilityActions(playAction);
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={t("onboarding.clicks.label", { click: c })}
                    accessibilityState={{ expanded: openClick === c }}
                    {...(actions
                      ? {
                          accessibilityActions: actions,
                          onAccessibilityAction: (e: AccessibilityActionEvent) =>
                            runTileAction(e.nativeEvent.actionName, { press: toggle, playAction }),
                        }
                      : {})}
                    onPress={toggle}
                    className="rounded-3xl bg-cloud px-4 py-3"
                    style={{ borderBottomWidth: 4, borderBottomColor: colors.cloudDeep }}
                    testID={`click-${c}`}
                  >
                    <View className="flex-row items-center gap-4">
                      <View
                        className="h-14 w-14 items-center justify-center rounded-full"
                        style={{ backgroundColor: clickColors[c] }}
                      >
                        <Text className="font-display-bold text-3xl text-cloud">{c}</Text>
                      </View>
                      <Text className="flex-1 font-body-semibold text-base text-mist">
                        {openClick === c
                          ? ""
                          : t(url ? "onboarding.clicks.listenHint" : "onboarding.clicks.tapHint")}
                      </Text>
                      {url && (
                        <AudioButton
                          controlRef={controlFor(c)}
                          url={url}
                          label={t("onboarding.clicks.play", { click: c })}
                          small
                          variant="tile"
                        />
                      )}
                      <Text className="font-display text-xl text-mist-soft">
                        {openClick === c ? "▴" : "▾"}
                      </Text>
                    </View>
                    {openClick === c && (
                      <Animated.Text
                        entering={FadeIn.duration(m.enter)}
                        className="mt-3 font-body text-base leading-6 text-ink"
                      >
                        {t(`onboarding.clicks.${c}`)}
                      </Animated.Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {step === "ready" && (
            <View className="flex-1 items-center justify-center gap-4">
              <Penguin pose="cheer" size={160} />
              <Text className="w-full text-center font-display-bold text-5xl text-indigo">
                {t("onboarding.ready.title")}
              </Text>
              <Text className="text-center font-body text-base text-mist">
                {t("onboarding.ready.body")}
              </Text>
              <View className="mt-4 w-full gap-3">
                <Button
                  label={t("onboarding.ready.start")}
                  variant="sun"
                  size="lg"
                  full
                  onPress={() => finish("lesson")}
                  testID="onboarding-start"
                />
                {!me.data && (
                  <Button
                    label={t("onboarding.ready.account")}
                    variant="indigo"
                    full
                    onPress={() => finish("auth")}
                    testID="onboarding-account"
                  />
                )}
                <Button
                  label={me.data ? t("nav.learn") : t("onboarding.ready.guest")}
                  variant="ghost"
                  full
                  onPress={() => finish("home")}
                  testID="onboarding-guest"
                />
                <LegalLinks accept />
              </View>
            </View>
          )}
        </Animated.View>
      </View>
      <View className="gap-4 px-5 pb-2">
        <Dots index={index} total={total} />
        {step !== "ready" && (
          <View className="flex-row items-center justify-between">
            <View>
              {index > 0 && (
                <Button
                  label={t("onboarding.back")}
                  variant="ghost"
                  onPress={() => go(-1)}
                  testID="onboarding-back"
                />
              )}
            </View>
            <Button
              label={t("onboarding.next")}
              variant="indigo"
              size="lg"
              onPress={() => go(1)}
              testID="onboarding-next"
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
