import { answerMatches, type AnswerVerdict, type ExercisePayload } from "@molo/core";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { colors } from "~/ui/theme.ts";
import { XhosaText } from "~/ui/XhosaText.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { clicksIn } from "./helpers.ts";
import { SpeechBubble } from "./SpeechBubble.tsx";
import type { ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "translate_type" }>;

/**
 * Type the isiXhosa for the gloss. `answerMatches` is lenient on tone marks
 * and one typo, strict on clicks; a click miss is called out with the click
 * letters painted so the learner sees exactly what to listen for.
 */
export function TranslateType({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sentence = content.sentences[payload.sentenceId];
  const expected = sentence?.textXh ?? "";
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const checked = verdict === null ? null : verdict.ok;

  const detail =
    verdict === null
      ? undefined
      : verdict.ok && verdict.typo
        ? `${t("lesson.typoHint")} ${expected}`
        : !verdict.ok && verdict.reason === "click"
          ? t("lesson.clickHint", { click: clicksIn(expected).join(", ") })
          : undefined;

  return (
    <View>
      <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.typeAnswer")}</Text>
      {/* The sunbird is the voice: it plays the sentence. The bubble holds
          the meaning and the audio only — the isiXhosa is what is being
          asked for, so printing it here would hand over the answer. */}
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
      <TextInput
        value={typed}
        onChangeText={setTyped}
        editable={checked === null}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t("lesson.typePlaceholder")}
        placeholderTextColor={colors.mist}
        accessibilityLabel={t("lesson.typeAnswer")}
        testID="type-answer"
        className="rounded-3xl border-2 border-cloud-deep bg-cloud px-5 py-4 font-display text-2xl text-ink"
        style={{ borderBottomWidth: 4 }}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (typed.trim() && checked === null) setVerdict(answerMatches(typed, expected));
        }}
      />
      {checked !== null && (
        <View className="mt-4 rounded-3xl bg-cloud p-4">
          <XhosaText text={expected} className="font-display text-2xl text-ink" />
          {sentence?.gloss?.literalGloss ? (
            <Text className="mt-1 font-body text-sm text-mist">{sentence.gloss.literalGloss}</Text>
          ) : null}
        </View>
      )}
      <CheckBar
        canCheck={typed.trim().length > 0}
        checked={checked}
        correctAnswer={checked === false ? expected : undefined}
        detail={detail}
        onCheck={() => setVerdict(answerMatches(typed, expected))}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}
