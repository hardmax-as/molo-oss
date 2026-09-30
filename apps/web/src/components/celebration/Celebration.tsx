import type { CelebrationBeat } from "@molo/core";
import type { SoundName } from "@molo/sfx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/Button.tsx";
import { burst, CONFETTI_COLOURS, GOLD_COLOURS } from "~/lib/confetti.ts";
import { useFocusTrap } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

import { LessonComplete, Milestone, StreakExtended, UnitFinished } from "./beats.tsx";

/**
 * The end-of-lesson sequence (docs/DESIGN.md "After a lesson"): a short
 * series of full-screen beats, each with its own entrance and one primary
 * button. A tap anywhere moves on, "Skip" ends the whole thing, and Escape
 * does the same — nothing here keeps a learner from the path for longer
 * than a tap.
 *
 * `beats` may grow while the sequence is on screen: the lesson beat is
 * shown the moment the last exercise is answered, and the beats that depend
 * on the server's answer join as soon as it lands. The primary button rises
 * in after the number has landed, which is both the nicer moment to invite
 * the next tap and the reason the two almost never race.
 */

function soundFor(beat: CelebrationBeat): SoundName {
  switch (beat.kind) {
    case "lesson":
      return beat.perfect ? "perfect" : "lesson_complete";
    case "streak":
      return "streak";
    case "milestone":
      return "level_up";
    case "unit":
      return "crown";
  }
}

function Beat({ beat, reduced }: { beat: CelebrationBeat; reduced: boolean }) {
  switch (beat.kind) {
    case "lesson":
      return <LessonComplete beat={beat} reduced={reduced} />;
    case "streak":
      return <StreakExtended beat={beat} reduced={reduced} />;
    case "milestone":
      return <Milestone beat={beat} reduced={reduced} />;
    case "unit":
      return <UnitFinished beat={beat} reduced={reduced} />;
  }
}

export function Celebration({
  beats,
  onDone,
}: {
  beats: readonly CelebrationBeat[];
  onDone: () => void;
}) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  useFocusTrap(root, true, onDone);

  const position = Math.min(index, Math.max(0, beats.length - 1));
  const beat = beats[position];
  const last = position >= beats.length - 1;

  // One chime and at most one burst per beat, even under React's double
  // invoke in development.
  const sounded = useRef(-1);
  useEffect(() => {
    if (!beat || sounded.current === position) return;
    sounded.current = position;
    sfx.play(soundFor(beat));
    if (beat.kind === "lesson") {
      void burst(reduced, CONFETTI_COLOURS, beat.perfect ? "big" : "normal");
    } else if (beat.kind === "unit") {
      void burst(reduced, GOLD_COLOURS, beat.flawless ? "big" : "normal");
    } else if (beat.kind === "milestone") {
      void burst(reduced, GOLD_COLOURS);
    }
  }, [beat, position, reduced, sfx]);

  if (!beat) return null;

  const advance = () => {
    if (index + 1 >= beats.length) onDone();
    else setIndex(index + 1);
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t("celebration.a11y.sequence")}
      data-testid="celebration"
      className="fixed inset-0 z-50 overflow-y-auto bg-indigo-deep text-white"
    >
      {/* A tap anywhere moves the sequence on; the buttons above it stop the bubble. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={advance}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="pointer-events-none relative flex min-h-full flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${position}-${beat.kind}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }}
              transition={{ duration: reduced ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <Beat beat={beat} reduced={reduced} />
            </motion.div>
          </AnimatePresence>
          <motion.div
            className="pointer-events-auto mt-8"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, delay: reduced ? 0 : 0.55 }}
          >
            <Button
              size="lg"
              className="w-full"
              data-testid="celebration-continue"
              onClick={(e) => {
                e.stopPropagation();
                advance();
              }}
            >
              {last ? t("celebration.back") : t("celebration.continue")}
            </Button>
          </motion.div>
          {beats.length > 1 && (
            <div className="mt-5 flex justify-center gap-2" aria-hidden>
              {beats.map((b, i) => (
                <span
                  key={`${b.kind}-${i}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === position ? "w-6 bg-sun" : "w-1.5 bg-white/25"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        {/* Last in the tab order on purpose: the primary button takes focus
            when the sequence opens, and "skip" is one Tab away. */}
        <div className="pointer-events-auto absolute right-4 top-4">
          <Button variant="ghost" size="sm" className="text-white/70" onClick={onDone}>
            {t("celebration.skipAll")}
          </Button>
        </div>
      </div>
    </div>
  );
}
