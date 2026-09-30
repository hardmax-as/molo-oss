import { SOURCE_LANGUAGES, type CultureCardView, type SourceLang } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Eye, EyeOff, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { CultureCard as LearnerCultureCard } from "~/components/exercises/CultureCard.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import { patchExercise, searchLexemes, transition } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { getCultureCards } from "~/lib/tutor-api.ts";

export const Route = createFileRoute("/edit/culture")({ component: CultureCardsPage });

const field = "w-full rounded border border-stone-300 px-2 py-1 text-sm";
type Move = "in_review" | "published" | "draft" | "retired";
type Word = CultureCardView["words"][number];
const LANG_LABEL = { en: "edit.write.english", nb: "edit.write.norwegian" } as const;

/**
 * "Check the culture cards" (docs/EDITOR-GUIDE.md).
 *
 * Same shape as the grammar page, for the same reason: a card loaded by
 * `molo content culture` was written by a model, and its caveat lists the
 * claims a speaker must confirm before anyone approves it. The caveat sits
 * above the text in warning colours so nobody publishes without reading it.
 * The words a card shows are picked from the lexicon, never typed; the
 * preview is the learner's own component. Edits go through
 * `PATCH /edit/exercises/:id` and status moves through `/edit/transition`,
 * both of which write `content_revisions`; there is no shortcut to
 * `published` here, and the second pair of eyes is still required.
 */
