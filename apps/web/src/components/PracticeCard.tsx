import type { LexemeView } from "@molo/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { ClickText } from "~/components/exercises/ClickText.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

export interface PracticeAction {
  key: string | number;
  label: string;
  variant: "coral" | "primary" | "sea" | "indigo";
}

/**
 * One recall card: hear the word, remember the meaning, reveal, answer.
 * The review session and the mistakes session are the same interaction with
 * different buttons behind it, so they share this component rather than
 * drifting apart.
 */
export function PracticeCard({
  id,
  lexeme,
  badge,
  actions,
  revealed,
  onReveal,
  onAnswer,
  disabled = false,
}: {
  /** Keys the flip animation; a new id flips a new card in. */
  id: string;
  lexeme: LexemeView | undefined;
  /** Small label above the word: the FSRS state, or how often it was missed. */
  badge?: string | undefined;
  actions: readonly PracticeAction[];
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (key: PracticeAction["key"]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  // "Show answer" replaces itself with the ratings; focus follows them, or a
  // keyboard user is dropped on the body (WCAG 2.4.3).
  const firstAction = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (revealed) firstAction.current?.focus();
  }, [revealed]);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={reduced ? { opacity: 0 } : { rotateY: -90, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { rotateY: 90, opacity: 0 }}
        transition={{ duration: reduced ? 0.1 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformPerspective: 1000 }}
        className="rounded-3xl bg-cloud p-8 shadow-pop"
      >
        <p className="mb-4 text-sm text-mist">{t("review.hearIt")}</p>
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <AudioButton
            key={id}
            url={lexeme?.audio?.url}
            label={t("lesson.listen")}
            attribution={lexeme?.audio?.attribution}
            autoPlay
            size="lg"
            tone="sun"
          />
          <h1 className="font-display text-5xl font-bold text-ink">
            <ClickText text={lexeme?.lemma ?? "?"} />
          </h1>
          {badge && (
            <span className="rounded-full bg-sand-deep px-2 py-0.5 text-xs font-semibold text-indigo/70">
              {badge}
            </span>
          )}
        </div>
        {revealed ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="mb-1 font-display text-3xl text-indigo">{lexeme?.gloss?.gloss ?? "?"}</p>
            {lexeme?.gloss?.usageNote && <p className="mb-1 text-mist">{lexeme.gloss.usageNote}</p>}
            {lexeme?.gloss?.contrastiveNote && (
              <p className="mb-4 text-sm text-mist">{lexeme.gloss.contrastiveNote}</p>
            )}
            <div
              className={`mt-6 grid gap-3 ${actions.length > 2 ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2"}`}
            >
              {actions.map((a, i) => (
                <Button
                  key={a.key}
                  {...(i === 0 ? { ref: firstAction } : {})}
                  variant={a.variant}
                  size="lg"
                  disabled={disabled}
                  onClick={() => onAnswer(a.key)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </motion.div>
        ) : (
          <Button variant="indigo" size="lg" onClick={onReveal} autoFocus>
            {t("review.reveal")}
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
