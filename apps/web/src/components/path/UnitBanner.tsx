import type { PathUnitRow } from "@molo/core";
import { BookMarked, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "~/lib/i18n.tsx";

/** Unit colours: the path is long, so each stretch gets its own ground. */
const TONES = [
  "bg-indigo text-white",
  "bg-sea-deep text-white",
  "bg-ochre-deep text-white",
  "bg-indigo-soft text-white",
] as const;

export function unitTone(unitNumber: number): string {
  return TONES[(unitNumber - 1) % TONES.length] ?? TONES[0];
}

/**
 * The app header is sticky and its height changes with the progress strip,
 * so the section header measures it rather than guessing. Nothing else on
 * the page depends on the number, and a wrong first frame is a few pixels.
 */
function useHeaderOffset(): number {
  const [top, setTop] = useState(96);
  useEffect(() => {
    const header = document.getElementById("app-header");
    if (!header) return;
    const measure = () => setTop(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return top;
}

/**
 * The section header. It sticks under the app header for the whole of its
 * unit's stretch of path and is pushed off by the next unit's header, which
 * is what `position: sticky` inside a section does natively — no scroll
 * listener, so a long path stays smooth.
 */
export function UnitBanner({
  row,
  as = "h2",
  onOpenWords,
}: {
  row: PathUnitRow;
  as?: "h1" | "h2";
  onOpenWords: (slug: string) => void;
}) {
  const t = useT();
  const top = useHeaderOffset();
  const Heading = as;
  const title = t(row.titleKey as never) || row.unitSlug;
  const prerequisite = row.prerequisiteTitleKey
    ? t(row.prerequisiteTitleKey as never) || (row.prerequisiteSlug ?? "")
    : (row.prerequisiteSlug ?? "");

  return (
    <div className="sticky z-20 -mx-4 px-4 pb-3 pt-2 sm:-mx-6 sm:px-6" style={{ top }}>
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 shadow-pop ${
          row.locked ? "bg-mist-soft text-mist" : unitTone(row.unitNumber)
        }`}
        data-testid="path-unit-banner"
        data-unit={row.unitSlug}
      >
        <div className="min-w-0 grow">
          <p className="text-[0.68rem] font-bold uppercase tracking-widest opacity-80">
            {t("path.unit", { number: row.unitNumber })} · {row.cefrBand}
          </p>
          <Heading className="flex items-center gap-2 truncate font-display text-lg font-bold sm:text-xl">
            {row.locked && <Lock size={18} aria-label={t("path.state.locked")} />}
            {title}
          </Heading>
        </div>
        <p className="text-sm font-semibold opacity-90">
          {row.locked
            ? t("units.lockedHint", { unit: prerequisite })
            : t("path.unitProgress", { done: row.done, total: row.total })}
        </p>
        <button
          type="button"
          onClick={() => onOpenWords(row.unitSlug)}
          aria-label={t("path.wordListTitle", { unit: title })}
          className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-xl border-b-[3px] border-white/25 bg-white/15 px-3 py-1.5 font-display text-sm font-semibold hover:bg-white/25"
          data-testid="path-unit-words"
        >
          <BookMarked size={16} aria-hidden />
          <span aria-hidden>{t("path.wordList")}</span>
        </button>
      </div>
    </div>
  );
}
