import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

import { ClickText } from "./ClickText.tsx";
import type { Content } from "./types.ts";

/**
 * One word of a sentence prompt, with its meaning a tap away — the way a
 * dictionary hint works, not a translation of the whole line. The gloss
 * comes from the sentence's linked lexeme in the learner's own language, so
 * it is a published editor's words and never something composed here.
 *
 * A word is only tappable when showing its meaning cannot give the answer
 * away; the exercise decides that and passes `gloss: null`, which renders
 * plain text with no affordance at all (see `hiddenAnswerWords` below).
 * The tappable ones carry a faint dotted underline so they can be found,
 * and they are real buttons, so the keyboard reaches them and Escape closes
 * the popover.
 */
export function WordHint({
  word,
  gloss,
  className = "",
  defaultOpen = false,
}: {
  word: string;
  /** Null means "not tappable here": the exercise is testing this word. */
  gloss: string | null;
  className?: string;
  /** Dev-only: the developer gallery shows the popover without a click. */
  defaultOpen?: boolean;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const box = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (gloss === null) return <ClickText text={word} className={className} />;

  return (
    <span ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        {...(open ? { "aria-describedby": id } : {})}
        title={t("lesson.wordHint.open", { word })}
        data-testid="word-hint"
        className={`rounded px-0.5 py-1 underline decoration-mist-soft decoration-dotted decoration-2 underline-offset-8 hover:decoration-sun ${className}`}
      >
        <ClickText text={word} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            data-testid="word-hint-popover"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.1 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full z-20 mt-1 block w-max max-w-56 -translate-x-1/2 rounded-2xl bg-indigo px-3 py-2 text-center font-sans text-sm font-semibold leading-snug text-white shadow-pop"
          >
            {gloss === "" ? t("lesson.wordHint.none") : gloss}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * The gloss to hand `WordHint` for one token: the published gloss, `""`
 * when the word has none yet, and `null` when this exercise is testing it
 * and a hint would be the answer.
 */
export function glossForHint(
  content: Content,
  lexemeId: string | undefined,
  hidden: ReadonlySet<string>,
): string | null {
  if (!lexemeId || hidden.has(lexemeId)) return null;
  return content.lexemes[lexemeId]?.gloss?.gloss ?? "";
}
