import { matchPairsMeanings, type ExercisePayload } from "@molo/core";
import { playsOnTap } from "@molo/core/lesson";
import { useState } from "react";
import { Text, View } from "react-native";

import { AudioButton, useAudioControls } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { OptionTile, type TileState } from "~/ui/OptionTile.tsx";
import { useSfx } from "~/ui/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import {
  distinctPairIds,
  glossOf,
  lexemeOf,
  sameTile,
  tileLabelOf,
  type ExerciseProps,
} from "./types.ts";

type P = Extract<ExercisePayload, { type: "match_pairs" }>;

/**
 * Words on the left, meanings on the right in an order where no meaning
 * shares a row with its own word (`matchPairsMeanings`, the function the
 * web uses too). Each row stretches to the taller of its two tiles so the
 * columns stay aligned however the glosses wrap.
 *
 * Choosing an isiXhosa tile also says the word, once per tap, as Duolingo
 * does (`playsOnTap`): not in quiet mode, not for a word with no recording,
 * never on the meanings' side. The speaker in the tile replays it.
 */
export function MatchPairs({
  payload,
  content,
  onDone,
  quiet = false,
}: ExerciseProps<P> & { quiet?: boolean }) {
  const t = useT();
  const sfx = useSfx();
  const labelOf = tileLabelOf(content);
  // No two words, or two meanings, that read the same (audit M02).
  const ids = distinctPairIds(
    payload.pairs.map((p) => p.lexemeId),
    labelOf,
  );
  const right = matchPairsMeanings(ids);
  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const { controls, controlFor } = useAudioControls();
  const done = Object.keys(matched).length === ids.length;

  function pickRight(id: string) {
    if (!selLeft) return;
    if (sameTile(id, selLeft, labelOf, "gloss")) {
      setMatched((m) => ({ ...m, [selLeft]: id }));
      sfx.play("correct");
    } else {
      setMistakes((n) => n + 1);
      setWrongFlash(id);
      sfx.play("wrong");
      setTimeout(() => setWrongFlash(null), 500);
    }
    setSelLeft(null);
  }
  const leftState = (id: string): TileState =>
    id in matched ? "right" : selLeft === id ? "picked" : "";
  const rightState = (id: string): TileState =>
    Object.values(matched).includes(id) ? "right" : wrongFlash === id ? "wrong" : "";

  return (
    <View>
      <Text className="mb-4 font-display text-xl text-indigo">{t("lesson.matchPairs")}</Text>
      <View className="gap-3">
        {ids.map((leftId, i) => {
          const lx = lexemeOf(content, leftId);
          const rightId = right[i] ?? leftId;
          return (
            <View key={leftId} className="flex-row items-stretch gap-3">
              <View className="flex-1">
                <OptionTile
                  state={leftState(leftId)}
                  selected={selLeft === leftId}
                  disabled={leftId in matched}
                  onPress={() => {
                    setSelLeft(leftId);
                    if (playsOnTap({ side: "xh", listening: !quiet, hasClip: !!lx?.audio?.url }))
                      controls.current.get(leftId)?.play();
                  }}
                  accessibilityLabel={lx?.lemma ?? ""}
                  className="flex-row items-center gap-2"
                  fill
                  playAction={
                    lx?.audio?.url
                      ? {
                          label: t("lesson.listen"),
                          play: () => controls.current.get(leftId)?.play(),
                        }
                      : undefined
                  }
                >
                  <View className="flex-row items-center gap-2">
                    {lx?.audio?.url && (
                      <AudioButton
                        controlRef={controlFor(leftId)}
                        url={lx.audio.url}
                        label={lx.lemma}
                        small
                        variant="tile"
                      />
                    )}
                    <Text
                      className="flex-1 font-display text-lg text-ink"
                      accessibilityLanguage="xh"
                    >
                      {lx?.lemma}
                    </Text>
                  </View>
                </OptionTile>
              </View>
              <View className="flex-1">
                <OptionTile
                  state={rightState(rightId)}
                  disabled={Object.values(matched).includes(rightId) || !selLeft}
                  onPress={() => pickRight(rightId)}
                  accessibilityLabel={glossOf(content, rightId)}
                  className="justify-center"
                  fill
                >
                  <Text className="font-body-semibold text-lg text-ink">
                    {glossOf(content, rightId)}
                  </Text>
                </OptionTile>
              </View>
            </View>
          );
        })}
      </View>
      <CheckBar
        canCheck={done}
        checked={done ? mistakes === 0 : null}
        onCheck={() => undefined}
        onContinue={() =>
          onDone({
            correct: mistakes === 0,
            xp:
              mistakes === 0
                ? currentTuning().xp.correct
                : Math.max(0, currentTuning().xp.correct - mistakes * 3),
          })
        }
      />
    </View>
  );
}
