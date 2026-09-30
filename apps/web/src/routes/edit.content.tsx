import { KNOWN_POS, NOUN_CLASS_LABELS, STATUSES, LICENCES } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type CellContext,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  listLexemes,
  transitionLexemes,
  type GridLexeme,
  type GridQuery,
  createLexeme,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

/**
 * The grid is deep-linked from the landing page, so its filters live in the
 * URL rather than in component state: "34 words need a recording" has to be
 * able to hand an editor exactly the 34 rows it counted. `status=pending`
 * is the landing page's three statuses; `missingGloss=all` is "neither".
 */
export const Route = createFileRoute("/edit/content")({
  component: ContentGrid,
  validateSearch: (search: Record<string, unknown>): GridSearch => {
    const out: Record<string, string | number | boolean> = {};
    for (const k of ["q", "status", "pos", "class", "missingGloss"] as const) {
      const v = search[k];
      if (typeof v === "string" && v !== "") out[k] = v;
    }
    // A boolean, so the URL reads `missingAudio=true` rather than the
    // router quoting a numeric-looking string into `%221%22`.
    if (search["missingAudio"] === true || search["missingAudio"] === "true")
      out["missingAudio"] = true;
    const offset = Number(search["offset"]);
    if (Number.isFinite(offset) && offset > 0) out["offset"] = offset;
    return out as GridSearch;
  },
});

/** Every filter the grid understands, as it appears in the URL. */
export interface GridSearch {
  readonly q?: string;
  readonly status?: string;
  readonly pos?: string;
  readonly class?: string;
  readonly missingGloss?: string;
  readonly missingAudio?: boolean;
  readonly offset?: number;
}

const PAGE_SIZE = 50;

const features = tableFeatures({ rowSelectionFeature });
const helper = createColumnHelper<typeof features, GridLexeme>();
/** A stable empty array: a fresh fallback would invalidate the row model every render. */
const NO_ROWS: GridLexeme[] = [];

/**
 * The bulk actions the grid offers. Each is the ordinary per-row transition
 * applied to a selection; the server re-checks every row on its own, so
 * `ai_draft → published` is refused here exactly as it is refused per row.
 * `draft` and `retired` need a note, as the status machine demands.
 */
const BULK_ACTIONS = [
  { to: "in_review", labelKey: "edit.bulk.promote", primary: false, note: false, confirm: false },
  { to: "draft", labelKey: "edit.bulk.sendBack", primary: false, note: true, confirm: false },
  { to: "retired", labelKey: "edit.bulk.retire", primary: false, note: true, confirm: false },
  { to: "published", labelKey: "edit.bulk.publish", primary: true, note: false, confirm: true },
] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

function SelectHeader({
  table,
}: {
  table: {
    getIsAllPageRowsSelected: () => boolean;
    getIsSomePageRowsSelected: () => boolean;
    getToggleAllPageRowsSelectedHandler: () => (e: unknown) => void;
  };
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement | null>(null);
  const all = table.getIsAllPageRowsSelected();
  const some = table.getIsSomePageRowsSelected();
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !all && some;
  }, [all, some]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 accent-sea"
      checked={all}
      aria-label={t("edit.bulk.selectAll")}
      onChange={table.getToggleAllPageRowsSelectedHandler()}
    />
  );
}

function SelectCell({ row }: CellContext<typeof features, GridLexeme, unknown>) {
  const t = useT();
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-sea"
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      aria-label={t("edit.bulk.selectRow", { lemma: row.original.lemma })}
      // v9 reads `shiftKey` off the event, so shift-click (and shift-space) selects a range.
      onChange={row.getToggleSelectedHandler()}
    />
  );
}

