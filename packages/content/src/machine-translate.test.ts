import { describe, expect, it } from "vitest";

import {
  planTranslate,
  runTranslate,
  sameGloss,
  TRANSLATE_MAX_SEGMENTS,
  type TranslateBatch,
} from "./machine-translate.ts";

const batch: TranslateBatch = {
  from: "en",
  to: "nb",
  items: [
    { id: "a", text: "to come" },
    { id: "b", text: "water" },
  ],
};

function fakeFetch(status: number, body: unknown, capture?: { url?: string; body?: unknown }) {
  return async (url: string | Request | URL, init?: RequestInit) => {
    if (capture) {
      capture.url = String(url);
      capture.body = JSON.parse(String(init?.body));
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("planTranslate", () => {
  it("prices by characters and drops empty texts before they are sent", () => {
    const plan = planTranslate(
      [
        { id: "a", text: "to come" },
        { id: "b", text: "   " },
        { id: "c", text: "water" },
      ],
      "en",
      "nb",
    );
    expect(plan.segments).toBe(2);
    expect(plan.chars).toBe("to come".length + "water".length);
    expect(plan.approxUsd).toBeCloseTo((12 / 1_000_000) * 20);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("splits at the endpoint's segment limit", () => {
    const items = Array.from({ length: TRANSLATE_MAX_SEGMENTS + 1 }, (_, i) => ({
      id: String(i),
      text: "x",
    }));
    const plan = planTranslate(items, "en", "nb");
    expect(plan.batches.map((b) => b.items.length)).toEqual([TRANSLATE_MAX_SEGMENTS, 1]);
  });

  it("refuses a no-op direction", () => {
    expect(() => planTranslate([{ id: "a", text: "x" }], "en", "en")).toThrow();
  });
});

describe("runTranslate", () => {
  it("sends the batch as text segments with our language codes and maps the answers back by position", async () => {
    const capture: { url?: string; body?: unknown } = {};
    const result = await runTranslate(
      "k",
      batch,
      fakeFetch(
        200,
        { data: { translations: [{ translatedText: "å komme" }, { translatedText: "vann " }] } },
        capture,
      ),
    );
    expect(capture.url).toContain("translation.googleapis.com/language/translate/v2?key=k");
    expect(capture.body).toEqual({
      q: ["to come", "water"],
      source: "en",
      target: "no",
      format: "text",
    });
    expect(result).toEqual({
      ok: true,
      translations: new Map([
        ["a", "å komme"],
        ["b", "vann"],
      ]),
    });
  });

  it("reports an HTTP error by status and message, never the key", async () => {
    const result = await runTranslate(
      "secret-key",
      batch,
      fakeFetch(403, {
        error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED" },
      }),
    );
    expect(result).toEqual({ ok: false, reason: "HTTP 403: API key not valid" });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("refuses an answer with the wrong number of segments rather than misaligning ids", async () => {
    const result = await runTranslate(
      "k",
      batch,
      fakeFetch(200, { data: { translations: [{ translatedText: "å komme" }] } }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a body that is not the documented shape", async () => {
    const result = await runTranslate("k", batch, fakeFetch(200, { translations: [] }));
    expect(result.ok).toBe(false);
  });

  it("sends nothing for an empty batch", async () => {
    let called = false;
    const result = await runTranslate("k", { ...batch, items: [] }, async () => {
      called = true;
      return new Response("{}");
    });
    expect(called).toBe(false);
    expect(result).toEqual({ ok: true, translations: new Map() });
  });
});

describe("sameGloss", () => {
  it("ignores case, edge whitespace and a final full stop", () => {
    expect(sameGloss("Å komme.", " å komme")).toBe(true);
  });
  it("treats different words as different", () => {
    expect(sameGloss("å komme", "å gå")).toBe(false);
  });
});
