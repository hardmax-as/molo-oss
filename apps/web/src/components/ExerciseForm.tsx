import { EXERCISE_TYPES, clickIdsForSet } from "@molo/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  createExercise,
  patchExercise,
  searchLexemes,
  validateExercise,
  type ExerciseDetail,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

import { StatusBadge } from "./StatusBadge.tsx";

const field = "w-full rounded border border-stone-300 px-2 py-1 text-sm";

/**
 * Starting payloads per type. Ids are left empty on purpose: the schema
 * rejects them until an editor picks real lexemes, so nothing invented can
 * be saved by accident.
 */
export const TEMPLATES: Record<string, unknown> = {
  listen_select: {
    type: "listen_select",
    prompt: { lexemeId: "" },
    options: [
      { lexemeId: "", correct: true },
      { lexemeId: "", correct: false },
    ],
  },
  select_listen: {
    type: "select_listen",
    prompt: { lexemeId: "" },
    options: [
      { lexemeId: "", correct: true },
      { lexemeId: "", correct: false },
    ],
  },
  translate_tap: { type: "translate_tap", sentenceId: "", distractorLexemeIds: [] },
  translate_type: { type: "translate_type", sentenceId: "" },
  concord_fill: {
    type: "concord_fill",
    sentenceId: "",
    blanks: [{ position: 0, lexemeId: "", form: "subject_concord", distractors: [] }],
  },
  class_sort: {
    type: "class_sort",
    buckets: ["1", "2"],
    items: [{ lexemeId: "" }, { lexemeId: "" }],
  },
  click_drill: {
    type: "click_drill",
    set: "c-x-q",
    contrast: ["c", "x"],
    steps: ["listen_identify"],
    pairs: [],
    contrastWords: [{ lexemeId: "", click: "c" }],
  },
  speak: { type: "speak", prompt: { lexemeId: "" }, referenceAudioAssetId: "" },
  match_pairs: { type: "match_pairs", pairs: [{ lexemeId: "" }, { lexemeId: "" }] },
  culture_card: {
    type: "culture_card",
    title: { en: "", nb: "" },
    body: { en: "", nb: "" },
    lexemeIds: [],
  },
  // Bare clicks are letters from CLICK_SOUNDS, not isiXhosa words, so the
  // template can name a whole set: A is c, x and q.
  click_identify: { type: "click_identify", set: "A", clicks: clickIdsForSet("A") },
};

interface OptionRow {
  lexemeId: string;
  correct: boolean;
}
interface ChoicePayload {
  type: "listen_select" | "select_listen";
  prompt: { lexemeId: string };
  options: OptionRow[];
  note?: string;
}

function isChoice(p: unknown): p is ChoicePayload {
  return (
    typeof p === "object" &&
    p !== null &&
    ((p as { type?: string }).type === "listen_select" ||
      (p as { type?: string }).type === "select_listen") &&
    Array.isArray((p as { options?: unknown }).options)
  );
}

type Props =
  | { mode: "new"; lessonId: string; order: number; onCreated: (id: string) => void }
  | { mode: "edit"; detail: ExerciseDetail; onSaved: () => Promise<unknown> };

