import type { ExercisePayload } from "@molo/core";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { OptionButton, type OptionState } from "./OptionButton.tsx";
import { glossOf, lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "select_listen" }>;

export function SelectListen({ payload, content, onDone, quiet }: ExerciseProps<P>) {
  const t = useT();
  const options = shuffle(payload.options, seedOf(payload.prompt.lexemeId));
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const correctId = payload.options.find((o) => o.correct)?.lexemeId ?? "";
  const stateOf = (id: string): OptionState =>
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
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">
        {quiet ? t("lesson.chooseWordQuiet") : t("lesson.chooseAudio")}
      </h2>
      <p className="mb-6 font-display text-3xl text-ink">
        {glossOf(content, payload.prompt.lexemeId)}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label={t("a11y.options")}>
        {options.map((o, i) => {
          const lx = lexemeOf(content, o.lexemeId);
          return (
            <li key={o.lexemeId} className="flex items-center gap-3">
              {!quiet && (
                <AudioButton
                  url={lx?.audio?.url}
                  label={`${t("lesson.listen")} ${i + 1}`}
                  attribution={lx?.audio?.attribution}
                  tone="indigo"
                />
              )}
              <OptionButton
                state={stateOf(o.lexemeId)}
                disabled={checked !== null}
                onClick={() => setPicked(o.lexemeId)}
              >
                {quiet || checked !== null ? (
                  <ClickText text={lx?.lemma ?? ""} />
                ) : (
                  <span className="font-display">{i + 1}</span>
                )}
              </OptionButton>
            </li>
          );
        })}
      </ul>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={checked === false ? lexemeOf(content, correctId)?.lemma : undefined}
        onCheck={() => setChecked(picked === correctId)}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
