import type { ExercisePayload } from "@molo/core";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { OptionButton, type OptionState } from "./OptionButton.tsx";
import { glossOf, lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "listen_select" }>;

export function ListenSelect({ payload, content, onDone, quiet }: ExerciseProps<P>) {
  const t = useT();
  const prompt = lexemeOf(content, payload.prompt.lexemeId);
  const audio = payload.prompt.audioAssetId
    ? content.audioAssets[payload.prompt.audioAssetId]
    : prompt?.audio;
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
      <h2 className="mb-4 font-display text-2xl font-bold text-indigo">
        {quiet ? t("lesson.chooseGlossQuiet") : t("lesson.chooseGloss")}
      </h2>
      {quiet ? (
        <p className="mb-8 font-display text-4xl font-bold text-ink">
          <ClickText text={prompt?.lemma ?? ""} />
        </p>
      ) : (
        <div className="mb-8 flex items-center gap-4">
          <AudioButton
            url={audio?.url}
            voices={payload.prompt.audioAssetId ? undefined : prompt?.voices}
            label={t("lesson.listen")}
            attribution={audio?.attribution}
            autoPlay
            size="lg"
            tone="sun"
          />
          {audio?.url && (
            <AudioButton url={audio.url} label={t("lesson.slow")} rate={0.7} size="sm" />
          )}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2" aria-label={t("a11y.options")}>
        {options.map((o) => (
          <li key={o.lexemeId}>
            <OptionButton
              state={stateOf(o.lexemeId)}
              disabled={checked !== null}
              onClick={() => setPicked(o.lexemeId)}
            >
              {glossOf(content, o.lexemeId)}
            </OptionButton>
          </li>
        ))}
      </ul>
      <CheckBar
        canCheck={picked !== null}
        checked={checked}
        correctAnswer={
          checked === false ? `${prompt?.lemma ?? ""}: ${glossOf(content, correctId)}` : undefined
        }
        onCheck={() => setChecked(picked === correctId)}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
