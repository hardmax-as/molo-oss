import { normaliseXhosa, type ExercisePayload } from "@molo/core";
import { useMemo, useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useSfx } from "~/lib/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { OptionButton } from "./OptionButton.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import { seedOf, shuffle, type ExerciseProps } from "./types.ts";
import { WordHint, glossForHint } from "./WordHint.tsx";

type P = Extract<ExercisePayload, { type: "concord_fill" }>;

/**
 * Concord fill: the sentence with its agreement morphemes blanked out.
 * Blanks are positions in `sentence.tokens`; the options for each blank are
 * the real surface form plus the payload's distractors (never invented
 * here). Feedback is per blank so the learner sees which concord slipped.
 */
export function ConcordFill({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const sentence = content.sentences[payload.sentenceId];
  const words = useMemo(() => {
    if (!sentence) return [];
    if (sentence.tokens.length > 0)
      return [...sentence.tokens].sort((a, b) => a.position - b.position).map((k) => k.surfaceForm);
    return sentence.textXh.split(/\s+/);
  }, [sentence]);
  const blanks = useMemo(
    () =>
      payload.blanks
        .filter((b) => b.position < words.length)
        .map((b) => {
          const answer = words[b.position] ?? "";
          const options = shuffle(
            [answer, ...b.distractors],
            seedOf(`${payload.sentenceId}:${b.position}`),
          );
          return { position: b.position, answer, options, form: b.form };
        }),
    [payload, words],
  );
  const tokenAt = (pos: number) => sentence?.tokens.find((k) => k.position === pos);
  /**
   * The words under test. A hint on the word a blank belongs to would name
   * the concord the learner is being asked for, so those stay plain text.
   */
  const hiddenWords = useMemo(
    () => new Set(payload.blanks.map((b) => b.lexemeId)),
    [payload.blanks],
  );
  const [filled, setFilled] = useState<Record<number, string>>({});
  const [active, setActive] = useState<number>(blanks[0]?.position ?? 0);
  const [checked, setChecked] = useState<boolean | null>(null);
  const blankAt = (pos: number) => blanks.find((b) => b.position === pos);
  const allFilled = blanks.every((b) => filled[b.position] !== undefined);
  const isRight = (pos: number) => {
    const b = blankAt(pos);
    return !!b && normaliseXhosa(filled[pos] ?? "") === normaliseXhosa(b.answer);
  };

  function choose(option: string) {
    setFilled((f) => ({ ...f, [active]: option }));
    const next = blanks.find((b) => b.position !== active && filled[b.position] === undefined);
    if (next) setActive(next.position);
  }

  const current = blankAt(active);

  return (
    <div>
      <h2 className="mb-3 font-display text-2xl font-bold text-indigo">{t("lesson.fillBlanks")}</h2>
      {/* The crane is the mentor: a sentence being explained is said by it,
          not printed into a void (docs/DESIGN.md "Illustration"). */}
      <SpeechBubble speaker="teaching">
        <p
          className="flex flex-wrap items-baseline gap-x-2 gap-y-3 font-display text-2xl text-ink sm:text-3xl"
          lang="xh"
        >
          {words.map((w, pos) => {
            const b = blankAt(pos);
            if (!b)
              return (
                <WordHint
                  key={pos}
                  word={w}
                  gloss={glossForHint(content, tokenAt(pos)?.lexemeId, hiddenWords)}
                />
              );
            const value = filled[pos];
            const tone =
              checked === null
                ? active === pos
                  ? "border-indigo bg-indigo-soft/10"
                  : "border-mist-soft bg-sand"
                : isRight(pos)
                  ? "border-sea bg-sea-soft text-sea-deep"
                  : "border-coral bg-coral-soft text-coral-deep";
            return (
              <button
                key={pos}
                type="button"
                disabled={checked !== null}
                onClick={() => setActive(pos)}
                aria-label={
                  value
                    ? `${t("lesson.blankAt", { n: pos + 1 })}: ${value}`
                    : t("lesson.blankAt", { n: pos + 1 })
                }
                aria-pressed={checked === null ? active === pos : undefined}
                className={`min-h-11 min-w-20 rounded-xl border-2 border-dashed px-3 py-1 text-center ${tone}`}
              >
                {value ? <ClickText text={value} /> : <span className="text-mist">…</span>}
              </button>
            );
          })}
        </p>
        <div className="mt-3 flex items-center gap-3">
          {sentence?.audio && (
            <AudioButton
              url={sentence.audio.url}
              label={t("lesson.listen")}
              attribution={sentence.audio.attribution}
              tone="sun"
              size="sm"
            />
          )}
          <p className="text-base text-mist">{sentence?.gloss?.gloss ?? "?"}</p>
        </div>
      </SpeechBubble>
      {current && checked === null && (
        <ul
          className="grid gap-2 sm:grid-cols-2"
          aria-label={t("lesson.blankAt", { n: active + 1 })}
        >
          {current.options.map((o) => (
            <li key={o}>
              <OptionButton
                state={filled[active] === o ? "picked" : ""}
                disabled={false}
                onClick={() => {
                  sfx.play("tap");
                  choose(o);
                }}
              >
                <ClickText text={o} />
              </OptionButton>
            </li>
          ))}
        </ul>
      )}
      <CheckBar
        canCheck={allFilled}
        checked={checked}
        correctAnswer={checked === false ? sentence?.textXh : undefined}
        onCheck={() => setChecked(blanks.every((b) => isRight(b.position)))}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
