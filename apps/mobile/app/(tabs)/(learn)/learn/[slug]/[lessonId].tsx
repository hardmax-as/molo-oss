import {
  celebrationExtras,
  guestCelebrationExtras,
  newWordsFor,
  type CelebrationExtras,
  type ProgressResponse,
} from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LessonRunner } from "~/components/exercises/Runner.tsx";
import { OutOfHearts } from "~/components/OutOfHearts.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { completeLesson, localToday, localTzOffset } from "~/lib/api.ts";
import { guestSeenLexemes } from "~/lib/guest-logic.ts";
import { useHearts } from "~/lib/hearts.tsx";
import { useT } from "~/lib/i18n.tsx";
import { mustConfirmExit } from "~/lib/lesson-exit.ts";
import { LessonScrollContext } from "~/lib/lesson-scroll.tsx";
import { useModes } from "~/lib/modes.tsx";
import { momentOf } from "~/lib/moment.ts";
import { usePlus } from "~/lib/plus.tsx";
import { useHideTabBar } from "~/lib/tab-bar.tsx";
import { useGuest } from "~/lib/use-guest.tsx";
import { useUnit } from "~/lib/use-unit.ts";
import { haptic } from "~/ui/haptics.ts";
import { LevelUp } from "~/ui/LevelUp.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { useSfx } from "~/ui/sfx.tsx";

