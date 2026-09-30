import type { Click } from "./content.ts";

/**
 * The bare clicks a speaker records in the studio: each of the fifteen
 * click letters on its own, with no word around it. These are the
 * orthographic letters the drills already use (`CLICKS`), not isiXhosa
 * words, so nothing here is content an editor has to approve; the
 * recordings are, and they go through review like any other audio.
 *
 * The ids are hard-coded because `audio_assets.target_id` points at them.
 * Never change or reorder an id: that would orphan every recording made
 * against it.
 */
export const CLICK_VARIANTS = ["plain", "aspirated", "nasal", "voiced", "voiced_nasal"] as const;
export type ClickVariant = (typeof CLICK_VARIANTS)[number];

export interface ClickSound {
  readonly id: string;
  readonly letter: Click;
  readonly base: "c" | "x" | "q";
  readonly variant: ClickVariant;
}

export const CLICK_SOUNDS: readonly ClickSound[] = [
  { id: "f2c23dae-88c2-460c-bb4b-7b3adcec05fc", letter: "c", base: "c", variant: "plain" },
  { id: "6dc06cfc-cbf4-431a-971e-480d53d3a472", letter: "x", base: "x", variant: "plain" },
  { id: "99ced0d3-1c90-4457-b05f-d98ef450ee1f", letter: "q", base: "q", variant: "plain" },
  { id: "5ac16a89-9716-4006-952b-4932d8183191", letter: "ch", base: "c", variant: "aspirated" },
  { id: "debeafce-0731-4e7b-baa4-e11b7369ce4b", letter: "xh", base: "x", variant: "aspirated" },
  { id: "499a08d1-d64b-42d2-9f33-43b76c03e8a8", letter: "qh", base: "q", variant: "aspirated" },
  { id: "09c14e36-9bad-4d6e-b46b-87a903f058d5", letter: "nc", base: "c", variant: "nasal" },
  { id: "4e0adc97-221f-4d77-9990-28485e90247a", letter: "nx", base: "x", variant: "nasal" },
  { id: "edd058ba-44b3-4114-9122-b3b3d27ab3e1", letter: "nq", base: "q", variant: "nasal" },
  { id: "ffd14b97-7b11-4ca9-b7cc-815a8a3891da", letter: "gc", base: "c", variant: "voiced" },
  { id: "5587ff25-70b8-42b3-978c-638e5218e53b", letter: "gx", base: "x", variant: "voiced" },
  { id: "69d1f602-19b1-4ade-b767-23bbe7eb88b6", letter: "gq", base: "q", variant: "voiced" },
  {
    id: "dd6f4cf3-a77b-48dc-a62f-de2851131423",
    letter: "ngc",
    base: "c",
    variant: "voiced_nasal",
  },
  {
    id: "fa4be3da-20ee-4204-ab68-c9990e670f18",
    letter: "ngx",
    base: "x",
    variant: "voiced_nasal",
  },
  {
    id: "4cda5c15-e663-4866-9934-aa0b326c3de7",
    letter: "ngq",
    base: "q",
    variant: "voiced_nasal",
  },
];

/** A bare click with a published studio recording, as `GET /clicks` returns it. */
export interface PublishedClickSound extends ClickSound {
  readonly audio: { readonly id: string; readonly url: string; readonly durationMs: number };
}

/** `GET /clicks`: only clicks whose recording is published; none at all is a valid answer. */
export interface ClickSoundsResponse {
  readonly clicks: readonly PublishedClickSound[];
}

/** The click a studio recording is attached to, or undefined for an unknown id. */
export function clickSoundById(id: string): ClickSound | undefined {
  return CLICK_SOUNDS.find((c) => c.id === id);
}

/** The bare click written with this letter (`"xh"`), or undefined. */
export function clickSoundByLetter(letter: string): ClickSound | undefined {
  return CLICK_SOUNDS.find((c) => c.letter === letter);
}

/**
 * The contrast sets a `click_identify` exercise draws from, in teaching
 * order. They are sets of orthographic click letters, the same ones the
 * click drills name, so nothing here is isiXhosa content: the learner hears
 * a studio recording of the bare click and picks its letter.
 *
 *   A  the three places: c dental, x lateral, q palatal
 *   B  plain against aspirated
 *   C  plain against nasal
 *   D  plain against voiced
 *   E  nasal against voiced nasal
 */
export const CLICK_IDENTIFY_SETS = {
  A: ["c", "x", "q"],
  B: ["c", "ch", "x", "xh", "q", "qh"],
  C: ["c", "nc", "x", "nx", "q", "nq"],
  D: ["c", "gc", "x", "gx", "q", "gq"],
  E: ["nc", "ngc", "nx", "ngx", "nq", "ngq"],
} as const satisfies Record<string, readonly Click[]>;
export type ClickIdentifySet = keyof typeof CLICK_IDENTIFY_SETS;
export const CLICK_IDENTIFY_SET_NAMES = Object.keys(CLICK_IDENTIFY_SETS) as ClickIdentifySet[];

export function isClickIdentifySet(s: string): s is ClickIdentifySet {
  return Object.hasOwn(CLICK_IDENTIFY_SETS, s);
}

/** The `CLICK_SOUNDS` ids a set offers, in the set's order. */
export function clickIdsForSet(set: ClickIdentifySet): string[] {
  return CLICK_IDENTIFY_SETS[set].map((letter) => {
    const sound = clickSoundByLetter(letter);
    if (!sound) throw new Error(`no CLICK_SOUNDS entry for ${letter}`);
    return sound.id;
  });
}

/**
 * The `click_identify` gate's question: which of these clicks has no
 * published tier-1 studio recording? The exercise plays nothing else (never
 * Forvo, never TTS), so one missing click keeps the whole exercise back.
 */
export function clicksMissingAudio(
  clickIds: readonly string[],
  publishedTier1ClickIds: ReadonlySet<string>,
): string[] {
  return clickIds.filter((id) => !publishedTier1ClickIds.has(id));
}
