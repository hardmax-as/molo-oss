import { workedExampleOf, type GrammarNoteView } from "@molo/core";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { AudioButton } from "~/components/AudioButton.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Crane } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";

import { MorphemeSplit } from "./MorphemeSplit.tsx";
import { ParadigmTable } from "./ParadigmTable.tsx";
import type { GrammarAudio } from "./types.ts";

/**
 * The rule, before the drill (docs/GRAMMAR.md section 1): a worked example,
 * then the rule in a sentence or two, then the paradigm, then the exercise.
 * The crane is the mentor and appears wherever something is explained.
 *
 * Two ways out, "Got it" and "Skip", both recording the dismissal — a
 * learner who skipped a rule and one who read it have equally decided not to
 * be stopped by it again.
 *
 * Without `onContinue` this is the reference screen's read-only form.
 * Reduced motion (the OS setting, through `useMotion`) turns the entrance
 * into a plain fade.
 */
export function GrammarNote({
  note,
  audio,
  onContinue,
  onSkip,
}: {
  note: GrammarNoteView;
  audio: GrammarAudio;
  onContinue?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
}) {
  const t = useT();
  const m = useMotion();
  const example = workedExampleOf(note.cells);
  const entering = m.reduced
    ? FadeIn.duration(m.enter)
    : FadeInDown.duration(m.enter).withInitialValues({ transform: [{ translateY: 12 }] });

  return (
    <Animated.View entering={entering} className="rounded-3xl bg-cloud p-5" testID="grammar-note">
      <View className="mb-1 flex-row items-start gap-3">
        <View className="flex-1">
          {/* "Before you start" is only true in front of a drill; on the
              reference screen the learner has already started. */}
          {onContinue ? (
            <Text className="font-body-semibold text-xs text-mist uppercase">
              {t("grammar.noteHeading")}
            </Text>
          ) : null}
          <Text
            className="mt-1 font-display text-2xl text-indigo"
            accessibilityRole="header"
            testID="grammar-note-title"
          >
            {note.title}
          </Text>
        </View>
        <Crane pose="think" size={72} />
      </View>

      {/* Something concrete before the claim, which is the order GRAMMAR.md
          asked for. */}
      {example.length > 0 && (
        <Block label={t("grammar.example")}>
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-3">
            {example.map((cell) => {
              const ref = cell.audioAssetId ? (audio[cell.audioAssetId] ?? null) : null;
              return (
                <View key={cell.id} className="flex-row items-center gap-2">
                  <MorphemeSplit
                    surfaceForm={cell.surfaceForm}
                    morphemes={cell.morphemes}
                    size="lg"
                  />
                  <AudioButton
                    url={ref?.url ?? null}
                    label={t("lesson.listen")}
                    attribution={ref?.attribution ?? null}
                    small
                  />
                </View>
              );
            })}
          </View>
        </Block>
      )}

      <Block label={t("grammar.rule")}>
        <Text className="font-body text-base leading-6 text-ink">{note.rule}</Text>
      </Block>

      {note.cells.some((c) => c.role === "paradigm") && (
        <Block label={t("grammar.forms")}>
          <ParadigmTable note={note} audio={audio} />
        </Block>
      )}

      {onContinue && (
        <View className="mt-6 flex-row flex-wrap items-center gap-3">
          <Button
            label={t("grammar.gotIt")}
            variant="sun"
            size="lg"
            onPress={onContinue}
            testID="grammar-note-continue"
          />
          {onSkip && (
            <Button
              label={t("grammar.skip")}
              variant="cloud"
              onPress={onSkip}
              testID="grammar-note-skip"
            />
          )}
        </View>
      )}
    </Animated.View>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="mb-2 font-body-semibold text-xs text-mist uppercase">{label}</Text>
      {children}
    </View>
  );
}
