import type { AudioRef, UnitResponse } from "@molo/core";

import {
  audioRefsOf,
  classifyFailure,
  downloadFailure,
  estimateBytes,
  formatBytes,
  hasRoomFor,
  localiseUnit,
  runDownload,
  type DownloadPorts,
  type DownloadProgress,
  type DownloadRecord,
} from "./download-logic.ts";

const ref = (id: string, durationMs = 1000): AudioRef => ({
  id,
  url: `https://api.molo.test/audio/${id}.opus`,
  tier: "1_native_studio",
  durationMs,
  attribution: null,
  speaker: null,
});

function unitWith(refs: readonly AudioRef[]): UnitResponse {
  // Indexed rather than destructured: array destructuring makes Babel reach
  // for a @babel/runtime helper that does not resolve here (see the module).
  const first = refs[0];
  const second = refs[1];
  const third = refs[2];
  return {
    unit: {
      id: "u",
      slug: "greetings",
      titleKey: "units.unit1.title",
      order: 1,
      cefrBand: "A1",
      prerequisiteUnitId: null,
      lessonCount: 1,
      locked: false,
      prerequisiteSlug: null,
      prerequisiteTitleKey: null,
      skills: [],
    },
    sourceLang: "en",
    lexemes: first
      ? {
          lx: {
            id: "lx",
            lemma: "molo",
            pos: "interjection",
            nounClass: null,
            isPlural: false,
            infinitive: null,
            register: "neutral",
            gloss: null,
            audio: first,
            voices: second ? [first, second] : [first],
          },
        }
      : {},
    sentences: third
      ? {
          sn: {
            id: "sn",
            textXh: "molo",
            gloss: null,
            tokens: [],
            audio: third,
            voices: [third],
          },
        }
      : {},
    audioAssets: first ? { [first.id]: first } : {},
  } as UnitResponse;
}

interface Recorded {
  readonly saved: string[];
  readonly discarded: number;
  readonly committed: DownloadRecord | null;
}

function ports(
  unit: UnitResponse,
  behaviour: {
    saveAudio?: (url: string, n: number) => Promise<number>;
    freeBytes?: () => Promise<number | null>;
    fetchUnit?: () => Promise<UnitResponse>;
    commit?: () => Promise<void>;
  } = {},
): { ports: DownloadPorts; log: Recorded } {
  const log: { saved: string[]; discarded: number; committed: DownloadRecord | null } = {
    saved: [],
    discarded: 0,
    committed: null,
  };
  return {
    log,
    ports: {
      fetchUnit: behaviour.fetchUnit ?? (() => Promise.resolve(unit)),
      freeBytes: behaviour.freeBytes ?? (() => Promise.resolve(1_000_000_000)),
      saveAudio: (_slug, _lang, url) => {
        const n = log.saved.length;
        log.saved.push(url);
        return behaviour.saveAudio ? behaviour.saveAudio(url, n) : Promise.resolve(1234);
      },
      commit: (record) => {
        log.committed = record;
        return behaviour.commit ? behaviour.commit() : Promise.resolve();
      },
      discard: () => {
        log.discarded += 1;
        return Promise.resolve();
      },
    },
  };
}

const request = { slug: "greetings", lang: "en" };

