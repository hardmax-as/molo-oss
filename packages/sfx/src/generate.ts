/**
 * Generates the learner apps' sound effects as 16-bit mono WAV files.
 * Deterministic: same code, same bytes. Run `bun packages/sfx/src/generate.ts`
 * after changing a recipe and commit the outputs; web imports them through
 * Vite, mobile bundles them through Metro.
 *
 * Design notes: short (under 900 ms), soft attack, no clipping, tuned to a
 * pentatonic-ish palette so consecutive sounds never clash. "wrong" is
 * gentle on purpose: a learner who just missed a click consonant should not
 * be punished by the UI.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44_100;

type Wave = "sine" | "triangle" | "square" | "saw";

interface Note {
  /** Hz */
  readonly freq: number;
  /** seconds from the start of the clip */
  readonly at: number;
  /** seconds */
  readonly dur: number;
  readonly gain?: number;
  readonly wave?: Wave;
  /** Exponential pitch glide target, Hz (for whooshes). */
  readonly glideTo?: number;
}

function osc(wave: Wave, phase: number): number {
  const p = phase % 1;
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * p);
    case "triangle":
      return 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
    case "square":
      return p < 0.5 ? 1 : -1;
    case "saw":
      return 2 * p - 1;
  }
}

/** Attack-decay-sustain-release envelope, all in seconds, returns 0..1. */
function env(t: number, dur: number, a = 0.008, r = 0.12): number {
  if (t < 0 || t > dur) return 0;
  if (t < a) return t / a;
  if (t > dur - r) return Math.max(0, (dur - t) / r);
  return 1;
}

function render(notes: readonly Note[], seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  for (const n of notes) {
    const gain = n.gain ?? 0.5;
    const wave = n.wave ?? "sine";
    let phase = 0;
    const start = Math.floor(n.at * RATE);
    const len = Math.floor(n.dur * RATE);
    for (let i = 0; i < len && start + i < out.length; i++) {
      const t = i / RATE;
      const f = n.glideTo ? n.freq * Math.pow(n.glideTo / n.freq, t / n.dur) : n.freq;
      phase += f / RATE;
      // A touch of second harmonic warms the sine without sounding like a synth preset.
      const s = osc(wave, phase) + (wave === "sine" ? 0.15 * Math.sin(4 * Math.PI * phase) : 0);
      out[start + i] = (out[start + i] ?? 0) + s * gain * env(t, n.dur);
    }
  }
  // Soft limiter so stacked notes never clip.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0.89 ? 0.89 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * k;
  return out;
}

function wav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, Math.round(s * 32_767), true);
  }
  return bytes;
}

// Pentatonic palette around A4 (440): A C# E F# A C# E
const A4 = 440;
const CS5 = 554.37;
const E5 = 659.25;
const FS5 = 739.99;
const A5 = 880;
const CS6 = 1108.73;
const E6 = 1318.51;

export const RECIPES: Record<string, { notes: Note[]; seconds: number }> = {
  /** Correct answer: a bright two-note lift. */
  correct: {
    seconds: 0.45,
    notes: [
      { freq: E5, at: 0, dur: 0.16, gain: 0.5 },
      { freq: A5, at: 0.11, dur: 0.3, gain: 0.55 },
    ],
  },
  /** Wrong answer: a soft low "hm", not a buzzer. */
  wrong: {
    seconds: 0.4,
    notes: [
      { freq: 220, at: 0, dur: 0.22, gain: 0.35, wave: "triangle" },
      { freq: 196, at: 0.14, dur: 0.24, gain: 0.3, wave: "triangle" },
    ],
  },
  /** Tap or tile placement: a tiny click. */
  tap: {
    seconds: 0.08,
    notes: [{ freq: 1400, at: 0, dur: 0.05, gain: 0.25, glideTo: 900 }],
  },
  /** Lesson finished: rising arpeggio. */
  lesson_complete: {
    seconds: 0.9,
    notes: [
      { freq: A4, at: 0, dur: 0.22, gain: 0.45 },
      { freq: CS5, at: 0.12, dur: 0.22, gain: 0.45 },
      { freq: E5, at: 0.24, dur: 0.24, gain: 0.5 },
      { freq: A5, at: 0.36, dur: 0.5, gain: 0.55 },
      { freq: E6, at: 0.5, dur: 0.38, gain: 0.25 },
    ],
  },
  /** Perfect lesson: the arpeggio plus a shimmer on top. */
  perfect: {
    seconds: 1.1,
    notes: [
      { freq: A4, at: 0, dur: 0.2, gain: 0.45 },
      { freq: CS5, at: 0.1, dur: 0.2, gain: 0.45 },
      { freq: E5, at: 0.2, dur: 0.2, gain: 0.5 },
      { freq: A5, at: 0.3, dur: 0.5, gain: 0.55 },
      { freq: CS6, at: 0.42, dur: 0.5, gain: 0.35 },
      { freq: E6, at: 0.54, dur: 0.5, gain: 0.3 },
      { freq: A5 * 2, at: 0.66, dur: 0.42, gain: 0.18, wave: "triangle" },
    ],
  },
  /** Streak extended: a whoosh into a ping. */
  streak: {
    seconds: 0.7,
    notes: [
      { freq: 300, at: 0, dur: 0.3, gain: 0.3, wave: "saw", glideTo: 1200 },
      { freq: FS5, at: 0.26, dur: 0.4, gain: 0.5 },
    ],
  },
  /** Level up: short fanfare. */
  level_up: {
    seconds: 1.0,
    notes: [
      { freq: E5, at: 0, dur: 0.14, gain: 0.45, wave: "triangle" },
      { freq: E5, at: 0.16, dur: 0.14, gain: 0.45, wave: "triangle" },
      { freq: A5, at: 0.32, dur: 0.6, gain: 0.55, wave: "triangle" },
      { freq: CS6, at: 0.44, dur: 0.5, gain: 0.35 },
    ],
  },
  /** Crown earned: slow, wide chord. */
  crown: {
    seconds: 1.3,
    notes: [
      { freq: A4, at: 0, dur: 1.2, gain: 0.3 },
      { freq: CS5, at: 0.05, dur: 1.15, gain: 0.3 },
      { freq: E5, at: 0.1, dur: 1.1, gain: 0.3 },
      { freq: A5, at: 0.3, dur: 0.9, gain: 0.35 },
      { freq: E6, at: 0.6, dur: 0.6, gain: 0.2 },
    ],
  },
  /** Click drill: a dry tick for the "listen" cue before the speaker plays. */
  cue: {
    seconds: 0.12,
    notes: [{ freq: 2000, at: 0, dur: 0.06, gain: 0.2, glideTo: 1500 }],
  },
};

export const SOUND_NAMES = Object.keys(RECIPES) as (keyof typeof RECIPES)[];

if (import.meta.main) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, "..", "sounds");
  mkdirSync(outDir, { recursive: true });
  for (const [name, r] of Object.entries(RECIPES)) {
    const bytes = wav(render(r.notes, r.seconds));
    writeFileSync(join(outDir, `${name}.wav`), bytes);
    console.log(`${name}.wav ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}
