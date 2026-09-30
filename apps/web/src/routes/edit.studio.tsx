import { CONTENT_NOTE_MAX, studioUnitOptions, type AudioQueueResponse } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  FileAudio,
  MessageSquare,
  Mic,
  Play,
  RefreshCw,
  Scissors,
  Square,
  Upload,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AudioBacklogNote } from "~/components/AudioBacklogNote.tsx";
import { AudioButton } from "~/components/AudioButton.tsx";
import { AudioTrimmer } from "~/components/AudioTrimmer.tsx";
import { ClickText } from "~/components/exercises/ClickText.tsx";
import {
  useDecodedAudioState,
  Waveform,
  type DecodeState,
} from "~/components/exercises/Waveform.tsx";
import { StatusBadge } from "~/components/StatusBadge.tsx";
import { Button } from "~/components/ui/Button.tsx";
import {
  addContentNote,
  createSpeaker,
  discardAudio,
  getAudioQueue,
  getSpeakers,
  transition,
  uploadAudio,
  type AudioQueueItem,
} from "~/lib/api.ts";
import { sliceToWav, type Trim } from "~/lib/audio-take.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useRecorder } from "~/lib/recorder.ts";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";
import { AUDIO_FILE_ACCEPT, extensionFor, matchFiles } from "~/lib/studio-files.ts";

/**
 * `?unit=<slug>` so the landing page's per-unit recording gap can hand a
 * speaker the session it just counted. Everything else the studio
 * remembers itself, in local storage, because it is a place you come back
 * to rather than a view you link to.
 */
export const Route = createFileRoute("/edit/studio")({
  component: Studio,
  // `kind` and `item` let another page open one item directly: the write
  // page's "Record it" lands on the sentence the tutor has just written.
  validateSearch: (
    search: Record<string, unknown>,
  ): { unit?: string; kind?: Kind; item?: string } => {
    const out: { unit?: string; kind?: Kind; item?: string } = {};
    const { unit, kind, item } = search;
    if (typeof unit === "string" && unit !== "") out.unit = unit;
    if (kind === "all" || kind === "lexeme" || kind === "sentence" || kind === "click")
      out.kind = kind;
    if (typeof item === "string" && item !== "") out.item = item;
    return out;
  },
});

const CONSENT_LABEL = {
  internal: "edit.recorder.consent.internal",
  published: "edit.recorder.consent.published",
  commercial: "edit.recorder.consent.commercial",
} as const;
type ConsentScope = keyof typeof CONSENT_LABEL;

const SPEAKER_KEY = "molo.studio.speaker";
const POS_KEY = "molo.studio.pos";
// Skipped items, per speaker: they move to the end of the list and stay there
// across reloads, so a session never restarts on the words the speaker refused.
const SKIPPED_KEY = "molo.studio.skipped";
type Kind = "all" | "lexeme" | "sentence" | "click";

/** A bare click's variant, named in the UI language (the letter is the prompt). */
const CLICK_VARIANT_LABEL = {
  plain: "edit.studio.clickVariant.plain",
  aspirated: "edit.studio.clickVariant.aspirated",
  nasal: "edit.studio.clickVariant.nasal",
  voiced: "edit.studio.clickVariant.voiced",
  voiced_nasal: "edit.studio.clickVariant.voiced_nasal",
} as const;

/**
 * The take on screen, wherever it came from: the microphone, a file the
 * tutor recorded in another app, or an existing take opened to be trimmed.
 * All three go up the same tier-1 path with the same speaker.
 */
interface TakeSource {
  readonly blob: Blob;
  readonly url: string;
  readonly mime: string;
  readonly origin: "mic" | "file" | "existing";
  readonly name?: string;
}

/** The existing take a new one will replace, once the new one is saved. */
interface Replacing {
  readonly id: string;
  readonly status: string;
  readonly speakerName: string | null;
  readonly url: string;
}

