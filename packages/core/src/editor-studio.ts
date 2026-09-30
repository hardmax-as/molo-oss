import type { ClickVariant } from "./click-sounds.ts";

/** Editor-only studio reads shared by the web dashboard and the mobile recorder. */
export interface StudioSpeaker {
  id: string;
  displayName: string;
  region: string | null;
  gender: string | null;
  ageGroup: "child" | "teen" | "adult" | "elder" | null;
  consentRecordedAt: string | null;
  consentScope: string | null;
}

/** A unit named in the queue's `unitSlugs`, so menus can show its title instead of the slug. */
export interface AudioQueueUnit {
  slug: string;
  titleKey: string;
  /** `units.order`; older servers omit it and the menu falls back to the slug. */
  order?: number;
  status?: string;
}

/**
 * Units the course spine replaced, still in some databases with a few rows
 * on them (`molo content reconcile-unit-1`). Menus list them after the spine
 * and mark them old, so nobody records a session into a unit on its way out.
 */
export const SUPERSEDED_UNIT_SLUGS: readonly string[] = ["unit-1"];

/** One entry of a studio's unit menu, in course order. */
export interface StudioUnitOption {
  slug: string;
  titleKey: string | null;
  /** 1-based position among the current units; null for an old one. */
  number: number | null;
  old: boolean;
}

/**
 * The unit menu both studios show: the units the queue names, in course
 * order (then slug), numbered 1, 2, 3 as the learner's path numbers them.
 * A superseded or retired unit goes last, unnumbered and marked old, even
 * when it shares an order with a current one.
 */
export function studioUnitOptions(
  slugs: readonly string[],
  units: readonly AudioQueueUnit[] | undefined,
): StudioUnitOption[] {
  const wanted = new Set(slugs);
  const bySlug = new Map((units ?? []).map((u) => [u.slug, u]));
  // Every unit the server named, plus any slug it did not, so a unit keeps its
  // course number even when an earlier unit has nothing left to record.
  const all = [...new Set([...bySlug.keys(), ...wanted])].map((slug) => {
    const u = bySlug.get(slug);
    return {
      slug,
      titleKey: u?.titleKey ?? null,
      order: u?.order ?? Number.POSITIVE_INFINITY,
      old: SUPERSEDED_UNIT_SLUGS.includes(slug) || u?.status === "retired",
    };
  });
  const byOrder = (a: (typeof all)[number], b: (typeof all)[number]) =>
    a.order - b.order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const current = all.filter((r) => !r.old).sort(byOrder);
  const old = all.filter((r) => r.old).sort(byOrder);
  return [
    ...current.map((r, i) => ({ slug: r.slug, titleKey: r.titleKey, number: i + 1, old: false })),
    ...old.map((r) => ({ slug: r.slug, titleKey: r.titleKey, number: null, old: true })),
  ].filter((r) => wanted.has(r.slug));
}

/** `GET /edit/audio/queue`. */
export interface AudioQueueResponse {
  items: AudioQueueItem[];
  total: number;
  /** Every unit the items name. Older servers omit it; clients fall back to the slug. */
  units?: AudioQueueUnit[];
}

/**
 * `GET /edit/audio/backlog`: uploads the audio worker has not processed yet
 * (the audio-process queue's realtime backlog). `waiting` is null when the
 * queue cannot report it (local simulation, an API hiccup); the studio then
 * says nothing rather than something wrong.
 */
export interface AudioBacklog {
  waiting: number | null;
  /** ISO time of the oldest waiting upload, or null. */
  oldestAt: string | null;
}

export interface AudioQueueItem {
  /** `click` is a bare click from `CLICK_SOUNDS`; `text` is then its letter. */
  kind: "lexeme" | "sentence" | "click";
  id: string;
  text: string;
  /** Set for `click` items, so the studio can name the variant in the UI language. */
  click?: { base: "c" | "x" | "q"; variant: ClickVariant };
  gloss: { en: string | null; nb: string | null };
  status: string;
  unitSlugs: string[];
  audio: {
    id: string;
    tier: string;
    status: string;
    url: string;
    speakerId: string | null;
    speakerName: string | null;
    /** Who uploaded it: that person or an admin may delete it while unpublished. */
    createdBy: string | null;
  }[];
}
