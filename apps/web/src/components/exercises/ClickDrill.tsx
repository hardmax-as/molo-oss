import type { ExercisePayload } from "@molo/core";
import { useEffect, useMemo, useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useSfx } from "~/lib/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { OptionButton, type OptionState } from "./OptionButton.tsx";
import { lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "click_drill" }>;

/**
 * Listen-and-identify (DESIGN.md "Click drill"): a cue tick, the speaker,
 * then big tactile buttons in the click colours. Each round plays one word
 * from the set's dedicated tier-1 recordings and asks which click it
 * carries; words without a recording are skipped.
 */
export function ClickDrill({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
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
  useEffect(() => {
    if (current) sfx.play("cue");
  }, [current, sfx]);

  if (!current) {
    return (
      <div className="text-center">
        <h2 className="mb-2 font-display text-2xl font-bold text-indigo">
          {t("lesson.clickIdentify")}
        </h2>
        <p className="mb-6 text-mist">—</p>
        <Button variant="indigo" onClick={() => onDone({ correct: false, xp: 0 })}>
          {t("lesson.skip")}
        </Button>
      </div>
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
  const stateOf = (c: string): OptionState =>
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
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">
        {t("lesson.clickIdentify")}
      </h2>
      <p className="mb-6 text-sm text-mist">
        {t("lesson.progress", { done: round + 1, total: rounds.length })} · {payload.set}
      </p>
      <div className="mb-8 flex items-center gap-4">
        <AudioButton
          key={current.lexemeId}
          url={audio?.url}
          label={t("lesson.listen")}
          autoPlay
          size="lg"
          tone="sun"
        />
        <AudioButton url={audio?.url} label={t("lesson.slow")} rate={0.6} size="sm" />
        {checked !== null && (
          <span className="font-display text-3xl font-bold text-ink">
            <ClickText text={lexemeOf(content, current.lexemeId)?.lemma ?? ""} />
          </span>
        )}
      </div>
      <ul className="flex flex-wrap gap-3" aria-label={t("a11y.options")}>
        {payload.contrast.map((c) => (
          <li key={c} className="min-w-24 grow sm:grow-0">
            <OptionButton
              state={stateOf(c)}
              disabled={checked !== null}
              onClick={() => setPicked(c)}
              size="lg"
              className="text-center"
            >
              <span className={`click-${c[0] ?? ""} font-display text-3xl`}>{c}</span>
            </OptionButton>
          </li>
        ))}
      </ul>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? current.click : undefined}
        hint={
          checked === false ? (
            <p>
              <span className={`click-${current.click[0] ?? ""} font-display text-lg font-bold`}>
                {current.click[0]}
              </span>{" "}
              {t(`lesson.clickTeach.${current.click[0] ?? "c"}` as never)}
            </p>
          ) : undefined
        }
        onCheck={() => setChecked(picked === current.click)}
        onContinue={next}
      />
    </div>
  );
}
