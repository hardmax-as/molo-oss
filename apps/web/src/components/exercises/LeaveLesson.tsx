import { useBlocker } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useRef } from "react";

import { Button } from "~/components/ui/Button.tsx";
import { useFocusTrap } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";
import { easeOut, useMotionPrefs } from "~/lib/motion.ts";

/**
 * "Leave this lesson?" on the web, asked at the same moments as on the phone
 * (`mustConfirmExit` in @molo/core, audit M06): once an exercise is done,
 * until the lesson is over or paused for hearts. It covers every way out —
 * the ✕, any other link in the app, the browser's back button — through
 * TanStack Router's blocker, and a reload or a closed tab through the
 * browser's own `beforeunload` prompt, which is the only one a page may show
 * there. A quit lesson is not resumed (Duolingo does not resume one either),
 * so the question is honest: the answers are lost.
 *
 * "Keep going" is the default: it takes focus, and Escape or a click on the
 * backdrop means it too.
 */
export function LessonLeaveGuard({ active }: { active: boolean }) {
  // The blocker reads the latest answer, so a lesson that ends while a
  // navigation is being decided never asks about answers it no longer has.
  const live = useRef(active);
  live.current = active;
  const shouldBlockFn = useCallback(() => live.current, []);
  const enableBeforeUnload = useCallback(() => live.current, []);
  const blocker = useBlocker({
    shouldBlockFn,
    enableBeforeUnload,
    disabled: !active,
    withResolver: true,
  });
  return (
    <AnimatePresence>
      {blocker.status === "blocked" && (
        <LeaveLessonDialog onStay={blocker.reset} onLeave={blocker.proceed} />
      )}
    </AnimatePresence>
  );
}

/** The question itself: an alert dialog in the page, never `window.confirm`. */
export function LeaveLessonDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const titleId = useId();
  const bodyId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialog, true, onStay);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-indigo/40 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.18 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <motion.div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduced ? 0.1 : 0.24, ease: easeOut }}
        className="w-full max-w-md rounded-3xl bg-cloud p-6 text-ink shadow-pop"
        data-testid="leave-lesson"
      >
        <h2 id={titleId} className="mb-2 font-display text-xl font-bold text-indigo">
          {t("lesson.leaveTitle")}
        </h2>
        <p id={bodyId} className="mb-5 text-base text-mist">
          {t("lesson.leaveBody")}
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="indigo" size="lg" onClick={onStay} data-testid="leave-lesson-stay">
            {t("lesson.keepGoing")}
          </Button>
          <Button variant="outline" onClick={onLeave} data-testid="leave-lesson-confirm">
            <span className="text-coral-deep">{t("lesson.leaveConfirm")}</span>
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
