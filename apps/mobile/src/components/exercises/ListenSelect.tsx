import { type ExercisePayload } from "@molo/core";
import { useState } from "react";
import { Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { OptionTile, type TileState } from "~/ui/OptionTile.tsx";

import { CheckBar } from "./CheckBar.tsx";
import {
  distinctOptions,
  glossOf,
  lexemeOf,
  sameTile,
  seedOf,
  shuffle,
  tileLabelOf,
  type ExerciseProps,
} from "./types.ts";

type P = Extract<ExercisePayload, { type: "listen_select" }>;

/**
 * Hear the word and pick its meaning. In quiet mode, or when the word has
 * no recording yet, the written word stands in so the exercise can still
 * be answered.
 */
export function ListenSelect({
  payload,
  content,
  onDone,
  quiet = false,
}: ExerciseProps<P> & { quiet?: boolean }) {
  const t = useT();
  const prompt = lexemeOf(content, payload.prompt.lexemeId);
  const audio = payload.prompt.audioAssetId
    ? content.audioAssets[payload.prompt.audioAssetId]
    : prompt?.audio;
  const reading = quiet || !audio?.url;
  const labelOf = tileLabelOf(content);
  // Never two tiles with the same meaning (audit M02): the gate refuses them, this guards old rows.
  const options = shuffle(
    distinctOptions(payload.options, labelOf),
    seedOf(payload.prompt.lexemeId),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const correctId = payload.options.find((o) => o.correct)?.lexemeId ?? "";
  const stateOf = (id: string): TileState =>
    checked === null
      ? picked === id
        ? "picked"
        : ""
      : id === correctId
        ? "right"
        : picked === id
          ? "wrong"
          : "";
  return (
    <View>
      <Text className="mb-3 font-display text-xl text-indigo">
        {reading ? t("lesson.chooseGlossQuiet") : t("lesson.chooseGloss")}
      </Text>
      <View className="mb-6 flex-row items-center gap-4 rounded-3xl bg-cloud p-4">
        {reading ? (
          <>
            {!quiet && <AudioButton url={audio?.url} label={t("lesson.listen")} small />}
            <Text className="flex-1 font-display-bold text-4xl text-ink" accessibilityLanguage="xh">
              {prompt?.lemma}
            </Text>
          </>
        ) : (
          <>
            <AudioButton
              url={audio?.url}
              label={t("lesson.listen")}
              attribution={audio?.attribution}
              autoPlay
            />
            <AudioButton url={audio?.url} label={t("lesson.slow")} rate={0.7} small />
            {checked !== null && (
              <Text className="flex-1 font-display text-2xl text-ink" accessibilityLanguage="xh">
                {prompt?.lemma}
              </Text>
            )}
          </>
        )}
      </View>
      <View className="gap-3">
        {options.map((o) => (
          <OptionTile
            key={o.lexemeId}
            state={stateOf(o.lexemeId)}
            selected={picked === o.lexemeId}
            disabled={checked !== null}
            onPress={() => setPicked(o.lexemeId)}
            accessibilityLabel={glossOf(content, o.lexemeId)}
            testID={`option-${o.lexemeId}`}
          >
            <Text className="font-body-semibold text-xl text-ink">
              {glossOf(content, o.lexemeId)}
            </Text>
          </OptionTile>
        ))}
      </View>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={
          checked === false ? `${prompt?.lemma ?? ""}: ${glossOf(content, correctId)}` : undefined
        }
        onCheck={() => setChecked(sameTile(picked, correctId, labelOf, "gloss"))}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}
