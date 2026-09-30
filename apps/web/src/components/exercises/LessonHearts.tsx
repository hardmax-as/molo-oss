import { heartsLostBetween, type LessonHeartsView } from "@molo/core";
import { Heart, Infinity as InfinityIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { useT } from "~/lib/i18n.tsx";
import { easeOut, useMotionPrefs } from "~/lib/motion.ts";

/**
 * The hearts on the right of the lesson header, where Duolingo keeps them.
 * A guest has none to lose and sees nothing; Plus sees ∞; everyone else sees
 * the count, which the runner lowers the moment a wrong answer is continued
 * past rather than a network round trip later (`lessonHeartsView`).
 *
 * A lost heart is meant to be seen: the heart pops and shakes, a copy of it
 * drops away, the number ticks down and a brief "−1" rises. Under reduced
 * motion the number simply changes. The words for a screen reader come from
 * the runner's own live region ("Heart lost. 3 of 5 left."), so this is a
 * labelled picture and never announces anything itself.
 */
export function LessonHearts({ view }: { view: LessonHeartsView }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const losses = useHeartLosses(view);
  const moving = losses > 0 && !reduced;
  if (view.kind === "none") return null;
  if (view.kind === "unlimited")
    return (
      <span
        role="img"
        aria-label={t("hearts.unlimited")}
        data-testid="lesson-hearts"
        className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-indigo px-3 text-sun shadow-card"
      >
        <Heart size={18} className="fill-current" aria-hidden />
        <InfinityIcon size={18} aria-hidden />
      </span>
    );
  const empty = view.hearts <= 0;
  return (
    <span
      role="img"
      aria-label={t("hearts.count", { hearts: view.hearts, max: view.max })}
      data-testid="lesson-hearts"
      className="relative inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-cloud px-3 font-display text-lg font-bold text-coral-deep shadow-card"
    >
      <span className="relative inline-flex" aria-hidden>
        {/* Keyed by the loss, so each one plays from the start. */}
        <motion.span
          key={`heart-${losses}`}
          className="inline-flex"
          initial={moving ? { scale: 1.35, rotate: 0 } : false}
          animate={{ scale: 1, rotate: moving ? [0, -14, 11, -6, 0] : 0 }}
          transition={{
            scale: { type: "spring", visualDuration: 0.3, bounce: 0.2 },
            rotate: { duration: 0.45, ease: "easeInOut" },
          }}
        >
          <Heart size={20} className={empty ? "" : "fill-coral"} />
        </motion.span>
        {/* The heart that went: it falls away, tilting, and fades. */}
        {moving && (
          <motion.span
            key={`drop-${losses}`}
            className="pointer-events-none absolute inset-0 inline-flex"
            initial={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
            animate={{ y: 28, rotate: 32, opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.7, ease: [0.55, 0, 0.8, 0.2] }}
            data-testid="lesson-hearts-drop"
          >
            <Heart size={20} className="fill-coral" />
          </motion.span>
        )}
      </span>
      <motion.span
        key={`count-${view.hearts}`}
        className="tabular-nums"
        initial={moving ? { y: -8, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: easeOut, delay: moving ? 0.12 : 0 }}
      >
        {view.hearts}
      </motion.span>
      {moving && (
        <motion.span
          key={`minus-${losses}`}
          aria-hidden
          className="pointer-events-none absolute -top-3 right-1 font-display text-sm font-bold text-coral-deep"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: -22 }}
          transition={{ duration: 0.9, ease: easeOut }}
        >
          −1
        </motion.span>
      )}
    </span>
  );
}

/**
 * How many losses this header has watched happen. Each one keys a fresh
 * animation; zero means none yet, so a lesson opened at three hearts does
 * not play a loss it never saw.
 *
 * Counted while rendering (React's "state from the previous render"), not
 * in an effect: the first frame that shows the lower number is already the
 * first frame of its animation, instead of one still frame and then a jump.
 */
function useHeartLosses(view: LessonHeartsView): number {
  const [before, setBefore] = useState(view);
  const [losses, setLosses] = useState(0);
  const same =
    before.kind === view.kind &&
    (before.kind !== "count" || (view.kind === "count" && before.hearts === view.hearts));
  if (!same) {
    setBefore(view);
    if (heartsLostBetween(before, view) > 0) setLosses((n) => n + 1);
  }
  return losses;
}
