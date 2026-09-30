import type { ExerciseMoment } from "@molo/core";
import { RotateCcw, Sun } from "lucide-react";
import { motion } from "motion/react";

import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * One line above the prompt saying what kind of moment this is: a word the
 * learner has never met (the sun) or one they have missed before (the
 * coral), per docs/DESIGN.md. Both are computed from the learner's own
 * history — on the server when they are signed in, on the device when they
 * are a guest — and neither is shown when the exercise is neither.
 *
 * It is a label, not an alert: no live region, no sound. The learner reads
 * it on the way past.
 */
export function MomentBadge({ moment }: { moment: ExerciseMoment | null | undefined }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  if (!moment) return null;
  const isNew = moment === "new_word";
  const Icon = isNew ? Sun : RotateCcw;
  return (
    <motion.p
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        isNew ? "bg-sun-soft text-ochre-deep" : "bg-coral-soft text-coral-deep"
      }`}
      aria-label={t("a11y.momentBadge")}
      title={isNew ? t("lesson.moment.newWordHint") : t("lesson.moment.trickyHint")}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      {isNew ? t("lesson.moment.newWord") : t("lesson.moment.tricky")}
    </motion.p>
  );
}
