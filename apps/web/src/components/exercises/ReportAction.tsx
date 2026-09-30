import { EXERCISE_REPORT_REASONS, type ExerciseReportReason } from "@molo/core";
import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button, ButtonLink } from "~/components/ui/Button.tsx";
import { ApiError, reportExercise } from "~/lib/api.ts";
import { useFocusTrap } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useMe } from "~/lib/session.tsx";

/**
 * "Report this exercise" — the learner's half of the review loop. A wrong
 * gloss should reach an editor from inside the lesson, not from a one-star
 * review on the store two weeks later.
 *
 * The exercise's id is carried in context rather than threaded through all
 * ten widgets: only the runner knows it, and only the check bar needs it.
 * A report is a note; it never changes a status, and the learner is told
 * plainly that a person will look at it.
 */
const ExerciseIdContext = createContext<string | null>(null);

export function CurrentExercise({ id, children }: { id: string; children: ReactNode }) {
  return <ExerciseIdContext.Provider value={id}>{children}</ExerciseIdContext.Provider>;
}

export function useCurrentExerciseId(): string | null {
  return useContext(ExerciseIdContext);
}

/**
 * The action in the check bar's verdict.
 *
 * A guest sees the same action, but it opens the account wall instead of the
 * form. The report itself still needs a name on it — an anonymous firehose
 * into the editors' queue would cost them more than it earns them — but
 * hiding the action costs us the report entirely, and a wrong gloss in the
 * free lesson is precisely the one we most need to hear about. Asking here
 * turns the intent into either a report or an account.
 */
export function ReportAction() {
  const t = useT();
  const me = useMe();
  const exerciseId = useCurrentExerciseId();
  const [open, setOpen] = useState(false);
  // While the session is still resolving we do not yet know which of the two
  // this learner is, and guessing would flash the wrong dialog.
  if (!exerciseId || me.isPending) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="report-exercise"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-current underline underline-offset-4 opacity-80 hover:opacity-100"
      >
        <Flag size={13} aria-hidden />
        {t("lesson.report.action")}
      </button>
      <AnimatePresence>
        {open &&
          (me.data ? (
            <ReportDialog exerciseId={exerciseId} onClose={() => setOpen(false)} />
          ) : (
            <ReportSignUpDialog onClose={() => setOpen(false)} />
          ))}
      </AnimatePresence>
    </>
  );
}

/**
 * What a guest gets instead of the form: why a name is needed, and the two
 * ways to get one. Exported so the developer gallery can open it directly.
 */
export function ReportSignUpDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialog, true, onClose);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-indigo/40 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.18 }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduced ? 0.1 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl bg-cloud p-6 text-ink shadow-pop"
        data-testid="report-signup"
      >
        <h2 id={titleId} className="mb-2 font-display text-xl font-bold text-indigo">
          {t("lesson.report.guestTitle")}
        </h2>
        <p className="mb-5 text-sm text-mist">{t("lesson.report.guestBody")}</p>
        <div className="flex flex-col gap-3">
          <ButtonLink to="/auth" search={{ mode: "signup" }} size="lg">
            {t("guest.create")}
          </ButtonLink>
          <ButtonLink to="/auth" variant="outline">
            {t("guest.haveAccount")}
          </ButtonLink>
          <Button variant="ghost" onClick={onClose}>
            {t("lesson.report.cancel")}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Exported so the developer gallery can open the flow without a lesson behind it. */
export function ReportDialog({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const titleId = useId();
  const noteId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialog, true, onClose);
  const [reason, setReason] = useState<ExerciseReportReason>("wrong_gloss");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"sent" | "already" | null>(null);
  const send = useMutation({
    mutationFn: () => reportExercise(exerciseId, { reason, ...(note.trim() ? { note } : {}) }),
    onSuccess: (r) => setDone(r.alreadyReported ? "already" : "sent"),
  });
  // Thanks, then out of the way: the next exercise is the point, not the form.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onClose, 2200);
    return () => clearTimeout(id);
  }, [done, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-indigo/40 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.18 }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduced ? 0.1 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl bg-cloud p-6 text-ink shadow-pop"
      >
        <h2 id={titleId} className="mb-4 font-display text-xl font-bold text-indigo">
          {t("lesson.report.title")}
        </h2>
        {done ? (
          <p role="status" className="text-base text-sea-deep">
            {done === "already" ? t("lesson.report.already") : t("lesson.report.thanks")}
          </p>
        ) : (
          <>
            <ul className="mb-4 space-y-2">
              {EXERCISE_REPORT_REASONS.map((r) => (
                <li key={r}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border-2 border-mist-soft px-3 py-2 text-sm has-[:checked]:border-sun has-[:checked]:bg-sun-soft">
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="h-4 w-4 accent-ochre"
                    />
                    {t(`lesson.report.reason.${r}` as never)}
                  </label>
                </li>
              ))}
            </ul>
            <label htmlFor={noteId} className="mb-1 block text-sm font-semibold text-mist">
              {t("lesson.report.note")}
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={3}
              className="mb-4 w-full rounded-2xl border-2 border-mist-soft bg-sand px-3 py-2 text-sm focus:border-sun"
            />
            {send.isError && (
              <p role="alert" className="mb-3 text-sm text-coral-deep">
                {/* A refusal says why. The rate limit is the only one a
                    learner can act on, so it gets its own sentence. */}
                {send.error instanceof ApiError && send.error.code === "report_rate_limited"
                  ? t("lesson.report.tooMany")
                  : t("lesson.report.failed")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                {t("lesson.report.cancel")}
              </Button>
              <Button variant="indigo" disabled={send.isPending} onClick={() => send.mutate()}>
                {t("lesson.report.send")}
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
