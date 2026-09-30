import { answerMatches, type AnswerVerdict, type ExercisePayload } from "@molo/core";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Crane } from "~/components/illustrations/Crane.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText, clickLettersIn } from "./ClickText.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import type { ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "translate_type" }>;

/**
 * Type the isiXhosa for a gloss. The verdict comes from `answerMatches`
 * (lenient on tone marks, one forgiven typo in long words, never a click):
 * a click mistake is named and taught, a forgiven typo is shown so the
 * spelling still sticks.
 */
export function TranslateType({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sentence = content.sentences[payload.sentenceId];
  const expected = sentence?.textXh ?? "";
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const checked = verdict === null ? null : verdict.ok;
  const clicks = clickLettersIn(expected);

  const hint =
    verdict === null ? null : verdict.ok ? (
      verdict.typo ? (
        <p>
          {t("lesson.typoHint")}{" "}
          <ClickText text={expected} className="font-display text-lg text-indigo" />
        </p>
      ) : null
    ) : verdict.reason === "click" ? (
      <div className="space-y-1">
        <p className="font-semibold">{t("lesson.clickHint", { letters: clicks.join(", ") })}</p>
        {clicks.map((c) => (
          <p key={c} className="text-coral-deep/90">
            <span className={`click-${c} font-display text-lg font-bold`}>{c}</span>{" "}
            <Crane pose="listen" size={56} className="mr-2 inline-block align-middle" />
            {t(`lesson.clickTeach.${c}` as never)}
          </p>
        ))}
      </div>
    ) : null;

  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">
        {t("lesson.typeTheXhosa")}
      </h2>
      {/* The sunbird is the voice: it plays the sentence. The bubble holds
          the meaning and the audio only — the isiXhosa is what is being
          asked for, so printing it here would hand over the answer. */}
      <SpeechBubble speaker="listening">
        <p className="font-display text-xl text-ink sm:text-2xl">{sentence?.gloss?.gloss ?? "?"}</p>
        {sentence?.audio && (
          <div className="mt-3">
            <AudioButton
              url={sentence.audio.url}
              label={t("lesson.listen")}
              attribution={sentence.audio.attribution}
              tone="sun"
              size="sm"
            />
          </div>
        )}
      </SpeechBubble>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (verdict === null && value.trim()) setVerdict(answerMatches(value, expected));
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={verdict !== null}
          placeholder={t("lesson.typePlaceholder")}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t("lesson.typeTheXhosa")}
          className={`w-full rounded-2xl border-2 bg-cloud px-5 py-4 font-display text-2xl text-ink placeholder:text-mist focus:border-sun ${checked === null ? "border-mist-soft" : checked ? "border-sea" : "border-coral"}`}
        />
      </form>
      <CheckBar
        canCheck={value.trim().length > 0}
        checked={checked}
        correctAnswer={checked === false ? expected : undefined}
        hint={hint}
        onCheck={() => setVerdict(answerMatches(value, expected))}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
