/**
 * The pure half of the studio's audio QA (docs/EDITOR-GUIDE.md "Recording
 * session"): measuring a take and cutting it. No React, no DOM beyond the
 * decoded `AudioBuffer`, so it can be tested without a browser.
 *
 * Trimming here is a convenience, not the pipeline. `xh-audio` still trims
 * silence, normalises to -16 LUFS and re-encodes on the server; this only
 * decides which seconds it is handed.
 */

/** Below this a trim is pointless and a decoder may choke. */
export const MIN_TRIM_SEC = 0.1;
/** Anything at or above this in the source counts as clipped. */
export const CLIP_THRESHOLD = 0.985;
/** A take whose loudest sample is under this was almost certainly too far from the mic. */
const QUIET_THRESHOLD = 0.06;

export interface Trim {
  readonly startSec: number;
  readonly endSec: number;
}

export interface TakeAnalysis {
  readonly durationSec: number;
  /** Loudest absolute sample, 0..1. */
  readonly peak: number;
  readonly peakDbfs: number;
  readonly clipping: boolean;
  readonly quiet: boolean;
}

export function analyseTake(buffer: AudioBuffer): TakeAnalysis {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] ?? 0);
      if (v > peak) peak = v;
    }
  }
  return {
    durationSec: buffer.duration,
    peak,
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    clipping: peak >= CLIP_THRESHOLD,
    quiet: peak > 0 && peak < QUIET_THRESHOLD,
  };
}

/** Min/max envelope per pixel column, so a click is not averaged away. */
export function envelope(buffer: AudioBuffer, columns: number): Float32Array {
  const out = new Float32Array(columns);
  const data = buffer.getChannelData(0);
  const step = data.length / columns;
  for (let c = 0; c < columns; c++) {
    const from = Math.floor(c * step);
    const to = Math.min(data.length, Math.floor((c + 1) * step));
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(data[i] ?? 0);
      if (v > peak) peak = v;
    }
    out[c] = peak;
  }
  return out;
}

/**
 * A slice of the decoded take as a 16-bit PCM WAV. WAV because it is what
 * the browser can write without a dependency and what symphonia (and so
 * `xh-audio`) reads first; the pipeline re-encodes to Opus anyway. An
 * untrimmed take is uploaded as recorded, so this runs only when an editor
 * has actually moved a handle.
 */
export function sliceToWav(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const rate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const from = Math.max(0, Math.floor(startSec * rate));
  const to = Math.min(buffer.length, Math.ceil(endSec * rate));
  const frames = Math.max(1, to - from);
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, data[ch]?.[from + i] ?? 0));
      view.setInt16(offset, Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
