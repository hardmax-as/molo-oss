import { describe, expect, it } from "vitest";

import { extensionFor, matchFiles, matchKey, stemOf } from "./studio-files.ts";

/** `zz-` fixture words: nothing here is a claim about isiXhosa. */
const items = [
  { kind: "lexeme", id: "1", text: "zzmolo" },
  { kind: "lexeme", id: "2", text: "zz enkosi" },
  { kind: "sentence", id: "3", text: "Zz ndiyabulela!" },
  { kind: "click", id: "c", text: "zc" },
  // Two items with one name: never guessed at.
  { kind: "lexeme", id: "4", text: "zzsame" },
  { kind: "sentence", id: "5", text: "zzsame" },
];
const file = (name: string) => ({ name });

describe("matching recordings to the queue by file name", () => {
  it("ignores case, accents, the extension and punctuation", () => {
    expect(matchKey("Zz Ndiyabulela!")).toBe("zz ndiyabulela");
    expect(matchKey("zz_ndiyábulela")).toBe("zz ndiyabulela");
    expect(stemOf("folder/ZZMOLO.m4a")).toBe("ZZMOLO");
    expect(stemOf("no-extension")).toBe("no-extension");
  });

  it("pairs each file with its one item and lists the rest with the reason", () => {
    const { matched, unmatched } = matchFiles(
      [
        file("ZZMOLO.m4a"),
        file("zz_enkosi.wav"),
        file("zz ndiyabulela.MP3"),
        file("zc.flac"),
        file("zzsame.ogg"),
        file("zzmolo (2).m4a"),
        file("zzmolo.wav"),
        file("nothing.wav"),
      ],
      items,
    );
    expect(matched.map((m) => [m.file.name, m.item.id])).toEqual([
      ["ZZMOLO.m4a", "1"],
      ["zz_enkosi.wav", "2"],
      ["zz ndiyabulela.MP3", "3"],
      ["zc.flac", "c"],
    ]);
    expect(unmatched.map((u) => [u.file.name, u.reason])).toEqual([
      ["zzsame.ogg", "ambiguous"],
      ["zzmolo (2).m4a", "none"],
      ["zzmolo.wav", "duplicate"],
      ["nothing.wav", "none"],
    ]);
  });

  it("names the upload after the file's own extension, else its type", () => {
    expect(extensionFor("audio/x-m4a", "take.M4A")).toBe("m4a");
    expect(extensionFor("audio/mpeg", "take")).toBe("mp3");
    expect(extensionFor("audio/wav")).toBe("wav");
    expect(extensionFor("audio/mp4;codecs=mp4a")).toBe("m4a");
    expect(extensionFor("")).toBe("webm");
  });
});
