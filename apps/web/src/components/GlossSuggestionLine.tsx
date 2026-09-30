import { sameGloss, TRANSLATE_PROVENANCE } from "@molo/content";
import type { GlossSuggestion } from "@molo/core";

import { useT } from "../lib/i18n.tsx";

/** A second opinion, never a replacement or an approval action. */
export function GlossSuggestionLine({
  canonical,
  suggestion,
}: {
  canonical: string;
  suggestion: Pick<GlossSuggestion, "provenance" | "gloss">;
}) {
  const t = useT();
  if (suggestion.provenance !== TRANSLATE_PROVENANCE) return null;
  const agrees = sameGloss(canonical, suggestion.gloss);
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
      <span>{t("edit.gloss.googleSuggestion", { gloss: suggestion.gloss })}</span>
      <span
        className={`rounded-full px-2 py-0.5 ${agrees ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-800"}`}
      >
        {t(agrees ? "edit.gloss.agree" : "edit.gloss.differs")}
      </span>
    </p>
  );
}
