import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { LeagueProfileRequest } from "./league-profile.ts";
import { nameAllowed, normaliseName } from "./name-filter.ts";

describe("name filter", () => {
  it.each([
    "Ada",
    "Thandi",
    "Sipho M",
    "Scunthorpe",
    "Cassandra",
    "Dickens",
    "Nazira",
    "Shitake fan",
    "Hancock",
    "Therapist Tom",
    "Bjørn",
    "Åse",
    "Molo fan",
  ])("lets %j through", (name) => {
    expect(nameAllowed(name)).toBe(true);
  });

  it.each([
    "fuck",
    "F.U.C.K",
    "motherfucker99",
    "n1gger",
    "K@ffir",
    "big dick",
    "You Cunt",
    "Admin",
    "Molo Team",
    "  support ",
    "sieg heil",
    "jævla idiot",
  ])("holds back %j", (name) => {
    expect(nameAllowed(name)).toBe(false);
  });

  it("reads look-alike characters as letters", () => {
    expect(normaliseName("Sh1t@ké")).toBe("shitake");
  });

  it("refuses a filtered display name at the API boundary", () => {
    expect(
      Schema.decodeUnknownEither(LeagueProfileRequest)({
        displayName: "Admin",
        leaguesOptOut: false,
      })._tag,
    ).toBe("Left");
  });
});
