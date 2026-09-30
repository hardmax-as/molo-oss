import {
  createWarmer,
  isUnmetered,
  TEMP_SUFFIX,
  toPrune,
  warmable,
  type WarmPorts,
} from "./audio-cache-logic.ts";

const URL_A = "https://api.hellomolo.com/audio/aaa.opus";
const URL_B = "https://api.hellomolo.com/audio/bbb.opus";
const URL_C = "https://api.hellomolo.com/audio/ccc.opus";

/** An in-memory directory: `files` holds whole and temporary files by name. */
function fakePorts(opts: { failOn?: string; partialOnFailure?: boolean } = {}) {
  const files = new Set<string>();
  const fetched: string[] = [];
  const ports: WarmPorts = {
    nameOf: (url) => url.split("/").pop() ?? "x",
    has: (name) => files.has(name),
    fetchTo: (url, temp) => {
      fetched.push(url);
      if (url === opts.failOn) {
        if (opts.partialOnFailure) files.add(temp);
        return Promise.reject(new Error("network is unreachable"));
      }
      files.add(temp);
      return Promise.resolve();
    },
    promote: (temp, name) => {
      files.delete(temp);
      files.add(name);
      return Promise.resolve();
    },
    discard: (temp) => {
      files.delete(temp);
    },
  };
  return { ports, files, fetched };
}

describe("createWarmer", () => {
  it("fetches each recording once, one at a time, under its real name only when whole", async () => {
    const { ports, files, fetched } = fakePorts();
    const warmer = createWarmer(ports);
    await warmer.warm([URL_A, URL_B, URL_A]);
    expect(fetched).toEqual([URL_A, URL_B]);
    expect([...files].sort()).toEqual(["aaa.opus", "bbb.opus"]);
  });

  it("never leaves a partial file under the real name when a fetch fails half way", async () => {
    const { ports, files } = fakePorts({ failOn: URL_B, partialOnFailure: true });
    await createWarmer(ports).warm([URL_A, URL_B, URL_C]);
    expect(files.has("bbb.opus")).toBe(false);
    expect(files.has(`bbb.opus${TEMP_SUFFIX}`)).toBe(false);
    // One failure does not stop the rest of the queue.
    expect(files.has("ccc.opus")).toBe(true);
  });

  it("skips what is already warm, so a second visit costs nothing", async () => {
    const { ports, fetched } = fakePorts();
    const warmer = createWarmer(ports);
    await warmer.warm([URL_A]);
    await warmer.warm([URL_A, URL_B]);
    expect(fetched).toEqual([URL_A, URL_B]);
  });

  it("puts the lesson the learner opened ahead of the unit already queued", async () => {
    const { ports, fetched } = fakePorts();
    const warmer = createWarmer(ports);
    const unit = warmer.warm([URL_A, URL_B, URL_C]);
    // URL_A is already in flight; the lesson wants C first, then B.
    void warmer.warm([URL_C, URL_B], { first: true });
    await unit;
    expect(fetched).toEqual([URL_A, URL_C, URL_B]);
  });

  it("warms nothing that is local, private editor audio, or empty", async () => {
    const { ports, fetched } = fakePorts();
    await createWarmer(ports).warm([
      "file:///var/mobile/molo-audio/aaa.opus",
      "https://api.hellomolo.com/audio/p.opus?b=private&sig=1",
      "",
    ]);
    expect(fetched).toEqual([]);
  });
});

describe("warmable", () => {
  it("accepts only public network recordings", () => {
    expect(warmable(URL_A)).toBe(true);
    expect(warmable("file:///x.opus")).toBe(false);
    expect(warmable(`${URL_A}?b=private`)).toBe(false);
    expect(warmable(null)).toBe(false);
  });
});

describe("isUnmetered", () => {
  it("counts Wi-Fi and Ethernet only; cellular and unknown are not assumed free", () => {
    expect(isUnmetered("WIFI")).toBe(true);
    expect(isUnmetered("ETHERNET")).toBe(true);
    expect(isUnmetered("CELLULAR")).toBe(false);
    expect(isUnmetered("UNKNOWN")).toBe(false);
    expect(isUnmetered(undefined)).toBe(false);
  });
});

describe("toPrune", () => {
  it("drops every leftover temporary file and the oldest whole files beyond the cap", () => {
    const out = toPrune(
      [
        { name: "new.opus", modified: 30 },
        { name: "old.opus", modified: 10 },
        { name: `half.opus${TEMP_SUFFIX}`, modified: 40 },
        { name: "mid.opus", modified: 20 },
      ],
      2,
    );
    expect(out).toEqual([`half.opus${TEMP_SUFFIX}`, "old.opus"]);
  });

  it("keeps everything under the cap", () => {
    expect(toPrune([{ name: "a.opus", modified: 1 }], 2)).toEqual([]);
  });
});
