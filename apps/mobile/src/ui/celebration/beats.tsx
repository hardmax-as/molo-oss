import type { LessonBeat, MilestoneBeat, StreakBeat, UnitBeat } from "@molo/core";
import type { TranslationKey } from "@molo/i18n";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";

import { useContentTitle, useT } from "~/lib/i18n.tsx";

import { useCountUp } from "../count-up.ts";
import { Crane, Penguin, Sunbird } from "../Mascots.tsx";
import { useMotion } from "../motion.ts";
import { StreakFlame } from "../StreakFlame.tsx";
import { Crown, Medal, Rays } from "./art.tsx";

/**
 * The four end-of-lesson beats (docs/DESIGN.md "After a lesson"). Each one
 * owns its entrance and its mascot: the penguin is the learner who just did
 * the work, the sunbird is the daily greeting that keeps the streak going,
 * and the crane is the mentor who hands over a medal. The unit finale shows
 * the three of them together.
 */

const WEEKDAY_KEYS = [
  "celebration.weekday.mon",
  "celebration.weekday.tue",
  "celebration.weekday.wed",
  "celebration.weekday.thu",
  "celebration.weekday.fri",
  "celebration.weekday.sat",
  "celebration.weekday.sun",
] as const satisfies readonly TranslationKey[];

function Title({ children }: { children: string }) {
  const m = useMotion();
  return (
    <Animated.Text
      entering={m.reduced ? FadeIn.duration(m.enter) : FadeInDown.duration(m.enter)}
      className="text-center font-display text-sm uppercase tracking-widest text-sun"
    >
      {children}
    </Animated.Text>
  );
}

function Body({ children }: { children: string }) {
  const m = useMotion();
  return (
    <Animated.Text
      entering={
        m.reduced ? FadeIn.duration(m.enter) : FadeInDown.duration(m.enter).delay(m.stagger * 5)
      }
      className="mt-3 text-center font-body text-base text-cloud/80"
    >
      {children}
    </Animated.Text>
  );
}

export function LessonComplete({ beat }: { beat: LessonBeat }) {
  const t = useT();
  const m = useMotion();
  const xp = useCountUp(beat.xp, 900, m.reduced);
  return (
    <View className="items-center" testID="celebration-lesson">
      <Penguin pose={beat.perfect ? "cheer" : "hello"} size={132} surface="dark" />
      <Title>
        {beat.perfect ? t("celebration.lesson.perfect") : t("celebration.lesson.title")}
      </Title>
      <View className="my-6 h-40 items-center justify-center">
        <Rays />
        <Animated.View
          entering={m.reduced ? FadeIn.duration(m.enter) : ZoomIn.duration(420)}
          className="flex-row items-end"
        >
          <Text className="font-display-bold text-8xl text-sun">{xp}</Text>
          <Text className="mb-3 ml-2 font-display text-2xl text-cloud/70">
            {t("gamification.xp")}
          </Text>
        </Animated.View>
      </View>
      <Body>
        {t("celebration.lesson.accuracy", {
          correct: beat.correct,
          total: beat.total,
          percent: beat.accuracy,
        })}
      </Body>
    </View>
  );
}

function WeekStrip({ beat }: { beat: StreakBeat }) {
  const t = useT();
  const m = useMotion();
  return (
    <View
      className="mt-7 w-full flex-row justify-between rounded-3xl bg-cloud/10 px-4 py-3"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("celebration.a11y.week")}
    >
      {WEEKDAY_KEYS.map((key, i) => {
        const filled = beat.week[i] === true;
        const today = i === beat.todayIndex;
        return (
          <View key={key} className="w-8 items-center gap-1.5">
            <Text className="font-display text-[11px] uppercase text-cloud/60">{t(key)}</Text>
            <Animated.View
              entering={
                m.reduced ? FadeIn.duration(m.enter) : ZoomIn.duration(260).delay(200 + i * 50)
              }
              className={`h-7 w-7 items-center justify-center rounded-full ${
                filled ? "bg-sun" : "bg-cloud/10"
              } ${today ? "border-2 border-cloud" : ""}`}
            >
              <Text
                className={`font-body-bold text-xs ${filled ? "text-indigo" : "text-cloud/40"}`}
              >
                {filled ? "✓" : ""}
              </Text>
            </Animated.View>
          </View>
        );
      })}
    </View>
  );
}

export function StreakExtended({ beat }: { beat: StreakBeat }) {
  const t = useT();
  const m = useMotion();
  const days = useCountUp(beat.days, 700, m.reduced);
  return (
    <View className="items-center" testID="celebration-streak">
      <Sunbird pose="cheer" size={120} surface="dark" />
      <Title>
        {beat.frozen ? t("celebration.streak.titleFrozen") : t("celebration.streak.title")}
      </Title>
      <View className="my-5 h-32 flex-row items-center justify-center gap-3">
        <Rays size={260} />
        <StreakFlame size={68} alive pop={1} />
        <Text className="font-display-bold text-7xl text-sun">{days}</Text>
      </View>
      <Text className="font-display text-lg text-cloud">
        {t("celebration.streak.dayLabel", { count: beat.days })}
      </Text>
      <Body>{beat.frozen ? t("celebration.streak.bodyFrozen") : t("celebration.streak.body")}</Body>
      <WeekStrip beat={beat} />
    </View>
  );
}

export function Milestone({ beat }: { beat: MilestoneBeat }) {
  const t = useT();
  const m = useMotion();
  return (
    <View className="items-center" testID="celebration-milestone">
      <Crane pose="hello" size={112} surface="dark" />
      <Title>{t("celebration.milestone.subtitle")}</Title>
      <View className="my-4 h-48 items-center justify-center">
        <Rays />
        <Animated.View
          entering={m.reduced ? FadeIn.duration(m.enter) : ZoomIn.duration(420).delay(100)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("celebration.a11y.medal", { words: beat.threshold })}
        >
          <Medal words={beat.threshold} />
        </Animated.View>
      </View>
      <Text className="font-display-bold text-2xl text-cloud">
        {t("celebration.milestone.title", { words: beat.words })}
      </Text>
      <Body>{t("celebration.milestone.body")}</Body>
    </View>
  );
}

export function UnitFinished({ beat }: { beat: UnitBeat }) {
  const t = useT();
  const contentTitle = useContentTitle();
  const title = contentTitle(beat.titleKey, beat.slug);
  return (
    <View className="items-center" testID="celebration-unit">
      <View
        className="h-44 items-center justify-center"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("celebration.a11y.crown")}
      >
        <Rays tone={beat.flawless ? "sun" : "sea"} />
        <Crown flawless={beat.flawless} />
      </View>
      <Title>
        {beat.flawless ? t("celebration.unit.titleFlawless") : t("celebration.unit.title")}
      </Title>
      <Text className="mt-2 text-center font-display-bold text-3xl text-cloud">{title}</Text>
      <Body>
        {beat.flawless
          ? t("celebration.unit.bodyFlawless", { unit: title })
          : t("celebration.unit.body", { unit: title })}
      </Body>
      {/* The trio takes a bow: the learner, the voice and the mentor. */}
      <View className="mt-4 flex-row items-end justify-center">
        <Sunbird pose="cheer" size={72} surface="dark" />
        <Penguin pose="cheer" size={100} surface="dark" />
        <Crane pose="cheer" size={82} surface="dark" />
      </View>
    </View>
  );
}
