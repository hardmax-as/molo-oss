import { useEffect, useId, useRef } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";
import { isShortcutEnter, overlayOpen } from "~/lib/keys.ts";

import { ClickText } from "./ClickText.tsx";
import type { Content } from "./types.ts";

/**
 * Meeting a word before being asked for it (`newWordIntroductions` in
 * @molo/core decides where this goes). The word, its recording played once
 * on arrival, and its meaning in the learner's own language — all of it the
 * published lexeme already in the unit payload, nothing composed. A word
 * with no gloss in this language still gets its lemma and its recording.
 *
 * Unscored: no hearts, no XP, no mistakes, and the progress bar does not
 * move. Several new words for one exercise share one card, a row each with
 * its own play button; only the first plays by itself, so three recordings
 * never talk over each other. With listening off nothing plays and no play
 * button is offered, as in every other exercise in quiet mode.
 */
export function NewWords({
  words,
  content,
  listening,
  onContinue,
}: {
  words: readonly string[];
  content: Content;
  listening: boolean;
  onContinue: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const lexemes = words.flatMap((id) => {
    const lx = content.lexemes[id];
    return lx ? [lx] : [];
  });
  // Enter anywhere continues, as it does on the check bar's verdict, but
  // never Enter that belongs to a focused control or an open dialog.
  const latest = useRef(onContinue);
  latest.current = onContinue;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcutEnter(e, overlayOpen())) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const one = lexemes.length === 1 ? lexemes[0] : null;
  return (
    <section aria-labelledby={titleId} data-testid="new-word-card">
      <h2 id={titleId} className="mb-6 font-display text-2xl font-bold text-indigo">
        {one ? t("lesson.intro.one") : t("lesson.intro.many")}
      </h2>
      {one ? (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-4">
            {listening && (
              <AudioButton
                url={one.audio?.url}
                voices={one.voices}
                label={t("lesson.listen")}
                attribution={one.audio?.attribution}
                autoPlay
                size="lg"
                tone="sun"
              />
            )}
            <p className="min-w-0 break-words font-display text-5xl font-bold text-ink">
              <ClickText text={one.lemma} />
            </p>
          </div>
          {one.gloss && <p className="text-xl text-indigo">{one.gloss.gloss}</p>}
        </div>
      ) : (
        <ul className="mb-8 space-y-3">
          {lexemes.map((lx, i) => (
            <li key={lx.id} className="flex items-center gap-4 rounded-2xl bg-sand p-3">
              {listening && (
                <AudioButton
                  url={lx.audio?.url}
                  voices={lx.voices}
                  label={t("lesson.intro.listen", { word: lx.lemma })}
                  attribution={lx.audio?.attribution}
                  autoPlay={i === 0}
                  tone={i === 0 ? "sun" : "indigo"}
                />
              )}
              <div className="min-w-0">
                <p className="break-words font-display text-3xl font-bold text-ink">
                  <ClickText text={lx.lemma} />
                </p>
                {lx.gloss && <p className="text-base text-indigo/80">{lx.gloss.gloss}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="indigo" size="lg" onClick={onContinue} data-testid="new-word-continue">
        {t("lesson.continue")}
      </Button>
    </section>
  );
}