function CultureCardsPage() {
  const t = useT();
  const cards = useQuery({ queryKey: ["edit-culture-cards"], queryFn: () => getCultureCards() });

  if (cards.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (cards.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
  const list = cards.data.cards;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-indigo">{t("edit.culture.title")}</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-mist">{t("edit.culture.hint")}</p>
      {list.length === 0 && <p className="text-mist">{t("edit.culture.none")}</p>}
      <div className="space-y-6">
        {list.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

const sameWords = (a: readonly Word[], b: readonly Word[]) =>
  a.length === b.length && a.every((w, i) => w.lexemeId === b[i]?.lexemeId);

function Card({ card }: { card: CultureCardView }) {
  const t = useT();
  const { lang: uiLang } = useLang();
  const qc = useQueryClient();
  const formId = useId();
  const refresh = () => qc.invalidateQueries({ queryKey: ["edit-culture-cards"] });
  const payload = card.payload.type === "culture_card" ? card.payload : null;
  const [title, setTitle] = useState<Record<SourceLang, string>>({
    en: payload?.title["en"] ?? "",
    nb: payload?.title["nb"] ?? "",
  });
  const [body, setBody] = useState<Record<SourceLang, string>>({
    en: payload?.body["en"] ?? "",
    nb: payload?.body["nb"] ?? "",
  });
  const [words, setWords] = useState<readonly Word[]>(card.words);
  const [preview, setPreview] = useState(false);
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : t("common.error"));
  const move = useMutation({
    mutationFn: (input: { to: Move; note?: string | undefined }) =>
      transition({
        kind: "exercise",
        id: card.id,
        to: input.to,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: async (r) => {
      if (r.ok) toast.success(t(`edit.status.${r.status}`));
      else toast.error(r.reason);
      await refresh();
    },
    onError,
  });
  const draft = payload
    ? { ...payload, title, body, lexemeIds: words.map((w) => w.lexemeId) }
    : null;
  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("not a culture card");
      return patchExercise(card.id, { payload: draft });
    },
    onSuccess: async () => {
      toast.success(t("edit.culture.saved"));
      await refresh();
    },
    onError,
  });
  if (!payload || !draft) return null;
  const dirty =
    SOURCE_LANGUAGES.some(
      (l) => title[l] !== (payload.title[l] ?? "") || body[l] !== (payload.body[l] ?? ""),
    ) || !sameWords(words, card.words);
  const locked = card.status === "published" || card.status === "retired";
  const incomplete = SOURCE_LANGUAGES.some((l) => title[l].trim() === "" || body[l].trim() === "");
  // Why Save is off, said out loud: a silent disabled button reads as "Save does nothing".
  const blocked = locked
    ? "edit.culture.publishedLocked"
    : incomplete
      ? "edit.culture.needsBoth"
      : null;
  // The caveat is stored as the loader's marker line, then the claims. A note
  // without the marker is older provenance (the Phase-0 card carries its
  // spike source ref there), not a claim to confirm, so it is not shown as one.
  const [first, ...rest] = (card.caveat ?? "").split("\n");
  const claims = first?.startsWith("culture-cards.json:") ? rest.join("\n") : "";
  const last = card.lastEdit;
  const when = (iso: string) =>
    new Intl.DateTimeFormat(uiLang, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <section className="rounded-3xl bg-cloud p-5 shadow-card" data-testid="culture-card">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-bold text-indigo">{payload.title["en"]}</h2>
        <StatusBadge status={card.status} />
        <span className="text-xs text-mist">
          {card.unitSlug} / {card.skillSlug}
        </span>
        <span className="grow" />
        <MoveButtons status={card.status} onMove={(to, note) => move.mutate({ to, note })} />
      </header>
      {last && (
        <p className="mt-1 text-xs text-mist" data-testid="culture-last-edit">
          {t(`edit.culture.lastEdit.${last.what}`, {
            name: last.actorName ?? t("edit.culture.someone"),
            time: when(last.at),
          })}
        </p>
      )}

      <div className="mt-4 flex gap-3 rounded-2xl bg-sun-soft p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre-deep" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-ochre-deep uppercase">
            {t("edit.culture.caveat")}
          </p>
          <p className="mt-1 text-sm whitespace-pre-line text-ink" data-testid="culture-caveat">
            {claims.trim() || t("edit.culture.caveatNone")}
          </p>
        </div>
      </div>

      <div className="mt-4" data-testid="culture-words">
        <p className="text-xs font-bold tracking-wide text-mist uppercase">
          {t("edit.culture.words")}
        </p>
        {words.length === 0 ? (
          <p className="mt-1 text-sm text-mist">{t("edit.culture.noWords")}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {words.map((w) => (
              <li
                key={w.lexemeId}
                className="inline-flex items-center gap-1 rounded-2xl bg-sand px-2 py-1 text-sm"
              >
                <Link
                  to="/edit/lexemes/$id"
                  params={{ id: w.lexemeId }}
                  className="font-display font-bold text-indigo underline"
                  lang="xh"
                >
                  {w.lemma}
                </Link>
                <StatusBadge status={w.status} />
                {!locked && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-mist hover:bg-sand-deep hover:text-coral-deep"
                    aria-label={t("edit.culture.removeWord", { lemma: w.lemma })}
                    onClick={() => setWords((ws) => ws.filter((x) => x.lexemeId !== w.lexemeId))}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!locked && (
          <WordPicker
            exclude={words.map((w) => w.lexemeId)}
            onPick={(w) => setWords((ws) => [...ws, w])}
          />
        )}
        <p className="mt-1 text-xs text-mist">{t("edit.culture.wordsHint")}</p>
      </div>

      <form
        id={formId}
        className="mt-5 grid gap-5 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) save.mutate();
        }}
      >
        {SOURCE_LANGUAGES.map((lang) => (
          <div key={lang} className="rounded-2xl border border-sand-deep p-4">
            <h3 className="mb-2 font-display text-base font-bold text-indigo uppercase">{lang}</h3>
            <label
              htmlFor={`${card.id}-${lang}-title`}
              className="block text-xs font-semibold text-mist"
            >
              {t("edit.culture.cardTitle")}
            </label>
            <input
              id={`${card.id}-${lang}-title`}
              lang={lang}
              className={field}
              value={title[lang]}
              readOnly={locked}
              onChange={(e) => setTitle((v) => ({ ...v, [lang]: e.target.value }))}
            />
            <label
              htmlFor={`${card.id}-${lang}-body`}
              className="mt-3 block text-xs font-semibold text-mist"
            >
              {t("edit.culture.body")}
            </label>
            <textarea
              id={`${card.id}-${lang}-body`}
              lang={lang}
              className={`${field} min-h-28`}
              value={body[lang]}
              readOnly={locked}
              onChange={(e) => setBody((v) => ({ ...v, [lang]: e.target.value }))}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <button
            type="submit"
            className="rounded bg-indigo px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            disabled={save.isPending || !!blocked || !dirty}
            aria-describedby={blocked ? `${formId}-blocked` : undefined}
          >
            {t(save.isPending ? "common.loading" : "edit.culture.save")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-stone-300 px-3 py-1.5 text-sm font-semibold text-indigo"
            aria-expanded={preview}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            {t(preview ? "edit.culture.closePreview" : "edit.culture.preview")}
          </button>
          {dirty && !blocked && (
            <span className="text-xs font-semibold text-ochre-deep" role="status">
              {t("edit.culture.unsaved")}
            </span>
          )}
          {blocked && (
            <span id={`${formId}-blocked`} className="text-xs text-coral-deep">
              {t(blocked)}
            </span>
          )}
        </div>
      </form>

      {preview && (
        <div className="mt-5" data-testid="culture-preview">
          <p className="mb-3 text-xs font-bold tracking-wide text-mist uppercase">
            {t("edit.culture.previewTitle")}
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {SOURCE_LANGUAGES.map((lang) => (
              <div key={lang} data-testid={`culture-preview-${lang}`}>
                <p className="mb-2 text-sm font-semibold text-indigo">{t(LANG_LABEL[lang])}</p>
                {/* The learner's own component, a lesson's frame around it (it pulls itself to the edges). */}
                <div className="rounded-3xl bg-cloud p-5 shadow-pop sm:p-8" lang={lang}>
                  <LearnerCultureCard
                    payload={draft}
                    content={{ lexemes: {}, sentences: {}, audioAssets: {}, sourceLang: lang }}
                    onDone={() => undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Adds a word from the lexicon: search by lemma, pick a row. There is no
 * free text, so a card can only ever name a word that exists (the server
 * checks the ids again on save).
 */
function WordPicker({
  exclude,
  onPick,
}: {
  exclude: readonly string[];
  onPick: (w: Word) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputId = useId();
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);
  const results = useQuery({
    queryKey: ["culture-word-search", debounced],
    queryFn: () => searchLexemes(debounced),
    enabled: open && debounced.length > 0,
  });
  if (!open)
    return (
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-indigo underline decoration-sun decoration-2 underline-offset-4"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} aria-hidden /> {t("edit.culture.addWord")}
      </button>
    );
  const list = (results.data?.lexemes ?? []).filter((l) => !exclude.includes(l.id));
  return (
    <div className="mt-2 max-w-md rounded-2xl border border-sand-deep p-3">
      <label htmlFor={inputId} className="block text-xs font-semibold text-mist">
        {t("edit.culture.searchWords")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          className={field}
          value={q}
          lang="xh"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          className="rounded-full p-1 text-mist hover:bg-sand"
          aria-label={t("common.close")}
          onClick={() => {
            setOpen(false);
            setQ("");
          }}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {debounced && results.isPending && (
        <p className="mt-2 text-xs text-mist">{t("common.loading")}</p>
      )}
      {debounced && results.data && list.length === 0 && (
        <p className="mt-2 text-xs text-mist">{t("edit.culture.noMatches")}</p>
      )}
      {list.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto" data-testid="culture-word-results">
          {list.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-sm hover:bg-sand"
                onClick={() => {
                  onPick({ lexemeId: l.id, lemma: l.lemma, status: l.status as Word["status"] });
                  setQ("");
                }}
              >
                <span className="font-display font-bold text-indigo" lang="xh">
                  {l.lemma}
                </span>
                <span className="text-xs text-mist">{l.pos}</span>
                <span className="grow" />
                <StatusBadge status={l.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The moves the status machine has from here, and no others. */
function MoveButtons({
  status,
  onMove,
}: {
  status: string;
  onMove: (to: Move, note?: string) => void;
}) {
  const t = useT();
  const small = "rounded px-2 py-1 text-xs font-medium";
  const withReason = (to: Move) => {
    const why = window.prompt(t("edit.lexeme.rejectNote")) ?? "";
    if (why.trim() !== "") onMove(to, why);
  };
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
            onClick={() => withReason("draft")}
          >
            {t("edit.status.draft")}
          </button>
        </>
      )}
      {status === "published" && (
        <button
          type="button"
          className={`${small} bg-sand-deep text-indigo`}
          onClick={() => withReason("retired")}
        >
          {t("edit.status.retired")}
        </button>
      )}
    </span>
  );
}