const columns = helper.columns([
  helper.display({
    id: "select",
    header: SelectHeader,
    cell: SelectCell,
  }),
  helper.accessor("lemma", {
    header: LemmaHeader,
    cell: ({ row }) => (
      <Link
        to="/edit/lexemes/$id"
        params={{ id: row.original.id }}
        className="font-medium underline-offset-2 hover:underline"
        lang="xh"
      >
        {row.original.lemma}
      </Link>
    ),
  }),
  helper.accessor("pos", {
    header: () => <Th k="edit.lexeme.pos" />,
    cell: ({ getValue }) => getValue(),
  }),
  helper.accessor("nounClass", {
    header: () => <Th k="edit.lexeme.nounClass" />,
    cell: ({ getValue }) => getValue() ?? "",
  }),
  helper.accessor("status", {
    header: () => <Th k="edit.filters.status" />,
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  helper.accessor("glossLangs", {
    header: () => <Th k="edit.lexeme.glosses" />,
    cell: ({ getValue }) => getValue().join(", "),
  }),
  helper.accessor("audioCount", {
    header: () => <Th k="edit.lexeme.audio" />,
    cell: ({ getValue }) => getValue(),
  }),
  helper.accessor("frequencyRank", {
    header: () => <Th k="edit.lexeme.frequencyRank" />,
    cell: ({ getValue }) => getValue() ?? "",
  }),
  helper.accessor("licence", {
    header: () => <Th k="edit.lexeme.licence" />,
    cell: ({ getValue }) => <span className="text-xs text-mist">{getValue()}</span>,
  }),
]);

function LemmaHeader() {
  return <Th k="edit.lexeme.lemma" />;
}

/** A header label from the translation catalogue; headers are components so they may use hooks. */
function Th({ k }: { k: Parameters<ReturnType<typeof useT>>[0] }) {
  const t = useT();
  return <>{t(k)}</>;
}

/** The content grid (ARCHITECTURE section 7): filter by status, pos, class, missing gloss or audio. */
function ContentGrid() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const { missingAudio, ...filters } = search;
  const query: GridQuery = {
    ...filters,
    // The API takes the flag as `1`; the URL carries it as a boolean.
    ...(missingAudio ? { missingAudio: "1" } : {}),
    limit: PAGE_SIZE,
    offset: search.offset ?? 0,
  };
  const rows = useQuery({
    queryKey: ["grid", query],
    queryFn: () => listLexemes(query),
    placeholderData: (prev) => prev,
  });
  const select = "rounded border border-stone-300 bg-white px-2 py-1 text-sm";

  const data = rows.data?.lexemes ?? NO_ROWS;
  const table = useTable({ features, columns, data, getRowId: (row) => row.id });
  // A new page or filter is a new set of rows: a selection carried across
  // would let an editor act on something they can no longer see. Cleared
  // where the query changes rather than in an effect, which would loop.
  const clearSelection = () => table.resetRowSelection(true);
  /** A filter change is a new URL, so the view an editor lands on is shareable. */
  const set = (patch: Partial<GridSearch>) => {
    clearSelection();
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        delete next["offset"];
        // An empty filter is an absent one, so the URL only ever carries
        // what is actually narrowing the list.
        for (const [k, v] of Object.entries(next))
          if (v === "" || v === undefined || v === false) delete next[k];
        return next as GridSearch;
      },
    });
  };
  const page = (delta: number) => {
    clearSelection();
    void navigate({
      search: (prev) => {
        const offset = Math.max(0, (prev.offset ?? 0) + delta * PAGE_SIZE);
        const next: Record<string, unknown> = { ...prev };
        if (offset === 0) delete next["offset"];
        else next["offset"] = offset;
        return next as GridSearch;
      },
    });
  };
  const selection = table.state.rowSelection;
  const selectedIds = useMemo(
    () => data.filter((l) => selection[l.id]).map((l) => l.id),
    [data, selection],
  );
  const lemmaOf = useMemo(() => new Map(data.map((l) => [l.id, l.lemma])), [data]);

  const [results, setResults] = useState<BulkResults | null>(null);
  const bulk = useMutation({
    mutationFn: (input: { to: string; note?: string }) =>
      transitionLexemes({
        ids: selectedIds,
        to: input.to,
        ...(input.note !== undefined ? { note: input.note } : {}),
      }),
    onSuccess: async (r) => {
      setResults({
        applied: r.applied,
        blocked: r.blocked,
        rows: r.results.map((o) => ({
          id: o.id,
          lemma: lemmaOf.get(o.id) ?? o.id,
          ...(o.ok
            ? { ok: true as const, status: o.status }
            : { ok: false as const, reason: o.reason, gate: o.gate ?? null }),
        })),
      });
      if (r.blocked === 0) toast.success(t("edit.bulk.done", { applied: r.applied, blocked: 0 }));
      else if (r.applied === 0) toast.error(t("edit.bulk.allBlocked", { blocked: r.blocked }));
      else toast.warning(t("edit.bulk.done", { applied: r.applied, blocked: r.blocked }));
      clearSelection();
      await qc.invalidateQueries({ queryKey: ["grid"] });
      await qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section>
      <NewLexemeForm />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {t("edit.search")}
          <input
            value={search.q ?? ""}
            onChange={(e) => set({ q: e.target.value })}
            className="block rounded border border-stone-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          {t("edit.filters.status")}
          <select
            value={search.status ?? ""}
            onChange={(e) => set({ status: e.target.value })}
            className={`block ${select}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            {/* The landing page counts over these three at once. */}
            <option value="pending">{t("edit.filters.pending")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`edit.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("edit.filters.pos")}
          <select
            value={search.pos ?? ""}
            onChange={(e) => set({ pos: e.target.value })}
            className={`block ${select}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            {KNOWN_POS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("edit.filters.class")}
          <select
            value={search.class ?? ""}
            onChange={(e) => set({ class: e.target.value })}
            className={`block ${select}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            {NOUN_CLASS_LABELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("edit.filters.missingGloss")}
          <select
            value={search.missingGloss ?? ""}
            onChange={(e) => set({ missingGloss: e.target.value })}
            className={`block ${select}`}
          >
            <option value="">{t("edit.filters.any")}</option>
            <option value="en">en</option>
            <option value="nb">nb</option>
            <option value="all">{t("edit.filters.missingGlossAll")}</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={search.missingAudio === true}
            onChange={(e) =>
              set(e.target.checked ? { missingAudio: true } : { missingAudio: false })
            }
          />
          {t("edit.lexeme.audio")}: 0
        </label>
      </div>
      <p className="mb-2 text-xs text-stone-500">{t("edit.bulk.hint")}</p>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("edit.content")}</caption>
          <thead className="bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-600">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" className="px-3 py-2">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-selected={row.getIsSelected() ? "true" : undefined}
                className="border-t border-stone-100 hover:bg-orange-50 data-[selected=true]:bg-orange-100"
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.isPending && <p className="p-3 text-stone-500">{t("common.loading")}</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={(search.offset ?? 0) === 0}
          onClick={() => page(-1)}
          className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          aria-label={t("edit.page.previous")}
        >
          ←
        </button>
        <button
          type="button"
          disabled={(rows.data?.lexemes.length ?? 0) < PAGE_SIZE}
          onClick={() => page(1)}
          className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          aria-label={t("edit.page.next")}
        >
          →
        </button>
      </div>
      <BulkBar
        count={selectedIds.length}
        pending={bulk.isPending}
        onClear={clearSelection}
        onRun={(to, note) => bulk.mutate(note === undefined ? { to } : { to, note })}
      />
      {results && <BulkResultsSheet results={results} onClose={() => setResults(null)} />}
    </section>
  );
}

type GateView = {
  readonly failures: readonly { readonly code: string; readonly detail?: string | undefined }[];
};

type BulkRow = { id: string; lemma: string } & (
  | { ok: true; status: string }
  | { ok: false; reason: string; gate: GateView | null }
);

interface BulkResults {
  applied: number;
  blocked: number;
  rows: BulkRow[];
}

/**
 * The sticky action bar. It appears only with a selection; the two
 * transitions the status machine requires a note for ask for one, and
 * publishing asks for a confirmation, before anything is sent. Both prompts
 * are inline rather than native dialogs, so they stay keyboard-operable and
 * translated.
 */
function BulkBar({
  count,
  pending,
  onClear,
  onRun,
}: {
  count: number;
  pending: boolean;
  onClear: () => void;
  onRun: (to: string, note?: string) => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState<BulkAction | null>(null);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (asking?.note) noteRef.current?.focus();
    else if (asking?.confirm) confirmRef.current?.focus();
  }, [asking]);
  if (count === 0) return null;
  const run = (action: BulkAction) => {
    if (action.note || action.confirm) {
      setAsking(action);
      setNote("");
      return;
    }
    onRun(action.to);
  };
  return (
    <div
      role="region"
      aria-label={t("edit.bulk.selected", { count })}
      className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-t-2xl border-t-2 border-stone-300 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <span aria-live="polite" className="font-semibold">
        {t("edit.bulk.selected", { count })}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="rounded border border-stone-300 px-3 py-1.5 text-sm"
      >
        {t("edit.bulk.clear")}
      </button>
      <span className="grow" />
      {asking?.confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">{t("edit.bulk.confirmPublish", { count })}</p>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={() => {
              onRun(asking.to);
              setAsking(null);
            }}
            className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {t(asking.labelKey)}
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm"
          >
            {t("edit.bulk.cancel")}
          </button>
        </div>
      ) : asking ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            onRun(asking.to, note.trim());
            setAsking(null);
          }}
        >
          <label className="text-sm">
            <span className="sr-only">{t(asking.labelKey)}</span>
            <input
              ref={noteRef}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("edit.bulk.notePlaceholder")}
              className="w-64 rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!note.trim() || pending}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {t(asking.labelKey)}
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm"
          >
            {t("edit.bulk.cancel")}
          </button>
        </form>
      ) : (
        BULK_ACTIONS.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={pending}
            onClick={() => run(a)}
            className={
              a.primary
                ? "rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                : "rounded border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40"
            }
          >
            {t(a.labelKey)}
          </button>
        ))
      )}
      {pending && <span className="text-sm text-stone-500">{t("edit.bulk.running")}</span>}
    </div>
  );
}

