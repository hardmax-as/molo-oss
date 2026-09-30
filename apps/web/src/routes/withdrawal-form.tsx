import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "~/components/Markdown.tsx";
import { useLang, useT } from "~/lib/i18n.tsx";

import en from "../../../../packages/brand/legal/withdrawal.en.md?raw";
import nb from "../../../../packages/brand/legal/withdrawal.nb.md?raw";

export const Route = createFileRoute("/withdrawal-form")({ component: WithdrawalForm });
function WithdrawalForm() {
  const { lang } = useLang();
  const t = useT();
  const source = lang === "nb" ? nb : en;
  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-3xl bg-cloud p-6">
      <Markdown source={source} />
      <a
        href={`data:text/plain;charset=utf-8,${encodeURIComponent(source)}`}
        download={`molo-withdrawal-form-${lang}.txt`}
        className="inline-flex min-h-11 items-center rounded-2xl bg-indigo px-4 py-3 font-bold text-white"
      >
        {t("withdrawal.downloadForm")}
      </a>
    </section>
  );
}
