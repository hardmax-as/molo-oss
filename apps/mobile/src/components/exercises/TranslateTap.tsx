import { normaliseXhosa, type ExercisePayload } from "@molo/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { haptic } from "~/ui/haptics.ts";
import { useSfx } from "~/ui/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import { lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "translate_tap" }>;

/** Same tile logic as apps/web: sentence tokens (or a whitespace split for drafts) plus distractor lemmas. */
export function TranslateTap({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const sentence = content.sentences[payload.sentenceId];
  const target = sentence
    ? sentence.tokens.length > 0
      ? sentence.tokens.map((k) => k.surfaceForm)
      : sentence.textXh.split(/\s+/)
    : [];
  const distractors = payload.distractorLexemeIds
    .map((id) => lexemeOf(content, id)?.lemma)
    .filter((x): x is string => !!x);
  const tiles = shuffle(
    [...target, ...distractors].map((text, i) => ({ id: `${i}-${text}`, text })),
    seedOf(payload.sentenceId),
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const isCorrect = () =>
    chosen.length === target.length &&
    chosen.every(
      (id, i) =>
        normaliseXhosa(tiles.find((x) => x.id === id)?.text ?? "") ===
        normaliseXhosa(target[i] ?? ""),
    );

  const tile = "rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3";
  const tap = () => {
    sfx.play("tap");
    void haptic.tap();
  };
  return (
    <View>
      <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.assemble")}</Text>
      {/* The sunbird plays it. The bubble carries the meaning, never the
          isiXhosa: assembling that is the exercise. */}
      <SpeechBubble speaker="listening">
        <Text className="font-body-semibold text-lg text-ink">{sentence?.gloss?.gloss ?? "?"}</Text>
        <View className="mt-3 flex-row">
          <AudioButton
            url={sentence?.audio?.url}
            label={t("lesson.listen")}
            attribution={sentence?.audio?.attribution}
            small
          />
        </View>
      </SpeechBubble>
      <View className="mb-4 min-h-16 flex-row flex-wrap gap-2 rounded-3xl border-2 border-dashed border-cloud-deep bg-sand-deep p-3">
        {chosen.map((id) => (
          <Animated.View key={id} layout={LinearTransition.duration(180)}>
            <Pressable
              accessibilityRole="button"
              disabled={checked !== null}
              onPress={() => {
                tap();
                setChosen((c) => c.filter((x) => x !== id));
              }}
              className={`${tile} border-indigo`}
              style={{ borderBottomWidth: 4 }}
            >
              <Text className="font-display text-xl text-ink">
                {tiles.find((x) => x.id === id)?.text}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {tiles
          .filter((x) => !chosen.includes(x.id))
          .map((x) => (
            <Animated.View key={x.id} layout={LinearTransition.duration(180)}>
              <Pressable
                accessibilityRole="button"
                disabled={checked !== null}
                onPress={() => {
                  tap();
                  setChosen((c) => [...c, x.id]);
                }}
                className={tile}
                style={{ borderBottomWidth: 4 }}
                testID={`tile-${x.text}`}
              >
                <Text className="font-display text-xl text-ink" accessibilityLanguage="xh">
                  {x.text}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
      </View>
      <CheckBar
        canCheck={chosen.length > 0}
        checked={checked}
        correctAnswer={checked === false ? sentence?.textXh : undefined}
        onCheck={() => setChecked(isCorrect())}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}
