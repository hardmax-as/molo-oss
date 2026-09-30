import { Either } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildUrl,
  fetchPronunciations,
  parsePronunciations,
  pickBest,
  provenanceFor,
  redactKey,
  type FetchLike,
} from "./forvo.ts";

const sample = {
  attributes: { total: 3 },
  items: [
    {
      id: 1,
      word: "inja",
      original: "inja",
      pathmp3: "https://apifree.forvo.com/audio/a.mp3",
      username: "u1",
      sex: "f",
      country: "South Africa",
      rate: 1,
      num_votes: 2,
      num_positive_votes: 2,
      standard_pronunciation: 0,
    },
    {
      id: 2,
      word: "inja",
      original: "inja",
      pathmp3: "https://apifree.forvo.com/audio/b.mp3",
      username: "u2",
      sex: "m",
      country: "United States",
      rate: 3,
      num_votes: 5,
      num_positive_votes: 4,
      standard_pronunciation: 1,
    },
    {
      id: 3,
      word: "inja",
      original: "inja",
      pathmp3: "https://apifree.forvo.com/audio/c.mp3",
      username: "u3",
      sex: "m",
      country: "South Africa",
      rate: -1,
      num_votes: 1,
      num_positive_votes: 0,
    },
  ],
};

describe("forvo adapter", () => {
  it("builds the documented path-style URL for isiXhosa and redacts the key", () => {
    const url = buildUrl({ key: "SECRET", word: "inja yam", minRate: 0, limit: 5 });
    expect(url).toBe(
      "https://apifree.forvo.com/key/SECRET/format/json/action/word-pronunciations/word/inja%20yam/language/xh/order/rate-desc/rate/0/limit/5/",
    );
    expect(redactKey(url)).not.toContain("SECRET");
    expect(redactKey(url)).toContain("/key/<redacted>/");
  });

  it("parses the envelope and normalises numbers and flags", () => {
    const r = parsePronunciations(sample);
    expect(Either.isRight(r)).toBe(true);
    if (Either.isLeft(r)) return;
    expect(r.right).toHaveLength(3);
    expect(r.right[1]).toMatchObject({
      id: "2",
      rate: 3,
      votes: 5,
      standard: true,
      country: "United States",
    });
    expect(r.right[2]?.standard).toBe(false);
  });

  it("surfaces Forvo's error array and rejects other shapes", () => {
    expect(Either.isLeft(parsePronunciations(["Limit/day reached."]))).toBe(true);
    expect(Either.isLeft(parsePronunciations({ nope: true }))).toBe(true);
  });

  it("prefers South Africa, then standard, then rating; never a negative rating", () => {
    const items = Either.getOrThrow(parsePronunciations(sample));
    expect(pickBest(items)?.id).toBe("1"); // South African beats the higher-rated US one
    expect(pickBest(items, { preferCountry: "United States" })?.id).toBe("2");
    expect(pickBest(items.filter((p) => p.id === "3"))).toBeNull();
    expect(pickBest([])).toBeNull();
  });

  it("fetches through an injected fetch and reports HTTP failures without the key", async () => {
    const good: FetchLike = async () =>
      new Response(JSON.stringify(sample), { headers: { "content-type": "application/json" } });
    const r = await fetchPronunciations({ key: "SECRET", word: "inja" }, good);
    expect(Either.isRight(r) && r.right.items.length).toBe(3);
    const bad: FetchLike = async () => new Response("nope", { status: 429 });
    const e = await fetchPronunciations({ key: "SECRET", word: "inja" }, bad);
    expect(Either.isLeft(e)).toBe(true);
    if (Either.isLeft(e)) {
      expect(e.left).toContain("429");
      expect(e.left).not.toContain("SECRET");
    }
  });

  it("provenance carries attribution and the redacted request", () => {
    const items = Either.getOrThrow(parsePronunciations(sample));
    const prov = provenanceFor(items[0]!, buildUrl({ key: "SECRET", word: "inja" }));
    expect(prov["attribution"]).toBe("Pronunciation by Forvo");
    expect(String(prov["request"])).not.toContain("SECRET");
    expect(prov["forvoId"]).toBe("1");
  });
});
