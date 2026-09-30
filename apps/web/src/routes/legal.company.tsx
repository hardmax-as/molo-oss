import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "~/components/Markdown.tsx";
import { useLang } from "~/lib/i18n.tsx";

import en from "../../../../packages/brand/legal/company.en.md?raw";
import nb from "../../../../packages/brand/legal/company.nb.md?raw";

export const Route = createFileRoute("/legal/company")({ component: Page });

function Page() {
  const { lang } = useLang();
  return (
    <section className="mx-auto max-w-2xl rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
      <Markdown source={lang === "nb" ? nb : en} />
    </section>
  );
}
