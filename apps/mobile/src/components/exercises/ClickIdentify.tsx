import { type ExercisePayload } from "@molo/core";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Crane } from "~/ui/Mascots.tsx";
import { OptionTile, type TileState } from "~/ui/OptionTile.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { clickColor } from "./ClickDrill.tsx";
import { clickChoices, clickRounds } from "./helpers.ts";
import { SKIPPED, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "click_identify" }>;

/**
 * Hear a bare click, pick its letter, as on the web: every click in the set
 * is played once from its published tier-1 studio take, in a shuffled
 * order, and the learner picks from big tiles in the click colours. The
 * tiles tap with a selection haptic and the check bar answers with the
 * success or warning one; the tile motion stands still under reduced
 * motion. A set with nothing recorded says so and is skipped unscored.
 */
export function ClickIdentify({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const choices = useMemo(() => clickChoices(payload.clicks), [payload.clicks]);
  const rounds = useMemo(
    () => clickRounds(payload.set, payload.clicks, content.clickAudio),
    [payload.set, payload.clicks, content.clickAudio],
  );
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const current = rounds[round];

  if (!current) {
    return (
      <View>
        <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.clickIdentify")}</Text>
        <View className="mb-4 flex-row items-center gap-4 rounded-3xl bg-cloud p-4">
          <Crane pose="think" size={72} />
          <Text className="flex-1 font-body text-base text-ink">{t("lesson.clickNoAudio")}</Text>
        </View>
        <View className="items-start">
          <Button label={t("lesson.skip")} variant="cloud" onPress={() => onDone(SKIPPED)} />
        </View>
      </View>
    );
  }
  const audio = content.clickAudio?.[current.id];
  const next = () => {
    const ok = checked === true;
    const s = { right: score.right + (ok ? 1 : 0), wrong: score.wrong + (ok ? 0 : 1) };
    if (round + 1 >= rounds.length) {
      onDone({ correct: s.wrong === 0, xp: s.right * currentTuning().xp.clickDrillCorrect });
      return;
    }
    setScore(s);
    setRound(round + 1);
    setPicked(null);
    setChecked(null);
  };
  const stateOf = (id: string): TileState =>
    checked === null
      ? picked === id
        ? "picked"
        : ""
      : id === current.id
        ? "right"
        : picked === id
          ? "wrong"
          : "";
  const hint =
    current.variant === "plain"
      ? t(`lesson.clickTeach.${current.base}` as never)
      : t(`lesson.clickVariant.${current.variant}` as never, { letters: current.letter });

  return (
    <View>
      <Text className="mb-1 font-display text-xl text-indigo">{t("lesson.clickIdentify")}</Text>
      <Text className="mb-4 font-body-semibold text-sm text-mist">
        {t("lesson.progress", { done: round + 1, total: rounds.length })}
      </Text>
      <View className="mb-6 items-center rounded-3xl bg-cloud p-4">
        <AudioButton
          key={`${current.id}:${round}`}
          url={audio?.url}
          label={t("lesson.clickReplay")}
          autoPlay
          cue
        />
      </View>
      <View className="flex-row flex-wrap justify-center gap-3">
        {choices.map((c) => (
          <View key={c.id} style={{ width: choices.length <= 3 ? "30%" : "46%" }}>
            <OptionTile
              state={stateOf(c.id)}
              selected={picked === c.id}
              disabled={checked !== null}
              onPress={() => setPicked(c.id)}
              accessibilityLabel={c.letter}
              className="min-h-20 items-center justify-center"
            >
              <Text
                className="font-display-bold text-4xl"
                style={{ color: clickColor(c.letter) }}
                accessibilityLanguage="xh"
              >
                {c.letter}
              </Text>
            </OptionTile>
          </View>
        ))}
      </View>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? current.letter : undefined}
        detail={checked === false ? hint : undefined}
        onCheck={() => setChecked(picked === current.id)}
        onContinue={next}
      />
    </View>
  );
}
