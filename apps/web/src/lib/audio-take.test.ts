import { describe, expect, it } from "vitest";

import { analyseTake, envelope, sliceToWav } from "../lib/audio-take.ts";

/**
 * The pure half of the studio's audio QA. A wrong WAV header would be
 * rejected by `xh-audio` long after the speaker went home, so the bytes are
 * asserted here rather than trusted.
 */
const RATE = 8000;

function fakeBuffer(samples: number[], channels = 1): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    sampleRate: RATE,
    numberOfChannels: channels,
    length: data.length,
    duration: data.length / RATE,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("analyseTake", () => {
  it("reports duration and peak, and flags a clipped take", () => {
    const a = analyseTake(fakeBuffer([0, 0.5, -1, 0.25]));
    expect(a.durationSec).toBeCloseTo(4 / RATE);
    expect(a.peak).toBe(1);
    expect(a.peakDbfs).toBeCloseTo(0);
    expect(a.clipping).toBe(true);
    expect(a.quiet).toBe(false);
  });

  it("flags a take that never got near the microphone", () => {
    const a = analyseTake(fakeBuffer([0.01, -0.02, 0.03]));
    expect(a.clipping).toBe(false);
    expect(a.quiet).toBe(true);
  });

  it("treats silence as neither clipped nor quiet, because there is nothing to judge", () => {
    const a = analyseTake(fakeBuffer([0, 0, 0]));
    expect(a.peak).toBe(0);
    expect(a.clipping).toBe(false);
    expect(a.quiet).toBe(false);
  });
});

describe("envelope", () => {
  it("keeps the loudest sample in each column, so a click is not averaged away", () => {
    const peaks = envelope(fakeBuffer([0, 0, 0.9, 0, 0, 0, 0, 0]), 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(0.9);
    expect(peaks[1]).toBe(0);
  });
});

describe("sliceToWav", () => {
  const samples = Array.from({ length: 800 }, (_, i) => Math.sin(i / 10) * 0.5);

  it("writes a 16-bit PCM WAV header that matches the slice", async () => {
    const blob = sliceToWav(fakeBuffer(samples), 0.01, 0.06); // 80..480 → 400 frames
    expect(blob.type).toBe("audio/wav");
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (o: number, n: number) =>
      String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(o + i)));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(ascii(36, 4)).toBe("data");
    const frames = 400;
    expect(view.getUint32(40, true)).toBe(frames * 2);
    expect(view.byteLength).toBe(44 + frames * 2);
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8);
  });

  it("keeps the samples the handles chose", async () => {
    const blob = sliceToWav(fakeBuffer(samples), 0.01, 0.0125); // frames 80..100
    const view = new DataView(await blob.arrayBuffer());
    const first = view.getInt16(44, true);
    expect(first).toBe(Math.round((samples[80] as number) * 32767));
  });

  it("never writes an empty data chunk", async () => {
    const blob = sliceToWav(fakeBuffer(samples), 0.05, 0.05);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint32(40, true)).toBeGreaterThan(0);
  });
});
