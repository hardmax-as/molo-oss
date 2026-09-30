import type { SentenceRequestView } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "~/components/StatusBadge.tsx";
import { transition } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import {
  dismissSentenceRequest,
  fulfilSentenceRequest,
  getSentenceRequests,
  reopenSentenceRequest,
} from "~/lib/tutor-api.ts";

export const Route = createFileRoute("/edit/write")({ component: WriteSentencesPage });

const field = "w-full rounded border border-stone-300 px-2 py-1 text-sm";
const FILTERS = ["open", "fulfilled", "dismissed"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * "Write the sentences" (docs/EDITOR-GUIDE.md): the tutor's page.
 *
 * Each card is an English sentence a beginner needs and the words it should
 * be built around. The tutor types the isiXhosa; that box is the only place
 * on this page where isiXhosa is written, and a person types it. Saving makes
 * a `draft` sentence, so what she writes still has to be split into words,
 * recorded and approved by a second editor before a learner can meet it.
 */
function WriteSentencesPage() {
  const t = useT();
  const [unit, setUnit] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("open");
  const requests = useQuery({
    queryKey: ["edit-sentence-requests"],
    queryFn: () => getSentenceRequests(),
  });

  if (requests.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (requests.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
  const all = requests.data.requests;
  const units = [...new Set(all.map((r) => r.unitSlug))];
  const inUnit = all.filter((r) => unit === "" || r.unitSlug === unit);
  const shown = inUnit.filter((r) => r.status === filter);
  const done = inUnit.filter((r) => r.status === "fulfilled").length;
  const bySkill = new Map<string, SentenceRequestView[]>();
  for (const r of shown) {
    const key = `${r.unitSlug}/${r.skillSlug}`;
    bySkill.set(key, [...(bySkill.get(key) ?? []), r]);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-indigo">{t("edit.write.title")}</h1>
      <p className="mt-2 mb-4 max-w-prose text-sm text-mist">{t("edit.write.hint")}</p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-indigo" htmlFor="write-unit">
          {t("edit.write.unit")}
        </label>
        <select
          id="write-unit"
          className="rounded border border-stone-300 px-2 py-1 text-sm"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="">{t("edit.write.allUnits")}</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <div role="group" aria-label={t("edit.write.show")} className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-2xl px-3 py-1 text-sm font-semibold ${
                filter === f ? "bg-ochre-deep text-white" : "text-indigo/80 hover:bg-sand-deep"
              }`}
            >
              {t(`edit.write.filter.${f}`)} ({inUnit.filter((r) => r.status === f).length})
            </button>
          ))}
        </div>
        <span className="text-sm text-mist" data-testid="write-progress">
          {t("edit.write.progress", { done, total: inUnit.length })}
        </span>
      </div>

      {shown.length === 0 && <p className="text-mist">{t("edit.write.none")}</p>}
      <div className="space-y-8">
        {[...bySkill.entries()].map(([key, list]) => (
          <section key={key}>
            <h2 className="mb-3 font-display text-lg font-bold text-indigo">
              {t(list[0]?.skillTitleKey as never) || key}
              <span className="ml-2 text-xs font-normal text-mist">{key}</span>
            </h2>
            <div className="space-y-4">
              {list.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RequestCard({ request: r }: { request: SentenceRequestView }) {
  const t = useT();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["edit-sentence-requests"] });
  const [xh, setXh] = useState("");
  const [en, setEn] = useState(r.promptEn);
  const [nb, setNb] = useState(r.promptNb ?? "");
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "error");

  const save = useMutation({
    mutationFn: () =>
      fulfilSentenceRequest(r.id, {
        textXh: xh,
        ...(en.trim() !== r.promptEn ? { promptEn: en } : {}),
        ...(nb.trim() !== "" && nb.trim() !== (r.promptNb ?? "") ? { promptNb: nb } : {}),
      }),
    onSuccess: async () => {
      toast.success(t("edit.write.saved"));
      await refresh();
    },
    onError,
  });
  const dismiss = useMutation({
    mutationFn: (reason: string) => dismissSentenceRequest(r.id, { reason }),
    onSuccess: refresh,
    onError,
  });
  const reopen = useMutation({
    mutationFn: () => reopenSentenceRequest(r.id),
    onSuccess: refresh,
    onError,
  });
  // Taking back a written draft deletes it and reopens the card; ask once.
  const [confirmTakeBack, setConfirmTakeBack] = useState(false);
  // A written sentence waits as a draft until someone sends it on; a tutor
  // working alone does it from here, and a second editor approves it.
  const submit = useMutation({
    mutationFn: (sentenceId: string) =>
      transition({ kind: "sentence", id: sentenceId, to: "in_review" }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(t("edit.write.sentToReview"));
      else toast.error(res.reason);
      await refresh();
    },
    onError,
  });
  const id = `req-${r.id}`;

  return (
    <article
      className="rounded-3xl bg-cloud p-5 shadow-card"
      data-testid="sentence-request"
      aria-labelledby={`${id}-en-label`}
    >
      <p id={`${id}-en-label`} className="font-display text-xl font-bold text-indigo">
        {r.promptEn}
      </p>
      {r.note && (
        <p className="mt-1 text-sm text-mist">
          <span className="font-semibold">{t("edit.write.note")}:</span> {r.note}
        </p>
      )}
      <div className="mt-3">
        <p className="text-xs font-bold tracking-wide text-ochre-deep uppercase">
          {t("edit.write.words")}
        </p>
        {r.words.length === 0 ? (
          <p className="text-sm text-mist">{t("edit.write.noWords")}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {r.words.map((w) => (
              <li key={w.lexemeId} className="rounded-2xl bg-sand-deep px-3 py-1 text-sm">
                <span className="font-display font-bold text-indigo">{w.lemma}</span>{" "}
                <span className="text-mist">
                  {[w.gloss.en, w.gloss.nb].filter(Boolean).join(" · ") || w.pos}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.status === "fulfilled" && r.fulfilled && (
        <div className="mt-4 rounded-2xl border border-sand-deep p-3">
          <p className="font-display text-lg font-bold text-indigo" lang="xh">
            {r.fulfilled.textXh}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
            <StatusBadge status={r.fulfilled.status} />
            {r.fulfilled.sourceRef}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* The next thing a tutor does with a sentence she wrote: say it. */}
            <Link
              to="/edit/studio"
              search={{ unit: r.unitSlug, kind: "sentence", item: r.fulfilled.sentenceId }}
              className="inline-flex items-center gap-1 rounded-full bg-coral px-3 py-1.5 text-sm font-semibold text-white shadow-card"
            >
              <Mic size={14} aria-hidden /> {t("edit.write.recordIt")}
            </Link>
            <Link
              to="/edit/sentences/$id"
              params={{ id: r.fulfilled.sentenceId }}
              className="inline-block text-sm font-semibold text-indigo underline"
            >
              {t("edit.write.openSentence")}
            </Link>
            {r.fulfilled.status === "draft" && (
              <button
                type="button"
                className="rounded bg-sand-deep px-2 py-1 text-xs font-medium text-indigo disabled:opacity-40"
                disabled={submit.isPending}
                onClick={() => r.fulfilled && submit.mutate(r.fulfilled.sentenceId)}
              >
                {t("edit.write.sendToReview")}
              </button>
            )}
            {(r.fulfilled.status === "draft" || r.fulfilled.status === "ai_draft") &&
              (confirmTakeBack ? (
                <span className="inline-flex flex-wrap items-center gap-2" role="group">
                  <span className="text-xs font-semibold text-coral-deep">
                    {t("edit.write.takeBack.confirm")}
                  </span>
                  <button
                    type="button"
                    className="rounded bg-coral-deep px-2 py-1 text-xs font-semibold text-cloud"
                    disabled={reopen.isPending}
                    onClick={() => reopen.mutate()}
                  >
                    {t("edit.write.takeBack.yes")}
                  </button>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs font-semibold text-indigo"
                    onClick={() => setConfirmTakeBack(false)}
                  >
                    {t("edit.write.takeBack.cancel")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs font-semibold text-coral-deep underline"
                  onClick={() => setConfirmTakeBack(true)}
                >
                  {t("edit.write.takeBack.button")}
                </button>
              ))}
          </div>
        </div>
      )}

      {r.status === "dismissed" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-mist">
            {t("edit.write.filter.dismissed")}: {r.dismissedReason}
          </span>
          <button
            type="button"
            className="rounded bg-sand-deep px-2 py-1 text-xs font-medium text-indigo"
            onClick={() => reopen.mutate()}
          >
            {t("edit.write.reopen")}
          </button>
        </div>
      )}

      {r.status === "open" && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (xh.trim() !== "") save.mutate();
          }}
        >
          <div>
            <label htmlFor={`${id}-xh`} className="block text-xs font-semibold text-indigo">
              {t("edit.write.xhosa")}
            </label>
            <textarea
              id={`${id}-xh`}
              lang="xh"
              className={`${field} min-h-16 font-display text-base`}
              value={xh}
              onChange={(e) => setXh(e.target.value)}
              aria-describedby={`${id}-xh-hint`}
            />
            <p id={`${id}-xh-hint`} className="mt-1 text-xs text-mist">
              {t("edit.write.xhosaHint")}
            </p>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-indigo">
              {t("edit.write.editTranslation")}
            </summary>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div>
                <label htmlFor={`${id}-en`} className="block text-xs font-semibold text-mist">
                  {t("edit.write.english")}
                </label>
                <input
                  id={`${id}-en`}
                  className={field}
                  value={en}
                  onChange={(e) => setEn(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${id}-nb`} className="block text-xs font-semibold text-mist">
                  {t("edit.write.norwegian")}
                </label>
                <input
                  id={`${id}-nb`}
                  lang="nb"
                  className={field}
                  value={nb}
                  onChange={(e) => setNb(e.target.value)}
                  aria-describedby={`${id}-nb-hint`}
                />
                <p id={`${id}-nb-hint`} className="mt-1 text-xs text-mist">
                  {t("edit.write.norwegianHint")}
                </p>
              </div>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-indigo px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              disabled={save.isPending || xh.trim() === "" || en.trim() === ""}
            >
              {t("edit.write.save")}
            </button>
            <button
              type="button"
              className="rounded bg-coral-soft px-3 py-1.5 text-sm font-medium text-coral-deep"
              onClick={() => {
                const why = window.prompt(t("edit.write.dismissReason")) ?? "";
                if (why.trim() !== "") dismiss.mutate(why);
              }}
            >
              {t("edit.write.dismiss")}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
