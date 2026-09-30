import {
  GOLDEN_CLASS_PAIRS,
  decodeGoldenFile,
  goldenAnswerOf,
  goldenKey,
  goldenOtherClass,
  goldenToml,
  isValidatedGolden,
  type GoldenAnswerView,
  type GoldenCase,
  type GoldenVerdict,
} from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";

import {
  concordFromMark,
  frameFor,
  framesEnabled,
  isConcordForm,
  noteWithSentence,
  sentenceFromNote,
  type ConcordForm,
} from "~/lib/golden-frames.ts";
import {
  applySessionDefault,
  checkGoldenForm,
  earlierAnswers,
  goldenNeedsSave,
  mergeGoldenSources,
  nextUnfinished,
  oldCardAnswer,
  orderedGoldens,
  pairProgress,
} from "~/lib/goldens.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { getGoldenAnswers, putGoldenAnswer } from "~/lib/tutor-api.ts";

import session from "../../../../packages/testkit/golden/cases.json";

export const Route = createFileRoute("/edit/goldens")({
  component: Goldens,
  // `?frames=preview` lets an admin look at the parked sentence frames.
  validateSearch: (search: Record<string, unknown>): { frames?: "preview" } =>
    search["frames"] === "preview" ? { frames: "preview" } : {},
});

/** Cards typed here that the server has not confirmed yet: the offline fallback. */
const PENDING_KEY = "molo.goldens.pending.v2";
/** The whole sheet as the first version kept it, browser-only. Read once, then folded into pending. */
const LEGACY_KEY = "molo.goldens.session.v1";
/** The tutor's name and the session date, entered once for every card. */
const SESSION_KEY = "molo.goldens.tutor.v1";
/** A frame sentence written but not yet used, per card, so a reload does not lose it. */
const FRAME_DRAFTS_KEY = "molo.goldens.frameDrafts.v1";
const sheet = decodeGoldenFile(session).case;
const sheetByKey = new Map(sheet.map((c) => [goldenKey(c), c]));
const field = "block w-full rounded border border-stone-300 px-2 py-1";
const pairId = (pair: readonly [string, string]) => `golden-pair-${pair[0]}-${pair[1]}`;
const PAIR_FORMS = new Set<GoldenCase["form"]>(["plural", "singular"]);
const LOCATIVES_ID = "golden-locatives";
const isLocative = (c: GoldenCase) => c.form === "locative";

type CardState = "saving" | "saved" | "error";

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The server copy is what counts; storage is only the offline fallback. */
  }
}

/**
 * Pending cards, decoded case by case so one bad entry never loses the rest.
 * A card the sheet no longer asks (the old plural-of-a-plural cards) is kept
 * and still sent: the server takes any well-formed key, and the answer then
 * shows under the earlier answers rather than vanishing from this browser.
 */
function readPending(): Record<string, GoldenCase> {
  const out: Record<string, GoldenCase> = {};
  const raw = readJson(PENDING_KEY);
  if (raw && typeof raw === "object")
    for (const value of Object.values(raw as Record<string, unknown>)) {
      try {
        const [c] = decodeGoldenFile({ schema_version: 1, case: [value] }).case;
        if (c) out[goldenKey(c)] = c;
      } catch {
        /* skip */
      }
    }
  return out;
}

/** The first version's browser-only sheet: every card with the tutor's input on it. */
function readLegacy(): GoldenCase[] {
  try {
    const raw = readJson(LEGACY_KEY);
    if (!raw) return [];
    return decodeGoldenFile(raw).case.filter((c) => {
      const original = sheetByKey.get(goldenKey(c));
      // Off the sheet now: kept if the tutor wrote anything on it.
      if (!original) return c.expected.trim() !== "" || c.note.trim() !== "";
      return (
        c.expected.trim() !== "" || c.irregular !== original.irregular || c.note !== original.note
      );
    });
  } catch {
    return [];
  }
}

