import { SOURCE_LANGUAGES, type SourceLang } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  getEditorGrammarNotes,
  saveGrammarNoteBody,
  transition,
  type EditorGrammarNote,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/edit/grammar")({ component: GrammarNotesPage });

const field = "w-full rounded border border-stone-300 px-2 py-1 text-sm";

/**
 * Writing and reviewing grammar notes (docs/GRAMMAR.md).
 *
 * A plain form on purpose. The interesting thing on this page is not the
 * form, it is the **caveat**: a note loaded by `molo content grammar` was
 * written by a model on top of a rule table no native speaker has checked,
 * and publishing it answers two questions at once — does the explanation
 * teach, and is the claim true? The caveat sits above the fields, in warning
 * colours, so nobody publishes without reading it.
 *
 * The forms in a note's paradigm are read-only here. They came from the
 * lexicon verbatim or from `xh-morph`, and a free-text box over them would
 * be the one place in the system where isiXhosa could be typed in without
 * passing either.
 */
function GrammarNotesPage() {
  const t = useT();
  const notes = useQuery({ queryKey: ["edit-grammar"], queryFn: () => getEditorGrammarNotes() });

  if (notes.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (notes.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
  const list = notes.data?.notes ?? [];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-indigo">{t("edit.grammar.title")}</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-mist">{t("edit.grammar.hint")}</p>
      {list.length === 0 && <p className="text-mist">{t("edit.grammar.none")}</p>}
      <div className="space-y-6">
        {list.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: EditorGrammarNote }) {
  const t = useT();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["edit-grammar"] });
  const move = useMutation({
    mutationFn: (input: {
      kind: "grammar_note" | "grammar_note_body";
      id: string;
      to: "in_review" | "published" | "draft" | "retired";
      note?: string | undefined;
    }) =>
      transition({
        kind: input.kind,
        id: input.id,
        to: input.to,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: async (r) => {
      if (r.ok) toast.success(r.status);
      else toast.error(r.reason);
      await refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "error"),
  });

  return (
    <section className="rounded-3xl bg-cloud p-5 shadow-card">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-bold text-indigo">{note.slug}</h2>
        <StatusBadge status={note.status} />
        <span className="text-xs text-mist">
          {note.unitSlug} / {note.skillSlug} · #{note.order}
        </span>
        <span className="grow" />
        <TransitionButtons
          status={note.status}
          onMove={(to, why) => move.mutate({ kind: "grammar_note", id: note.id, to, note: why })}
        />
      </header>

      {/* The reason this page exists in this shape. */}
      <div className="mt-4 flex gap-3 rounded-2xl bg-sun-soft p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre-deep" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-ochre-deep uppercase">
            {t("edit.grammar.caveat")}
          </p>
          <p className="mt-1 text-sm whitespace-pre-line text-ink">
            {note.caveat ?? t("edit.grammar.caveatEmpty")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {SOURCE_LANGUAGES.map((lang) => (
          <BodyForm key={lang} note={note} lang={lang} onMove={move.mutate} />
        ))}
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold text-indigo">
          {t("edit.grammar.cells")} ({note.cells.length})
        </summary>
        <p className="mt-2 max-w-prose text-xs text-mist">{t("edit.grammar.cellsHint")}</p>
        {note.cells.length === 0 ? (
          <p className="mt-2 text-sm text-coral-deep">{t("edit.grammar.cellsNone")}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">{t("edit.grammar.cells")}</caption>
            <thead>
              <tr className="text-xs text-mist uppercase">
                <th scope="col" className="py-1 pr-3">
                  #
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("edit.grammar.roleParadigm")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("grammar.columns.class")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("grammar.columns.word")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("grammar.morphemes", { word: "", parts: "" }).trim() || "parts"}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("lesson.listen")}
                </th>
              </tr>
            </thead>
            <tbody>
              {note.cells.map((c) => (
                <tr key={c.id} className="border-t border-sand-deep">
                  <td className="py-1 pr-3 text-mist">{c.order}</td>
                  <td className="py-1 pr-3">
                    {c.role === "example"
                      ? t("edit.grammar.roleExample")
                      : t("edit.grammar.roleParadigm")}
                  </td>
                  <td className="py-1 pr-3">{c.rowLabel || "—"}</td>
                  <td className="py-1 pr-3 font-display font-bold text-indigo">{c.surfaceForm}</td>
                  <td className="py-1 pr-3 text-mist">{c.morphemes.join(" · ") || "—"}</td>
                  <td className="py-1 pr-3 text-mist">
                    {c.audioAssetId ? "✓" : t("edit.grammar.noAudio")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}

function BodyForm({
  note,
  lang,
  onMove,
}: {
  note: EditorGrammarNote;
  lang: SourceLang;
  onMove: (input: {
    kind: "grammar_note" | "grammar_note_body";
    id: string;
    to: "in_review" | "published" | "draft" | "retired";
    note?: string | undefined;
  }) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const existing = note.bodies.find((b) => b.sourceLang === lang);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [rule, setRule] = useState(existing?.rule ?? "");
  const [correction, setCorrection] = useState(existing?.correction ?? "");
  const save = useMutation({
    mutationFn: () =>
      saveGrammarNoteBody(note.id, {
        sourceLang: lang,
        title,
        rule,
        correction: correction === "" ? null : correction,
      }),
    onSuccess: async () => {
      toast.success(t("edit.grammar.saved"));
      await qc.invalidateQueries({ queryKey: ["edit-grammar"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "error"),
  });
  const id = `${note.id}-${lang}`;

  return (
    <div className="rounded-2xl border border-sand-deep p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-bold text-indigo uppercase">{lang}</h3>
        {existing ? (
          <>
            <StatusBadge status={existing.status} />
            <span className="grow" />
            <TransitionButtons
              status={existing.status}
              onMove={(to, why) =>
                onMove({ kind: "grammar_note_body", id: existing.id, to, note: why })
              }
            />
          </>
        ) : (
          <span className="text-xs text-coral-deep">{t("edit.grammar.bodyMissing", { lang })}</span>
        )}
      </div>
      <label htmlFor={`${id}-title`} className="block text-xs font-semibold text-mist">
        {t("edit.grammar.noteTitle")}
      </label>
      <input
        id={`${id}-title`}
        className={field}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label htmlFor={`${id}-rule`} className="mt-3 block text-xs font-semibold text-mist">
        {t("edit.grammar.rule")}
      </label>
      <textarea
        id={`${id}-rule`}
        className={`${field} min-h-24`}
        value={rule}
        onChange={(e) => setRule(e.target.value)}
      />
      <label htmlFor={`${id}-correction`} className="mt-3 block text-xs font-semibold text-mist">
        {t("edit.grammar.correction")}
      </label>
      <textarea
        id={`${id}-correction`}
        className={`${field} min-h-16`}
        value={correction}
        onChange={(e) => setCorrection(e.target.value)}
        aria-describedby={`${id}-correction-hint`}
      />
      <p id={`${id}-correction-hint`} className="mt-1 text-xs text-mist">
        {t("edit.grammar.correctionHint")}
      </p>
      <button
        type="button"
        className="mt-3 rounded bg-indigo px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        disabled={save.isPending || title.trim() === "" || rule.trim() === ""}
        onClick={() => save.mutate()}
      >
        {t("edit.grammar.save")}
      </button>
    </div>
  );
}

/**
 * The status moves an editor may make from here. There is no button that
 * jumps straight to `published`: the machine has no such edge, and this page
 * offers exactly the edges it does.
 */
function TransitionButtons({
  status,
  onMove,
}: {
  status: string;
  onMove: (to: "in_review" | "published" | "draft" | "retired", note?: string) => void;
}) {
  const t = useT();
  const small = "rounded px-2 py-1 text-xs font-medium";
  return (
    <span className="flex gap-2">
      {(status === "draft" || status === "ai_draft") && (
        <button
          type="button"
          className={`${small} bg-sand-deep text-indigo`}
          onClick={() => onMove("in_review")}
        >
          {t("edit.status.in_review")}
        </button>
      )}
      {status === "published" && (
        <button
          type="button"
          className={`${small} bg-sand-deep text-indigo`}
          onClick={() => {
            const why = window.prompt(t("edit.lexeme.rejectNote")) ?? "";
            if (why.trim() !== "") onMove("retired", why);
          }}
        >
          {t("edit.status.retired")}
        </button>
      )}
      {status === "in_review" && (
        <>
          <button
            type="button"
            className={`${small} bg-sea-deep text-white`}
            onClick={() => onMove("published")}
          >
            {t("edit.status.published")}
          </button>
          <button
            type="button"
            className={`${small} bg-coral-soft text-coral-deep`}
            onClick={() => {
              const why = window.prompt(t("edit.lexeme.rejectNote")) ?? "";
              if (why.trim() !== "") onMove("draft", why);
            }}
          >
            {t("edit.status.draft")}
          </button>
        </>
      )}
    </span>
  );
}
