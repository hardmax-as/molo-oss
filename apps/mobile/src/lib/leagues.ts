/** Pure league helpers (no React Native imports; covered by Jest). */

/** Days left in the week, from the API's weekEnd (inclusive), never negative. */
export function daysLeft(weekEnd: string, now = new Date()): number {
  const end = new Date(`${weekEnd}T23:59:59`);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}

export type Zone = "promote" | "stay" | "demote";

/** Which zone a rank falls in, given the cohort size and the promote/demote counts. */
export function zoneOf(rank: number, size: number, promote: number, demote: number): Zone {
  if (rank <= promote) return "promote";
  if (rank > size - demote) return "demote";
  return "stay";
}
