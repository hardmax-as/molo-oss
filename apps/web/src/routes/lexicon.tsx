import { LexiconPackageManifest } from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/lexicon")({ component: Lexicon });

async function getPackage(): Promise<LexiconPackageManifest> {
  const response = await fetch("/lexicon-data/manifest.json");
  if (!response.ok) throw new Error("lexicon_package_unavailable");
  const manifest = Schema.decodeUnknownSync(LexiconPackageManifest)(await response.json());
  if (!manifest.publishedOnly) throw new Error("lexicon_package_not_public");
  return manifest;
}

function Lexicon() {
  const t = useT();
  const bundle = useQuery({ queryKey: ["lexicon-package"], queryFn: getPackage });
  const link = "font-semibold text-indigo underline decoration-sun decoration-2 underline-offset-4";
  return (
    <section className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
      <h1 className="font-display text-3xl font-bold text-indigo">{t("lexicon.title")}</h1>
      <p>{t("lexicon.intro")}</p>
      <p>{t("lexicon.attribution")}</p>
      <a href="https://isixhosa.click" className={link}>
        {t("lexicon.source")}
      </a>
      <p>{t("lexicon.changes")}</p>
      <p>{t("lexicon.scope")}</p>
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" className={link}>
        {t("lexicon.licence")}
      </a>
      {bundle.isPending ? (
        <p role="status">{t("common.loading")}</p>
      ) : bundle.data ? (
        <div className="space-y-3 rounded-2xl bg-sand p-5">
          <p>
            {t(bundle.data.headwords === 1 ? "lexicon.headwords_one" : "lexicon.headwords_other", {
              count: bundle.data.headwords,
            })}
          </p>
          <p>{t("lexicon.exported", { date: bundle.data.exportedAt })}</p>
          {bundle.data.headwords === 0 && <p>{t("lexicon.empty")}</p>}
          <a href={`/lexicon-data/${bundle.data.archive}`} download className={link}>
            {t("lexicon.download")}
          </a>
        </div>
      ) : (
        <p role="status">{t("lexicon.unavailable")}</p>
      )}
    </section>
  );
}
