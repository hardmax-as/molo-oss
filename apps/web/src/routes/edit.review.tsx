import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AudioBacklogNote } from "~/components/AudioBacklogNote.tsx";
import { AudioButton } from "~/components/AudioButton.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  approveReviewItems,
  assignReview,
  getEditors,
  getExerciseReports,
  getReviewQueue,
  resolveExerciseReport,
  transition,
  type ReviewFilter,
  type ReviewItem,
} from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/edit/review")({ component: ReviewQueue });

const FILTERS: readonly {
  value: ReviewFilter;
  key: "filterAll" | "filterMine" | "filterUnassigned";
}[] = [
  { value: "all", key: "filterAll" },
  { value: "mine", key: "filterMine" },
  { value: "unassigned", key: "filterUnassigned" },
];

/**
 * Everything in `in_review`, across content kinds, from the review_queue
 * view. An editor claims an item so two people do not review the same row;
 * an admin can hand one over. Assignment never changes status — approving
 * is still a transition, and still needs a second pair of eyes.
 */
function ReviewQueue() {
  const t = useT();
  const me = useMe();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const q = useQuery({
    queryKey: ["review-queue", filter],
    queryFn: () => getReviewQueue(filter),
    refetchInterval: 30_000,
  });
  const isAdmin = !!me.data?.roles.includes("admin");
  const editors = useQuery({ queryKey: ["editors"], queryFn: getEditors, staleTime: 300_000 });
  const filterId = useId();
  const qc = useQueryClient();
  const meId = me.data?.user.id ?? null;
  // Selection for "Approve and publish selected", keyed kind:id. Own rows are
  // selectable only for an admin; the server applies the same rule anyway.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [blocked, setBlocked] = useState<Map<string, string>>(() => new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const keyOf = (i: ReviewItem) => `${i.entityKind}:${i.entityId}`;
  const approvable = (q.data?.items ?? []).filter((i) => isAdmin || !meId || i.createdBy !== meId);
  const allSelected = approvable.length > 0 && approvable.every((i) => selected.has(keyOf(i)));
  const bulk = useMutation({
    mutationFn: async (items: ReviewItem[]) => {
      // Batches of 50, one after the other: a steady trickle on the database.
      const out = { published: 0, blocked: new Map<string, string>() };
      setProgress({ done: 0, total: items.length });
      for (let n = 0; n < items.length; n += 50) {
        const chunk = items.slice(n, n + 50).map((i) => ({ kind: i.entityKind, id: i.entityId }));
        const r = await approveReviewItems(chunk);
        out.published += r.published;
        for (const x of r.results)
          if (!x.ok) out.blocked.set(`${x.kind}:${x.id}`, x.reason ?? t("common.error"));
        setProgress({ done: Math.min(n + 50, items.length), total: items.length });
      }
      return out;
    },
    onSuccess: async (out) => {
      setProgress(null);
      setSelected(new Set());
      setBlocked(out.blocked);
      if (out.blocked.size === 0)
        toast.success(t("edit.review.bulk.done", { count: out.published }));
      else
        toast.warning(
          t("edit.review.bulk.partly", { count: out.published, blocked: out.blocked.size }),
        );
      await qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e) => {
      setProgress(null);
      toast.error(e instanceof Error ? e.message : t("common.error"));
    },
  });

  return (
    <section>
      <h1 className="mb-4 text-xl font-bold">{t("edit.reviewQueue")}</h1>
      <AudioBacklogNote className="mb-4" />
      <div
        role="group"
        aria-labelledby={filterId}
        className="mb-4 flex flex-wrap items-center gap-2 text-sm"
      >
        <span id={filterId} className="font-semibold">
          {t("edit.assign.filter")}
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 ${
              filter === f.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white"
            }`}
          >
            {t(`edit.assign.${f.key}`)}
          </button>
        ))}
      </div>
      {approvable.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm"
          data-testid="review-bulk"
        >
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(approvable.map(keyOf)))}
            />
            {t("edit.review.bulk.selectAll", { count: approvable.length })}
          </label>
          <button
            type="button"
            disabled={selected.size === 0 || bulk.isPending}
            onClick={() => bulk.mutate((q.data?.items ?? []).filter((i) => selected.has(keyOf(i))))}
            className="rounded bg-sea-deep px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {progress
              ? t("edit.review.bulk.progress", { done: progress.done, total: progress.total })
              : t("edit.review.bulk.approve", { count: selected.size })}
          </button>
          <span className="text-xs text-stone-500">{t("edit.review.bulk.hint")}</span>
        </div>
      )}
      {q.isPending && <p className="text-stone-500">{t("common.loading")}</p>}
      {q.data && q.data.items.length === 0 && (
        <p className="text-stone-600">{t("edit.assign.empty")}</p>
      )}
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
        {q.data?.items.map((i) => (
          <Row
            key={`${i.entityKind}:${i.entityId}`}
            item={i}
            meId={me.data?.user.id ?? null}
            isAdmin={isAdmin}
            editors={editors.data?.editors ?? []}
            selectable={isAdmin || !meId || i.createdBy !== meId}
            selected={selected.has(keyOf(i))}
            onSelect={(on) =>
              setSelected((s) => {
                const next = new Set(s);
                if (on) next.add(keyOf(i));
                else next.delete(keyOf(i));
                return next;
              })
            }
            blockedReason={blocked.get(keyOf(i)) ?? null}
          />
        ))}
      </ul>
      <LearnerReports />
    </section>
  );
}

/**
 * What learners reported from inside a lesson. It sits under the review
 * queue rather than in it: a report is a note about content, not a row
 * waiting for a status change, and acting on one is still an ordinary
 * edit with an ordinary second pair of eyes.
 */
function LearnerReports() {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const q = useQuery({
    queryKey: ["exercise-reports", open],
    queryFn: () => getExerciseReports(open),
    refetchInterval: 60_000,
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; resolved: boolean }) => resolveExerciseReport(v.id, v.resolved),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["exercise-reports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{t("edit.reports.title")}</h2>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
          {t("edit.reports.open", { count: q.data?.openCount ?? 0 })}
        </span>
        <span className="grow" />
        {(["openTab", "allTab"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={open === (key === "openTab")}
            onClick={() => setOpen(key === "openTab")}
            className={`rounded-full border px-3 py-1 text-sm ${
              open === (key === "openTab")
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white"
            }`}
          >
            {t(`edit.reports.${key}`)}
          </button>
        ))}
      </div>
      {q.data && q.data.reports.length === 0 && (
        <p className="text-stone-600">{t("edit.reports.empty")}</p>
      )}
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
        {q.data?.reports.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="w-36 text-xs uppercase tracking-wide text-stone-500">
              {t(`edit.reports.reason.${r.reason}` as never)}
            </span>
            <Link
              to="/edit/exercises/$id"
              params={{ id: r.exerciseId }}
              className="font-medium underline-offset-2 hover:underline"
            >
              {t("edit.reports.exercise")}: {r.exerciseType}
            </Link>
            <StatusBadge status={r.exerciseStatus} />
            <span className="text-xs uppercase text-stone-500">{r.sourceLang}</span>
            {r.note && <span className="min-w-0 grow text-stone-700">“{r.note}”</span>}
            <span className="grow" />
            <span className="text-stone-400">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
            {r.resolvedAt ? (
              <button
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: r.id, resolved: false })}
                className="rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                {t("edit.reports.reopen")}
              </button>
            ) : (
              <button
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: r.id, resolved: true })}
                className="rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                {t("edit.reports.resolve")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  item,
  meId,
  isAdmin,
  editors,
  selectable,
  selected,
  onSelect,
  blockedReason,
}: {
  selectable: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  /** Why the last bulk approval left this row where it is. */
  blockedReason: string | null;
  item: ReviewItem;
  meId: string | null;
  /** Also lets an admin approve their own work; the server logs it as such. */
  isAdmin: boolean;
  editors: readonly { id: string; name: string }[];
}) {
  const t = useT();
  const qc = useQueryClient();
  const selectId = useId();
  const assign = useMutation({
    mutationFn: (assignedTo: string | null) =>
      assignReview({ kind: item.entityKind, id: item.entityId, assignedTo }),
    onSuccess: async (r) => {
      toast.success(r.assignedTo ? t("edit.assign.assigned") : t("edit.assign.released"));
      await qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const { lang } = useLang();
  const decide = useMutation({
    mutationFn: (v: { to: "published" | "draft"; note?: string }) =>
      transition({
        kind: item.entityKind as never,
        id: item.entityId,
        to: v.to,
        ...(v.note ? { note: v.note } : {}),
      }),
    onSuccess: async (r) => {
      if (r.ok)
        toast.success(
          r.status === "published" ? t("edit.review.approved") : t("edit.review.sentBack"),
        );
      else toast.error(r.reason);
      await qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const mine = !!meId && item.assignedTo === meId;
  // Four eyes: whoever made a row cannot approve it, unless they are an admin
  // (the approval is then logged as an admin's own). The server decides;
  // saying so here saves a click that could only fail.
  const mineToMake = !!meId && item.createdBy === meId;
  const own = mineToMake && !isAdmin;
  const link = "font-medium underline-offset-2 hover:underline";
  const when = new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.updatedAt));
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-testid="review-row">
      <input
        type="checkbox"
        aria-label={t("edit.review.bulk.selectRow", { label: item.label })}
        disabled={!selectable}
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <span className="w-24 text-xs uppercase tracking-wide text-stone-500">{item.entityKind}</span>
      {item.entityKind === "lexeme" ? (
        <Link to="/edit/lexemes/$id" params={{ id: item.entityId }} className={link}>
          {item.label}
        </Link>
      ) : item.entityKind === "sentence" ? (
        <Link to="/edit/sentences/$id" params={{ id: item.entityId }} className={link} lang="xh">
          {item.label}
        </Link>
      ) : item.exercise?.type === "culture_card" ? (
        <Link to="/edit/culture" className={link}>
          {t("edit.review.cultureCard", { title: item.exercise.title ?? item.label })}
        </Link>
      ) : item.exercise ? (
        <Link to="/edit/exercises/$id" params={{ id: item.entityId }} className={link}>
          {t("edit.review.exercise", { type: item.exercise.type })}
        </Link>
      ) : item.audio && item.audio.targetKind !== "click" ? (
        // A recording is heard and decided here: it has no page of its own.
        <span className="inline-flex flex-wrap items-center gap-2">
          <AudioButton url={item.audio.url} label={t("edit.review.play")} size="sm" tone="sea" />
          {item.audio.targetKind === "lexeme" ? (
            <Link to="/edit/lexemes/$id" params={{ id: item.audio.targetId }} className={link}>
              {t("edit.review.recordingOf", { text: item.audio.targetText ?? item.label })}
            </Link>
          ) : item.audio.targetKind === "sentence" ? (
            <Link to="/edit/sentences/$id" params={{ id: item.audio.targetId }} className={link}>
              {t("edit.review.recordingOf", { text: item.audio.targetText ?? item.label })}
            </Link>
          ) : (
            <span className="font-medium">
              {t("edit.review.recordingOf", { text: item.audio.targetText ?? item.label })}
            </span>
          )}
          {item.audio.speakerName && (
            <span className="text-xs text-stone-500">
              {t("edit.review.spokenBy", { name: item.audio.speakerName })} · {item.audio.tier}
            </span>
          )}
        </span>
      ) : item.clickLetter ? (
        // A bare-click take has no page of its own; it is played and approved in the studio.
        <Link
          to="/edit/studio"
          className="font-medium underline-offset-2 hover:underline"
          title={t("edit.review.clickAudioHint")}
        >
          {t("edit.review.clickAudio", { letter: item.clickLetter })}
        </Link>
      ) : (
        <span className="font-medium">{item.label}</span>
      )}
      <StatusBadge status={item.status} />
      <span className="grow" />
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          item.assignedTo ? "bg-sea/15 text-sea-deep" : "bg-stone-100 text-stone-500"
        }`}
        title={
          item.assignedAt
            ? [
                t("edit.assign.since", { date: item.assignedAt.slice(0, 16).replace("T", " ") }),
                item.assignedBy
                  ? t("edit.assign.assignedBy", {
                      name: item.assignedByName ?? item.assignedBy,
                    })
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      >
        {t("edit.assign.assignee")}:{" "}
        {item.assignedToName ?? item.assignedTo ?? t("edit.assign.unassigned")}
      </span>
      {mine || (isAdmin && item.assignedTo) ? (
        <button
          type="button"
          disabled={assign.isPending}
          onClick={() => assign.mutate(null)}
          className="rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-40"
        >
          {t("edit.assign.release")}
        </button>
      ) : (
        !item.assignedTo && (
          <button
            type="button"
            disabled={assign.isPending || !meId}
            onClick={() => meId && assign.mutate(meId)}
            className="rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            {t("edit.assign.takeIt")}
          </button>
        )
      )}
      {isAdmin && (
        <label className="text-xs text-stone-500" htmlFor={selectId}>
          <span className="sr-only">{t("edit.assign.assignTo")}</span>
          <select
            id={selectId}
            value={item.assignedTo ?? ""}
            disabled={assign.isPending}
            onChange={(e) => assign.mutate(e.target.value || null)}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">{t("edit.assign.unassigned")}</option>
            {editors.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {item.entityKind === "audio_asset" && !item.clickLetter && (
        <span className="flex items-center gap-2">
          <button
            type="button"
            disabled={decide.isPending || own}
            title={own ? t("edit.review.ownItem") : undefined}
            onClick={() => decide.mutate({ to: "published" })}
            className="rounded bg-sea-deep px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            {t("edit.review.approve")}
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => {
              const why = window.prompt(t("edit.lexeme.rejectNote")) ?? "";
              if (why.trim() !== "") decide.mutate({ to: "draft", note: why });
            }}
            className="rounded bg-coral-soft px-2 py-1 text-xs font-semibold text-coral-deep disabled:opacity-40"
          >
            {t("edit.review.sendBack")}
          </button>
        </span>
      )}
      {own && <span className="text-xs text-stone-500">{t("edit.review.ownItem")}</span>}
      {mineToMake && isAdmin && (
        <span className="text-xs text-stone-500">{t("edit.review.ownItemAdmin")}</span>
      )}
      <span className="text-stone-500" data-testid="review-by">
        {t("edit.review.by", { name: item.createdByName ?? item.createdBy ?? "system" })}
      </span>
      <time className="text-stone-400" dateTime={item.updatedAt}>
        {when}
      </time>
      {item.priority > 0 && (
        <span className="rounded bg-orange-100 px-2 text-xs text-orange-800">p{item.priority}</span>
      )}
      {blockedReason && (
        <span className="basis-full text-xs text-coral-deep" data-testid="review-blocked">
          {t("edit.review.bulk.blocked", { reason: blockedReason })}
        </span>
      )}
    </li>
  );
}
