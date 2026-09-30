import { type ExercisePayload } from "@molo/core";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { OptionTile, type TileState } from "~/ui/OptionTile.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { resolveBlanks, type ResolvedBlank as Blank } from "./helpers.ts";
import { SpeechBubble } from "./SpeechBubble.tsx";
import { SKIPPED, type ExerciseProps } from "./types.ts";
import { WordHint, glossForHint } from "./WordHint.tsx";

type P = Extract<ExercisePayload, { type: "concord_fill" }>;

/**
 * The sentence with one or more forms blanked out; each blank has the
 * xh-morph form and its distractors as tiles. All blanks must be right.
 */
export function ConcordFill({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sentence = content.sentences[payload.sentenceId];
  const tokens = sentence?.tokens ?? [];
  const blanks = useMemo(
    () => resolveBlanks(payload.sentenceId, payload.blanks, tokens),
    [payload, tokens],
  );
  /**
   * The words under test. A hint on the word a blank belongs to would name
   * the concord the learner is being asked for, so those stay plain text.
   */
  const hiddenWords = useMemo(
    () => new Set(payload.blanks.map((b) => b.lexemeId)),
    [payload.blanks],
  );
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [active, setActive] = useState<number>(blanks[0]?.position ?? 0);
  const [checked, setChecked] = useState<boolean | null>(null);
  const allPicked = blanks.every((b) => picked[b.position] !== undefined);
  const current = blanks.find((b) => b.position === active) ?? blanks[0];

  if (!sentence || blanks.length === 0) {
    return (
      <CheckBar
        canCheck
        checked={null}
        onCheck={() => onDone(SKIPPED)}
        onContinue={() => undefined}
        checkLabel={t("lesson.skip")}
      />
    );
  }

  const tileState = (b: Blank, option: string): TileState => {
    if (checked === null) return picked[b.position] === option ? "picked" : "";
    if (option === b.answer) return "right";
    if (picked[b.position] === option) return "wrong";
    return "";
  };

  return (
    <View>
      <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.fillBlank")}</Text>
      {/* The crane is the mentor: a sentence being explained is said by it,
          not printed into a void (docs/DESIGN.md "Illustration"). */}
      <SpeechBubble speaker="teaching">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-3">
          {tokens.map((k) => {
            const blank = blanks.find((b) => b.position === k.position);
            if (!blank) {
              return (
                <WordHint
                  key={k.position}
                  word={k.surfaceForm}
                  gloss={glossForHint(content, k.lexemeId, hiddenWords)}
                />
              );
            }
            const value = picked[k.position];
            const isActive = active === k.position && checked === null;
            const tone =
              checked === null
                ? isActive
                  ? "border-indigo bg-sand"
                  : "border-cloud-deep bg-sand-deep"
                : value === blank.answer
                  ? "border-sea bg-sea/10"
                  : "border-coral bg-coral/10";
            return (
              <Text
                key={k.position}
                onPress={() => checked === null && setActive(k.position)}
                accessibilityRole="button"
                accessibilityLabel={`${t("lesson.blank")} ${k.position + 1}`}
                className={`min-w-16 rounded-2xl border-2 px-3 py-1 text-center font-display text-2xl text-ink ${tone}`}
                style={{ borderStyle: value ? "solid" : "dashed" }}
              >
                {value ?? "  "}
              </Text>
            );
          })}
        </View>
        <View className="mt-3 flex-row items-center gap-3">
          <AudioButton
            url={sentence.audio?.url}
            label={t("lesson.listen")}
            attribution={sentence.audio?.attribution}
            small
          />
          <Text className="flex-1 font-body text-base text-mist">
            {sentence.gloss?.gloss ?? ""}
          </Text>
        </View>
      </SpeechBubble>
      {current && (
        <View className="flex-row flex-wrap gap-2">
          {current.options.map((option) => (
            <OptionTile
              key={option}
              state={tileState(current, option)}
              selected={picked[current.position] === option}
              disabled={checked !== null}
              onPress={() => {
                setPicked((p) => ({ ...p, [current.position]: option }));
                const next = blanks.find(
                  (b) => b.position > current.position && picked[b.position] === undefined,
                );
                if (next) setActive(next.position);
              }}
              className="min-w-20 items-center"
            >
              <Text className="font-display text-2xl text-ink">{option}</Text>
            </OptionTile>
          ))}
        </View>
      )}
      <CheckBar
        canCheck={allPicked}
        checked={checked}
        correctAnswer={checked === false ? sentence.textXh : undefined}
        onCheck={() => setChecked(blanks.every((b) => picked[b.position] === b.answer))}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}
