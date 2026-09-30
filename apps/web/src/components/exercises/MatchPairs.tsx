import { matchPairsMeanings, playsOnTap, type ExercisePayload } from "@molo/core";
import { useRef, useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";

import { CheckBar } from "./CheckBar.tsx";
import { ClickText } from "./ClickText.tsx";
import { OptionButton, type OptionState } from "./OptionButton.tsx";
import { glossOf, lexemeOf, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "match_pairs" }>;

/**
 * Plays, from the start, the recording the `AudioButton` inside `holder`
 * has already loaded. Its own `play`/`ended` listeners keep its pulse and
 * its hold on the UI sounds in step, so the tile and the speaker are one
 * recording, never two.
 */
function playFrom(holder: HTMLElement | undefined): void {
  const audio = holder?.querySelector("audio");
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => undefined);
}

/**
 * Words on the left, meanings on the right, none in its own word's row
 * (`matchPairsMeanings`, shared with mobile). Choosing an isiXhosa
 * tile also says the word, once per click, as Duolingo does (`playsOnTap`):
 * not in quiet mode, not for a word with no recording, never on the
 * meanings' side. The speaker beside it replays it.
 */
export function MatchPairs({ payload, content, onDone, quiet = false }: ExerciseProps<P>) {
  const t = useT();
  const speakers = useRef(new Map<string, HTMLElement>());
  const ids = payload.pairs.map((p) => p.lexemeId);
  const left = ids;
  // No meaning in its word's row (packages/core, the function mobile uses too).
  const right = matchPairsMeanings(ids);
  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [wrongRight, setWrongRight] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = Object.keys(matched).length === ids.length;

  function pickRight(id: string) {
    if (!selLeft) return;
    if (selLeft === id) {
      setMatched((m) => ({ ...m, [selLeft]: id }));
    } else {
      setMistakes((n) => n + 1);
      setWrongRight(id);
      setTimeout(() => setWrongRight(null), 500);
    }
    setSelLeft(null);
  }
  const leftState = (id: string): OptionState =>
    id in matched ? "right" : selLeft === id ? "picked" : "";
  const rightState = (id: string): OptionState =>
    Object.values(matched).includes(id) ? "right" : wrongRight === id ? "wrong" : "";

  return (
    <div>
      <h2 className="mb-5 font-display text-2xl font-bold text-indigo">{t("lesson.matchPairs")}</h2>
      <div className="grid grid-cols-2 gap-4">
        <ul className="space-y-3" aria-label={t("a11y.wordsXh")}>
          {left.map((id) => {
            const lx = lexemeOf(content, id);
            return (
              <li key={id} className="flex items-center gap-2">
                <span
                  className="inline-flex"
                  ref={(el) => {
                    if (el) speakers.current.set(id, el);
                    else speakers.current.delete(id);
                  }}
                >
                  <AudioButton url={lx?.audio?.url} label={lx?.lemma ?? ""} size="sm" />
                </span>
                <OptionButton
                  state={leftState(id)}
                  disabled={id in matched}
                  onClick={() => {
                    setSelLeft(id);
                    if (playsOnTap({ side: "xh", listening: !quiet, hasClip: !!lx?.audio?.url }))
                      playFrom(speakers.current.get(id));
                  }}
                >
                  <ClickText text={lx?.lemma ?? ""} />
                </OptionButton>
              </li>
            );
          })}
        </ul>
        <ul className="space-y-3" aria-label={t("a11y.meanings")}>
          {right.map((id) => (
            <li key={id}>
              <OptionButton
                state={rightState(id)}
                disabled={Object.values(matched).includes(id) || !selLeft}
                onClick={() => pickRight(id)}
              >
                {glossOf(content, id)}
              </OptionButton>
            </li>
          ))}
        </ul>
      </div>
      <CheckBar
        canCheck={done}
        checked={done ? mistakes === 0 : null}
        onCheck={() => undefined}
        onContinue={() =>
          onDone({
            correct: mistakes === 0,
            xp:
              mistakes === 0
                ? currentTuning().xp.correct
                : Math.max(0, currentTuning().xp.correct - mistakes * 3),
          })
        }
      />
    </div>
  );
}
