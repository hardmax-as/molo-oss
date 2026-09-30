import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/Button.tsx";
import { useFocusTrap } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

/**
 * Level up (DESIGN.md): a full-screen indigo sky, the new number scaling in
 * inside a ring of particles, the fanfare. Short: one tap to continue.
 *
 * The one true modal in the learner app: focus moves in, Tab stays inside,
 * Escape closes it, and focus goes back to whatever opened it (WCAG 2.1.2).
 */
export function LevelUp({ level, onClose }: { level: number | null; onClose: () => void }) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const dialog = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialog, level !== null, onClose);
  useEffect(() => {
    if (level !== null) sfx.play("level_up");
  }, [level, sfx]);
  const particles = reduced ? [] : Array.from({ length: 14 }, (_, i) => i);
  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          ref={dialog}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-deep/95 p-6 text-white"
          role="dialog"
          aria-modal="true"
          aria-label={t("gamification.levelUp")}
        >
          <div className="relative text-center">
            {particles.map((i) => {
              const angle = (i / particles.length) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full"
                  style={{
                    background: i % 3 === 0 ? "#F6B73C" : i % 3 === 1 ? "#1FA38C" : "#FFFFFF",
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    x: Math.cos(angle) * 150,
                    y: Math.sin(angle) * 150,
                    opacity: [0, 1, 0],
                    scale: [0, 1.2, 0.6],
                  }}
                  transition={{ duration: 1.2, delay: 0.15, ease: "easeOut" }}
                />
              );
            })}
            <motion.p
              initial={reduced ? false : { y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="font-display text-xl font-semibold uppercase tracking-widest text-sun"
            >
              {t("gamification.levelUp")}
            </motion.p>
            <motion.p
              initial={reduced ? false : { scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.2 }}
              className="my-4 font-display text-[9rem] font-bold leading-none"
            >
              {level}
            </motion.p>
            <p className="text-white/80">{t("gamification.newLevel", { level })}</p>
            <Button className="mt-8" size="lg" onClick={onClose}>
              {t("lesson.keepGoing")}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
