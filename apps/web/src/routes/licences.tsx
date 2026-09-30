import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Markdown } from "~/components/Markdown.tsx";
import { useLang, useT } from "~/lib/i18n.tsx";

import attributions from "../../../../packages/brand/generated/attributions.json";
import libraries from "../../../../packages/brand/generated/libraries.web.json";

export const Route = createFileRoute("/licences")({ component: Licences });

function Licences() {
  const { lang } = useLang();
  const t = useT();
  const [search, setSearch] = useState("");
  const matches = libraries.libraries.filter((library) =>
    library.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <section className="mx-auto max-w-3xl rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
      <Markdown source={attributions.markdown[lang]} />
      <h2 className="mt-8 font-display text-xl font-semibold text-indigo">
        {t("licences.libraries")}
      </h2>
      <label className="my-4 block text-ink">
        {t("licences.search")}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-2 block w-full rounded-xl border border-mist-soft p-3"
        />
      </label>
      {matches.length === 0 && <p>{t("licences.noResults")}</p>}
      {matches.map((library) => (
        <details
          key={`${library.name}@${library.version}`}
          className="border-b border-mist-soft py-3"
        >
          <summary className="cursor-pointer break-words text-ink">
            <strong>{library.name}</strong> {library.version} · {library.licence}
          </summary>
          {library.notices.map((notice, i) => (
            <pre key={i} className="mt-3 whitespace-pre-wrap break-words text-xs text-ink">
              {notice.text}
            </pre>
          ))}
        </details>
      ))}
    </section>
  );
}
