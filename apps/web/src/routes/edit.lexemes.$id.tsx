import {
  CEFR_BANDS,
  KNOWN_POS,
  NOUN_CLASS_LABELS,
  REGISTERS,
  type GlossSuggestion,
} from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AudioButton } from "~/components/AudioButton.tsx";
import { GlossSuggestionLine } from "~/components/GlossSuggestionLine.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  ApiError,
  assistLexeme,
  getLexeme,
  morphPreview,
  patchLexeme,
  publishCheck,
  transition,
  upsertGloss,
  type AssistResponse,
  type LexemeDetail,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/edit/lexemes/$id")({ component: LexemeEditor });

const field = "w-full rounded border border-stone-300 px-2 py-1";

function LexemeEditor() {
  const { id } = Route.useParams();
  const t = useT();
  const qc = useQueryClient();
  const me = useMe();
  const detail = useQuery({ queryKey: ["lexeme", id], queryFn: () => getLexeme(id) });
  const gate = useQuery({
    queryKey: ["publish-check", id],
    queryFn: () => publishCheck("lexeme", id),
  });
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["lexeme", id] }),
      qc.invalidateQueries({ queryKey: ["publish-check", id] }),
      qc.invalidateQueries({ queryKey: ["grid"] }),
      qc.invalidateQueries({ queryKey: ["review-queue"] }),
    ]);

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => patchLexeme(id, patch),
    onSuccess: async () => {
      toast.success(t("edit.lexeme.saved"));
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const move = useMutation({
    mutationFn: (input: { to: "in_review" | "published" | "draft" | "retired"; note?: string }) =>
      transition({ kind: "lexeme", id, to: input.to, ...(input.note ? { note: input.note } : {}) }),
    onSuccess: async (r) => {
      if (r.ok) toast.success(`${t("edit.filters.status")}: ${r.status}`);
      else toast.error(r.reason);
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const [suggestion, setSuggestion] = useState<AssistResponse["draft"] | null>(null);
  const assist = useMutation({
    mutationFn: () => assistLexeme(id),
    onSuccess: async (r) => {
      setSuggestion(r.draft);
      if (r.saved.length > 0)
        toast.success(t("edit.lexeme.assistDone", { langs: r.saved.join(", ") }));
      else toast.message(t("edit.lexeme.assistNothing"));
      await invalidate();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 503
          ? t("edit.lexeme.assistUnavailable")
          : e instanceof Error
            ? e.message
            : t("common.error"),
      ),
  });
  const morph = useQuery({ queryKey: ["morph", id], queryFn: () => morphPreview(id) });

  if (detail.isPending) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (detail.isError || !detail.data) return <p className="text-red-700">{t("common.error")}</p>;
  const { lexeme, glosses, links, audio, revisions } = detail.data;
  // Four eyes, except for an admin, whose own approval is logged as such.
  const isCreator = me.data?.user.id === lexeme.createdBy && !me.data?.roles.includes("admin");

  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" lang="xh">
            {lexeme.lemma}
          </h1>
          <StatusBadge status={lexeme.status} />
          {lexeme.status === "ai_draft" && (
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-900">
              {t("edit.lexeme.aiDraftBadge")}
            </span>
          )}
          <span className="text-xs text-stone-500">
            {lexeme.source} · {lexeme.licence}
            {lexeme.attribution.length > 0 && ` · ${lexeme.attribution.join(", ")}`}
          </span>
        </header>

        <Fields lexeme={lexeme} onSave={(patch) => save.mutate(patch)} saving={save.isPending} />

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t("edit.lexeme.glosses")}</h2>
            <button
              type="button"
              disabled={assist.isPending}
              title={t("edit.lexeme.assistHint")}
              onClick={() => assist.mutate()}
              className="rounded border border-purple-700 px-3 py-1 text-xs font-medium text-purple-900 disabled:opacity-50"
            >
              {assist.isPending ? t("common.loading") : t("edit.lexeme.assist")}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["en", "nb"] as const).map((lang) => (
              <GlossEditor
                key={lang}
                lexemeId={id}
                lang={lang}
                gloss={glosses.find((g) => g.sourceLang === lang)}
                suggestion={suggestion?.[lang] ?? null}
                comparisons={(detail.data.glossSuggestions ?? []).filter(
                  (s) => s.sourceLang === lang,
                )}
                onSaved={invalidate}
              />
            ))}
          </div>
          {suggestion && suggestion.caveat && (
            <p className="mt-3 text-xs text-purple-900">
              {t("edit.lexeme.assistSuggestion")} ({suggestion.confidence}): {suggestion.caveat}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("edit.lexeme.audio")}</h2>
          {audio.length === 0 && <p className="text-sm text-stone-500">—</p>}
          <ul className="space-y-2">
            {audio.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <AudioButton url={a.url} label={a.tier} />
                <span>{a.tier}</span>
                <StatusBadge status={a.status} />
                <span className="text-stone-500">{a.durationMs} ms</span>
                {a.status === "in_review" && (
                  <button
                    type="button"
                    className="rounded bg-green-700 px-2 py-1 text-xs text-white"
                    onClick={() =>
                      transition({ kind: "audio_asset", id: a.id, to: "published" })
                        .then((r) =>
                          r.ok ? toast.success("audio published") : toast.error(r.reason),
                        )
                        .then(invalidate)
                    }
                  >
                    {t("edit.lexeme.approve")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {links.length > 0 && (
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold">Links</h2>
            <ul className="flex flex-wrap gap-2">
              {links.map((l, i) => (
                <li key={i} className="rounded-full bg-stone-100 px-2 py-0.5">
                  {l.kind}
                  {l.sourceKind && l.sourceKind !== l.kind ? ` (${l.sourceKind})` : ""}: {l.toLemma}
                </li>
              ))}
            </ul>
          </div>
        )}

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
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t("edit.lexeme.morph")}</h2>
          {morph.data?.applicable ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {morph.data.forms.map((f) => (
                  <div key={f.form} className="contents">
                    <dt className="text-stone-500">{f.form.replace("_", " ")}</dt>
                    <dd className={f.error ? "text-red-800" : "font-medium"}>
                      {f.surface ?? f.error}
                    </dd>
                  </div>
                ))}
              </dl>
              {!morph.data.validated && (
                <p className="mt-2 text-xs text-amber-800">{t("edit.lexeme.morphUnvalidated")}</p>
              )}
            </>
          ) : (
            <p className="text-stone-500">{t("edit.lexeme.morphNotNoun")}</p>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
          {(lexeme.status === "draft" || lexeme.status === "ai_draft") && (
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => move.mutate({ to: "in_review" })}
              className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white"
            >
              {t("edit.lexeme.promote")}
            </button>
          )}
          {lexeme.status === "in_review" && (
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
              <RejectButton onReject={(note) => move.mutate({ to: "draft", note })} />
            </>
          )}
          {lexeme.status === "published" && (
            <RejectButton
              label={t("edit.status.retired")}
              onReject={(note) => move.mutate({ to: "retired", note })}
            />
          )}
        </div>
      </aside>
    </section>
  );
}

function Fields({
  lexeme,
  onSave,
  saving,
}: {
  lexeme: LexemeDetail["lexeme"];
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const t = useT();
  const [form, setForm] = useState({
    lemma: lexeme.lemma,
    pos: lexeme.pos,
    nounClassLabel: lexeme.nounClass ?? "",
    register: lexeme.register,
    cefrBand: lexeme.cefrBand ?? "",
    frequencyRank: lexeme.frequencyRank?.toString() ?? "",
    tonePattern: lexeme.tonePattern ?? "",
    infinitive: lexeme.infinitive ?? "",
  });
  useEffect(() => {
    setForm({
      lemma: lexeme.lemma,
      pos: lexeme.pos,
      nounClassLabel: lexeme.nounClass ?? "",
      register: lexeme.register,
      cefrBand: lexeme.cefrBand ?? "",
      frequencyRank: lexeme.frequencyRank?.toString() ?? "",
      tonePattern: lexeme.tonePattern ?? "",
      infinitive: lexeme.infinitive ?? "",
    });
  }, [lexeme]);
  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          lemma: form.lemma,
          pos: form.pos,
          nounClassLabel: form.nounClassLabel || null,
          register: form.register,
          cefrBand: form.cefrBand || null,
          frequencyRank: form.frequencyRank ? Number(form.frequencyRank) : null,
          tonePattern: form.tonePattern || null,
          infinitive: form.infinitive || null,
        });
      }}
    >
      <label className="text-sm">
        {t("edit.lexeme.lemma")}
        <input value={form.lemma} onChange={upd("lemma")} className={field} lang="xh" />
      </label>
      <label className="text-sm">
        {t("edit.lexeme.pos")}
        <select value={form.pos} onChange={upd("pos")} className={field}>
          {KNOWN_POS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t("edit.lexeme.nounClass")}
        <select value={form.nounClassLabel} onChange={upd("nounClassLabel")} className={field}>
          <option value="">—</option>
          {NOUN_CLASS_LABELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t("edit.lexeme.register")}
        <select value={form.register} onChange={upd("register")} className={field}>
          {REGISTERS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t("edit.lexeme.cefrBand")}
        <select value={form.cefrBand} onChange={upd("cefrBand")} className={field}>
          <option value="">—</option>
          {CEFR_BANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t("edit.lexeme.frequencyRank")}
        <input
          type="number"
          value={form.frequencyRank}
          onChange={upd("frequencyRank")}
          className={field}
        />
      </label>
      <label className="text-sm">
        Infinitive
        <input value={form.infinitive} onChange={upd("infinitive")} className={field} />
      </label>
      <label className="text-sm">
        Tone pattern (from audio)
        <input value={form.tonePattern} onChange={upd("tonePattern")} className={field} />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("edit.lexeme.save")}
        </button>
      </div>
    </form>
  );
}

