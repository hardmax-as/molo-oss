import { type ExercisePayload } from "@molo/core";
import { useState } from "react";
import { Text, View } from "react-native";

import { AudioButton, useAudioControls } from "~/components/AudioButton.tsx";
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

type P = Extract<ExercisePayload, { type: "select_listen" }>;

/**
 * See the gloss, pick the recording that says it. In quiet mode, and for
 * any option without a recording yet, the written word is shown instead of
 * a numbered speaker, so the exercise can always be answered.
 */
export function SelectListen({
  payload,
  content,
  onDone,
  quiet = false,
}: ExerciseProps<P> & { quiet?: boolean }) {
  const t = useT();
  const labelOf = tileLabelOf(content);
  // Never two words that say the prompt, or two identical words (audit M02).
  const options = shuffle(
    distinctOptions(payload.options, labelOf),
    seedOf(payload.prompt.lexemeId),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const { controls, controlFor } = useAudioControls();
  const [checked, setChecked] = useState<boolean | null>(null);
  const correctId = payload.options.find((o) => o.correct)?.lexemeId ?? "";
  const anyAudio = options.some((o) => !!lexemeOf(content, o.lexemeId)?.audio?.url);
  const reading = quiet || !anyAudio;
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
      <Text className="mb-1 font-display text-xl text-indigo">
        {reading ? t("lesson.chooseWordQuiet") : t("lesson.chooseAudio")}
      </Text>
      <Text className="mb-5 font-display text-3xl text-ink">
        {glossOf(content, payload.prompt.lexemeId)}
      </Text>
      <View className="gap-3">
        {options.map((o, i) => {
          const lx = lexemeOf(content, o.lexemeId);
          const url = lx?.audio?.url;
          const showWord = reading || !url || checked !== null;
          return (
            <OptionTile
              key={o.lexemeId}
              state={stateOf(o.lexemeId)}
              selected={picked === o.lexemeId}
              disabled={checked !== null}
              onPress={() => setPicked(o.lexemeId)}
              accessibilityLabel={showWord ? (lx?.lemma ?? "") : `${t("lesson.listen")} ${i + 1}`}
              className="flex-row items-center gap-4"
              testID={`option-${o.lexemeId}`}
              playAction={
                !quiet && url
                  ? {
                      label: `${t("lesson.listen")} ${i + 1}`,
                      play: () => controls.current.get(o.lexemeId)?.play(),
                    }
                  : undefined
              }
            >
              <View className="flex-row items-center gap-4">
                {!quiet && url && (
                  <AudioButton
                    controlRef={controlFor(o.lexemeId)}
                    url={url}
                    label={`${t("lesson.listen")} ${i + 1}`}
                    attribution={lx?.audio?.attribution}
                    variant="tile"
                  />
                )}
                <Text
                  className="font-display text-2xl text-ink"
                  // The tile shows either the isiXhosa word or a number; only
                  // one of those is isiXhosa.
                  {...(showWord ? { accessibilityLanguage: "xh" } : {})}
                >
                  {showWord ? lx?.lemma : `${i + 1}`}
                </Text>
              </View>
            </OptionTile>
          );
        })}
      </View>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? lexemeOf(content, correctId)?.lemma : undefined}
        onCheck={() =>
          setChecked(
            sameTile(picked, correctId, labelOf, "gloss") ||
              sameTile(picked, correctId, labelOf, "lemma"),
          )
        }
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}
