import { motion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * A bar waveform from decoded audio, with a sweep while playing. Used by
 * the speak exercise and the studio so a learner can *see* their take
 * against the speaker's. Falls back to flat bars when decoding fails
 * (cross-origin clips without CORS, for instance).
 */
export function Waveform({
  buffer,
  progress = 0,
  tone = "indigo",
  bars = 40,
  height = 56,
  className = "",
}: {
  buffer: AudioBuffer | null;
  /** 0..1 of the clip that has played. */
  progress?: number;
  tone?: "indigo" | "sea" | "sun";
  bars?: number;
  height?: number;
  className?: string;
}) {
  const peaks = usePeaks(buffer, bars);
  const colour = { indigo: "#26264F", sea: "#1FA38C", sun: "#F6B73C" }[tone];
  const w = 100 / bars;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden
    >
      {peaks.map((p, i) => {
        const h = Math.max(3, p * (height - 4));
        const played = i / bars < progress;
        return (
          <motion.rect
            key={i}
            x={i * w + w * 0.15}
            width={w * 0.7}
            rx={w * 0.35}
            initial={{ height: 3, y: height / 2 - 1.5 }}
            animate={{ height: h, y: height / 2 - h / 2 }}
            transition={{ duration: 0.4, delay: i * 0.008 }}
            fill={colour}
            opacity={played ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}

function usePeaks(buffer: AudioBuffer | null, bars: number): number[] {
  const [peaks, setPeaks] = useState<number[]>(() => Array.from({ length: bars }, () => 0.08));
  useEffect(() => {
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const out: number[] = [];
    let max = 0;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * step;
      for (let j = start; j < start + step && j < data.length; j += 4)
        peak = Math.max(peak, Math.abs(data[j] ?? 0));
      out.push(peak);
      max = Math.max(max, peak);
    }
    setPeaks(out.map((p) => (max > 0 ? p / max : 0)));
  }, [buffer, bars]);
  return peaks;
}

export type DecodeState = "idle" | "decoding" | "ready" | "failed";

/**
 * Decodes a URL or blob into an AudioBuffer, reporting where it got to.
 * The studio needs the difference between "still reading" and "this take
 * cannot be drawn"; the exercises only want the buffer.
 */
export function useDecodedAudioState(source: string | Blob | null | undefined): {
  buffer: AudioBuffer | null;
  state: DecodeState;
} {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [state, setState] = useState<DecodeState>("idle");
  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    if (!source || typeof window === "undefined") {
      setState("idle");
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setState("failed");
      return;
    }
    setState("decoding");
    const ctx = new Ctor();
    const bytes =
      typeof source === "string"
        ? fetch(source, { credentials: "include" }).then((r) => r.arrayBuffer())
        : source.arrayBuffer();
    bytes
      .then((b) => ctx.decodeAudioData(b))
      .then((decoded) => {
        if (!cancelled) {
          setBuffer(decoded);
          setState("ready");
        }
        return decoded;
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      })
      .finally(() => void ctx.close());
    return () => {
      cancelled = true;
    };
  }, [source]);
  return { buffer, state };
}

/** Decodes a URL or blob into an AudioBuffer; null when it cannot (kept quiet on purpose). */
export function useDecodedAudio(source: string | Blob | null | undefined): AudioBuffer | null {
  return useDecodedAudioState(source).buffer;
}
