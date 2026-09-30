import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { PatternCorrection } from "~/components/grammar/PatternCorrection.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";
import { isShortcutEnter, overlayOpen } from "~/lib/keys.ts";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

import { ClickText } from "./ClickText.tsx";
import { ReportAction } from "./ReportAction.tsx";

/**
 * The bottom bar of every exercise (DESIGN.md "Correct" / "Wrong"): sea
 * with a self-drawing check when right, soft coral with the right answer
 * when wrong. Plays the matching sound once per verdict. `hint` is extra
 * teaching (a click explanation, a spelling note).
 */
export function CheckBar({
  canCheck,
  checked,
  correctAnswer,
  hint,
  onCheck,
  onContinue,
}: {
  canCheck: boolean;
  checked: boolean | null;
  correctAnswer?: string | undefined;
  hint?: ReactNode;
  onCheck: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const action = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (checked === true) sfx.play("correct");
    if (checked === false) sfx.play("wrong");
  }, [checked, sfx]);
  // A verdict disables the answer controls; move focus to "Continue" so a
  // keyboard user is never left on a disabled node (WCAG 2.4.3).
  useEffect(() => {
    if (checked !== null) action.current?.focus();
  }, [checked]);
  useEffect(() => {
    if (checked === null) return;
    // Enter anywhere on the page continues, but never Enter that belongs to
    // something else: the report dialog's reasons, note and buttons, a text
    // field, or a focused button (Continue itself activates natively).
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcutEnter(e, overlayOpen())) return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checked, onContinue]);
  const tone =
    checked === null
      ? "bg-sand-deep text-indigo"
      : checked
        ? "bg-sea-deep text-white"
        : "bg-coral-soft text-coral-deep";
  return (
    <motion.div
      layout
      className={`mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-4 sm:p-5 ${tone}`}
      initial={false}
      animate={{ scale: [1, checked === null ? 1 : 1.01, 1] }}
      transition={{ duration: reduced ? 0 : 0.3 }}
    >
      <div className="flex min-w-0 grow items-start gap-3">
        <AnimatePresence mode="wait">
          {checked === true && (
            <motion.span
              key="ok"
              initial={reduced ? false : { scale: 0.4, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 18 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25"
            >
              <Check size={26} strokeWidth={3} aria-hidden />
            </motion.span>
          )}
          {checked === false && (
            <motion.span
              key="no"
              initial={reduced ? false : { scale: 0.4 }}
              animate={{ scale: 1 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white"
            >
              <X size={24} strokeWidth={3} aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
        {/* The verdict, and only the verdict, is the live region: the buttons
            around it must not be re-announced on every render. */}
        <div
          className="min-w-0"
          role="status"
          aria-live="polite"
          aria-label={t("a11y.answerFeedback")}
        >
          {checked === true && (
            <p className="font-display text-xl font-bold">{t("lesson.correct")}</p>
          )}
          {checked === false && (
            <>
              <p className="font-display text-xl font-bold">{t("lesson.incorrect")}</p>
              {correctAnswer && (
                <p className="mt-0.5 text-base">
                  <span className="font-semibold">{t("lesson.rightAnswer")}:</span>{" "}
                  <ClickText text={correctAnswer} className="font-display text-lg text-indigo" />
                </p>
              )}
            </>
          )}
          {checked !== null && hint && <div className="mt-2 text-sm">{hint}</div>}
          {/* The pattern gets named here, inside the same live region, so it
              is announced with the verdict as one polite utterance rather
              than as a second interruption. It adds no focusable control, so
              the focus move to "Continue" above is untouched. */}
          {checked === false && <PatternCorrection />}
        </div>
        {/* Outside the live region: a verdict must not be re-announced with
            the action attached to it. This is where a wrong gloss reaches an
            editor instead of a one-star review on the store. */}
        {checked !== null && (
          <div className="mt-1 shrink-0">
            <ReportAction />
          </div>
        )}
      </div>
      {checked === null ? (
        <Button ref={action} size="lg" disabled={!canCheck} onClick={onCheck} variant="indigo">
          {t("lesson.check")}
        </Button>
      ) : (
        <Button
          ref={action}
          size="lg"
          onClick={onContinue}
          variant={checked ? "primary" : "indigo"}
        >
          {t("lesson.continue")}
        </Button>
      )}
    </motion.div>
  );
}
