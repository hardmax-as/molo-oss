import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { getUnit } from "~/lib/api.ts";
import { useFocusTrap } from "~/lib/focus.ts";
import { useLang, useT } from "~/lib/i18n.tsx";

/**
 * What the section header opens: every word this unit teaches, with its
 * gloss in the learner's source language and the voice that says it. The
 * words come from `/units/:slug`, which serves published rows only, so a
 * word that is pulled back into review simply stops appearing here.
 */
export function UnitWords({
  slug,
  title,
  onClose,
}: {
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const panel = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panel, true, onClose);
  const unit = useQuery({ queryKey: ["unit", slug, lang], queryFn: () => getUnit(slug, lang) });
  const words = Object.values(unit.data?.lexemes ?? {}).sort((a, b) =>
    a.lemma.localeCompare(b.lemma),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("path.wordListTitle", { unit: title })}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cloud p-5 shadow-pop sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <h2 className="grow font-display text-xl font-bold text-indigo">
            {t("path.wordListTitle", { unit: title })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="pressable flex h-10 w-10 items-center justify-center rounded-2xl border-sand-deep bg-sand text-indigo hover:bg-sand-deep"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {unit.isPending && <p className="text-mist">{t("common.loading")}</p>}
        {unit.isError && <p className="text-coral-deep">{t("common.error")}</p>}
        {unit.data && words.length === 0 && <p className="text-mist">{t("path.wordListEmpty")}</p>}
        <ul className="divide-y divide-mist-soft">
          {words.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2.5">
              <AudioButton
                url={w.audio?.url ?? null}
                voices={w.voices}
                label={t("lesson.listen")}
                attribution={w.audio?.attribution}
                size="sm"
              />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-indigo" lang="xh">
                  {w.lemma}
                </p>
                {w.gloss && <p className="text-sm text-mist">{w.gloss.gloss}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
