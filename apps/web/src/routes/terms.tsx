import { Link, createFileRoute } from "@tanstack/react-router";

import { Markdown } from "~/components/Markdown.tsx";
import { useLang, useT } from "~/lib/i18n.tsx";

import termsEn from "../../../../packages/brand/legal/terms.en.md?raw";
import termsNb from "../../../../packages/brand/legal/terms.nb.md?raw";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  const { lang } = useLang();
  const t = useT();
  return (
    <section className="mx-auto max-w-2xl rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
      <Markdown source={lang === "nb" ? termsNb : termsEn} />
      <p className="mt-6">
        <Link to="/lexicon" className="font-semibold text-indigo underline">
          {t("lexicon.title")}
        </Link>
      </p>
    </section>
  );
}
