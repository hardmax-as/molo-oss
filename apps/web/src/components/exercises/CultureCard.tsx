import type { ExercisePayload } from "@molo/core";
import { BookOpen } from "lucide-react";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";

import type { ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "culture_card" }>;

export function CultureCard({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const lang = content.sourceLang;
  return (
    <article className="relative -m-5 overflow-hidden rounded-3xl bg-sun-soft p-6 sm:-m-8 sm:p-10">
      <div className="mb-2 flex justify-end">
        <Crane pose="hello" size={96} />
      </div>
      <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-sun/40" aria-hidden />
      <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ochre-deep">
        <BookOpen size={14} aria-hidden /> Molo
      </p>
      <h2 className="mb-4 font-display text-3xl font-bold text-indigo">
        {payload.title[lang] ?? payload.title["en"]}
      </h2>
      <p className="mb-8 whitespace-pre-line text-lg leading-relaxed text-ink">
        {payload.body[lang] ?? payload.body["en"]}
      </p>
      <Button variant="indigo" size="lg" onClick={() => onDone({ correct: true, xp: 0 })}>
        {t("lesson.continue")}
      </Button>
    </article>
  );
}
