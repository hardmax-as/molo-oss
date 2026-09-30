import type { CelebrationBeat } from "@molo/core";
import type { SoundName } from "@molo/sfx";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";

import { Button } from "../Button.tsx";
import { Confetti } from "../Confetti.tsx";
import { haptic } from "../haptics.ts";
import { useMotion } from "../motion.ts";
import { useSfx } from "../sfx.tsx";
import { LessonComplete, Milestone, StreakExtended, UnitFinished } from "./beats.tsx";

/**
 * The end-of-lesson sequence (docs/DESIGN.md "After a lesson"): a short
 * series of full-screen beats, each with its own entrance and one primary
 * button. A tap anywhere moves on and "Skip" ends the whole thing, so
 * nothing here keeps a learner from the path for longer than a tap.
 *
 * It fills the lesson screen's scroll area rather than floating over it —
 * the screen turns indigo and centres its content once the last exercise is
 * answered — so a long beat still scrolls on a small phone.
 *
 * `beats` may grow while the sequence is on screen: the lesson beat shows
 * the moment the last exercise is answered, and the beats that depend on
 * the server's answer join as soon as it lands.
 */

function soundFor(beat: CelebrationBeat): SoundName {
  switch (beat.kind) {
    case "lesson":
      return beat.perfect ? "perfect" : "lesson_complete";
    case "streak":
      return "streak";
    case "milestone":
      return "level_up";
    case "unit":
      return "crown";
  }
}

/** Particles for a beat's burst; zero means none. The streak beat has its own flame. */
function confettiFor(beat: CelebrationBeat): number {
  switch (beat.kind) {
    case "lesson":
      return beat.perfect ? 60 : 36;
    case "streak":
      return 0;
    case "milestone":
      return 44;
    case "unit":
      return beat.flawless ? 60 : 44;
  }
}

function Beat({ beat }: { beat: CelebrationBeat }) {
  switch (beat.kind) {
    case "lesson":
      return <LessonComplete beat={beat} />;
    case "streak":
      return <StreakExtended beat={beat} />;
    case "milestone":
      return <Milestone beat={beat} />;
    case "unit":
      return <UnitFinished beat={beat} />;
  }
}

export function Celebration({
  beats,
  onDone,
}: {
  beats: readonly CelebrationBeat[];
  onDone: () => void;
}) {
  const t = useT();
  const sfx = useSfx();
  const m = useMotion();
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState<{ n: number; count: number }>({ n: 0, count: 36 });

  const position = Math.min(index, Math.max(0, beats.length - 1));
  const beat = beats[position];
  const last = position >= beats.length - 1;

  // One chime, one haptic and at most one burst per beat.
  const sounded = useRef(-1);
  useEffect(() => {
    if (!beat || sounded.current === position) return;
    sounded.current = position;
    sfx.play(soundFor(beat));
    void (beat.kind === "unit" ? haptic.medium() : haptic.success());
    const count = confettiFor(beat);
    if (count > 0) setBurst((b) => ({ n: b.n + 1, count }));
  }, [beat, position, sfx]);

  if (!beat) return null;

  const advance = () => {
    if (index + 1 >= beats.length) onDone();
    else setIndex(index + 1);
  };

  return (
    <View className="flex-1 justify-center" testID="celebration">
      <Confetti burst={burst.n} count={burst.count} />
      {/* A tap anywhere moves the sequence on. */}
      <Pressable
        className="absolute inset-0"
        accessibilityRole="button"
        accessibilityLabel={t("celebration.continue")}
        onPress={advance}
      />
      <Animated.View key={`${position}-${beat.kind}`} entering={FadeIn.duration(m.enter)}>
        <Beat beat={beat} />
      </Animated.View>
      <View className="mt-8 w-full">
        <Button
          label={last ? t("celebration.back") : t("celebration.continue")}
          variant="sun"
          size="lg"
          full
          onPress={advance}
          testID="finish"
        />
      </View>
      {beats.length > 1 && (
        <View className="mt-5 flex-row justify-center gap-2">
          {beats.map((b, i) => (
            <View
              key={`${b.kind}-${i}`}
              className={`h-1.5 rounded-full ${i === position ? "w-6 bg-sun" : "w-1.5 bg-cloud/25"}`}
            />
          ))}
        </View>
      )}
      <Pressable
        className="absolute right-0 top-0 min-h-11 justify-center px-3"
        accessibilityRole="button"
        onPress={onDone}
        testID="celebration-skip"
      >
        <Text className="font-display text-base text-cloud/70">{t("celebration.skipAll")}</Text>
      </Pressable>
    </View>
  );
}
