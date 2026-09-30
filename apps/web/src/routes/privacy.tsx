import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "~/components/Markdown.tsx";
import { useLang } from "~/lib/i18n.tsx";

import privacyEn from "../../../../packages/brand/legal/privacy.en.md?raw";
import privacyNb from "../../../../packages/brand/legal/privacy.nb.md?raw";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  const { lang } = useLang();
  return (
    <section className="mx-auto max-w-2xl rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
      <Markdown source={lang === "nb" ? privacyNb : privacyEn} />
    </section>
  );
}
