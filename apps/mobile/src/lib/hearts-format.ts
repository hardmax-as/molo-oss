/** Pure helpers for the hearts UI; kept free of React so Jest can cover them. */

export interface HeartsState {
  hearts: number;
  max: number;
  unlimited: boolean;
  nextRegenAt: string | null;
  practiceLeft: number;
}

/** "2 h 06 min" or "12 min" until `iso`; empty when already due. */
export function formatCountdown(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** What the strip shows: a number, or the infinity sign for Plus. */
export function heartsLabel(state: HeartsState | null | undefined, localPlus: boolean): string {
  if (!state) return "";
  return state.unlimited || localPlus ? "∞" : String(state.hearts);
}

/** A lesson cannot start or continue: signed in, not unlimited, none left. */
export function heartsBlocked(state: HeartsState | null | undefined, localPlus: boolean): boolean {
  return !!state && !state.unlimited && !localPlus && state.hearts <= 0;
}
