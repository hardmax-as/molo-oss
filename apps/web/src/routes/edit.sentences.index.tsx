import { LICENCES, STATUSES } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "~/components/StatusBadge.tsx";
import { createSentence, listSentences, type SentenceQuery } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

/**
 * Deep-linked from the landing page, so the filters live in the URL:
 * `?missingGloss=any` is "short of a translation in at least one source
 * language", the figure the landing page counts.
 */
export const Route = createFileRoute("/edit/sentences/")({
  component: SentenceList,
  validateSearch: (search: Record<string, unknown>): SentenceSearch => {
    const out: Record<string, string | number> = {};
    for (const k of ["q", "status", "missingGloss"] as const) {
      const v = search[k];
      if (typeof v === "string" && v !== "") out[k] = v;
    }
    const offset = Number(search["offset"]);
    if (Number.isFinite(offset) && offset > 0) out["offset"] = offset;
    return out as SentenceSearch;
  },
});

export interface SentenceSearch {
  readonly q?: string;
  readonly status?: string;
  readonly missingGloss?: string;
  readonly offset?: number;
}

const PAGE_SIZE = 50;
const field = "rounded border border-stone-300 bg-white px-2 py-1 text-sm";

/** Sentence list with filters and a minimal "new sentence" form (ARCHITECTURE section 7). */
function SentenceList() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routeNavigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const query: SentenceQuery = { ...search, limit: PAGE_SIZE, offset: search.offset ?? 0 };
  const rows = useQuery({
    queryKey: ["sentences", query],
    queryFn: () => listSentences(query),
    placeholderData: (prev) => prev,
  });
  /** A filter change is a new URL, so a filtered list can be linked to. */
  const set = (patch: Partial<SentenceSearch>) =>
    void routeNavigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        delete next["offset"];
        for (const [k, v] of Object.entries(next)) if (v === "" || v === undefined) delete next[k];
        return next as SentenceSearch;
      },
    });
  const page = (delta: number) =>
    void routeNavigate({
      search: (prev) => {
        const offset = Math.max(0, (prev.offset ?? 0) + delta * PAGE_SIZE);
        const next: Record<string, unknown> = { ...prev };
        if (offset === 0) delete next["offset"];
        else next["offset"] = offset;
        return next as SentenceSearch;
      },
    });

  const [draft, setDraft] = useState({ textXh: "", licence: "proprietary-molo", sourceRef: "" });
  const create = useMutation({
    mutationFn: () =>
      createSentence({
        textXh: draft.textXh.trim(),
        source: "editor",
        sourceRef: draft.sourceRef.trim() || null,
        licence: draft.licence as (typeof LICENCES)[number],
        origin: "human",
      }),
    onSuccess: async (r) => {
      toast.success(t("edit.sentence.created"));
      await qc.invalidateQueries({ queryKey: ["sentences"] });
      await navigate({ to: "/edit/sentences/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="grow text-sm">
          {t("edit.sentence.new")}
          <input
            value={draft.textXh}
            onChange={(e) => setDraft((d) => ({ ...d, textXh: e.target.value }))}
            className={`block w-full ${field}`}
            placeholder={t("edit.sentence.text")}
            required
            lang="xh"
          />
        </label>
        <label className="text-sm">
          {t("edit.sentence.sourceRef")}
          <input
            value={draft.sourceRef}
            onChange={(e) => setDraft((d) => ({ ...d, sourceRef: e.target.value }))}
            className={`block ${field}`}
          />
        </label>
        <label className="text-sm">
          {t("edit.lexeme.licence")}
          <select
            value={draft.licence}
            onChange={(e) => setDraft((d) => ({ ...d, licence: e.target.value }))}
            className={`block ${field}`}
          >
            {LICENCES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={create.isPending || !draft.textXh.trim()}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("edit.sentence.create")}
        </button>
      </form>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {t("edit.search")}
          <input
            value={search.q ?? ""}
            onChange={(e) => set({ q: e.target.value })}
            className={`block ${field}`}
          />
        </label>
        <label className="text-sm">
          {t("edit.filters.status")}
          <select
            value={search.status ?? ""}
            onChange={(e) => set({ status: e.target.value })}
            className={`block ${field}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`edit.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("edit.filters.missingGloss")}
          <select
            value={search.missingGloss ?? ""}
            onChange={(e) => set({ missingGloss: e.target.value })}
            className={`block ${field}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            <option value="en">en</option>
            <option value="nb">nb</option>
            <option value="any">{t("edit.filters.missingGlossAny")}</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("edit.sentence.title")}</caption>
          <thead className="bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-600">
            <tr>
              <th scope="col" className="px-3 py-2">
                {t("edit.sentence.cols.text")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("edit.filters.status")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("edit.sentence.cols.tokens")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("edit.sentence.cols.glosses")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("edit.sentence.cols.audio")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("edit.sentence.cols.updated")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.sentences.map((s) => (
              <tr key={s.id} className="border-t border-stone-100 hover:bg-orange-50">
                <td className="px-3 py-2 font-medium" lang="xh">
                  <Link
                    to="/edit/sentences/$id"
                    params={{ id: s.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {s.textXh}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2">
                  <span className={s.verifiedCount < s.tokenCount ? "text-amber-800" : ""}>
                    {s.verifiedCount}/{s.tokenCount}
                  </span>
                </td>
                <td className="px-3 py-2">{s.glossLangs.join(", ")}</td>
                <td className="px-3 py-2">{s.audioCount}</td>
                <td className="px-3 py-2 text-xs text-stone-500">
                  {s.updatedAt.slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.isPending && <p className="p-3 text-stone-500">{t("common.loading")}</p>}
        {rows.data && rows.data.sentences.length === 0 && (
          <p className="p-3 text-stone-500">{t("edit.sentence.empty")}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={(search.offset ?? 0) === 0}
          onClick={() => page(-1)}
          className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          disabled={(rows.data?.sentences.length ?? 0) < PAGE_SIZE}
          onClick={() => page(1)}
          className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          →
        </button>
      </div>
    </section>
  );
}
