import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { leagueName, LeagueProfileRequest } from "./league-profile.ts";

describe("league privacy", () => {
  it("uses a chosen name or only the first account-name word", () => {
    expect(leagueName("Ada Lovelace", "Starling")).toBe("Starling");
    expect(leagueName("  Ada  Lovelace ", null)).toBe("Ada");
    expect(leagueName("Ada", null)).toBe("Ada");
  });
  it.each(["", "   ", " padded ", "a".repeat(41), "a\nb", "a\u202Eb"])(
    "refuses invalid public name %j",
    (displayName) => {
      expect(
        Schema.decodeUnknownEither(LeagueProfileRequest)({ displayName, leaguesOptOut: false })
          ._tag,
      ).toBe("Left");
    },
  );
  it("allows resetting to the first name", () => {
    expect(
      Schema.decodeUnknownEither(LeagueProfileRequest)({ displayName: null, leaguesOptOut: true })
        ._tag,
    ).toBe("Right");
  });
});
