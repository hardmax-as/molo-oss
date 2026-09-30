import { workedExampleOf, type GrammarNoteView } from "@molo/core";
import { motion } from "motion/react";
import { useRef, type ReactNode } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Crane } from "~/components/illustrations/Crane.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

import { MorphemeSplit } from "./MorphemeSplit.tsx";
import { ParadigmTable } from "./ParadigmTable.tsx";
import type { GrammarAudio } from "./types.ts";

/**
 * The rule, before the drill (docs/GRAMMAR.md section 1): a worked example,
 * then the rule in a sentence or two, then the table, then the exercise.
 * The crane is the mentor and appears where something is explained
 * (DESIGN.md "Illustration").
 *
 * Two ways out, both real buttons: "Got it" and "Skip". They do the same
 * thing to the lesson — the caller records the dismissal either way — and
 * differ only in what they say, because a learner who skipped a rule and one
 * who read it have both decided not to be stopped by it again.
 *
 * Without `onContinue` the card is the reference page's read-only form: no
 * action row, and no focus taken, because a page of six notes must not fight
 * over the caret and a button that does nothing is worse than no button.
 *
 * Accessibility: the title is the heading the lesson's `h1` sits under, the
 * primary button takes focus on mount so a keyboard user is not left at the
 * top of the document, and the whole card is a labelled region.
 */
export function GrammarNote({
  note,
  audio,
  onContinue,
  onSkip,
  heading = "h2",
}: {
  note: GrammarNoteView;
  audio: GrammarAudio;
  /** Omitted on the reference page: there is nothing to continue to. */
  onContinue?: (() => void) | undefined;
  /** Omitted on the reference page, where there is nothing to skip past. */
  onSkip?: (() => void) | undefined;
  heading?: "h2" | "h3";
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const primary = useRef<HTMLButtonElement | null>(null);
  const example = workedExampleOf(note.cells);
  const Heading = heading;

  return (
    <motion.section
      aria-label={t("a11y.grammarNote")}
      data-testid="grammar-note"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl bg-cloud p-5 shadow-card sm:p-8"
    >
      <div className="flex items-start gap-4">
        <Crane pose="think" size={72} className="hidden shrink-0 sm:block" />
        <div className="min-w-0 grow">
          {/* "Before you start" is only true in front of a drill; on the
              reference page the learner has already started. */}
          {onContinue && (
            <p className="font-body text-xs font-bold tracking-wide text-mist uppercase">
              {t("grammar.noteHeading")}
            </p>
          )}
          <Heading className="mt-1 font-display text-2xl font-bold text-indigo sm:text-3xl">
            {note.title}
          </Heading>

          {/* The worked example comes first: something concrete before the
              claim, which is the order GRAMMAR.md asked for. */}
          {example.length > 0 && (
            <Block label={t("grammar.example")}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {example.map((cell) => {
                  const ref = cell.audioAssetId ? (audio[cell.audioAssetId] ?? null) : null;
                  return (
                    <span key={cell.id} className="flex items-center gap-2">
                      <MorphemeSplit
                        surfaceForm={cell.surfaceForm}
                        morphemes={cell.morphemes}
                        size="lg"
                      />
                      <AudioButton
                        url={ref?.url ?? null}
                        label={t("lesson.listen")}
                        attribution={ref?.attribution ?? null}
                        size="sm"
                      />
                    </span>
                  );
                })}
              </div>
            </Block>
          )}

          <Block label={t("grammar.rule")}>
            <p className="max-w-prose text-base leading-relaxed text-ink">{note.rule}</p>
          </Block>

          {note.cells.some((c) => c.role === "paradigm") && (
            <Block label={t("grammar.forms")}>
              <ParadigmTable note={note} audio={audio} />
            </Block>
          )}
        </div>
      </div>

      {onContinue && (
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button ref={primary} size="lg" variant="primary" onClick={onContinue} autoFocus>
            {t("grammar.gotIt")}
          </Button>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} data-testid="grammar-note-skip">
              {t("grammar.skip")}
            </Button>
          )}
        </div>
      )}
    </motion.section>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 font-body text-xs font-bold tracking-wide text-mist uppercase">{label}</p>
      {children}
    </div>
  );
}