function GlossEditor({
  lexemeId,
  lang,
  gloss,
  suggestion,
  comparisons,
  onSaved,
}: {
  lexemeId: string;
  lang: "en" | "nb";
  gloss: LexemeDetail["glosses"][number] | undefined;
  suggestion: AssistResponse["draft"]["en"] | null;
  comparisons: readonly GlossSuggestion[];
  onSaved: () => Promise<unknown>;
}) {
  const t = useT();
  const [form, setForm] = useState({
    gloss: gloss?.gloss ?? "",
    usageNote: gloss?.usageNote ?? "",
    contrastiveNote: gloss?.contrastiveNote ?? "",
  });
  useEffect(
    () =>
      setForm({
        gloss: gloss?.gloss ?? "",
        usageNote: gloss?.usageNote ?? "",
        contrastiveNote: gloss?.contrastiveNote ?? "",
      }),
    [gloss],
  );
  const save = useMutation({
    mutationFn: () =>
      upsertGloss(lexemeId, lang, {
        gloss: form.gloss,
        usageNote: form.usageNote || null,
        contrastiveNote: form.contrastiveNote || null,
        origin: "human",
      }),
    onSuccess: async () => {
      toast.success(`${t(`edit.gloss.${lang}`)}: ${t("edit.lexeme.saved")}`);
      await onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium">{t(`edit.gloss.${lang}`)}</h3>
        {gloss && <StatusBadge status={gloss.status} />}
        {gloss?.status === "ai_draft" && (
          <span className="text-xs text-purple-800">{t("edit.lexeme.aiDraftBadge")}</span>
        )}
      </div>
      {suggestion && (
        <div className="rounded border border-purple-200 bg-purple-50 p-2 text-xs text-purple-950">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{t("edit.lexeme.assistSuggestion")}</span>
            <button
              type="button"
              className="rounded bg-purple-700 px-2 py-0.5 text-white"
              onClick={() =>
                setForm({
                  gloss: suggestion.gloss,
                  usageNote: suggestion.usage_note,
                  contrastiveNote: suggestion.contrastive_note,
                })
              }
            >
              {t("common.apply")}
            </button>
          </div>
          <p>{suggestion.gloss}</p>
          {suggestion.usage_note && <p className="text-purple-800">{suggestion.usage_note}</p>}
          {suggestion.contrastive_note && (
            <p className="text-purple-800">{suggestion.contrastive_note}</p>
          )}
        </div>
      )}
      <label className="block text-sm">
        {t("edit.gloss.gloss")}
        <input
          value={form.gloss}
          onChange={(e) => setForm((f) => ({ ...f, gloss: e.target.value }))}
          className={field}
          required
        />
      </label>
      {comparisons.map((s) => (
        <GlossSuggestionLine key={s.id} canonical={form.gloss} suggestion={s} />
      ))}
      <label className="block text-sm">
        {t("edit.gloss.usageNote")}
        <textarea
          value={form.usageNote}
          onChange={(e) => setForm((f) => ({ ...f, usageNote: e.target.value }))}
          className={field}
          rows={2}
        />
      </label>
      <label className="block text-sm">
        {t("edit.gloss.contrastiveNote")}
        <textarea
          value={form.contrastiveNote}
          onChange={(e) => setForm((f) => ({ ...f, contrastiveNote: e.target.value }))}
          className={field}
          rows={2}
          placeholder={lang === "nb" ? "tonelag, ikke trykk" : "tone, not stress"}
        />
      </label>
      <button
        type="submit"
        disabled={save.isPending || !form.gloss.trim()}
        className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {t("edit.lexeme.save")}
      </button>
    </form>
  );
}

function RejectButton({ onReject, label }: { onReject: (note: string) => void; label?: string }) {
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
          onClick={() => onReject(note.trim())}
          className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {label ?? t("edit.lexeme.reject")}
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
      {label ?? t("edit.lexeme.reject")}
    </button>
  );
}