describe("what a unit costs", () => {
  it("collects every recording once, however many exercises reach for it", () => {
    const a = ref("a");
    const b = ref("b");
    const unit = unitWith([a, b, a]);
    expect(
      audioRefsOf(unit)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("counts a word, its other voices and its sentences, not just the exercise assets", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    expect(audioRefsOf(unit)).toHaveLength(3);
  });

  it("estimates from duration, and assumes a longish word when there is none", () => {
    expect(estimateBytes([ref("a", 2000)])).toBe(8000);
    expect(estimateBytes([ref("a", 0)])).toBe(24_000);
    expect(estimateBytes([])).toBe(0);
  });

  it("refuses to start without headroom, and starts when the platform will not say", () => {
    expect(hasRoomFor(1_000_000, 10_000_000)).toBe(true);
    expect(hasRoomFor(1_000_000, 1_200_000)).toBe(false);
    expect(hasRoomFor(1_000_000, null)).toBe(true);
  });

  it("writes a size a learner can read", () => {
    expect(formatBytes(400)).toBe("400 B");
    expect(formatBytes(400_000)).toBe("400 kB");
    expect(formatBytes(2_400_000)).toBe("2.4 MB");
    expect(formatBytes(24_000_000)).toBe("24 MB");
  });
});

describe("downloading a unit", () => {
  it("saves every recording and commits once, with honest progress", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    const { ports: p, log } = ports(unit);
    const seen: DownloadProgress[] = [];
    return runDownload(p, { ...request, onProgress: (x) => seen.push(x) }).then((out) => {
      expect(out).toEqual({ ok: true, files: 3, bytes: 3702 });
      expect(log.saved).toHaveLength(3);
      expect(log.discarded).toBe(0);
      expect(log.committed?.urls).toHaveLength(3);
      // It opens at 0 of 3 and closes at 3 of 3; nothing claims a file it did not write.
      expect(seen[0]).toEqual({ done: 0, total: 3, bytes: 0 });
      expect(seen.at(-1)).toEqual({ done: 3, total: 3, bytes: 3702 });
      expect(seen.map((s) => s.done)).toEqual([0, 1, 2, 3]);
      return null;
    });
  });

  it("keeps nothing when a recording 404s half way, so the unit never claims to be offline", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    const { ports: p, log } = ports(unit, {
      saveAudio: (_url, n) =>
        n === 1 ? Promise.reject(downloadFailure("missing")) : Promise.resolve(1000),
    });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "missing_audio" });
      // The first file was written before the second failed; it is thrown away.
      expect(log.saved).toEqual([
        "https://api.molo.test/audio/a.opus",
        "https://api.molo.test/audio/b.opus",
      ]);
      expect(log.discarded).toBe(1);
      expect(log.committed).toBeNull();
      return null;
    });
  });

  it("keeps nothing when the connection goes half way", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    const { ports: p, log } = ports(unit, {
      saveAudio: (_url, n) =>
        n === 2 ? Promise.reject(new Error("Network request failed")) : Promise.resolve(1000),
    });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "offline" });
      expect(log.discarded).toBe(1);
      expect(log.committed).toBeNull();
      return null;
    });
  });

  it("keeps nothing when the device fills up half way", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    const { ports: p, log } = ports(unit, {
      saveAudio: (_url, n) =>
        n === 1 ? Promise.reject(new Error("ENOSPC: no space left on device")) : Promise.resolve(1),
    });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "no_space" });
      expect(log.committed).toBeNull();
      return null;
    });
  });

  it("does not start at all when there is not room for the estimate", () => {
    const unit = unitWith([ref("a", 60_000)]);
    const { ports: p, log } = ports(unit, { freeBytes: () => Promise.resolve(1000) });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "no_space" });
      expect(log.saved).toEqual([]);
      expect(log.discarded).toBe(1);
      return null;
    });
  });

  it("stops within one recording of a cancel, and keeps nothing", () => {
    const unit = unitWith([ref("a"), ref("b"), ref("c")]);
    let cancel = false;
    const { ports: p, log } = ports(unit, {
      saveAudio: () => {
        cancel = true;
        return Promise.resolve(1000);
      },
    });
    return runDownload(p, { ...request, cancelled: () => cancel }).then((out) => {
      expect(out).toEqual({ ok: false, reason: "cancelled" });
      expect(log.saved).toHaveLength(1);
      expect(log.discarded).toBe(1);
      expect(log.committed).toBeNull();
      return null;
    });
  });

  it("never leaves a claim behind when the unit itself cannot be fetched", () => {
    const { ports: p, log } = ports(unitWith([ref("a")]), {
      fetchUnit: () => Promise.reject(new Error("Network request failed")),
    });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "offline" });
      expect(log.saved).toEqual([]);
      expect(log.committed).toBeNull();
      return null;
    });
  });

  it("does not claim a unit whose record could not be written", () => {
    const { ports: p, log } = ports(unitWith([ref("a")]), {
      commit: () => Promise.reject(new Error("database is locked")),
    });
    return runDownload(p, request).then((out) => {
      expect(out).toEqual({ ok: false, reason: "failed" });
      expect(log.discarded).toBe(1);
      return null;
    });
  });

  it("reads a raw error the way the learner needs it read", () => {
    expect(classifyFailure(downloadFailure("missing"))).toBe("missing");
    expect(classifyFailure(new Error("UnableToDownload: status 404"))).toBe("missing");
    expect(classifyFailure(new Error("Could not connect: network is unreachable"))).toBe("offline");
    expect(classifyFailure(new Error("write failed: No space left"))).toBe("no_space");
    expect(classifyFailure(new Error("something else entirely"))).toBe("failed");
  });
});

describe("playing what was downloaded", () => {
  it("swaps a recording for the copy on this device and leaves the rest remote", () => {
    const a = ref("a");
    const b = ref("b");
    const unit = unitWith([a, b, b]);
    const local = localiseUnit(unit, new Map([[a.url, "file:///units/en/greetings/a.opus"]]));
    expect(local.lexemes["lx"]?.audio?.url).toBe("file:///units/en/greetings/a.opus");
    expect(local.lexemes["lx"]?.voices[1]?.url).toBe(b.url);
    expect(local.audioAssets["a"]?.url).toBe("file:///units/en/greetings/a.opus");
  });

  it("downloads and swaps the bare clicks a click_identify plays", () => {
    const click = ref("click-c");
    const unit = { ...unitWith([ref("a")]), clickAudio: { "c-id": click } } as UnitResponse;
    expect(
      audioRefsOf(unit)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["a", "click-c"]);
    const local = localiseUnit(unit, new Map([[click.url, "file:///units/en/greetings/c.opus"]]));
    expect(local.clickAudio?.["c-id"]?.url).toBe("file:///units/en/greetings/c.opus");
  });

  it("leaves a unit untouched when nothing is downloaded", () => {
    const unit = unitWith([ref("a")]);
    expect(localiseUnit(unit, new Map())).toBe(unit);
  });

  it("falls back to the network for a recording an editor has replaced", () => {
    // URLs are the file's own SHA-256, so a new recording is a new URL and
    // is simply not among the downloaded files.
    const unit = unitWith([ref("new")]);
    const local = localiseUnit(
      unit,
      new Map([["https://api.molo.test/audio/old.opus", "file:///x"]]),
    );
    expect(local.audioAssets["new"]?.url).toBe("https://api.molo.test/audio/new.opus");
  });
});
