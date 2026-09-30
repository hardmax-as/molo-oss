import { normaliseXhosa } from "@molo/core";
import type { ExercisePayload } from "@molo/core";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import { lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "translate_tap" }>;

/**
 * Tiles are the sentence's surface forms (sentence_lexemes) plus distractor
 * lemmas. Until tokens exist for a sentence, the sentence text is split on
 * spaces so drafts stay playable; comparison ignores punctuation and tone.
 */
export function TranslateTap({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const sentence = content.sentences[payload.sentenceId];
  const target = sentence
    ? sentence.tokens.length > 0
      ? sentence.tokens.map((k) => k.surfaceForm)
      : sentence.textXh.split(/\s+/)
    : [];
  const distractors = payload.distractorLexemeIds
    .map((id) => lexemeOf(content, id)?.lemma)
    .filter((x): x is string => !!x);
  const tiles = shuffle(
    [...target, ...distractors].map((text, i) => ({ id: `${i}-${text}`, text })),
    seedOf(payload.sentenceId),
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const isCorrect = () =>
    chosen.length === target.length &&
    chosen.every(
      (id, i) =>
        normaliseXhosa(tiles.find((x) => x.id === id)?.text ?? "") ===
        normaliseXhosa(target[i] ?? ""),
    );
  const tile = (extra: string) =>
    `pressable rounded-2xl border-2 px-4 py-2 font-display text-xl shadow-card ${extra}`;

  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">{t("lesson.assemble")}</h2>
      {/* The sunbird plays it. The bubble carries the meaning, never the
          isiXhosa: assembling that is the exercise. */}
      <SpeechBubble speaker="listening" className="mb-5">
        <p className="text-lg text-ink sm:text-xl">{sentence?.gloss?.gloss ?? "?"}</p>
        <div className="mt-3">
          <AudioButton
            url={sentence?.audio?.url}
            label={t("lesson.listen")}
            attribution={sentence?.audio?.attribution}
            tone="sun"
            size="sm"
          />
        </div>
      </SpeechBubble>
      <div
        className={`mb-5 flex min-h-16 flex-wrap gap-2 rounded-3xl border-2 border-dashed p-3 ${checked === null ? "border-mist-soft bg-sand" : checked ? "border-sea bg-sea-soft" : "border-coral bg-coral-soft"}`}
        role="group"
        aria-label={t("lesson.answerArea")}
      >
        <AnimatePresence>
          {chosen.map((id) => (
            <motion.button
              key={id}
              layout
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              type="button"
              disabled={checked !== null}
              aria-label={t("lesson.removeWord", {
                word: tiles.find((x) => x.id === id)?.text ?? "",
              })}
              onClick={() => {
                sfx.play("tap");
                setChosen((c) => c.filter((x) => x !== id));
              }}
              className={tile("min-h-11 border-indigo-deep bg-indigo text-white")}
            >
              <ClickText text={tiles.find((x) => x.id === id)?.text ?? ""} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("a11y.wordBank")}>
        {tiles.map((x) => {
          const used = chosen.includes(x.id);
          return (
            <motion.button
              key={x.id}
              type="button"
              disabled={checked !== null || used}
              aria-label={t("lesson.addWord", { word: x.text })}
              animate={{ opacity: used ? 0.25 : 1 }}
              onClick={() => {
                sfx.play("tap");
                setChosen((c) => [...c, x.id]);
              }}
              className={tile(
                "min-h-11 border-mist-soft bg-cloud text-ink disabled:cursor-default",
              )}
            >
              <ClickText text={x.text} />
            </motion.button>
          );
        })}
      </div>
      <CheckBar
        canCheck={chosen.length > 0}
        checked={checked}
        correctAnswer={checked === false ? sentence?.textXh : undefined}
        onCheck={() => setChecked(isCorrect())}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
