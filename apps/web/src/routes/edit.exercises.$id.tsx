import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ExerciseForm } from "~/components/ExerciseForm.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import { deleteDraft, getExercise, publishCheck, transition } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/edit/exercises/$id")({ component: ExercisePage });

const field = "w-full rounded border border-stone-300 px-2 py-1";

function ExercisePage() {
  const { id } = Route.useParams();
  const t = useT();
  const qc = useQueryClient();
  const me = useMe();
  const navigate = useNavigate();
  const detail = useQuery({ queryKey: ["exercise", id], queryFn: () => getExercise(id) });
  const gate = useQuery({
    queryKey: ["publish-check", "exercise", id],
    queryFn: () => publishCheck("exercise", id),
  });
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["exercise", id] }),
      qc.invalidateQueries({ queryKey: ["publish-check", "exercise", id] }),
      qc.invalidateQueries({ queryKey: ["curriculum"] }),
      qc.invalidateQueries({ queryKey: ["review-queue"] }),
    ]);
  const move = useMutation({
    mutationFn: (input: { to: "in_review" | "published" | "draft" | "retired"; note?: string }) =>
      transition({
        kind: "exercise",
        id,
        to: input.to,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: async (r) => {
      if (r.ok) toast.success(`${t("edit.filters.status")}: ${r.status}`);
      else toast.error(r.reason);
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const remove = useMutation({
    mutationFn: () => deleteDraft("exercise", id),
    onSuccess: async () => {
      toast.success(t("edit.curriculum.deleted"));
      await qc.invalidateQueries({ queryKey: ["curriculum"] });
      await navigate({ to: "/edit/curriculum" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  if (detail.isPending) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (detail.isError || !detail.data) return <p className="text-red-700">{t("common.error")}</p>;
  const { exercise, context, revisions } = detail.data;
  // Four eyes, except for an admin, whose own approval is logged as such.
  const isCreator = me.data?.user.id === exercise.createdBy && !me.data?.roles.includes("admin");

  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {t("edit.exercise.title")} <span className="font-mono text-lg">{exercise.type}</span>
          </h1>
          <StatusBadge status={exercise.status} />
          <Link to="/edit/curriculum" className="text-xs text-stone-500 underline">
            {t("edit.exercise.context", {
              unit: context.unit?.slug ?? "?",
              skill: context.skill?.slug ?? "?",
              lesson: context.lesson?.order ?? "?",
            })}
          </Link>
        </header>

        <ExerciseForm
          key={exercise.updatedAt}
          mode="edit"
          detail={detail.data}
          onSaved={async () => {
            toast.success(t("edit.exercise.saved"));
            await invalidate();
          }}
        />

        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t("edit.lexeme.revisions")}</h2>
          <ul className="space-y-1 text-stone-600">
            {revisions.map((r) => (
              <li key={r.id}>
                <span className="text-stone-400">{r.createdAt.slice(0, 16).replace("T", " ")}</span>{" "}
                {r.actorId ?? "system"}: {JSON.stringify(r.diff).slice(0, 120)}
                {r.note && <em> — {r.note}</em>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">{t("edit.lexeme.publishCheck")}</h2>
          {gate.data?.ok ? (
            <p className="text-green-700">{t("edit.lexeme.gateOk")}</p>
          ) : (
            <ul className="space-y-1 text-sm text-red-800">
              {gate.data?.failures.map((f, i) => (
                <li key={i}>
                  {t(`edit.gate.${f.code}` as never, { detail: f.detail ?? "" }) ||
                    `${f.code} ${f.detail ?? ""}`}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
          {(exercise.status === "draft" || exercise.status === "ai_draft") && (
            <>
              <button
                type="button"
                disabled={move.isPending}
                onClick={() => move.mutate({ to: "in_review" })}
                className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white"
              >
                {t("edit.lexeme.promote")}
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("edit.curriculum.deleteConfirm"))) remove.mutate();
                }}
                className="w-full rounded border border-red-700 px-3 py-2 text-sm font-medium text-red-700"
              >
                {t("edit.curriculum.delete")}
              </button>
            </>
          )}
          {exercise.status === "in_review" && (
            <>
              <button
                type="button"
                disabled={move.isPending || isCreator || !gate.data?.ok}
                title={isCreator ? t("edit.gate.four_eyes") : ""}
                onClick={() => move.mutate({ to: "published" })}
                className="w-full rounded bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {t("edit.lexeme.approve")}
              </button>
              <NoteButton
                label={t("edit.lexeme.reject")}
                onConfirm={(note) => move.mutate({ to: "draft", note })}
              />
            </>
          )}
          {exercise.status === "published" && (
            <NoteButton
              label={t("edit.status.retired")}
              onConfirm={(note) => move.mutate({ to: "retired", note })}
            />
          )}
        </div>
      </aside>
    </section>
  );
}

function NoteButton({ label, onConfirm }: { label: string; onConfirm: (note: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return open ? (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={field}
        rows={2}
        aria-label={t("edit.lexeme.rejectNote")}
        placeholder={t("edit.lexeme.rejectNote")}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() => onConfirm(note.trim())}
          className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full rounded border border-red-700 px-3 py-2 text-sm font-medium text-red-700"
    >
      {label}
    </button>
  );
}
