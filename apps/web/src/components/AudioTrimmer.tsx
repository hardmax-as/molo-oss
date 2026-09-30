import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  analyseTake,
  CLIP_THRESHOLD,
  envelope,
  MIN_TRIM_SEC,
  type Trim,
} from "~/lib/audio-take.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * Audio QA for a studio take (docs/EDITOR-GUIDE.md "Recording session").
 *
 * The take is decoded with `AudioContext.decodeAudioData` and drawn on a
 * canvas so a speaker can *see* what they recorded: how long it is, how
 * close to clipping it came, and how much silence sits at either end. The
 * two handles cut the start and the end. Nothing here writes an
 * audio_assets row, and nothing here publishes anything.
 */

const fmt = (seconds: number) => (Math.round(seconds * 100) / 100).toFixed(2);

/**
 * Waveform, numbers and two draggable handles. The handles are sliders:
 * they carry `role="slider"` with a value in seconds, so they work from the
 * keyboard (arrows, Page keys, Home/End) and read out sensibly.
 */
export function AudioTrimmer({
  buffer,
  trim,
  onChange,
  disabled = false,
}: {
  buffer: AudioBuffer;
  trim: Trim;
  /** Called when a handle is released, or on each keyboard step. */
  onChange: (next: Trim) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const analysis = useMemo(() => analyseTake(buffer), [buffer]);
  const duration = analysis.durationSec;
  // While a handle is held the value lives here, so dragging never rebuilds
  // anything downstream; `onChange` fires once, on release.
  const [drag, setDrag] = useState<Trim | null>(null);
  const shown = drag ?? trim;

  const clamp = useCallback(
    (next: Trim): Trim => {
      const start = Math.min(Math.max(0, next.startSec), Math.max(0, duration - MIN_TRIM_SEC));
      const end = Math.max(Math.min(duration, next.endSec), start + MIN_TRIM_SEC);
      return { startSec: start, endSec: Math.min(end, duration) };
    },
    [duration],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 96;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const columns = Math.max(1, Math.floor(width));
    const peaks = envelope(buffer, columns);
    const mid = height / 2;
    const fromX = (shown.startSec / duration) * width;
    const toX = (shown.endSec / duration) * width;
    for (let c = 0; c < columns; c++) {
      const inside = c >= fromX && c <= toX;
      const p = peaks[c] ?? 0;
      const h = Math.max(1, p * (height - 6));
      // Kept: sea. Cut: mist. Clipped columns are coral so the eye finds them.
      ctx.fillStyle = !inside ? "#C7C9D9" : p >= CLIP_THRESHOLD ? "#F07171" : "#1FA38C";
      ctx.fillRect(c, mid - h / 2, 1, h);
    }
    ctx.strokeStyle = "#C7C9D9";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
  }, [buffer, duration, shown.startSec, shown.endSec]);

  const fractionAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const handleProps = (which: "start" | "end") => {
    const value = which === "start" ? shown.startSec : shown.endSec;
    const step = (delta: number) => {
      const next = clamp(
        which === "start"
          ? { ...shown, startSec: value + delta }
          : { ...shown, endSec: value + delta },
      );
      setDrag(null);
      onChange(next);
    };
    return {
      role: "slider" as const,
      tabIndex: disabled ? -1 : 0,
      "aria-label": t(which === "start" ? "edit.audioQa.trimStart" : "edit.audioQa.trimEnd"),
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(duration * 100) / 100,
      "aria-valuenow": Math.round(value * 100) / 100,
      "aria-valuetext": t("edit.audioQa.duration", { seconds: fmt(value) }),
      "aria-disabled": disabled || undefined,
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (disabled) return;
        const fine = e.shiftKey ? 0.1 : 0.01;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") step(-fine);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") step(fine);
        else if (e.key === "PageDown") step(-0.5);
        else if (e.key === "PageUp") step(0.5);
        else if (e.key === "Home") step(-duration);
        else if (e.key === "End") step(duration);
        else return;
        e.preventDefault();
        // The studio binds the arrows to "previous / next word" on window.
        e.stopPropagation();
      },
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(shown);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const at = fractionAt(e.clientX) * duration;
        setDrag(clamp(which === "start" ? { ...shown, startSec: at } : { ...shown, endSec: at }));
      },
      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (drag) onChange(drag);
        setDrag(null);
      },
      onLostPointerCapture: () => setDrag(null),
    };
  };

  const kept = shown.endSec - shown.startSec;
  const pct = (seconds: number) => `${(seconds / duration) * 100}%`;
  const grip =
    "absolute top-0 h-full w-4 -translate-x-1/2 cursor-ew-resize touch-none rounded-full bg-indigo/80 " +
    "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sun " +
    (reduced ? "" : "transition-colors");

  return (
    <div className="mt-4" data-audio-qa>
      <p id={labelId} className="mb-1 text-sm font-semibold text-indigo">
        {t("edit.audioQa.title")}
      </p>
      <div
        ref={trackRef}
        role="group"
        aria-labelledby={labelId}
        className="relative h-24 w-full select-none rounded-2xl border-2 border-mist-soft bg-cloud"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          role="img"
          aria-label={t("edit.audioQa.waveform", { seconds: fmt(duration) })}
        />
        <div
          className="pointer-events-none absolute inset-y-0 bg-indigo/10"
          style={{ left: 0, width: pct(shown.startSec) }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 bg-indigo/10"
          style={{ left: pct(shown.endSec), right: 0 }}
          aria-hidden
        />
        <div {...handleProps("start")} className={grip} style={{ left: pct(shown.startSec) }} />
        <div {...handleProps("end")} className={grip} style={{ left: pct(shown.endSec) }} />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
        <span>{t("edit.audioQa.duration", { seconds: fmt(duration) })}</span>
        <span>
          {t("edit.audioQa.peak", {
            db: Number.isFinite(analysis.peakDbfs) ? analysis.peakDbfs.toFixed(1) : "−∞",
          })}
        </span>
        <span>{t("edit.audioQa.trimmedLength", { seconds: fmt(kept) })}</span>
      </p>
      {analysis.clipping && (
        <p role="alert" className="mt-1 text-sm font-semibold text-coral-deep">
          {t("edit.audioQa.clipping")}
        </p>
      )}
      {analysis.quiet && (
        <p role="alert" className="mt-1 text-sm font-semibold text-ochre-deep">
          {t("edit.audioQa.quiet")}
        </p>
      )}
      <p className="mt-1 text-xs text-mist">{t("edit.audioQa.trimHint")}</p>
    </div>
  );
}
