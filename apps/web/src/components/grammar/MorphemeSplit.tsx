import { displayMorphemes } from "@molo/core";

import { useT } from "~/lib/i18n.tsx";

/**
 * A word shown as its parts (docs/GRAMMAR.md section 1: "split words into
 * their morphemes visually, so the learner sees concord and root as separate
 * things"). The orthography hides the structure; the split shows it.
 *
 * The parts come from the row, never from this component: a cell filled by
 * `xh-morph` and a cell filled from the Gothenburg corpus's own `segmented`
 * attribute arrive in the same shape. With no parts recorded the word is
 * drawn whole — an unsplit word is honest, a guessed split is not.
 *
 * For a screen reader the boxes would read as disconnected syllables, so the
 * whole thing is one labelled group saying the word and then its parts.
 */
export function MorphemeSplit({
  surfaceForm,
  morphemes,
  size = "md",
  tone = "indigo",
}: {
  surfaceForm: string;
  morphemes: readonly string[];
  size?: "sm" | "md" | "lg";
  tone?: "indigo" | "sea";
}) {
  const t = useT();
  const parts = displayMorphemes(morphemes);
  const text = {
    sm: "text-base",
    md: "text-xl",
    lg: "font-display text-3xl sm:text-4xl",
  }[size];
  const pad = { sm: "px-1.5 py-0.5", md: "px-2.5 py-1", lg: "px-3 py-1.5" }[size];
  // Written out rather than interpolated: Tailwind reads class names statically.
  const plain = tone === "sea" ? "text-sea-deep" : "text-indigo";

  if (parts.length < 2) {
    return <span className={`font-display font-bold ${plain} ${text}`}>{surfaceForm}</span>;
  }
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      role="group"
      aria-label={t("grammar.morphemes", { word: surfaceForm, parts: parts.join(", ") })}
    >
      {parts.map((part, i) => (
        <span
          key={`${part}-${i}`}
          aria-hidden
          className={`rounded-xl font-display font-bold ${pad} ${text} ${
            // The first part is the piece that agrees; the rest is the root.
            // Two tones, so the boundary is visible without a legend.
            i === 0 ? "bg-sea-soft text-sea-deep" : "bg-sand-deep text-indigo"
          }`}
        >
          {part}
        </span>
      ))}
    </span>
  );
}