export default function LessonScreen() {
  const { slug, lessonId } = useLocalSearchParams<{ slug: string; lessonId: string }>();
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const sfx = useSfx();
  const modes = useModes();
  const unit = useUnit(slug ?? "");
  // A level gained waits for the celebration sequence to finish: two
  // full-screen moments at once would be one too many.
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  // Streak, words learned and unit completion: beats two to four. Null until
  // the server answers, and for a guest whatever the device alone can prove.
  const [extras, setExtras] = useState<CelebrationExtras | null>(null);
  // The celebration owns the screen: the exit and quiet buttons go away with the last exercise.
  const [finished, setFinished] = useState(false);
  const onSummary = useCallback(() => setFinished(true), []);
  const scroll = useRef<ScrollView>(null);
  const scrollToEnd = useCallback(() => scroll.current?.scrollToEnd({ animated: true }), []);
  const hearts = useHearts();
  const { localPlus } = usePlus();
  const guest = useGuest();
  // The runner owns the whole screen: no tab bar under the answer buttons.
  useHideTabBar();

  const back = () => router.replace({ pathname: "/learn/[slug]", params: { slug: slug ?? "" } });
  // Once an exercise is done, ✕ and Android's back ask first, with "Keep
  // going" as the default (audit M06). Leaving on the lesson's own terms
  // (hearts, the account wall, the end of the celebration) does not ask.
  const [done, setDone] = useState(0);
  // Out of hearts halfway: the runner pauses in place and says so here.
  const [paused, setPaused] = useState(false);
  const allowLeave = useRef(false);
  const navigation = useNavigation();
  const leaveNow = () => {
    allowLeave.current = true;
    back();
  };
  const asksFirst = mustConfirmExit({ done, finished, paused: paused || hearts.blocked });
  usePreventRemove(asksFirst, ({ data }) => {
    if (allowLeave.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t("lesson.leaveTitle"), t("lesson.leaveBody"), [
      { text: t("lesson.keepGoing"), style: "cancel" },
      {
        text: t("lesson.leaveConfirm"),
        style: "destructive",
        onPress: () => {
          allowLeave.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  if (unit.isPending || guest.isPending)
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="font-body text-mist">{t("common.loading")}</Text>
      </Screen>
    );
  const skill = unit.data?.unit.skills.find((s) => s.lessons.some((l) => l.id === lessonId));
  const lesson = skill?.lessons.find((l) => l.id === lessonId);
  if (unit.isError || !unit.data || !lesson)
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
        <View className="items-start">
          <Pressable accessibilityRole="button" onPress={back} className="min-h-11 justify-center">
            <Text className="font-body-bold text-base text-indigo">{t("lesson.exit")}</Text>
          </Pressable>
        </View>
      </Screen>
    );

  const quietOn = !modes.listening;
  const unitTitleKey = unit.data.unit.titleKey;
  const unitLessonCount = unit.data.unit.lessonCount;
  // A signed-in learner gets "new word" / "tricky" from the server, which
  // knows their whole history; a guest has none there, so the same rule runs
  // over the lessons kept on the device.
  const local = guest.isGuest ? guest.progress : null;
  const exercises = lesson.exercises.map((e) => ({ ...e, moment: momentOf(e, local) }));
  const taught = [...new Set(lesson.exercises.flatMap((e) => [...e.teaches]))];
  // The words met on a card before they are practised: the server's list for
  // an account, the same rule over the device's lessons for a guest.
  const newWords = newWordsFor({
    taught,
    serverUnseen: unit.data.unseenLexemeIds,
    guestSeen: local ? guestSeenLexemes(local) : null,
  });
  // The account wall: the free lesson is behind this guest, the next one asks for an account.
  if (guest.mustSignUp(lesson.id)) {
    return (
      <SafeAreaView className="flex-1 bg-sand" edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 justify-center px-5">
          <SaveProgressWall xp={guest.xp} lessons={guest.lessons} onLater={leaveNow} />
        </View>
      </SafeAreaView>
    );
  }
  // No hearts before the lesson starts. Halfway through, the runner pauses
  // in place instead, so the answers so far are not thrown away.
  if (hearts.blocked && hearts.state && done === 0) {
    return (
      <SafeAreaView className="flex-1 bg-sand" edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 justify-center px-5">
          <OutOfHearts state={hearts.state} onLater={leaveNow} />
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView
      className={`flex-1 ${finished ? "bg-indigo" : "bg-sand"}`}
      edges={["top", "bottom"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* The summary sits on the indigo sky, so the clock and battery flip to light. */}
      {finished && <StatusBar style="light" />}
      {!finished && (
        <View className="flex-row items-center justify-between px-5 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("lesson.exit")}
            onPress={back}
            className="h-11 w-11 items-center justify-center rounded-full bg-cloud"
            testID="exit-lesson"
          >
            <Text className="font-display text-xl text-indigo">✕</Text>
          </Pressable>
          <Text className="font-display text-base text-mist">
            {t("units.lesson", { order: lesson.order })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("lesson.quietMode")}
            accessibilityHint={t("lesson.quietToggle")}
            accessibilityState={{ selected: quietOn }}
            onPress={() => {
              void haptic.tap();
              // Session-only: flips listening for this lesson without touching the preference.
              modes.setQuiet(!quietOn);
            }}
            className={`h-11 w-11 items-center justify-center rounded-full ${quietOn ? "bg-indigo" : "bg-cloud"}`}
            testID="quiet-mode"
          >
            <Text className={`font-display text-base ${quietOn ? "text-cloud" : "text-indigo"}`}>
              {quietOn ? "🔇" : "🔈"}
            </Text>
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          className="flex-1"
          contentContainerClassName={`px-5 pb-8 ${finished ? "flex-grow justify-center pt-4" : ""}`}
          keyboardShouldPersistTaps="handled"
        >
          <LessonScrollContext.Provider value={scrollToEnd}>
            <LessonRunner
              exercises={exercises}
              content={unit.data}
              newWords={newWords}
              grammarNotes={skill?.grammarNotes}
              modes={{ listening: modes.listening, speaking: modes.speaking }}
              onOpenSettings={() => router.push("/settings")}
              onSummary={onSummary}
              onProgress={setDone}
              onPausedChange={setPaused}
              hearts={{
                state: hearts.state,
                blocked: hearts.blocked,
                lose: hearts.lose,
                onLater: leaveNow,
                plus: localPlus,
              }}
              extras={extras}
              onLeave={() => {
                if (levelUp === null) leaveNow();
                else {
                  sfx.play("level_up");
                  setShowLevelUp(true);
                }
              }}
              onFinish={(summary) => {
                if (guest.isGuest) {
                  // A replayed lesson crowns nothing, as on the server.
                  const replay = guest.progress.lessons.some((l) => l.lessonId === lesson.id);
                  // Guests keep the result on the device; it is replayed on the server at sign-up.
                  void guest
                    .record(
                      {
                        lessonId: lesson.id,
                        unitSlug: slug ?? "",
                        correct: summary.correct,
                        total: summary.total,
                        xp: summary.xp,
                        today: localToday(),
                        teaches: taught,
                      },
                      summary.mistakes.map((m) => m.lexemeId),
                    )
                    .then((next) => {
                      // No account, so only what the device itself can prove.
                      setExtras(
                        guestCelebrationExtras({
                          unit: {
                            slug: slug ?? "",
                            titleKey: unitTitleKey,
                            lessonCount: unitLessonCount,
                          },
                          lessons: next.lessons.filter((l) => l.unitSlug === (slug ?? "")),
                          firstTime: !replay,
                        }),
                      );
                      return next;
                    })
                    .catch(() => null);
                  return;
                }
                const before = qc.getQueryData<ProgressResponse>(["progress"]);
                // Signed-in learners get XP and streak from the server.
                void (async () => {
                  try {
                    const r = await completeLesson(lesson.id, {
                      correct: summary.correct,
                      total: summary.total,
                      mistakes: summary.mistakes,
                      today: localToday(),
                      tzOffsetMinutes: localTzOffset(),
                    });
                    qc.setQueryData(["progress"], r.progress);
                    // The beats the server knows about join the sequence,
                    // which is still on its first one.
                    setExtras(celebrationExtras(r.celebration));
                    if (before && r.progress.level > before.level) setLevelUp(r.progress.level);
                    void qc.invalidateQueries({ queryKey: ["crown", slug] });
                    void qc.invalidateQueries({ queryKey: ["mistakes"] });
                    void qc.invalidateQueries({ queryKey: ["units"] });
                    // The lesson just added review cards: Review must not
                    // show the session it cached before them (as on the web).
                    void qc.invalidateQueries({ queryKey: ["review-session"] });
                    // The unit carries this learner's history (badges, the
                    // words not yet met), so the next lesson must not meet
                    // this one's words again.
                    void qc.invalidateQueries({ queryKey: ["unit", slug] });
                  } catch {
                    // Offline: the lesson beat stands alone and the next tap
                    // still gets the learner back to the path.
                  }
                })();
              }}
            />
          </LessonScrollContext.Provider>
        </ScrollView>
      </KeyboardAvoidingView>
      {showLevelUp && levelUp !== null && <LevelUp level={levelUp} onClose={back} />}
    </SafeAreaView>
  );
}
