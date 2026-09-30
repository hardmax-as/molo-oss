import { clickSoundById, type ClickSound, type ExercisePayload } from "@molo/core";
import { useEffect, useMemo, useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useSfx } from "~/lib/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { OptionButton, type OptionState } from "./OptionButton.tsx";
import { seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "click_identify" }>;

/**
 * Hear a bare click, pick its letter (DESIGN.md "Click drill"): the cue
 * tick, the studio take of one click, then big tiles in the click colours
 * (c sea, x sun, q coral, in their AA text shades). Every click in the set
 * is played once, in a shuffled order. Only published tier-1 takes arrive
 * in `content.clickAudio`; a click without one is left out, and a set with
 * none says so and is skipped without a score.
 */
export function ClickIdentify({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const choices = useMemo(
    () => payload.clicks.flatMap((id) => clickSoundById(id) ?? []),
    [payload.clicks],
  );
  const rounds = useMemo(
    () =>
      shuffle(
        choices.filter((c) => content.clickAudio?.[c.id]),
        seedOf(`${payload.set}:${payload.clicks.join()}`),
      ),
    [choices, content.clickAudio, payload.set, payload.clicks],
  );
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
        <p className="mb-6 text-mist">{t("lesson.clickNoAudio")}</p>
        <Button variant="indigo" onClick={() => onDone({ correct: false, xp: 0 })}>
          {t("lesson.skip")}
        </Button>
      </div>
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
  const stateOf = (id: string): OptionState =>
    checked === null
      ? picked === id
        ? "picked"
        : ""
      : id === current.id
        ? "right"
        : picked === id
          ? "wrong"
          : "";

  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">
        {t("lesson.clickIdentify")}
      </h2>
      <p className="mb-6 text-sm text-mist">
        {t("lesson.progress", { done: round + 1, total: rounds.length })}
      </p>
      <div className="mb-8 flex justify-center">
        <AudioButton
          key={`${current.id}:${round}`}
          url={audio?.url}
          label={t("lesson.clickReplay")}
          autoPlay
          size="lg"
          tone="sun"
        />
      </div>
      <ul
        className={`grid gap-3 ${choices.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}
        aria-label={t("a11y.options")}
      >
        {choices.map((c) => (
          <li key={c.id}>
            <OptionButton
              state={stateOf(c.id)}
              disabled={checked !== null}
              onClick={() => setPicked(c.id)}
              size="lg"
              className="min-h-20 text-center"
            >
              <span className={`click-${c.base} font-display text-4xl font-bold`} lang="xh">
                {c.letter}
              </span>
            </OptionButton>
          </li>
        ))}
      </ul>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? current.letter : undefined}
        hint={checked === false ? <ClickHint click={current} /> : undefined}
        onCheck={() => setChecked(picked === current.id)}
        onContinue={next}
      />
    </div>
  );
}

/** What the click that was played sounds like: the place for a plain click, the manner for the rest. */
function ClickHint({ click }: { click: ClickSound }) {
  const t = useT();
  // Both sentences open with the letter itself, and the right tile is
  // already lit in its colour, so the letter is not repeated in front.
  return (
    <p>
      {click.variant === "plain"
        ? t(`lesson.clickTeach.${click.base}` as never)
        : t(`lesson.clickVariant.${click.variant}` as never, { letters: click.letter })}
    </p>
  );
}
