import { runHeat, runIsWorthSaying } from "@molo/core";
import { AnimatePresence, motion } from "motion/react";

import { useTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * The lesson strip and the run of right answers, split out of the runner so
 * both are driven by numbers alone — the runner passes a real lesson's, the
 * developer gallery passes three and seven. Same rule, same numbers as the
 * mobile app (`RUN_MIN_TO_SHOW` / `RUN_HOT_AT` in @molo/core).
 */

/**
 * The one allowed bar. On a run it takes the colour of "right"; from seven
 * it shimmers as well, so the state survives reduced motion as a colour and
 * as words rather than only as movement.
 */
export function LessonProgressBar({
  index,
  total,
  run,
}: {
  index: number;
  total: number;
  run: number;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const runRules = useTuning().run;
  const heat = runHeat(run, runRules);
  const onARun = runIsWorthSaying(run, runRules);
  const runLabel = t(heat === "hot" ? "lesson.run.onFire" : "lesson.run.inARow", { count: run });
  return (
    <div
      className="h-4 grow overflow-hidden rounded-full bg-sand-deep"
      role="progressbar"
      aria-label={t("a11y.lessonProgress")}
      aria-valuenow={index}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuetext={
        onARun
          ? `${t("lesson.progress", { done: index, total })} — ${runLabel}`
          : t("lesson.progress", { done: index, total })
      }
    >
      <motion.div
        className={
          onARun
            ? `h-full rounded-full bg-sea shadow-[inset_0_-3px_0_0_#11705F] ${heat === "hot" && !reduced ? "animate-shimmer" : ""}`
            : "h-full rounded-full bg-sun shadow-[inset_0_-3px_0_0_#D9772B]"
        }
        initial={false}
        animate={{ width: `${(index / Math.max(1, total)) * 100}%` }}
        transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/**
 * Three right answers in a row is worth saying; two is not. Quiet below
 * `RUN_MIN_TO_SHOW`, because a counter that congratulates everything
 * congratulates nothing.
 */
export function RunCounter({ run }: { run: number }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const runRules = useTuning().run;
  const heat = runHeat(run, runRules);
  const onARun = runIsWorthSaying(run, runRules);
  const runLabel = t(heat === "hot" ? "lesson.run.onFire" : "lesson.run.inARow", { count: run });
  return (
    <AnimatePresence initial={false}>
      {onARun && (
        <motion.p
          key={heat}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="-mt-3 mb-3 text-right text-xs font-bold uppercase tracking-wide text-sea-deep"
          aria-label={t("a11y.runCounter")}
          data-testid="run-counter"
        >
          {runLabel}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