/**
 * The tutor's golden-forms sheet (docs/EDITOR-GUIDE.md, "Golden forms").
 *
 * Each card saves itself to the server when the tutor leaves it, and says
 * so; a tutor working alone never needs a download or the same browser
 * twice. What has not reached the server yet is kept in this browser and
 * sent again when the connection is back. The operator turns the saved
 * cards into the TOML with `molo morph goldens pull`; the download below is
 * the same data, for an admin only.
 */
function Goldens() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const isAdmin = !!me.data?.roles.includes("admin");
  const search = Route.useSearch();
  // Parked until the operator switches it on; an admin may preview it.
  const frames = framesEnabled(isAdmin, search.frames === "preview");
  const server = useQuery({
    queryKey: ["goldens"],
    queryFn: getGoldenAnswers,
    // A card the tutor is typing on must not be replaced by a refetch.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: 1,
  });
  const [cases, setCases] = useState<readonly GoldenCase[]>(sheet);
  const [ready, setReady] = useState(false);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [saved, setSaved] = useState<ReadonlyMap<string, GoldenAnswerView>>(() => new Map());
  const [tutor, setTutor] = useState({ by: "", on: "" });
  const casesRef = useRef(cases);
  casesRef.current = cases;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const pending = useRef<Record<string, GoldenCase>>({});
  const inFlight = useRef(new Map<string, string>());

  /** Sends one card if it differs from the server's copy. Never throws. */
  const saveCard = useCallback(async (card: GoldenCase) => {
    const key = goldenKey(card);
    const body = goldenAnswerOf(card);
    if (!goldenNeedsSave(card, sheetByKey.get(key), savedRef.current.get(key))) {
      const wasPending = key in pending.current;
      delete pending.current[key];
      writeJson(PENDING_KEY, pending.current);
      // A pending copy the server already holds (the tab closed after the
      // save) is saved: say so, which also redraws what read the pending list.
      setStates((s) =>
        s[key] === "error" || (wasPending && s[key] !== "saved") ? { ...s, [key]: "saved" } : s,
      );
      return;
    }
    const sent = JSON.stringify(body);
    if (inFlight.current.get(key) === sent) return;
    inFlight.current.set(key, sent);
    pending.current[key] = card;
    writeJson(PENDING_KEY, pending.current);
    setStates((s) => ({ ...s, [key]: "saving" }));
    try {
      const { answer } = await putGoldenAnswer(body);
      setSaved((m) => new Map(m).set(key, answer));
      savedRef.current = new Map(savedRef.current).set(key, answer);
      // Keep the pending copy if the tutor typed more while this was in flight.
      const now = casesRef.current.find((c) => goldenKey(c) === key);
      if (!now || JSON.stringify(goldenAnswerOf(now)) === sent) delete pending.current[key];
      writeJson(PENDING_KEY, pending.current);
      setStates((s) => ({ ...s, [key]: "saved" }));
    } catch {
      setStates((s) => ({ ...s, [key]: "error" }));
    } finally {
      if (inFlight.current.get(key) === sent) inFlight.current.delete(key);
    }
  }, []);

  const flushPending = useCallback(() => {
    for (const card of Object.values(pending.current)) void saveCard(card);
  }, [saveCard]);

  // Load once the server has answered (or failed): its cards over the sheet,
  // then anything this browser still holds that it never confirmed.
  useEffect(() => {
    if (ready || server.isPending) return;
    const answers = server.data?.answers ?? [];
    const onServer = new Set(answers.map((a) => a.caseId));
    const local = readPending();
    for (const c of readLegacy()) if (!onServer.has(goldenKey(c))) local[goldenKey(c)] ??= c;
    pending.current = local;
    writeJson(PENDING_KEY, pending.current);
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    const map = new Map(answers.map((a) => [a.caseId, a]));
    setSaved(map);
    savedRef.current = map;
    const merged = mergeGoldenSources(sheet, answers, local);
    setCases(merged);
    casesRef.current = merged;
    const who = readJson(SESSION_KEY) as { by?: unknown; on?: unknown } | null;
    if (who)
      setTutor({
        by: typeof who.by === "string" ? who.by : "",
        on: typeof who.on === "string" ? who.on : "",
      });
    setReady(true);
  }, [ready, server.isPending, server.data]);

  useEffect(() => {
    if (!ready || server.isError) return;
    flushPending();
    const online = () => flushPending();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [ready, server.isError, flushPending]);

  useEffect(() => {
    if (ready) writeJson(SESSION_KEY, tutor);
  }, [tutor, ready]);

  // With the frames parked, the concord cards are not asked at all: they are
  // left out of the sheet, the counts, "Next unfinished" and the session stamp.
  const isAsked = (c: GoldenCase) => frames || !isConcordForm(c.form);
  // Entered once, flowing into every asked card still empty or still on the old value.
  const setSession = (which: "by" | "on", value: string) => {
    const fieldName = which === "by" ? "validated_by" : "validated_on";
    setCases((all) => {
      const stamped = applySessionDefault(all, fieldName, tutor[which], value);
      const next = stamped.map((c, i) => (isAsked(c) ? c : all[i]!));
      casesRef.current = next;
      return next;
    });
    setTutor((prev) => ({ ...prev, [which]: value }));
  };
  // Leaving the name or the date saves every asked card it changed that the server needs.
  const saveAll = () => {
    for (const c of casesRef.current) if (isAsked(c)) void saveCard(c);
  };

  const update = (edited: GoldenCase) => {
    const key = goldenKey(edited);
    const next = casesRef.current.map((row) => (goldenKey(row) === key ? edited : row));
    casesRef.current = next;
    setCases(next);
    // Kept in this browser straight away, so nothing typed is lost before the save.
    if (goldenNeedsSave(edited, sheetByKey.get(key), savedRef.current.get(key))) {
      pending.current[key] = edited;
      writeJson(PENDING_KEY, pending.current);
    }
  };

  const validated = cases.filter(isValidatedGolden);
  const toml = goldenToml(validated);
  const asked = cases.filter(isAsked);
  const askedReady = asked.filter(isValidatedGolden);
  const next = nextUnfinished(asked);
  const byPair = pairProgress(asked.filter((c) => !isLocative(c)));
  const locatives = orderedGoldens(asked.filter(isLocative));
  const locativesReady = locatives.filter(isValidatedGolden).length;
  const earlierConcord = frames
    ? []
    : orderedGoldens(cases.filter((c) => isConcordForm(c.form) && c.expected.trim() !== ""));
  const earlier = earlierAnswers(sheet, saved.values());
  // Typed on a card the sheet no longer asks and not saved yet: shown, so a
  // refusal by the server can never hide what the tutor wrote.
  const unsentEarlier = orderedGoldens(
    Object.values(pending.current).filter((c) => !sheetByKey.has(goldenKey(c))),
  );
  const unsaved = Object.values(states).filter((s) => s !== "saved").length;
  const failedCount = Object.values(states).filter((s) => s === "error").length;
  const renderCard = (c: GoldenCase) => {
    const key = goldenKey(c);
    const last = saved.get(key);
    return (
      <CaseEntry
        key={key}
        value={c}
        disabled={!ready}
        state={states[key] ?? null}
        oldAnswer={oldCardAnswer(c, saved)}
        frames={frames}
        lastSaved={
          last
            ? t("edit.goldens.lastSavedBy", {
                name: last.authorName ?? last.tutorName,
                time: fmtTime(last.updatedAt),
              })
            : null
        }
        update={update}
        save={() => {
          const now = casesRef.current.find((row) => goldenKey(row) === key);
          if (now) void saveCard(now);
        }}
      />
    );
  };
  const goToNext = () => {
    if (!next) return;
    const card = document.querySelector<HTMLElement>(
      `[data-golden="${CSS.escape(goldenKey(next))}"]`,
    );
    if (!card) return;
    card.scrollIntoView({ block: "center" });
    const empty = [...card.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])")].find(
      (i) => !i.value.trim(),
    );
    (empty ?? card.querySelector<HTMLInputElement>("input"))?.focus({ preventScroll: true });
  };
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-xl font-bold">{t("edit.goldens.title")}</h1>
        <div
          className="flex gap-3 rounded-2xl border border-sea/40 bg-sea/10 p-4 text-sm text-ink"
          data-testid="goldens-how"
        >
          <Info size={18} className="mt-0.5 shrink-0 text-sea-deep" aria-hidden />
          <div className="space-y-1">
            <p className="font-bold">{t("edit.goldens.howTitle")}</p>
            <p>{t("edit.goldens.how1")}</p>
            <p>{t("edit.goldens.how2")}</p>
            <p>{t("edit.goldens.how3")}</p>
            <details className="pt-1">
              <summary className="cursor-pointer font-semibold">
                {t("edit.goldens.termsTitle")}
              </summary>
              <dl className="mt-2 space-y-2">
                {(
                  [
                    "class",
                    "plural",
                    "singular",
                    "subject_concord",
                    "object_concord",
                    "possessive",
                    "locative",
                  ] as const
                ).map((term) => (
                  <div key={term}>
                    <dt className="font-semibold">
                      {term === "class"
                        ? t("edit.goldens.termClass")
                        : t(`edit.goldens.forms.${term}`)}
                    </dt>
                    <dd>{t(`edit.goldens.formHelp.${term}`)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </div>
        {frames ? (
          search.frames === "preview" && (
            <p
              role="status"
              className="rounded bg-sun-soft p-2 text-sm text-ink"
              data-testid="goldens-frames-preview"
            >
              {t("edit.goldens.frames.preview")}
            </p>
          )
        ) : (
          <FramesParked earlier={earlierConcord} />
        )}
        {server.isError && (
          <p role="alert" className="text-sm font-semibold text-coral-deep">
            {t("edit.goldens.loadFailed")}
          </p>
        )}
        <p className="text-sm">
          {t("edit.goldens.sessionCount", { count: asked.length, ready: askedReady.length })}
        </p>
        <fieldset className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
          <legend className="px-1 font-bold">{t("edit.goldens.sessionTitle")}</legend>
          <p className="text-sm text-stone-600 md:col-span-2">{t("edit.goldens.sessionHelp")}</p>
          <label className="text-sm">
            {t("edit.goldens.tutorAll")}
            <input
              value={tutor.by}
              onChange={(e) => setSession("by", e.target.value)}
              onBlur={saveAll}
              className={field}
              autoComplete="name"
            />
          </label>
          <label className="text-sm">
            {t("edit.goldens.dateAll")}
            <input
              type="date"
              value={tutor.on}
              onChange={(e) => setSession("on", e.target.value)}
              onBlur={saveAll}
              className={field}
            />
          </label>
        </fieldset>
        <nav aria-label={t("edit.goldens.jump")}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {byPair.map(({ pair, ready: done, count }) => (
              <li key={pairId(pair)}>
                <a
                  href={`#${pairId(pair)}`}
                  className={`inline-flex min-h-11 items-center rounded border px-3 ${done === count ? "border-sea-deep text-sea-deep" : "border-stone-300"}`}
                >
                  {t("edit.goldens.pairLink", {
                    singular: pair[0],
                    plural: pair[1],
                    ready: done,
                    count,
                  })}
                </a>
              </li>
            ))}
            {locatives.length > 0 && (
              <li>
                <a
                  href={`#${LOCATIVES_ID}`}
                  className={`inline-flex min-h-11 items-center rounded border px-3 ${locativesReady === locatives.length ? "border-sea-deep text-sea-deep" : "border-stone-300"}`}
                >
                  {t("edit.goldens.locativeLink", {
                    ready: locativesReady,
                    count: locatives.length,
                  })}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </header>
      {GOLDEN_CLASS_PAIRS.map((pair) => (
        <section
          key={pairId(pair)}
          id={pairId(pair)}
          className="scroll-mt-28 space-y-3"
          aria-labelledby={`${pairId(pair)}-title`}
        >
          <h2 id={`${pairId(pair)}-title`} className="text-lg font-bold">
            {t("edit.goldens.pairTitle", { singular: pair[0], plural: pair[1] })}
          </h2>
          <p className="text-sm text-stone-600">
            {t("edit.goldens.pairIntro", { singular: pair[0], plural: pair[1] })}
          </p>
          {orderedGoldens(
            asked.filter((c) => !isLocative(c) && (pair as readonly string[]).includes(c.class)),
          ).map(renderCard)}
        </section>
      ))}
      {locatives.length > 0 && (
        <section
          id={LOCATIVES_ID}
          className="scroll-mt-28 space-y-3"
          aria-labelledby={`${LOCATIVES_ID}-title`}
        >
          <h2 id={`${LOCATIVES_ID}-title`} className="text-lg font-bold">
            {t("edit.goldens.locativeTitle")}
          </h2>
          <p className="text-sm text-stone-600">{t("edit.goldens.locativeIntro")}</p>
          {locatives.map(renderCard)}
        </section>
      )}
      {(earlier.length > 0 || unsentEarlier.length > 0) && (
        <section
          className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-4"
          aria-labelledby="golden-earlier-title"
          data-testid="goldens-earlier"
        >
          <h2 id="golden-earlier-title" className="text-lg font-bold">
            {t("edit.goldens.earlierTitle")}
          </h2>
          <p className="text-sm text-stone-600">{t("edit.goldens.earlierHelp")}</p>
          <ul className="space-y-1 text-sm">
            {earlier.map((a) => (
              <li key={a.caseId} className="flex flex-wrap gap-x-3">
                <span>
                  {t("edit.goldens.earlierRow", {
                    lemma: a.lemma,
                    cls: a.class,
                    form: t(`edit.goldens.forms.${a.caseForm}`),
                  })}
                </span>
                <span className="font-semibold" lang="xh">
                  {a.form.trim() ? a.form : "—"}
                </span>
                {a.notes.trim() && <span className="text-stone-600">{a.notes}</span>}
              </li>
            ))}
            {unsentEarlier.map((c) => (
              <li
                key={`unsent:${goldenKey(c)}`}
                className="flex flex-wrap gap-x-3"
                data-testid="golden-earlier-unsent"
              >
                <span>
                  {t("edit.goldens.earlierRow", {
                    lemma: c.lemma,
                    cls: c.class,
                    form: t(`edit.goldens.forms.${c.form}`),
                  })}
                </span>
                <span className="font-semibold" lang="xh">
                  {c.expected.trim() ? c.expected : "—"}
                </span>
                {c.note.trim() && <span className="text-stone-600">{c.note}</span>}
                <span className="font-semibold text-coral-deep">
                  {t("edit.goldens.earlierUnsaved")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isAdmin && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold">{t("edit.goldens.exportTitle")}</h2>
          <p className="text-sm">{t("edit.goldens.exportHelp")}</p>
          <pre className="max-h-72 overflow-auto rounded border border-stone-200 p-3 text-xs">
            {toml}
          </pre>
        </div>
      )}
      {/* Always in reach while the sheet scrolls: progress, the next place to
          work, and whether the work is saved (W07). */}
      <div
        className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-t-lg border border-stone-200 bg-white p-3 shadow-card"
        data-testid="goldens-bar"
      >
        <p className="text-sm font-semibold">
          {t("edit.goldens.progress", {
            ready: askedReady.length,
            remaining: asked.length - askedReady.length,
          })}
        </p>
        <button
          type="button"
          onClick={goToNext}
          disabled={!next}
          className="min-h-11 rounded border border-stone-300 px-3 text-sm disabled:opacity-40"
        >
          {next ? t("edit.goldens.nextUnfinished") : t("edit.goldens.allDone")}
        </button>
        {isAdmin &&
          (validated.length > 0 ? (
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(toml)}`}
              download="classes_1_10.goldens.toml"
              className="inline-flex min-h-11 items-center rounded bg-stone-900 px-3 text-sm text-white"
            >
              {t("edit.goldens.export")}
            </a>
          ) : (
            <span className="text-sm text-stone-600">{t("edit.goldens.exportNone")}</span>
          ))}
        <p
          className={`w-full text-xs ${failedCount > 0 ? "font-semibold text-coral-deep" : "text-stone-600"}`}
          role={failedCount > 0 ? "alert" : "status"}
          data-testid="goldens-saved"
        >
          {ready && (unsaved > 0 || Object.keys(pending.current).length > 0)
            ? t("edit.goldens.unsavedCount", {
                count: Math.max(unsaved, Object.keys(pending.current).length),
              })
            : ready
              ? t("edit.goldens.savedServer")
              : null}
        </p>
      </div>
    </section>
  );
}

function CaseEntry({
  value: c,
  disabled,
  state,
  oldAnswer,
  frames,
  lastSaved,
  update,
  save,
}: {
  value: GoldenCase;
  disabled: boolean;
  state: CardState | null;
  /** On a singular card: the answer on the old plural-of-a-plural card. Shown, never filled in. */
  oldAnswer: string | null;
  /** Concord cards are asked by sentence frames (parked unless switched on). */
  frames: boolean;
  lastSaved: string | null;
  update: (value: GoldenCase) => void;
  save: () => void;
}) {
  const t = useT();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ input: string; verdict: GoldenVerdict | "error" } | null>(
    null,
  );
  const check = async () => {
    if (!c.expected.trim() || checking) return;
    const input = c.expected;
    setChecking(true);
    try {
      setResult({ input, verdict: await checkGoldenForm(c) });
    } catch {
      setResult({ input, verdict: "error" });
    } finally {
      setChecking(false);
    }
  };
  // Autosave when focus leaves the card, not on every key.
  const onBlur = (e: FocusEvent<HTMLFieldSetElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) save();
  };
  return (
    <fieldset
      className="grid scroll-mt-28 gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-3"
      data-golden={goldenKey(c)}
      onBlur={onBlur}
      disabled={disabled}
    >
      <legend className="px-1 font-bold">
        {/* The lemma is isiXhosa; the form label is in the UI language (WCAG 3.1.2). */}
        <span lang="xh">{c.lemma}</span> · {t(`edit.goldens.forms.${c.form}`)}{" "}
        {PAIR_FORMS.has(c.form) && (
          <span className="ml-2 text-sm font-normal text-stone-600" data-testid="golden-pair">
            {t("edit.goldens.pairAsk", { cls: c.class, other: goldenOtherClass(c.class) })}
          </span>
        )}
      </legend>
      {/* What the form is and how to write it, on the card where it is needed. */}
      <p className="text-xs text-stone-600 md:col-span-3" data-testid="golden-form-help">
        {t(`edit.goldens.formHelp.${c.form}`)}
      </p>
      {oldAnswer && (
        <p className="text-xs text-stone-600 md:col-span-3" data-testid="golden-old-answer">
          {t("edit.goldens.oldCard", { form: oldAnswer })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs md:col-span-3" aria-live="polite">
        {state === "saving" && (
          <span className="text-stone-600" data-testid="golden-state">
            {t("edit.goldens.state.saving")}
          </span>
        )}
        {state === "saved" && (
          <span className="font-semibold text-sea-deep" data-testid="golden-state">
            {t("edit.goldens.state.saved")}
          </span>
        )}
        {state === "error" && (
          <>
            <span className="font-semibold text-coral-deep" role="alert" data-testid="golden-state">
              {t("edit.goldens.state.error")}
            </span>
            <button
              type="button"
              onClick={save}
              className="rounded border border-coral-deep px-2 py-0.5 font-semibold text-coral-deep"
            >
              {t("edit.goldens.state.retry")}
            </button>
          </>
        )}
        {lastSaved && state !== "saving" && state !== "error" && (
          <span className="text-stone-500">{lastSaved}</span>
        )}
      </div>
      {frames && isConcordForm(c.form) ? (
        <FrameAnswer
          value={c}
          form={c.form}
          onUse={(expected, note) => {
            setResult(null);
            update({ ...c, expected, note });
            save();
          }}
        />
      ) : (
        <label className="text-sm">
          {t("edit.goldens.expected")}
          <input
            value={c.expected}
            lang="xh"
            onChange={(e) => {
              setResult(null);
              update({ ...c, expected: e.target.value });
            }}
            className={field}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
      <label className="text-sm">
        {t("edit.goldens.validatedBy")}
        <input
          value={c.validated_by}
          onChange={(e) => update({ ...c, validated_by: e.target.value })}
          className={field}
          autoComplete="off"
        />
      </label>
      <label className="text-sm">
        {t("edit.goldens.validatedOn")}
        <input
          type="date"
          value={c.validated_on}
          onChange={(e) => update({ ...c, validated_on: e.target.value })}
          className={field}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={c.irregular}
          onChange={(e) => update({ ...c, irregular: e.target.checked })}
        />
        {t("edit.goldens.irregular")}
      </label>
      <label className="text-sm md:col-span-3">
        {t("edit.goldens.note")}
        <textarea
          value={c.note}
          onChange={(e) => update({ ...c, note: e.target.value })}
          className={field}
        />
      </label>
      <div className="space-y-2 md:col-span-3">
        <button
          type="button"
          disabled={!c.expected.trim() || checking}
          onClick={() => void check()}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t(checking ? "common.loading" : "edit.goldens.check")}
        </button>
        {c.expected.trim() && result?.input === c.expected && (
          <p role="status" className="text-sm">
            {t(`edit.goldens.${result.verdict}`)}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/**
 * The parked state of the concord questions: what agreement is, by example,
 * the words the school books use for it, and the tutor's earlier answers,
 * read-only. Nothing here asks for anything.
 */
function FramesParked({ earlier }: { earlier: readonly GoldenCase[] }) {
  const t = useT();
  return (
    <section
      className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-ink"
      aria-labelledby="goldens-frames-parked-title"
      data-testid="goldens-frames-parked"
    >
      <h2 id="goldens-frames-parked-title" className="font-bold">
        {t("edit.goldens.frames.parkedTitle")}
      </h2>
      <p>{t("edit.goldens.frames.parkedBody")}</p>
      <details>
        <summary className="cursor-pointer font-semibold">
          {t("edit.goldens.frames.exampleTitle")}
        </summary>
        <p className="mt-2">{t("edit.goldens.frames.example")}</p>
      </details>
      {earlier.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">
            {t("edit.goldens.frames.earlierTitle")}
          </summary>
          <p className="mt-1 text-stone-600">{t("edit.goldens.frames.earlierHelp")}</p>
          <ul className="mt-1 space-y-1">
            {earlier.map((c) => (
              <li key={goldenKey(c)} className="flex flex-wrap gap-x-3">
                <span>
                  {t("edit.goldens.earlierRow", {
                    lemma: c.lemma,
                    cls: c.class,
                    form: t(`edit.goldens.forms.${c.form}`),
                  })}
                </span>
                <span className="font-semibold" lang="xh">
                  {c.expected}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * A concord card asked by a sentence frame. The tutor writes the whole
 * sentence, selects the part that agrees with the noun, and presses Mark;
 * the card shows what would be saved, and only her "Use this" sets the
 * answer. Nothing is derived without her say.
 */
function FrameAnswer({
  value: c,
  form,
  onUse,
}: {
  value: GoldenCase;
  form: ConcordForm;
  onUse: (expected: string, note: string) => void;
}) {
  const t = useT();
  const frame = frameFor(c);
  const key = goldenKey(c);
  const [sentence, setSentence] = useState(() => {
    const drafts = readJson(FRAME_DRAFTS_KEY) as Record<string, unknown> | null;
    const draft = drafts?.[key];
    return typeof draft === "string" ? draft : sentenceFromNote(c.note);
  });
  const keepDraft = (text: string | null) => {
    const drafts = { ...(readJson(FRAME_DRAFTS_KEY) as Record<string, unknown> | null) };
    if (text === null) delete drafts[key];
    else drafts[key] = text;
    writeJson(FRAME_DRAFTS_KEY, drafts);
  };
  const [marked, setMarked] = useState<string | null>(null);
  const [problem, setProblem] = useState<"markEmpty" | "markSpace" | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const mark = () => {
    const el = box.current;
    const part = el ? el.value.slice(el.selectionStart, el.selectionEnd).trim() : "";
    const ok = part !== "" && concordFromMark(form, part) !== "";
    setProblem(part === "" ? "markEmpty" : ok ? null : "markSpace");
    setMarked(ok ? part : null);
  };
  const value = marked ? concordFromMark(form, marked) : "";
  return (
    <div className="space-y-2 text-sm md:col-span-3" data-testid="golden-frame">
      <p>
        {frame ? (
          <>
            {t("edit.goldens.frames.intro")}{" "}
            <q className="font-semibold italic" lang="en">
              {t(frame.key, { noun: frame.noun })}
            </q>
          </>
        ) : (
          t("edit.goldens.frames.noFrame")
        )}
      </p>
      {form === "subject_concord" && (
        <p className="text-xs text-stone-600">{t("edit.goldens.frames.anyVerb")}</p>
      )}
      <label className="block">
        {t("edit.goldens.frames.sentenceLabel")}
        <textarea
          ref={box}
          value={sentence}
          lang="xh"
          rows={2}
          spellCheck={false}
          onChange={(e) => {
            setSentence(e.target.value);
            setMarked(null);
            keepDraft(e.target.value);
          }}
          className={field}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!sentence.trim()}
          onClick={mark}
          className="rounded border border-stone-300 px-3 py-1.5 disabled:opacity-40"
        >
          {t("edit.goldens.frames.mark")}
        </button>
        <span className="text-xs text-stone-600">{t("edit.goldens.frames.markHint")}</span>
      </div>
      {problem && (
        <p role="alert" className="text-coral-deep">
          {t(`edit.goldens.frames.${problem}`)}
        </p>
      )}
      {marked && value && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-sand p-2" role="status">
          <span>
            {t("edit.goldens.frames.marked.before")}
            <span className="font-semibold" lang="xh">
              {marked}
            </span>
            {t("edit.goldens.frames.marked.middle")}
            <span className="font-semibold" lang="xh">
              {value}
            </span>
            {t("edit.goldens.frames.marked.after")}
          </span>
          <button
            type="button"
            onClick={() => {
              onUse(value, noteWithSentence(c.note, sentence, marked));
              setMarked(null);
              keepDraft(null);
            }}
            className="rounded bg-stone-900 px-3 py-1.5 text-white"
          >
            {t("edit.goldens.frames.use")}
          </button>
        </div>
      )}
      {c.expected.trim() && (
        <p data-testid="golden-frame-saved">
          {t("edit.goldens.frames.savedBefore")}
          <span className="font-semibold" lang="xh">
            {c.expected}
          </span>
        </p>
      )}
    </div>
  );
}
