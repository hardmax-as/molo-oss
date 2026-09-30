import { Schema } from "effect";

import { nameAllowed } from "./name-filter.ts";

export const LeagueProfileRequest = Schema.Struct({
  displayName: Schema.NullOr(
    Schema.String.pipe(
      Schema.minLength(1),
      Schema.maxLength(40),
      Schema.filter((value) => value === value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value)),
      // The client checks the same function first so it can say why.
      Schema.filter((value) => nameAllowed(value)),
    ),
  ),
  leaguesOptOut: Schema.Boolean,
});
export type LeagueProfileRequest = typeof LeagueProfileRequest.Type;
export interface LeagueProfile extends LeagueProfileRequest {
  readonly publicName: string;
}

/** The account surname must never escape through a league response. */
export function leagueName(accountName: string, displayName: string | null): string {
  return displayName ?? accountName.trim().split(/\s+/u)[0] ?? "";
}

/** Report or hide another member of your league, by the id the standings carry. */
export const LeagueMemberRequest = Schema.Struct({
  userId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
});
export type LeagueMemberRequest = typeof LeagueMemberRequest.Type;