function readSkipped(speakerId: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(readLocal(`${SKIPPED_KEY}.${speakerId}`) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function readLocal(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

const safeName = (text: string) => text.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40);

/**
 * The recording studio (ARCHITECTURE section 7): a speaker with consent on
 * file works through everything that lacks tier-1/2 audio, word by word,
 * phrase by phrase, from the keyboard. Space records and stops, P plays the
 * take, Enter saves and advances, the arrows move. A take can also come from
 * a file, one at a time or a folder at once, and a saved take can be
 * replaced or trimmed later. Uploads go to POST /edit/audio; xh-audio and
 * the audio_assets row happen off the browser, so a saved item shows
 * "processing" until the worker has run.
 */
function Studio() {
  const t = useT();
  const me = useMe();
  const qc = useQueryClient();
  const sfx = useSfx();
  const search = Route.useSearch();
  const [kind, setKind] = useState<Kind>(search.kind ?? "all");
  // Opened on one click (a note on Today links here), that click must be in
  // the list even if it is recorded already. Other ?item= links (Record it on
  // the write page) keep the usual only-missing list.
  const [onlyMissing, setOnlyMissing] = useState(!(search.item && search.kind === "click"));
  const [unit, setUnit] = useState(search.unit ?? "");
  const [speakerId, setSpeakerId] = useState("");
  const [index, setIndex] = useState(0);
  const [uploaded, setUploaded] = useState<Set<string>>(() => new Set());
  const [sessionCount, setSessionCount] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  // The take whose "Delete take" was pressed once and now asks to confirm.
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const discard = useMutation({
    mutationFn: (id: string) => discardAudio(id),
    onSuccess: async (_res, id) => {
      setConfirmDiscard(null);
      toast.success(t("edit.studio.discard.done"));
      // Gone from the screen at once; the queue is a large read, and waiting
      // for it left the deleted take showing for seconds.
      qc.setQueriesData<AudioQueueResponse>({ queryKey: ["audio-queue"] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) => ({ ...i, audio: i.audio.filter((a) => a.id !== id) })),
            }
          : old,
      );
      await qc.invalidateQueries({ queryKey: ["audio-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const mayDiscard = (a: { status: string; createdBy: string | null }) =>
    a.status !== "published" &&
    a.status !== "retired" &&
    (a.createdBy === me.data?.user.id || !!me.data?.roles.includes("admin"));
  // Open while the speaker says why they skip: null is closed, "" is empty.
  const [skipNote, setSkipNote] = useState<string | null>(null);
  // A note on one item, recorded or not, without skipping it. It names its
  // item, so a list that moves under it (a save drops the item) never sends
  // the text against whatever slid into its place.
  const [itemNote, setItemNote] = useState<{ id: string; text: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  useEffect(() => {
    const savedSpeaker = readLocal(SPEAKER_KEY);
    setSpeakerId(savedSpeaker);
    setSkipped(readSkipped(savedSpeaker));
    const pos = Number(readLocal(`${POS_KEY}.${kind}`));
    if (Number.isFinite(pos)) setIndex(pos);
  }, [kind]);

  const speakers = useQuery({ queryKey: ["speakers"], queryFn: getSpeakers });
  const queue = useQuery({
    queryKey: ["audio-queue", kind, speakerId, onlyMissing],
    queryFn: () =>
      getAudioQueue({
        kind,
        limit: 500,
        ...(speakerId ? { speaker: speakerId } : {}),
        // "Only missing" off asks the server for recorded items too, so a
        // saved take can be heard, replaced or trimmed later. The fifteen
        // clicks always come back: a click take has no page of its own.
        ...(kind === "click" || !onlyMissing ? { missing: false } : {}),
      }),
  });
  const speaker = speakers.data?.speakers.find((s) => s.id === speakerId);
  const consent = !!speaker?.consentRecordedAt && !!speaker.consentScope;

  const unitOptions = useMemo(
    () =>
      studioUnitOptions(
        queue.data?.items.flatMap((i) => i.unitSlugs) ?? [],
        queue.data?.units ?? undefined,
      ),
    [queue.data],
  );
  const items = useMemo(() => {
    const all = queue.data?.items ?? [];
    const shown = all.filter((i) => {
      // Bare clicks belong to no unit, so the unit filter does not apply to them.
      if (unit && i.kind !== "click" && !i.unitSlugs.includes(unit)) return false;
      // With a speaker chosen, "missing" means missing in this voice, as the
      // server already counts it: another speaker's take must not hide an item.
      const recorded = i.audio.some(
        (a) => a.tier !== "3_tts" && (!speakerId || a.speakerId === speakerId),
      );
      if (onlyMissing && (recorded || uploaded.has(i.id))) return false;
      return true;
    });
    // Skipped items last, in their own order: what is still to do comes first.
    return [...shown.filter((i) => !skipped.has(i.id)), ...shown.filter((i) => skipped.has(i.id))];
  }, [queue.data, unit, onlyMissing, uploaded, skipped, speakerId]);
  // Everything left was skipped, or nothing is left: the list is done, and the
  // studio says what comes next instead of leaving the speaker on the last word.
  const listDone = queue.isSuccess && items.every((i) => skipped.has(i.id));
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const current = items[safeIndex];
  const noteOpen = !!current && itemNote?.id === current.id;
  const rec = useRecorder();

  // A take from a file or an existing recording; the microphone's own take
  // lives in `rec`. Only one of the two is ever set.
  const [alt, setAlt] = useState<TakeSource | null>(null);
  useEffect(() => () => void (alt && URL.revokeObjectURL(alt.url)), [alt]);
  const take: TakeSource | null =
    alt ??
    (rec.take
      ? { blob: rec.take.blob, url: rec.take.url, mime: rec.take.mime, origin: "mic" }
      : null);
  const [replacing, setReplacing] = useState<Replacing | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // A take belongs to the item it was recorded for. Moving to another item,
  // by any route (arrows, list, keyboard, a filter), discards it, and the
  // upload refuses a take whose item is not the one on screen (audit W01).
  const takeFor = useRef<string | null>(null);
  const resetRec = rec.reset;
  const discardTake = useCallback(() => {
    resetRec();
    setAlt(null);
  }, [resetRec]);
  const go = useCallback(
    (next: number) => {
      const n = Math.max(0, Math.min(items.length - 1, next));
      discardTake();
      setReplacing(null);
      setSkipNote(null);
      setItemNote(null);
      takeFor.current = null;
      setIndex(n);
      writeLocal(`${POS_KEY}.${kind}`, String(n));
    },
    [items.length, kind, discardTake],
  );
  // Opened for one item (?item=): go to it once the list has loaded, after the
  // remembered position has been restored, so it wins.
  const jumpedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!search.item || jumpedTo.current === search.item) return;
    const n = items.findIndex((i) => i.id === search.item);
    if (n < 0) return;
    jumpedTo.current = search.item;
    go(n);
  }, [search.item, items, go]);
  const skipCurrent = () => {
    if (!current) return;
    const next = new Set(skipped).add(current.id);
    setSkipped(next);
    writeLocal(`${SKIPPED_KEY}.${speakerId}`, JSON.stringify([...next]));
    // The skipped item moves to the end, so the next one to do slides into this slot.
    const remaining = items.filter((i) => !next.has(i.id)).length;
    go(Math.min(safeIndex, Math.max(0, remaining - 1)));
  };
  // A skip can carry a note to the editor ("the gloss is wrong", "the prefix is
  // missing"); it lands in the row's history and on the editor landing page.
  const sendNote = useMutation({
    mutationFn: (req: { kind: "lexeme" | "sentence" | "click"; id: string; note: string }) =>
      addContentNote(req),
  });
  // The Note button: the same note as a skip carries, for any item, and the
  // item stays where it is. The editors read it on Today.
  const sendItemNote = async () => {
    if (!current) return;
    if (!itemNote || itemNote.id !== current.id) return;
    const note = itemNote.text.trim();
    if (!note) return;
    const id = current.id;
    try {
      await sendNote.mutateAsync({ kind: current.kind, id, note });
      toast.success(t("edit.studio.skipNote.sent"));
      // Only this item's form: a late reply must not close a note begun on another.
      setItemNote((n) => (n?.id === id ? null : n));
    } catch {
      // Keep the form and the text, so nothing the speaker wrote is lost.
      toast.error(t("edit.studio.skipNote.failed"));
    }
  };
  const skipWithNote = async () => {
    if (!current) return;
    const note = skipNote?.trim() ?? "";
    if (note && current.kind !== "click") {
      try {
        await sendNote.mutateAsync({ kind: current.kind, id: current.id, note });
        toast.success(t("edit.studio.skipNote.sent"));
      } catch {
        // Keep the form and the text, so nothing the speaker wrote is lost.
        toast.error(t("edit.studio.skipNote.failed"));
        return;
      }
    }
    skipCurrent();
  };
  useEffect(() => {
    if (takeFor.current && takeFor.current !== current?.id) {
      discardTake();
      takeFor.current = null;
    }
    setReplacing((r) => (r && !current?.audio.some((a) => a.id === r.id) ? null : r));
    setItemNote((n) => (n && n.id !== current?.id ? null : n));
  }, [current?.id, current?.audio, discardTake]);
  const startTake = useCallback(() => {
    if (!current) return;
    setAlt(null);
    takeFor.current = current.id;
    void rec.start();
  }, [current, rec]);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const takeFile = useCallback(
    (file: File) => {
      if (!current) return;
      resetRec();
      takeFor.current = current.id;
      setAlt({
        blob: file,
        url: URL.createObjectURL(file),
        mime: file.type,
        origin: "file",
        name: file.name,
      });
    },
    [current, resetRec],
  );
  const openExisting = useCallback(
    async (url: string) => {
      if (!current) return;
      const forId = current.id;
      setLoadingExisting(true);
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (takeFor.current && takeFor.current !== forId) return;
        resetRec();
        takeFor.current = forId;
        setAlt({
          blob,
          url: URL.createObjectURL(blob),
          mime: blob.type || "audio/mp4",
          origin: "existing",
        });
      } catch {
        toast.error(t("edit.studio.loadTakeFailed"));
      } finally {
        setLoadingExisting(false);
      }
    },
    [current, resetRec, t],
  );

  const { buffer: takeBuffer, state: decodeState } = useDecodedAudioState(take?.blob ?? null);
  // Audio QA: the editor may cut the start and the end before uploading.
  // `null` means "as recorded"; the server pipeline trims and normalises
  // whatever it is given, so this only chooses which seconds it gets.
  const [trim, setTrim] = useState<Trim | null>(null);
  const takeUrl = take?.url ?? null;
  useEffect(() => {
    setTrim(null);
  }, [takeUrl]);
  const shownTrim: Trim | null = takeBuffer
    ? (trim ?? { startSec: 0, endSec: takeBuffer.duration })
    : null;
  const isTrimmed =
    !!takeBuffer &&
    !!shownTrim &&
    (shownTrim.startSec > 0.005 || shownTrim.endSec < takeBuffer.duration - 0.005);
  const trimmedBlob = useMemo(
    () =>
      takeBuffer && shownTrim && isTrimmed
        ? sliceToWav(takeBuffer, shownTrim.startSec, shownTrim.endSec)
        : null,
    [takeBuffer, shownTrim?.startSec, shownTrim?.endSec, isTrimmed],
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!trimmedBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(trimmedBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [trimmedBlob]);

  // One audio element for the take on screen. Nothing plays until the
  // speaker asks: the Play button, or P.
  const player = useRef<HTMLAudioElement | null>(null);
  const playUrl = take ? (previewUrl ?? take.url) : null;
  const playTake = useCallback(() => {
    const el = player.current;
    if (!el || !playUrl) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, [playUrl]);

  const upload = useMutation({
    mutationFn: async (item: AudioQueueItem) => {
      if (!take) throw new Error("no take");
      if (takeFor.current !== item.id) throw new Error(t("edit.studio.takeMismatch"));
      const ext = trimmedBlob
        ? "wav"
        : take.origin === "mic"
          ? take.mime.includes("mp4")
            ? "m4a"
            : "webm"
          : extensionFor(take.mime, take.name);
      const r = await uploadAudio({
        file: trimmedBlob ?? take.blob,
        filename: `${safeName(item.text)}__${speakerId.slice(0, 8)}__t1.${ext}`,
        targetKind: item.kind,
        targetId: item.id,
        speakerId,
        tier: "1_native_studio",
        licence: "proprietary-molo",
      });
      // The take this one replaces goes back through the status machine, as
      // a rejection with its reason; a published one stays live until the
      // new take is approved.
      let replaced = false;
      if (replacing && replacing.status === "in_review") {
        const moved = await transition({
          kind: "audio_asset",
          id: replacing.id,
          to: "draft",
          note: t("edit.studio.replacedNote"),
        });
        if (!moved.ok) toast.error(moved.reason);
        replaced = moved.ok;
      }
      return { r, replaced };
    },
    onSuccess: async ({ replaced }, item) => {
      sfx.play("correct");
      toast.success(t("edit.recorder.uploaded"));
      if (replaced) toast.success(t("edit.studio.replaced"));
      setUploaded((s) => new Set(s).add(item.id));
      setSessionCount((n) => n + 1);
      discardTake();
      setReplacing(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["grid"] }),
        qc.invalidateQueries({ queryKey: ["audio-queue"] }),
      ]);
      void qc.invalidateQueries({ queryKey: ["audio-backlog"] });
      // With "only missing" on, the saved item leaves the list and the next one takes its index.
      if (!onlyMissing) go(safeIndex + 1);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
    onSettled: () => {
      saving.current = false;
    },
  });
  // Set before the mutation starts, so a double click or Enter-repeat cannot
  // send the same take twice (audit W15); the pending flag arrives a render late.
  const saving = useRef(false);
  const save = useCallback(() => {
    if (saving.current || !current || !take) return;
    saving.current = true;
    upload.mutate(current);
  }, [current, take, upload]);

  // Keyboard: space record/stop, P play, Enter save, arrows move. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (bulkOpen) return;
      // The trim handles own the arrow keys while they have focus.
      if (el?.closest("[data-audio-qa]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!consent || !current) return;
        if (rec.state === "recording") rec.stop();
        else startTake();
      } else if (e.key === "p" || e.key === "P") {
        if (take && rec.state !== "recording") {
          e.preventDefault();
          playTake();
        }
      } else if (e.key === "Enter") {
        if (take && current && consent) {
          e.preventDefault();
          save();
        }
      } else if (e.key === "ArrowRight") {
        go(safeIndex + 1);
      } else if (e.key === "ArrowLeft") {
        go(safeIndex - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rec, take, current, consent, save, startTake, playTake, go, safeIndex, bulkOpen]);

  const select =
    "mt-1 w-full min-w-0 max-w-full rounded-xl border-2 border-mist-soft bg-cloud px-2 py-1.5 text-sm";
  const unitLabel = (o: (typeof unitOptions)[number]) => {
    // The unit's title when the server names it (MOL-67), else the slug.
    const title = o.titleKey ? t(o.titleKey as never, { defaultValue: o.slug }) : o.slug;
    return o.number !== null
      ? t("edit.studio.unitNumbered", { number: o.number, title })
      : t("edit.studio.unitOld", { title });
  };

  return (
    // On a phone the aside dissolves (`contents`) so its two cards can take
    // their own order around the working panel: setup, then the word and the
    // record controls, then the long queue, collapsed (W04). `grid-cols-1`
    // and `min-w-0` keep wide selects and long words inside the viewport.
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,1fr)_2fr]">
      {playUrl && <audio ref={player} src={playUrl} preload="auto" className="hidden" />}
      <aside className="contents lg:block lg:min-w-0 lg:space-y-4">
        <div className="order-1 min-w-0 rounded-3xl bg-cloud p-4 shadow-card lg:order-none">
          <h1 className="mb-3 font-display text-xl font-bold text-indigo">
            {t("edit.studio.title")}
          </h1>
          <AudioBacklogNote className="mb-3" />
          <label className="block text-sm font-semibold text-indigo">
            {t("edit.recorder.speaker")}
            <select
              value={speakerId}
              onChange={(e) => {
                setSpeakerId(e.target.value);
                writeLocal(SPEAKER_KEY, e.target.value);
                setSkipped(readSkipped(e.target.value));
                // Hand focus back to the page so Space records instead of reopening the list.
                e.currentTarget.blur();
              }}
              className={select}
            >
              <option value="">—</option>
              {speakers.data?.speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                  {s.gender || s.ageGroup
                    ? ` · ${[s.gender, s.ageGroup].filter(Boolean).join(", ")}`
                    : ""}{" "}
                  (
                  {s.consentScope
                    ? t(CONSENT_LABEL[s.consentScope as ConsentScope] ?? "edit.recorder.noConsent")
                    : t("edit.recorder.noConsent")}
                  )
                </option>
              ))}
            </select>
          </label>
          {speakerId && !consent && (
            <p className="mt-2 text-sm text-coral-deep">{t("edit.recorder.consentMissing")}</p>
          )}
          {!speakerId && <p className="mt-2 text-sm text-mist">{t("edit.studio.speakerFirst")}</p>}
          {me.data?.roles.includes("admin") && (
            <NewSpeaker onCreated={() => qc.invalidateQueries({ queryKey: ["speakers"] })} />
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <label className="block min-w-0 font-semibold text-indigo">
              {t("edit.studio.queue")}
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as Kind);
                  e.currentTarget.blur();
                }}
                className={select}
              >
                <option value="all">{t("edit.studio.kind.all")}</option>
                <option value="lexeme">{t("edit.studio.kind.lexeme")}</option>
                <option value="sentence">{t("edit.studio.kind.sentence")}</option>
                <option value="click">{t("edit.studio.kind.click")}</option>
              </select>
            </label>
            <label className="block min-w-0 font-semibold text-indigo">
              {t("edit.studio.unit")}
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  e.currentTarget.blur();
                }}
                className={select}
              >
                <option value="">{t("edit.studio.anyUnit")}</option>
                {unitOptions.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {unitLabel(o)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-indigo">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              className="h-4 w-4 accent-sea"
            />
            {t("edit.studio.onlyMissing")}
          </label>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!consent || items.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            <Upload size={16} aria-hidden /> {t("edit.studio.bulk.open")}
          </Button>
          <p className="mt-3 text-xs text-mist">{t("edit.studio.done", { count: sessionCount })}</p>
        </div>
        <QueueDisclosure count={items.length}>
          <ol className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
            {items.map((i, n) => (
              <li key={`${i.kind}:${i.id}`}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left ${n === safeIndex ? "bg-sun-soft font-semibold text-indigo" : "hover:bg-sand"}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${uploaded.has(i.id) ? "bg-sun" : i.audio.length > 0 ? "bg-sea" : "bg-mist-soft"}`}
                    aria-hidden
                  />
                  <span className="w-6 shrink-0 text-xs text-mist">{n + 1}</span>
                  <span className="truncate" lang="xh">
                    {i.text}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-mist">
                    {skipped.has(i.id)
                      ? t("edit.studio.skipped")
                      : i.kind === "sentence"
                        ? t("edit.studio.kind.sentence")
                        : i.click
                          ? t(CLICK_VARIANT_LABEL[i.click.variant])
                          : ""}
                  </span>
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="p-2 text-mist">
                <QueueStatus queue={queue} />
              </li>
            )}
          </ol>
        </QueueDisclosure>
      </aside>

      <div
        className="order-2 min-w-0 rounded-3xl bg-cloud p-4 shadow-pop sm:p-8 lg:order-none"
        data-testid="studio-panel"
      >
        {listDone && kind !== "click" && (
          <div
            role="status"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-sea-soft p-4 text-ink"
            data-testid="studio-list-done"
          >
            <p className="min-w-0 flex-1">
              {items.length > 0
                ? t("edit.studio.listDone.skipped", { count: items.length })
                : t("edit.studio.listDone.empty")}
            </p>
            <Button onClick={() => setKind("click")}>{t("edit.studio.listDone.clicks")}</Button>
          </div>
        )}
        {current ? (
          <>
            <div className="mb-4 flex items-center justify-between text-sm text-mist">
              <span>
                {t("edit.studio.position", { index: safeIndex + 1, total: items.length })}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={current.status} />
                {uploaded.has(current.id) && (
                  <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-ochre-deep">
                    {t("edit.studio.processing")}
                  </span>
                )}
              </span>
            </div>
            <motion.h2
              key={current.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 font-display text-4xl font-bold leading-tight text-ink [overflow-wrap:anywhere] sm:text-6xl"
            >
              <ClickText text={current.text} />
            </motion.h2>
            <p className="mb-6 text-lg text-mist">
              {current.click && (
                <span>
                  {t("edit.studio.clickMeaning", {
                    base: current.click.base,
                    variant: t(CLICK_VARIANT_LABEL[current.click.variant]),
                  })}
                </span>
              )}
              {current.gloss.en && <span>{current.gloss.en}</span>}
              {current.gloss.en && current.gloss.nb && <span> · </span>}
              {current.gloss.nb && <span>{current.gloss.nb}</span>}
            </p>
            <div className="-mt-4 mb-6 flex flex-wrap items-center gap-3 text-sm">
              {current.kind !== "click" && (
                // Its own page, in a new tab so the session stays where it is.
                <Link
                  to={current.kind === "lexeme" ? "/edit/lexemes/$id" : "/edit/sentences/$id"}
                  params={{ id: current.id }}
                  target="_blank"
                  className="font-semibold text-indigo underline underline-offset-2"
                >
                  {t(
                    current.kind === "lexeme" ? "edit.studio.editWord" : "edit.studio.editSentence",
                  )}
                </Link>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={noteOpen}
                data-testid="studio-note-open"
                onClick={() => {
                  setSkipNote(null);
                  setItemNote(noteOpen ? null : { id: current.id, text: "" });
                }}
              >
                <MessageSquare size={16} aria-hidden /> {t("edit.studio.note.open")}
              </Button>
            </div>
            {noteOpen && itemNote && (
              <form
                className="-mt-2 mb-6 space-y-2 rounded-2xl bg-sand p-4"
                data-testid="studio-note"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendItemNote();
                }}
              >
                <label className="block text-sm font-semibold text-indigo">
                  {t("edit.studio.note.label")}
                  <textarea
                    value={itemNote.text}
                    onChange={(e) => setItemNote({ id: current.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setItemNote(null);
                    }}
                    rows={3}
                    maxLength={CONTENT_NOTE_MAX}
                    autoFocus
                    className="mt-1 block w-full rounded-xl border border-mist-soft bg-white p-2 font-normal text-ink"
                  />
                </label>
                <p className="text-xs text-mist">{t("edit.studio.note.hint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={sendNote.isPending || !itemNote.text.trim()}
                  >
                    {t("edit.studio.note.send")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItemNote(null)}>
                    {t("edit.studio.skipNote.cancel")}
                  </Button>
                </div>
              </form>
            )}
            {current.audio.length > 0 && (
              <div
                className="mb-6 flex flex-col gap-2 rounded-2xl bg-sand p-3 text-sm"
                data-testid="studio-existing"
              >
                <span className="font-semibold text-indigo">{t("edit.studio.existing")}</span>
                {current.audio.map((a) => (
                  <span key={a.id} className="flex flex-wrap items-center gap-2">
                    <AudioButton url={a.url} label={a.tier} size="sm" />
                    <span className="text-mist">
                      {a.tier}
                      {a.speakerName ? ` · ${a.speakerName}` : ""}
                    </span>
                    <StatusBadge status={a.status} />
                    {mayDiscard(a) &&
                      (confirmDiscard === a.id ? (
                        <span className="inline-flex items-center gap-2" role="group">
                          <span className="text-xs font-semibold text-coral-deep">
                            {t("edit.studio.discard.confirm")}
                          </span>
                          <button
                            type="button"
                            className="rounded bg-coral-deep px-2 py-1 text-xs font-semibold text-cloud"
                            disabled={discard.isPending}
                            onClick={() => discard.mutate(a.id)}
                          >
                            {t("edit.studio.discard.yes")}
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs font-semibold text-indigo"
                            onClick={() => setConfirmDiscard(null)}
                          >
                            {t("edit.studio.discard.cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-xs font-semibold text-coral-deep underline"
                          onClick={() => setConfirmDiscard(a.id)}
                        >
                          {t("edit.studio.discard.button")}
                        </button>
                      ))}
                    {current.kind === "click" && a.status === "in_review" && (
                      <button
                        type="button"
                        className="rounded bg-sea-deep px-2 py-1 text-xs font-semibold text-cloud"
                        onClick={() =>
                          transition({ kind: "audio_asset", id: a.id, to: "published" })
                            .then((r) =>
                              r.ok
                                ? toast.success(t("edit.studio.clickApproved"))
                                : toast.error(r.reason),
                            )
                            .then(() => qc.invalidateQueries({ queryKey: ["audio-queue"] }))
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : t("common.error")),
                            )
                        }
                      >
                        {t("edit.lexeme.approve")}
                      </button>
                    )}
                    {(a.status === "in_review" || a.status === "published") &&
                      replacing?.id !== a.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!consent}
                          onClick={() => {
                            discardTake();
                            takeFor.current = null;
                            setReplacing({
                              id: a.id,
                              status: a.status,
                              speakerName: a.speakerName,
                              url: a.url,
                            });
                          }}
                        >
                          <RefreshCw size={14} aria-hidden /> {t("edit.studio.replace")}
                        </Button>
                      )}
                  </span>
                ))}
              </div>
            )}
            {replacing && (
              <div
                className="mb-4 rounded-2xl border-2 border-sun bg-sun-soft p-3 text-sm text-ink"
                role="status"
                data-testid="studio-replacing"
              >
                <p>
                  {t(
                    replacing.status === "published"
                      ? "edit.studio.replacingPublished"
                      : "edit.studio.replacing",
                    { speaker: replacing.speakerName ?? t("edit.studio.unknownSpeaker") },
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingExisting || !consent}
                    onClick={() => void openExisting(replacing.url)}
                  >
                    <Scissors size={14} aria-hidden /> {t("edit.studio.trimExisting")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (take?.origin === "existing") discardTake();
                      setReplacing(null);
                    }}
                  >
                    {t("edit.studio.cancelReplace")}
                  </Button>
                </div>
              </div>
            )}
            <Take
              state={rec.state}
              level={rec.level}
              take={
                take
                  ? { url: playUrl ?? take.url, buffer: takeBuffer, decodeState, source: take }
                  : null
              }
              trim={shownTrim}
              trimmed={isTrimmed}
              onTrim={setTrim}
              onResetTrim={() => setTrim(null)}
              disabled={!consent || upload.isPending}
              micDisabled={!consent || upload.isPending || rec.unsupported || rec.denied}
              onStart={startTake}
              onStop={rec.stop}
              onRetake={discardTake}
              onUpload={save}
              onSkip={() => {
                setItemNote(null);
                if (current.kind === "click") skipCurrent();
                else setSkipNote("");
              }}
              onPlay={playTake}
              onChooseFile={() => fileInput.current?.click()}
              uploading={upload.isPending}
            />
            <input
              ref={fileInput}
              type="file"
              accept={AUDIO_FILE_ACCEPT}
              className="hidden"
              data-testid="studio-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) takeFile(file);
                e.target.value = "";
              }}
            />
            {(rec.unsupported || rec.denied) && (
              <p className="mt-3 text-sm text-coral-deep">{t("lesson.noMic")}</p>
            )}
            {skipNote !== null && (
              <form
                className="mt-4 space-y-2 rounded-2xl bg-sand p-4"
                data-testid="studio-skip-note"
                onSubmit={(e) => {
                  e.preventDefault();
                  void skipWithNote();
                }}
              >
                <label className="block text-sm font-semibold text-indigo">
                  {t("edit.studio.skipNote.label")}
                  <textarea
                    value={skipNote}
                    onChange={(e) => setSkipNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSkipNote(null);
                    }}
                    rows={3}
                    maxLength={CONTENT_NOTE_MAX}
                    autoFocus
                    className="mt-1 block w-full rounded-xl border border-mist-soft bg-white p-2 font-normal text-ink"
                  />
                </label>
                <p className="text-xs text-mist">{t("edit.studio.skipNote.hint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={sendNote.isPending}>
                    {t(
                      skipNote.trim()
                        ? "edit.studio.skipNote.sendAndSkip"
                        : "edit.studio.skipNote.skipOnly",
                    )}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSkipNote(null)}>
                    {t("edit.studio.skipNote.cancel")}
                  </Button>
                </div>
              </form>
            )}
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => go(safeIndex - 1)}
                disabled={safeIndex === 0}
                aria-label={t("edit.studio.previous")}
              >
                <ChevronLeft size={16} />
              </Button>
              <p className="text-xs text-mist">
                {t("edit.studio.hint")}
                {current?.kind === "click" && (
                  <span className="mt-1 block">{t("edit.studio.clickHint")}</span>
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => go(safeIndex + 1)}
                disabled={safeIndex >= items.length - 1}
                aria-label={t("edit.studio.next")}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-mist">
            <QueueStatus queue={queue} />
          </div>
        )}
      </div>
      {bulkOpen && (
        <BulkUpload
          items={items}
          speakerId={speakerId}
          onClose={() => setBulkOpen(false)}
          onUploaded={async (ids) => {
            setUploaded((s) => {
              const next = new Set(s);
              for (const id of ids) next.add(id);
              return next;
            });
            setSessionCount((n) => n + ids.length);
            void qc.invalidateQueries({ queryKey: ["audio-backlog"] });
            await qc.invalidateQueries({ queryKey: ["audio-queue"] });
          }}
        />
      )}
    </section>
  );
}

/** Loading, failed or genuinely empty: a failed fetch must never read as "all done" (audit W06). */
function QueueStatus({
  queue,
}: {
  queue: { isPending: boolean; isError: boolean; refetch: () => unknown };
}) {
  const t = useT();
  if (queue.isPending) return <>{t("common.loading")}</>;
  if (queue.isError)
    return (
      <span role="alert" className="flex flex-wrap items-center gap-2 text-coral-deep">
        {t("edit.studio.loadFailed")}
        <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
          {t("common.retry")}
        </Button>
      </span>
    );
  return <>{t("edit.studio.nothing")}</>;
}

function Take({
  state,
  level,
  take,
  trim,
  trimmed,
  onTrim,
  onResetTrim,
  disabled,
  micDisabled,
  uploading,
  onStart,
  onStop,
  onRetake,
  onUpload,
  onSkip,
  onPlay,
  onChooseFile,
}: {
  state: "idle" | "recording" | "done";
  level: number;
  /** `url` is what will be uploaded: the trimmed clip once a handle has moved. */
  take: {
    url: string;
    buffer: AudioBuffer | null;
    decodeState: DecodeState;
    source: TakeSource;
  } | null;
  trim: Trim | null;
  trimmed: boolean;
  onTrim: (next: Trim) => void;
  onResetTrim: () => void;
  disabled: boolean;
  micDisabled: boolean;
  uploading: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetake: () => void;
  onUpload: () => void;
  onSkip: () => void;
  onPlay: () => void;
  onChooseFile: () => void;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  return (
    <div
      className={`rounded-3xl border-2 p-5 ${state === "recording" ? "border-coral bg-coral-soft/40" : "border-mist-soft bg-sand"}`}
    >
      {state === "recording" ? (
        <div
          className="flex h-16 items-end justify-center gap-0.5 overflow-hidden sm:gap-1"
          aria-live="polite"
          aria-label={t("edit.studio.recording")}
        >
          {Array.from({ length: 32 }, (_, i) => (
            <motion.span
              key={i}
              className={`w-1.5 shrink-0 rounded-full sm:w-2 ${level > 0.9 ? "bg-coral-deep" : "bg-coral"}`}
              animate={{
                height: reduced
                  ? 12
                  : Math.max(6, level * 64 * (0.5 + Math.abs(Math.sin(i * 1.7)) * 0.8)),
              }}
              transition={{ duration: 0.08 }}
            />
          ))}
        </div>
      ) : take && take.buffer && take.buffer.duration > 0 && trim ? (
        <AudioTrimmer buffer={take.buffer} trim={trim} onChange={onTrim} disabled={uploading} />
      ) : take ? (
        <>
          <Waveform buffer={take.buffer} progress={1} tone="sea" height={64} />
          <p className="mt-2 text-xs text-mist">
            {take.decodeState === "failed"
              ? take.source.origin === "file"
                ? t("edit.studio.fileUnreadable")
                : t("edit.audioQa.undecodable")
              : t("edit.audioQa.decoding")}
          </p>
        </>
      ) : (
        <div className="flex h-16 items-center justify-center text-sm text-mist">
          {t("edit.recorder.levelHint")}
        </div>
      )}
      {take?.source.origin === "file" && take.source.name && (
        <p className="mt-2 text-xs font-semibold text-indigo" data-testid="studio-file-name">
          <FileAudio size={14} className="mr-1 inline" aria-hidden />
          {t("edit.studio.fileTake", { name: take.source.name })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state !== "recording" ? (
          <button
            type="button"
            disabled={micDisabled}
            onClick={onStart}
            className="pressable inline-flex h-16 w-16 items-center justify-center rounded-full border-coral-deep bg-coral text-white shadow-card disabled:opacity-40"
            aria-label={take ? t("edit.studio.retake") : t("edit.studio.record")}
          >
            <Mic size={28} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="pressable inline-flex h-16 w-16 items-center justify-center rounded-full border-indigo-deep bg-indigo text-white shadow-card"
            aria-label={t("edit.studio.stop")}
          >
            <Square size={24} fill="currentColor" />
          </button>
        )}
        <span className="text-sm font-semibold text-indigo">
          {state === "recording"
            ? t("edit.studio.recording")
            : take
              ? t("edit.studio.take")
              : t("edit.studio.record")}
        </span>
        {take && state !== "recording" && (
          <Button variant="sea" size="sm" onClick={onPlay} aria-keyshortcuts="P">
            <Play size={16} aria-hidden />
            {trimmed ? t("edit.audioQa.preview") : t("edit.studio.play")}
          </Button>
        )}
        {trimmed && (
          <Button variant="ghost" size="sm" onClick={onResetTrim}>
            {t("edit.audioQa.reset")}
          </Button>
        )}
        {state !== "recording" && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onChooseFile}
            title={t("edit.studio.useFileHint")}
          >
            <FileAudio size={16} aria-hidden /> {t("edit.studio.useFile")}
          </Button>
        )}
        <span className="grow" />
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t("edit.studio.skip")}
        </Button>
        {take && (
          <>
            <Button variant="outline" size="sm" onClick={onRetake}>
              {t("edit.studio.retake")}
            </Button>
            <Button variant="sea" disabled={disabled || uploading} onClick={onUpload}>
              {t("edit.studio.upload")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Several files at once, each named after the word or letter it says. The
 * matches are shown, and playable, before anything leaves the browser;
 * a file whose name fits no item, or more than one, is listed and never
 * guessed at. Each upload is the same tier-1 upload the record button makes.
 */
function BulkUpload({
  items,
  speakerId,
  onClose,
  onUploaded,
}: {
  items: readonly AudioQueueItem[];
  speakerId: string;
  onClose: () => void;
  onUploaded: (ids: string[]) => Promise<unknown>;
}) {
  const t = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const matches = useMemo(() => matchFiles(files, items), [files, items]);
  const urls = useMemo(() => new Map(files.map((f) => [f, URL.createObjectURL(f)])), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const run = async () => {
    const list = matches.matched;
    setProgress({ done: 0, total: list.length });
    const ok: string[] = [];
    for (const [i, { file, item }] of list.entries()) {
      try {
        await uploadAudio({
          file,
          filename: `${safeName(item.text)}__${speakerId.slice(0, 8)}__t1.${extensionFor(file.type, file.name)}`,
          targetKind: item.kind,
          targetId: item.id,
          speakerId,
          tier: "1_native_studio",
          licence: "proprietary-molo",
        });
        ok.push(item.id);
      } catch (e) {
        toast.error(
          t("edit.studio.bulk.failed", {
            name: file.name,
            error: e instanceof Error ? e.message : t("common.error"),
          }),
        );
      }
      setProgress({ done: i + 1, total: list.length });
    }
    if (ok.length > 0) toast.success(t("edit.studio.bulk.done", { count: ok.length }));
    await onUploaded(ok);
    setProgress(null);
    if (ok.length === list.length) onClose();
    else
      setFiles((fs) => fs.filter((f) => !list.some((m) => m.file === f && ok.includes(m.item.id))));
  };

  const busy = progress !== null;
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-3xl bg-cloud p-5 text-ink shadow-pop backdrop:bg-ink/40"
      aria-labelledby="bulk-title"
      data-testid="studio-bulk"
    >
      <h2 id="bulk-title" className="font-display text-xl font-bold text-indigo">
        {t("edit.studio.bulk.title")}
      </h2>
      <p className="mt-2 text-sm text-mist">{t("edit.studio.bulk.help")}</p>
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-mist-soft bg-sand px-3 py-2 text-sm font-semibold text-indigo">
        <FileAudio size={16} aria-hidden /> {t("edit.studio.bulk.choose")}
        <input
          type="file"
          multiple
          accept={AUDIO_FILE_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
        />
      </label>
      {files.length === 0 ? (
        <p className="mt-4 text-sm text-mist">{t("edit.studio.bulk.none")}</p>
      ) : (
        <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto">
          <section>
            <h3 className="text-sm font-bold text-indigo">
              {t("edit.studio.bulk.matched", { count: matches.matched.length })}
            </h3>
            <ul className="mt-1 space-y-1 text-sm" data-testid="bulk-matched">
              {matches.matched.map(({ file, item }) => (
                <li key={file.name} className="flex items-center gap-2">
                  <AudioButton url={urls.get(file)} label={file.name} size="sm" tone="sea" />
                  <span className="truncate text-mist">{file.name}</span>
                  <span aria-hidden>→</span>
                  <span className="font-display font-bold text-indigo" lang="xh">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {matches.unmatched.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-coral-deep">
                {t("edit.studio.bulk.unmatched", { count: matches.unmatched.length })}
              </h3>
              <ul className="mt-1 space-y-1 text-sm" data-testid="bulk-unmatched">
                {matches.unmatched.map(({ file, reason }) => (
                  <li key={file.name}>
                    <span className="font-semibold">{file.name}</span>{" "}
                    <span className="text-mist">
                      {reason === "ambiguous"
                        ? t("edit.studio.bulk.ambiguous")
                        : reason === "duplicate"
                          ? t("edit.studio.bulk.duplicate")
                          : t("edit.studio.bulk.unmatchedHelp")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {progress && (
          <span className="text-sm text-mist" role="status">
            {t("edit.studio.bulk.progress", progress)}
          </span>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          {t("edit.studio.bulk.cancel")}
        </Button>
        <Button
          variant="sea"
          size="sm"
          disabled={busy || matches.matched.length === 0}
          onClick={() => void run()}
        >
          <Upload size={16} aria-hidden />
          {t("edit.studio.bulk.upload", { count: matches.matched.length })}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * The queue as a disclosure: open beside the panel on a wide screen, and
 * collapsed under it on a phone, where 500 rows would otherwise push the
 * word and the record button a thousand pixels down (W04).
 */
function QueueDisclosure({ count, children }: { count: number; children: ReactNode }) {
  const t = useT();
  // Uncontrolled on purpose: React re-applying an `open` prop fought the
  // browser's own toggle, so the width decides once on mount and again when
  // the viewport crosses lg; in between the editor opens and closes it.
  const ref = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (ref.current) ref.current.open = wide.matches;
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);
  return (
    <details
      ref={ref}
      className="order-3 min-w-0 rounded-3xl bg-cloud p-4 shadow-card lg:order-none"
      data-testid="studio-queue"
    >
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-indigo lg:hidden">
        {t("edit.studio.queueList", { count })}
      </summary>
      {children}
    </details>
  );
}

function NewSpeaker({ onCreated }: { onCreated: () => Promise<unknown> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (fd: FormData) =>
      createSpeaker({
        displayName: String(fd.get("displayName") ?? ""),
        region: String(fd.get("region") ?? ""),
        gender: String(fd.get("gender") ?? "") || null,
        ageGroup: (String(fd.get("ageGroup") ?? "") || null) as
          | "child"
          | "teen"
          | "adult"
          | "elder"
          | null,
        consentScope:
          (fd.get("consentScope") as "internal" | "published" | "commercial") ?? "internal",
      }),
    onSuccess: async () => {
      setOpen(false);
      await onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-semibold text-indigo underline decoration-sun decoration-2 underline-offset-4"
      >
        + {t("edit.speakers")}
      </button>
    );
  const field = "w-full rounded-xl border-2 border-mist-soft bg-cloud px-2 py-1.5 text-sm";
  return (
    <form
      className="mt-3 space-y-2 border-t border-sand-deep pt-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(new FormData(e.currentTarget));
      }}
    >
      <input
        name="displayName"
        required
        placeholder={t("edit.recorder.displayName")}
        aria-label={t("edit.recorder.displayName")}
        className={field}
      />
      <input
        name="region"
        placeholder={t("edit.recorder.region")}
        aria-label={t("edit.recorder.region")}
        className={field}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          name="gender"
          className={field}
          defaultValue=""
          aria-label={t("edit.recorder.gender")}
        >
          <option value="">
            {t("edit.recorder.gender")}: {t("edit.recorder.genderAny")}
          </option>
          <option value="female">{t("edit.recorder.female")}</option>
          <option value="male">{t("edit.recorder.male")}</option>
        </select>
        <select
          name="ageGroup"
          className={field}
          defaultValue=""
          aria-label={t("edit.recorder.ageGroup")}
        >
          <option value="">{t("edit.recorder.ageGroup")}</option>
          <option value="child">{t("edit.recorder.child")}</option>
          <option value="teen">{t("edit.recorder.teen")}</option>
          <option value="adult">{t("edit.recorder.adult")}</option>
          <option value="elder">{t("edit.recorder.elder")}</option>
        </select>
      </div>
      <select
        name="consentScope"
        className={field}
        defaultValue="internal"
        aria-label={t("edit.recorder.consentLabel")}
      >
        <option value="internal">
          {t("edit.recorder.consentLabel")}: {t("edit.recorder.consent.internal")}
        </option>
        <option value="published">
          {t("edit.recorder.consentLabel")}: {t("edit.recorder.consent.published")}
        </option>
        <option value="commercial">
          {t("edit.recorder.consentLabel")}: {t("edit.recorder.consent.commercial")}
        </option>
      </select>
      <p className="text-xs text-mist">{t("edit.recorder.consentHelp")}</p>
      <Button type="submit" variant="indigo" size="sm">
        {t("edit.lexeme.save")}
      </Button>
    </form>
  );
}
