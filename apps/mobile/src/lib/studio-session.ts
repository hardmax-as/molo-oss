/**
 * The phone studio's session, as plain data (no native imports; covered by
 * Jest). A sitting has to survive auto-lock, backgrounding and a dropped
 * connection, all of which unmount the recorder (audit M01). So everything
 * needed to pick up where the tutor left off lives here and is persisted:
 * the speaker, the unit, the item on screen and what this sitting has
 * already recorded. A take itself is never persisted; one in memory may be
 * lost, but the place in the queue may not.
 */

export interface StudioItemRef {
  readonly kind: string;
  readonly id: string;
}

export interface StudioSessionState {
  readonly speakerId: string;
  readonly unit: string;
  readonly started: boolean;
  /** The item on screen, so a refetched list (reordered, shorter) puts the tutor back on it. */
  readonly currentKey: string | null;
  /** Fallback when that item has left the list: the same slot. */
  readonly index: number;
  /** Items uploaded in this sitting; the server may still list them until its job lands. */
  readonly recorded: readonly string[];
}

export const EMPTY_STUDIO_SESSION: StudioSessionState = {
  speakerId: "",
  unit: "",
  started: false,
  currentKey: null,
  index: 0,
  recorded: [],
};

export const itemKey = (item: StudioItemRef) => `${item.kind}:${item.id}`;

/** The queue as the session shows it: what the server lists, minus what this sitting uploaded. */
export function remainingItems<T extends StudioItemRef>(
  items: readonly T[],
  state: Pick<StudioSessionState, "recorded">,
): T[] {
  const done = new Set(state.recorded);
  return items.filter((item) => !done.has(itemKey(item)));
}

/** Where the session stands in `items` (already filtered): the remembered item, else the same slot. */
export function positionOf(
  items: readonly StudioItemRef[],
  state: Pick<StudioSessionState, "currentKey" | "index">,
): number {
  if (items.length === 0) return -1;
  if (state.currentKey) {
    const found = items.findIndex((item) => itemKey(item) === state.currentKey);
    if (found !== -1) return found;
  }
  return Math.max(0, Math.min(items.length - 1, state.index));
}

/** Skip (+1) or Back (-1), clamped to the list. Any move discards the take on screen. */
export function moveBy(
  items: readonly StudioItemRef[],
  state: StudioSessionState,
  delta: 1 | -1,
): StudioSessionState {
  const here = positionOf(items, state);
  if (here === -1) return state;
  const next = Math.max(0, Math.min(items.length - 1, here + delta));
  const item = items[next];
  return { ...state, index: next, currentKey: item ? itemKey(item) : null };
}

/**
 * The server accepted a take for `key`: count it and stay in the same slot,
 * which now holds the next item.
 */
export function markRecorded(
  items: readonly StudioItemRef[],
  state: StudioSessionState,
  key: string,
): StudioSessionState {
  const recorded = state.recorded.includes(key) ? state.recorded : [...state.recorded, key];
  const here = items.findIndex((item) => itemKey(item) === key);
  const left = remainingItems(items, { recorded });
  const slot = Math.max(0, Math.min(left.length - 1, here === -1 ? state.index : here));
  const next = left[slot];
  return { ...state, recorded, index: slot, currentKey: next ? itemKey(next) : null };
}

/**
 * A take belongs to the item it was recorded for (the web studio's rule,
 * PR #118). Uploading it against any other item is refused.
 */
export function takeMatches(takeFor: string | null, item: StudioItemRef): boolean {
  return takeFor !== null && takeFor === itemKey(item);
}

/**
 * The i18n key of a unit's title, from the queue's `units` (MOL-67): unit
 * menus show the title, and only a server too old to send it leaves the slug.
 */
export function unitTitleKeyFor(
  slug: string,
  units: readonly { readonly slug: string; readonly titleKey: string }[] | undefined,
): string | null {
  return units?.find((u) => u.slug === slug)?.titleKey ?? null;
}

/** Reads a persisted session; anything malformed is treated as no session. */
export function parseStudioSession(raw: string | null): StudioSessionState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StudioSessionState>;
    if (
      typeof v.speakerId !== "string" ||
      typeof v.unit !== "string" ||
      typeof v.started !== "boolean" ||
      typeof v.index !== "number" ||
      !Array.isArray(v.recorded) ||
      !v.recorded.every((k) => typeof k === "string") ||
      !(v.currentKey === null || typeof v.currentKey === "string")
    )
      return null;
    return {
      speakerId: v.speakerId,
      unit: v.unit,
      started: v.started,
      currentKey: v.currentKey,
      index: Math.max(0, Math.floor(v.index)),
      recorded: v.recorded,
    };
  } catch {
    return null;
  }
}
