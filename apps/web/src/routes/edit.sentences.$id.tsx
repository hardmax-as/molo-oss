import { CEFR_BANDS, REGISTERS } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AudioButton } from "~/components/AudioButton.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  getSentence,
  listLexemes,
  patchSentence,
  publishCheck,
  setSentenceTokens,
  transition,
  upsertSentenceGloss,
  verifySentenceTokens,
  type SentenceDetail,
  type SentenceTokenInput,
  type TokenVerification,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/edit/sentences/$id")({ component: SentenceEditor });

const field = "w-full rounded border border-stone-300 px-2 py-1";

/** The sentence builder (ARCHITECTURE section 7): text as typed, tokens from the lexicon, xh-morph verdicts, glosses, gate. */
function SentenceEditor() {
  const { id } = Route.useParams();
  const t = useT();
  const qc = useQueryClient();
  const me = useMe();
  const detail = useQuery({ queryKey: ["sentence", id], queryFn: () => getSentence(id) });
  const gate = useQuery({
    queryKey: ["publish-check", "sentence", id],
    queryFn: () => publishCheck("sentence", id),
  });
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["sentence", id] }),
      qc.invalidateQueries({ queryKey: ["publish-check", "sentence", id] }),
      qc.invalidateQueries({ queryKey: ["sentences"] }),
      qc.invalidateQueries({ queryKey: ["review-queue"] }),
    ]);

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchSentence>[1]) => patchSentence(id, patch),
    onSuccess: async () => {
      toast.success(t("edit.sentence.saved"));
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const move = useMutation({
    mutationFn: (input: { to: "in_review" | "published" | "draft" | "retired"; note?: string }) =>
      transition({
        kind: "sentence",
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

  if (detail.isPending) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (detail.isError || !detail.data) return <p className="text-red-700">{t("common.error")}</p>;
  const { sentence, tokens, glosses, audio, revisions } = detail.data;
  // Four eyes, except for an admin, whose own approval is logged as such.
  const isCreator = me.data?.user.id === sentence.createdBy && !me.data?.roles.includes("admin");

  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" lang="xh">
            {sentence.textXh}
          </h1>
          <StatusBadge status={sentence.status} />
          <span className="text-xs text-stone-500">
            {sentence.source} · {sentence.licence}
          </span>
        </header>

        <Fields
          sentence={sentence}
          onSave={(patch) => save.mutate(patch)}
          saving={save.isPending}
        />

        <TokenBuilder sentenceId={id} tokens={tokens} onSaved={invalidate} />

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("edit.sentence.glosses")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(["en", "nb"] as const).map((lang) => (
              <GlossEditor
                key={lang}
                sentenceId={id}
                lang={lang}
                gloss={glosses.find((g) => g.sourceLang === lang)}
                onSaved={invalidate}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("edit.sentence.audio")}</h2>
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

        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t("edit.sentence.revisions")}</h2>
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
          {(sentence.status === "draft" || sentence.status === "ai_draft") && (
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => move.mutate({ to: "in_review" })}
              className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white"
            >
              {t("edit.lexeme.promote")}
            </button>
          )}
          {sentence.status === "in_review" && (
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
          {sentence.status === "published" && (
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
  sentence,
  onSave,
  saving,
}: {
  sentence: SentenceDetail["sentence"];
  onSave: (patch: Parameters<typeof patchSentence>[1]) => void;
  saving: boolean;
}) {
  const t = useT();
  const initial = () => ({
    textXh: sentence.textXh,
    register: sentence.register,
    cefrBand: sentence.cefrBand ?? "",
    sourceRef: sentence.sourceRef ?? "",
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [sentence]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form
      className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          textXh: form.textXh,
          register: form.register as (typeof REGISTERS)[number],
          cefrBand: (form.cefrBand || null) as (typeof CEFR_BANDS)[number] | null,
          sourceRef: form.sourceRef || null,
        });
      }}
    >
      <label className="text-sm md:col-span-5">
        {t("edit.sentence.text")}
        <input
          value={form.textXh}
          onChange={(e) => setForm((f) => ({ ...f, textXh: e.target.value }))}
          className={field}
          lang="xh"
          required
        />
        <span className="text-xs text-stone-500">{t("edit.sentence.textHint")}</span>
      </label>
      <label className="text-sm">
        {t("edit.sentence.register")}
        <select
          value={form.register}
          onChange={(e) => setForm((f) => ({ ...f, register: e.target.value }))}
          className={field}
        >
          {REGISTERS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t("edit.sentence.cefrBand")}
        <select
          value={form.cefrBand}
          onChange={(e) => setForm((f) => ({ ...f, cefrBand: e.target.value }))}
          className={field}
        >
          <option value="">—</option>
          {CEFR_BANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        {t("edit.sentence.sourceRef")}
        <input
          value={form.sourceRef}
          onChange={(e) => setForm((f) => ({ ...f, sourceRef: e.target.value }))}
          className={field}
        />
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

interface TokenRow extends SentenceTokenInput {
  lemma: string;
  pos: string;
  nounClass: string | null;
  lexemeStatus: string;
}

function VerificationBadge({ v }: { v: TokenVerification | null | undefined }) {
  const t = useT();
  if (!v) return null;
  const tone =
    v.state === "verified"
      ? "bg-green-100 text-green-900"
      : v.state === "mismatch"
        ? "bg-red-100 text-red-900"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${tone}`} title={v.reason ?? ""}>
      {t(`edit.sentence.${v.state}`)}
      {v.matched &&
        ` · ${t(v.matched === "lemma" ? "edit.sentence.matchedLemma" : "edit.sentence.matchedPlural")}`}
    </span>
  );
}

/** Ordered tokens: pick lexemes from the lexicon, type the form as it appears, let xh-morph judge. */
function TokenBuilder({
  sentenceId,
  tokens,
  onSaved,
}: {
  sentenceId: string;
  tokens: SentenceDetail["tokens"];
  onSaved: () => Promise<unknown>;
}) {
  const t = useT();
  const fromDetail = (): TokenRow[] =>
    tokens.map((tk) => ({
      lexemeId: tk.lexemeId,
      surfaceForm: tk.surfaceForm,
      irregular: tk.irregular,
      irregularNote: tk.irregularNote,
      lemma: tk.lemma,
      pos: tk.pos,
      nounClass: tk.nounClass,
      lexemeStatus: tk.lexemeStatus,
    }));
  const [rows, setRows] = useState<TokenRow[]>(fromDetail);
  const [checks, setChecks] = useState<(TokenVerification | null)[]>(() =>
    tokens.map((tk) => tk.verification),
  );
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRows(fromDetail());
    setChecks(tokens.map((tk) => tk.verification));
    setDirty(false);
  }, [tokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["grid", { q, limit: 8 }],
    queryFn: () => listLexemes({ q, limit: 8 }),
    enabled: q.trim().length >= 2,
  });

  const toInputs = (r: TokenRow[]): SentenceTokenInput[] =>
    r.map((x) => ({
      lexemeId: x.lexemeId,
      surfaceForm: x.surfaceForm,
      irregular: x.irregular ?? false,
      irregularNote: x.irregularNote ?? null,
    }));
  const verify = useMutation({
    mutationFn: () => verifySentenceTokens(toInputs(rows)),
    onSuccess: (r) => setChecks(r.tokens),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const saveTokens = useMutation({
    mutationFn: () => setSentenceTokens(sentenceId, toInputs(rows)),
    onSuccess: async (r) => {
      setChecks(r.tokens);
      setDirty(false);
      toast.success(t("edit.sentence.tokensSaved"));
      await onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const update = (i: number, patch: Partial<TokenRow>) => {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setChecks((c) => c.map((x, j) => (j === i ? null : x)));
    setDirty(true);
  };
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= rows.length) return;
    setRows((r) => {
      const next = [...r];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setChecks((c) => {
      const next = [...c];
      [next[i], next[j]] = [next[j] ?? null, next[i] ?? null];
      return next;
    });
    setDirty(true);
  };
  const add = (lx: {
    id: string;
    lemma: string;
    pos: string;
    nounClass: string | null;
    status: string;
  }) => {
    setRows((r) => [
      ...r,
      {
        lexemeId: lx.id,
        surfaceForm: lx.lemma,
        irregular: false,
        irregularNote: null,
        lemma: lx.lemma,
        pos: lx.pos,
        nounClass: lx.nounClass,
        lexemeStatus: lx.status,
      },
    ]);
    setChecks((c) => [...c, null]);
    setDirty(true);
    setQ("");
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("edit.sentence.tokens")}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={verify.isPending || rows.length === 0}
            onClick={() => verify.mutate()}
            className="rounded border border-stone-400 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {t("edit.sentence.verify")}
          </button>
          <button
            type="button"
            disabled={saveTokens.isPending || !dirty}
            onClick={() => saveTokens.mutate()}
            className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {t("edit.sentence.saveTokens")}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-stone-500">{t("edit.sentence.tokensHint")}</p>

      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={`${row.lexemeId}-${i}`} className="rounded border border-stone-200 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-5 text-right text-stone-400">{i + 1}</span>
              <span className="font-medium" lang="xh">
                {row.lemma}
              </span>
              <span className="text-xs text-stone-500">
                {row.pos}
                {row.nounClass ? ` · ${row.nounClass}` : ""}
              </span>
              {row.lexemeStatus !== "published" && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-900">
                  {t("edit.sentence.lexemeDraft")}
                </span>
              )}
              <VerificationBadge v={checks[i]} />
              {checks[i]?.expectedPlural && checks[i]?.matched !== "plural" && (
                <span className="text-xs text-stone-500">
                  {t("edit.sentence.expectedPlural")}:{" "}
                  <span lang="xh">{checks[i]?.expectedPlural}</span>
                </span>
              )}
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => swap(i, i - 1)}
                  className="rounded border px-2 text-xs"
                  aria-label={t("edit.sentence.moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => swap(i, i + 1)}
                  className="rounded border px-2 text-xs"
                  aria-label={t("edit.sentence.moveDown")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows((r) => r.filter((_, j) => j !== i));
                    setChecks((c) => c.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  className="rounded border border-red-300 px-2 text-xs text-red-800"
                  aria-label={t("edit.sentence.remove")}
                >
                  ×
                </button>
              </span>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_2fr]">
              <label className="text-xs">
                {t("edit.sentence.surfaceForm")}
                <input
                  value={row.surfaceForm}
                  onChange={(e) => update(i, { surfaceForm: e.target.value })}
                  className={field}
                  lang="xh"
                />
              </label>
              <label className="flex items-end gap-1 pb-2 text-xs">
                <input
                  type="checkbox"
                  checked={row.irregular ?? false}
                  onChange={(e) => update(i, { irregular: e.target.checked })}
                />
                {t("edit.sentence.irregular")}
              </label>
              <label className="text-xs">
                {t("edit.sentence.irregularNote")}
                <input
                  value={row.irregularNote ?? ""}
                  onChange={(e) => update(i, { irregularNote: e.target.value || null })}
                  className={field}
                  disabled={!row.irregular}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3">
        <label className="text-sm">
          {t("edit.sentence.search")}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={field}
            lang="xh"
            placeholder="…"
          />
        </label>
        {search.data && q.trim().length >= 2 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {search.data.lexemes.map((lx) => (
              <li key={lx.id}>
                <button
                  type="button"
                  onClick={() => add(lx)}
                  className="rounded-full border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
                >
                  <span lang="xh">{lx.lemma}</span>
                  <span className="ml-1 text-xs text-stone-500">
                    {lx.pos}
                    {lx.nounClass ? ` ${lx.nounClass}` : ""} · {lx.status}
                  </span>
                </button>
              </li>
            ))}
            {search.data.lexemes.length === 0 && <li className="text-xs text-stone-500">—</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function GlossEditor({
  sentenceId,
  lang,
  gloss,
  onSaved,
}: {
  sentenceId: string;
  lang: "en" | "nb";
  gloss: SentenceDetail["glosses"][number] | undefined;
  onSaved: () => Promise<unknown>;
}) {
  const t = useT();
  const [form, setForm] = useState({
    gloss: gloss?.gloss ?? "",
    literalGloss: gloss?.literalGloss ?? "",
  });
  useEffect(
    () => setForm({ gloss: gloss?.gloss ?? "", literalGloss: gloss?.literalGloss ?? "" }),
    [gloss],
  );
  const save = useMutation({
    mutationFn: () =>
      upsertSentenceGloss(sentenceId, lang, {
        gloss: form.gloss,
        literalGloss: form.literalGloss || null,
        origin: "human",
      }),
    onSuccess: async () => {
      toast.success(`${t(`edit.gloss.${lang}`)}: ${t("edit.sentence.saved")}`);
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
      <label className="block text-sm">
        {t("edit.sentence.gloss")}
        <input
          value={form.gloss}
          onChange={(e) => setForm((f) => ({ ...f, gloss: e.target.value }))}
          className={field}
          required
        />
      </label>
      <label className="block text-sm">
        {t("edit.sentence.literalGloss")}
        <textarea
          value={form.literalGloss}
          onChange={(e) => setForm((f) => ({ ...f, literalGloss: e.target.value }))}
          className={field}
          rows={2}
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
