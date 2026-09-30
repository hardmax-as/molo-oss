import type { ExercisePayload } from "@molo/core";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useSfx } from "~/lib/sfx.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "class_sort" }>;

export function ClassSort({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const items = shuffle(payload.items, seedOf(payload.items.map((i) => i.lexemeId).join()));
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const allPlaced = items.every((i) => i.lexemeId in placed);

  function place(bucket: string) {
    if (!active) return;
    sfx.play("tap");
    setPlaced((p) => ({ ...p, [active]: bucket }));
    setActive(null);
  }
  const correct = () =>
    items.every((i) => placed[i.lexemeId] === lexemeOf(content, i.lexemeId)?.nounClass);

  return (
    <div>
      <h2 className="mb-5 font-display text-2xl font-bold text-indigo">
        {t("lesson.sortClasses")}
      </h2>
      <ul className="mb-5 flex flex-wrap gap-2" aria-label={t("a11y.wordsToSort")}>
        {items
          .filter((i) => !(i.lexemeId in placed))
          .map((i) => {
            const lx = lexemeOf(content, i.lexemeId);
            return (
              <li key={i.lexemeId}>
                <button
                  type="button"
                  onClick={() => {
                    sfx.play("tap");
                    setActive(i.lexemeId);
                  }}
                  aria-pressed={active === i.lexemeId}
                  className={`pressable inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 px-3 py-2 font-display text-xl ${active === i.lexemeId ? "border-indigo bg-indigo text-white" : "border-mist-soft bg-cloud text-ink"}`}
                >
                  <ClickText text={lx?.lemma ?? ""} />
                </button>
              </li>
            );
          })}
        {items.some((i) => !(i.lexemeId in placed)) && active && (
          <li className="flex items-center">
            <AudioButton
              url={lexemeOf(content, active)?.audio?.url}
              label={t("lesson.listen")}
              size="sm"
            />
          </li>
        )}
      </ul>
      {/* A button may only contain phrasing content, so the bucket's contents
          are spans, not a list, and the button's name says what pressing does. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {payload.buckets.map((b) => {
          const label = t("nounClass.label", { label: b });
          const inBucket = items.filter((i) => placed[i.lexemeId] === b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => place(b)}
              disabled={!active || checked !== null}
              className={`min-h-28 rounded-3xl border-2 border-dashed p-4 text-left transition-colors disabled:cursor-default ${active ? "border-sun bg-sun-soft/60" : "border-mist-soft bg-cloud"}`}
            >
              <span className="mb-2 block font-display text-lg font-bold text-indigo">{label}</span>
              {/* The name is built from the content, so the words already sorted
                  into this class are read out with it. */}
              <span className="sr-only">{t("lesson.bucketFor", { label })}. </span>
              <span className="flex flex-wrap gap-1.5">
                {inBucket.map((i) => {
                  const lx = lexemeOf(content, i.lexemeId);
                  const right = lx?.nounClass === b;
                  return (
                    <span
                      key={i.lexemeId}
                      className={`rounded-full px-3 py-1 font-semibold ${checked === null ? "bg-sand-deep text-ink" : right ? "bg-sea-soft text-sea-deep" : "bg-coral-soft text-coral-deep animate-shake"}`}
                    >
                      <span lang="xh">{lx?.lemma}</span>
                      {checked !== null && (
                        <span className="sr-only">
                          {" "}
                          — {right ? t("lesson.rightAnswer") : t("lesson.incorrect")}
                        </span>
                      )}
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
      <CheckBar
        canCheck={allPlaced}
        checked={checked}
        onCheck={() => setChecked(correct())}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </div>
  );
}
