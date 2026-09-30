import { type ExercisePayload } from "@molo/core";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Crane } from "~/ui/Mascots.tsx";
import { OptionTile, type TileState } from "~/ui/OptionTile.tsx";
import { clickColors, colors } from "~/ui/theme.ts";

import { CheckBar } from "./CheckBar.tsx";
import { lexemeOf, seedOf, shuffle, SKIPPED, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "click_drill" }>;

/** The base click letter of a click label such as "gc" or "xh", for its colour. */
export function clickColor(click: string): string {
  const base = [...click.toLowerCase()].find((c) => c === "c" || c === "x" || c === "q");
  return (base && clickColors[base]) || colors.indigo;
}

/**
 * Listen-and-identify variant; words without a tier-1 recording are left
 * out, as on the web. A drill with nothing to play says so and is skipped
 * without a score.
 */
export function ClickDrill({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const rounds = useMemo(() => {
    const items = [...payload.pairs.flatMap((p) => [p.a, p.b]), ...payload.contrastWords].filter(
      (i) => i.audioAssetId && content.audioAssets[i.audioAssetId],
    );
    return shuffle(items, seedOf(payload.set)).slice(0, 6);
  }, [payload, content]);
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
  const audio = content.audioAssets[current.audioAssetId ?? ""];
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
  const stateOf = (c: string): TileState =>
    checked === null
      ? picked === c
        ? "picked"
        : ""
      : c === current.click
        ? "right"
        : picked === c
          ? "wrong"
          : "";

  return (
    <View>
      <Text className="mb-1 font-display text-xl text-indigo">{t("lesson.clickIdentify")}</Text>
      <Text className="mb-4 font-body-semibold text-sm text-mist">
        {t("lesson.progress", { done: round + 1, total: rounds.length })}
      </Text>
      <View className="mb-6 flex-row items-center gap-4 rounded-3xl bg-cloud p-4">
        <AudioButton
          key={current.lexemeId}
          url={audio?.url}
          label={t("lesson.listen")}
          autoPlay
          cue
        />
        <AudioButton url={audio?.url} label={t("lesson.slow")} rate={0.6} small />
        {checked !== null && (
          <Text className="flex-1 font-display text-2xl text-ink" accessibilityLanguage="xh">
            {lexemeOf(content, current.lexemeId)?.lemma}
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap gap-3">
        {payload.contrast.map((c) => (
          <OptionTile
            key={c}
            state={stateOf(c)}
            selected={picked === c}
            disabled={checked !== null}
            onPress={() => setPicked(c)}
            accessibilityLabel={c}
            className="min-w-24 items-center"
          >
            <Text className="font-display-bold text-4xl" style={{ color: clickColor(c) }}>
              {c}
            </Text>
          </OptionTile>
        ))}
      </View>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? current.click : undefined}
        onCheck={() => setChecked(picked === current.click)}
        onContinue={next}
      />
    </View>
  );
}