/** Per-row outcomes, with the gate's reasons spelled out for the blocked ones. */
function BulkResultsSheet({ results, onClose }: { results: BulkResults; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-results-title"
        tabIndex={-1}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 id="bulk-results-title" className="text-lg font-bold">
          {t("edit.bulk.results")}
        </h2>
        <p className="mt-1 text-sm text-stone-600">{t("edit.bulk.resultsHint")}</p>
        <p className="mt-1 text-sm font-semibold">
          {t("edit.bulk.done", { applied: results.applied, blocked: results.blocked })}
        </p>
        <ul className="mt-3 divide-y divide-stone-100">
          {results.rows.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <span className="font-medium" lang="xh">
                {r.lemma}
              </span>{" "}
              {r.ok ? (
                <span className="text-green-700">
                  {t("edit.bulk.moved", { status: t(`edit.status.${r.status as "draft"}`) })}
                </span>
              ) : (
                <span className="text-red-700">
                  {t("edit.bulk.blocked")}: {r.reason}
                </span>
              )}
              {!r.ok && r.gate && r.gate.failures.length > 0 && (
                <ul className="mt-1 list-disc pl-6 text-xs text-red-700">
                  {r.gate.failures.map(
                    (f: { code: string; detail?: string | undefined }, i: number) => (
                      <li key={`${f.code}-${i}`}>
                        {t(`edit.gate.${f.code}` as never, { detail: f.detail ?? "" }) || f.code}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("edit.bulk.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Creates a draft lexeme and opens its editor. Nothing here is visible to learners. */
function NewLexemeForm() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    lemma: "",
    pos: "noun",
    nounClassLabel: "",
    source: "editor",
    licence: LICENCES[0] as string,
  });
  const create = useMutation({
    mutationFn: () =>
      createLexeme({
        lemma: f.lemma.trim(),
        pos: f.pos,
        nounClassLabel: f.pos === "noun" ? f.nounClassLabel || null : null,
        source: f.source.trim(),
        licence: f.licence,
        origin: "human",
      }),
    onSuccess: async (r) => {
      toast.success(t("edit.lexeme.saved"));
      await navigate({ to: "/edit/lexemes/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const field = "rounded border border-stone-300 px-2 py-1 text-sm";
  if (!open) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          {t("edit.newLexeme.title")}
        </button>
      </div>
    );
  }
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <p className="w-full text-xs text-stone-500">{t("edit.newLexeme.hint")}</p>
      <label className="text-sm">
        {t("edit.newLexeme.lemma")}
        <input
          required
          value={f.lemma}
          lang="xh"
          onChange={(e) => setF({ ...f, lemma: e.target.value })}
          className={`block ${field}`}
        />
      </label>
      <label className="text-sm">
        {t("edit.newLexeme.pos")}
        <select
          value={f.pos}
          onChange={(e) => setF({ ...f, pos: e.target.value })}
          className={`block ${field}`}
        >
          {KNOWN_POS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {f.pos === "noun" && (
        <label className="text-sm">
          {t("edit.newLexeme.nounClass")}
          <select
            required
            value={f.nounClassLabel}
            onChange={(e) => setF({ ...f, nounClassLabel: e.target.value })}
            className={`block ${field}`}
          >
            <option value="">—</option>
            {NOUN_CLASS_LABELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        {t("edit.newLexeme.source")}
        <input
          required
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
          className={`block ${field}`}
        />
      </label>
      <label className="text-sm">
        {t("edit.newLexeme.licence")}
        <select
          value={f.licence}
          onChange={(e) => setF({ ...f, licence: e.target.value })}
          className={`block ${field}`}
        >
          {LICENCES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("edit.newLexeme.create")}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded border border-stone-300 px-3 py-1.5 text-sm"
      >
        {t("common.cancel")}
      </button>
    </form>
  );
}