export function ExerciseForm(props: Props) {
  const t = useT();
  const initialType = props.mode === "edit" ? props.detail.exercise.type : "listen_select";
  const initialPayload =
    props.mode === "edit" ? props.detail.exercise.payload : TEMPLATES[initialType];
  const [type, setType] = useState(initialType);
  const [note, setNote] = useState(props.mode === "edit" ? (props.detail.exercise.note ?? "") : "");
  const [order, setOrder] = useState(
    String(props.mode === "edit" ? props.detail.exercise.order : props.order),
  );
  const [json, setJson] = useState(JSON.stringify(initialPayload, null, 2));
  const [view, setView] = useState<"form" | "json">(isChoice(initialPayload) ? "form" : "json");
  const [names, setNames] = useState<Record<string, string>>(() =>
    props.mode === "edit"
      ? Object.fromEntries(
          Object.values(props.detail.lexemes).map((l) => [l.id, `${l.lemma} · ${l.gloss ?? "?"}`]),
        )
      : {},
  );

  const parsed = useMemo<{ value: unknown; error: string | null }>(() => {
    try {
      return { value: JSON.parse(json), error: null };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : "invalid JSON" };
    }
  }, [json]);

  // Server-side validation against the Effect schema for `type`, debounced.
  const [check, setCheck] = useState<{ ok: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (parsed.error) {
      setCheck({ ok: false, error: parsed.error });
      return;
    }
    const handle = setTimeout(() => {
      validateExercise(type, parsed.value)
        .then(setCheck)
        .catch((e: unknown) =>
          setCheck({ ok: false, error: e instanceof Error ? e.message : "?" }),
        );
    }, 300);
    return () => clearTimeout(handle);
  }, [type, parsed]);

  const save = useMutation({
    mutationFn: async () => {
      if (props.mode === "new") {
        const r = await createExercise({
          lessonId: props.lessonId,
          order: Number(order),
          type,
          payload: parsed.value,
          note: note || null,
        });
        return r.id;
      }
      await patchExercise(props.detail.exercise.id, {
        order: Number(order),
        type,
        payload: parsed.value,
        note: note || null,
      });
      return props.detail.exercise.id;
    },
    onSuccess: async (id) => {
      if (props.mode === "new") props.onCreated(id);
      else await props.onSaved();
    },
  });

  function switchType(next: string) {
    setType(next);
    setJson(JSON.stringify(TEMPLATES[next] ?? { type: next }, null, 2));
    setView(next === "listen_select" || next === "select_listen" ? "form" : "json");
  }

  function updateChoice(fn: (p: ChoicePayload) => ChoicePayload) {
    if (!isChoice(parsed.value)) return;
    const next = fn(structuredClone(parsed.value));
    if (type !== next.type) next.type = type as ChoicePayload["type"];
    setJson(JSON.stringify(next, null, 2));
  }

  const choice = isChoice(parsed.value) ? parsed.value : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          {t("edit.exercise.type")}
          <select value={type} onChange={(e) => switchType(e.target.value)} className={field}>
            {EXERCISE_TYPES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("edit.curriculum.order")}
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          {t("edit.exercise.note")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>

      {choice && (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setView("form")}
            className={`rounded px-2 py-1 ${view === "form" ? "bg-stone-900 text-white" : "border border-stone-300"}`}
          >
            {t("edit.exercise.structured")}
          </button>
          <button
            type="button"
            onClick={() => setView("json")}
            className={`rounded px-2 py-1 ${view === "json" ? "bg-stone-900 text-white" : "border border-stone-300"}`}
          >
            {t("edit.exercise.json")}
          </button>
        </div>
      )}

      {choice && view === "form" ? (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <div>
            <h2 className="mb-1 text-sm font-medium">{t("edit.exercise.prompt")}</h2>
            <LexemePicker
              value={choice.prompt.lexemeId}
              label={names[choice.prompt.lexemeId]}
              onPick={(l) => {
                setNames((n) => ({ ...n, [l.id]: l.label }));
                updateChoice((p) => ({ ...p, prompt: { lexemeId: l.id } }));
              }}
            />
          </div>
          <div>
            <h2 className="mb-1 text-sm font-medium">{t("edit.exercise.options")}</h2>
            <ul className="space-y-2">
              {choice.options.map((o, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name="correct"
                      checked={o.correct}
                      onChange={() =>
                        updateChoice((p) => ({
                          ...p,
                          options: p.options.map((x, j) => ({ ...x, correct: j === i })),
                        }))
                      }
                    />
                    {t("edit.exercise.correct")}
                  </label>
                  <div className="min-w-64 flex-1">
                    <LexemePicker
                      value={o.lexemeId}
                      label={names[o.lexemeId]}
                      onPick={(l) => {
                        setNames((n) => ({ ...n, [l.id]: l.label }));
                        updateChoice((p) => ({
                          ...p,
                          options: p.options.map((x, j) =>
                            j === i ? { ...x, lexemeId: l.id } : x,
                          ),
                        }));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={choice.options.length <= 2}
                    className="text-xs text-red-700 disabled:opacity-40"
                    onClick={() =>
                      updateChoice((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))
                    }
                  >
                    {t("edit.exercise.removeOption")}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={choice.options.length >= 4}
              className="mt-2 rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-40"
              onClick={() =>
                updateChoice((p) => ({
                  ...p,
                  options: [...p.options, { lexemeId: "", correct: false }],
                }))
              }
            >
              {t("edit.exercise.addOption")}
            </button>
          </div>
        </div>
      ) : (
        <label className="block text-sm">
          {t("edit.exercise.payload")}
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={16}
            spellCheck={false}
            className={`${field} font-mono text-xs`}
          />
        </label>
      )}

      {view === "json" && (
        <InlinePicker onPick={(l) => setNames((n) => ({ ...n, [l.id]: l.label }))} />
      )}

      <p className={`text-sm ${check?.ok ? "text-green-700" : "text-red-800"}`}>
        {check === null
          ? t("common.loading")
          : check.ok
            ? t("edit.exercise.payloadValid")
            : t("edit.exercise.payloadInvalid", { error: check.error ?? "" })}
      </p>

      {props.mode === "edit" && Object.keys(props.detail.lexemes).length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("edit.exercise.references")}</h3>
          <ul className="space-y-1">
            {Object.values(props.detail.lexemes).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium" lang="xh">
                  {l.lemma}
                </span>
                <span className="text-stone-500">{l.gloss ?? "?"}</span>
                <StatusBadge status={l.status} />
                {l.status !== "published" && (
                  <span className="text-xs text-red-800">{t("edit.exercise.unpublishedRef")}</span>
                )}
              </li>
            ))}
            {Object.values(props.detail.sentences).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium" lang="xh">
                  {s.text}
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {save.isError && (
        <p className="text-sm text-red-800">
          {save.error instanceof Error ? save.error.message : t("common.error")}
        </p>
      )}
      <button
        type="submit"
        disabled={save.isPending || !check?.ok}
        className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {props.mode === "new" ? t("edit.curriculum.create") : t("edit.exercise.save")}
      </button>
    </form>
  );
}

interface Picked {
  id: string;
  label: string;
}

/** Search-as-you-type lemma picker. Shows status so a draft pick is a visible choice. */
function LexemePicker({
  value,
  label,
  onPick,
}: {
  value: string;
  label: string | undefined;
  onPick: (l: Picked) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["lexeme-search", q],
    queryFn: () => searchLexemes(q),
    enabled: q.trim().length >= 1,
  });
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="min-w-32 text-sm">{value ? (label ?? value.slice(0, 8)) : "—"}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("edit.exercise.pickLexeme")}
          placeholder={t("edit.exercise.pickLexeme")}
          className={field}
        />
      </div>
      {q.trim() && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-stone-300 bg-white text-sm shadow">
          {results.data?.lexemes.length === 0 && (
            <li className="px-2 py-1 text-stone-500">{t("edit.exercise.noResults")}</li>
          )}
          {results.data?.lexemes.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-stone-100"
                onClick={() => {
                  onPick({
                    id: l.id,
                    label: `${l.lemma} (${l.pos}${l.nounClass ? ` ${l.nounClass}` : ""})`,
                  });
                  setQ("");
                }}
              >
                <span className="font-medium" lang="xh">
                  {l.lemma}
                </span>
                <span className="text-stone-500">
                  {l.pos}
                  {l.nounClass ? ` · ${l.nounClass}` : ""}
                </span>
                <StatusBadge status={l.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** For the JSON view: find a lexeme, copy its id. */
function InlinePicker({ onPick }: { onPick: (l: Picked) => void }) {
  const [last, setLast] = useState<Picked | null>(null);
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm">
      <LexemePicker
        value={last?.id ?? ""}
        label={last?.label}
        onPick={(l) => {
          setLast(l);
          onPick(l);
          void navigator.clipboard?.writeText(l.id);
        }}
      />
      {last && <p className="mt-1 font-mono text-xs text-stone-600">{last.id}</p>}
    </div>
  );
}
