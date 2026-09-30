import type { GrammarNoteView } from "@molo/core";
import { createContext, useContext, type ReactNode } from "react";

import { useT } from "~/lib/i18n.tsx";

/**
 * The correction that names the pattern (docs/GRAMMAR.md section 1: "a
 * correction that names the pattern when a learner gets it wrong").
 *
 * The note is carried in context for the same reason the exercise id is:
 * only the runner knows which rule this lesson is drilling, and only the
 * check bar needs it. None of the ten exercise widgets is touched.
 *
 * The correction renders **inside the bar's existing live region**, so it is
 * announced with the verdict in one polite utterance rather than as a second
 * interruption, and it adds no focusable control — the bar's focus handling
 * (move to "Continue", Enter continues) is untouched.
 */
const PatternContext = createContext<GrammarNoteView | null>(null);

export function CurrentPattern({
  note,
  children,
}: {
  note: GrammarNoteView | null;
  children: ReactNode;
}) {
  return <PatternContext.Provider value={note}>{children}</PatternContext.Provider>;
}

export function useCurrentPattern(): GrammarNoteView | null {
  return useContext(PatternContext);
}

/**
 * Shown under "Not quite." A wrong answer is a moment to teach: the pattern
 * gets its name back and, where the editor wrote one, the sentence that says
 * what to look at. Nothing here is composed — both lines are the note's own
 * published text.
 */
export function PatternCorrection() {
  const t = useT();
  const note = useCurrentPattern();
  if (!note) return null;
  return (
    <div className="mt-2" data-testid="grammar-correction">
      <p className="text-xs font-bold tracking-wide uppercase opacity-70">
        {t("grammar.patternLabel")}
      </p>
      <p className="font-display text-base font-bold">{note.title}</p>
      {note.correction !== "" && <p className="mt-0.5 text-sm">{note.correction}</p>}
    </div>
  );
}
