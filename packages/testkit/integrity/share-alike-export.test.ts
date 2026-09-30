/**
 * The share-alike export against Postgres. isixhosa.click gives us its
 * dictionary under CC BY-SA 4.0, so what we derive from it has to be
 * offerable back under the same licence (docs/CONTENT.md section 3). These
 * assertions are the difference between meaning that and doing it.
 */

import { editorRepo, shareAlikeExport, type Db } from "@molo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  completeLexeme,
  editorA,
  harness,
  LICENCE,
  SOURCE,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

/** A row from a source with no share-alike obligation; it must stay out of the package. */
async function proprietaryLexeme(db: Db): Promise<string> {
  const repo = editorRepo(db, editorA, { morph: yesMorph });
  return repo.createLexeme({
    lemma: `zz-own-${crypto.randomUUID().slice(0, 8)}`,
    pos: "noun",
    nounClassLabel: "13",
    source: "molo-editors",
    licence: "proprietary-molo",
    origin: "human",
  });
}

describe("molo content export", () => {
  it("carries every share-alike lexeme with the glosses we wrote for it", async () => {
    const id = await completeLexeme(h.db, { lemma: "zz-export-one" });
    const data = await shareAlikeExport(h.db);
    const row = data.lexemes.find((l) => l.id === id);
    expect(row).toBeDefined();
    expect(row?.licence).toBe(LICENCE);
    expect(row?.source).toBe(SOURCE);
    expect(row?.glosses.map((g) => g.sourceLang).sort()).toEqual(["en", "nb"]);
  });

  it("leaves out rows we own, so the licence covers only what it has to", async () => {
    const own = await proprietaryLexeme(h.db);
    const data = await shareAlikeExport(h.db);
    expect(data.lexemes.some((l) => l.id === own)).toBe(false);
  });

  it("names the upstream source for each row, which is what attribution needs", async () => {
    await completeLexeme(h.db, { lemma: "zz-export-two" });
    const data = await shareAlikeExport(h.db);
    expect(data.sources).toContainEqual(
      expect.objectContaining({ source: SOURCE, licence: LICENCE }),
    );
  });

  it("holds no audio, because a recording is not an adaptation of the dictionary", async () => {
    await completeLexeme(h.db, { lemma: "zz-export-three" });
    const data = await shareAlikeExport(h.db);
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain(FIXTURE_SPEAKER_ID);
    expect(serialised).not.toContain("audio/");
  });
});
