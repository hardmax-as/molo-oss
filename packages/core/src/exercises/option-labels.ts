/**
 * Option collisions (audit M02). A learner cannot choose between two tiles
 * that read the same: "thank you", "hello", "hello" offers two right
 * answers, and scoring one of them wrong punishes a defensible choice. So
 * for every exercise whose tiles are lexemes, no two of them may share a
 * lemma, and no two may share a gloss in any source language.
 *
 * The check is about display strings, not about whether a gloss is right;
 * which gloss to change is an editor's call. Pure, so the publish gate, the
 * curation planner and both clients agree.
 */

import type { ExercisePayload } from "./index.ts";

/** How a tile reads, for comparison: case, spacing, punctuation and diacritics do not tell tiles apart. */
export function optionLabelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The lexemes an exercise shows as interchangeable tiles; empty for types without such tiles. */
export function optionLexemeIds(p: ExercisePayload): readonly string[] {
  switch (p.type) {
    case "listen_select":
    case "select_listen":
      return p.options.map((o) => o.lexemeId);
    case "match_pairs":
      return p.pairs.map((o) => o.lexemeId);
    default:
      return [];
  }
}

export interface OptionLabels {
  readonly lemma: string;
  /** Gloss per source language; a missing gloss cannot collide. */
  readonly glosses: Readonly<Record<string, string | null | undefined>>;
}

export interface OptionCollision {
  /** `xh` for the lemma, else the source language of the gloss. */
  readonly field: string;
  readonly label: string;
  readonly lexemeIds: readonly string[];
}

/** Every label two or more of the exercise's option lexemes share. */
export function optionCollisions(
  p: ExercisePayload,
  labelsOf: (lexemeId: string) => OptionLabels | undefined,
): OptionCollision[] {
  const ids = [...new Set(optionLexemeIds(p))];
  const groups = new Map<string, { field: string; label: string; ids: string[] }>();
  const add = (field: string, label: string | null | undefined, id: string) => {
    if (!label) return;
    const key = optionLabelKey(label);
    if (!key) return;
    const at = `${field}\u0000${key}`;
    const group = groups.get(at) ?? { field, label, ids: [] };
    group.ids.push(id);
    groups.set(at, group);
  };
  for (const id of ids) {
    const labels = labelsOf(id);
    if (!labels) continue;
    add("xh", labels.lemma, id);
    for (const [lang, gloss] of Object.entries(labels.glosses)) add(lang, gloss, id);
  }
  return [...groups.values()]
    .filter((g) => g.ids.length > 1)
    .map((g) => ({ field: g.field, label: g.label, lexemeIds: g.ids }));
}

/**
 * Keeps the first item for each (field, label) pair, but never drops a preferred
 * item (the correct option) in favour of a distractor. Order is otherwise
 * preserved. For clients that meet an already published collision.
 */
export function distinctByLabel<T>(
  items: readonly T[],
  labelsOf: (item: T) => readonly (readonly [field: string, label: string | null | undefined])[],
  preferred: (item: T) => boolean = () => false,
): T[] {
  const seen = new Set<string>();
  const kept = new Set<T>();
  const claim = (item: T) => {
    const keys = labelsOf(item).flatMap(([field, label]) => {
      const key = label ? optionLabelKey(label) : "";
      return key ? [`${field}\u0000${key}`] : [];
    });
    if (keys.some((k) => seen.has(k))) return;
    for (const k of keys) seen.add(k);
    kept.add(item);
  };
  for (const item of items) if (preferred(item)) claim(item);
  for (const item of items) if (!preferred(item)) claim(item);
  return items.filter((item) => kept.has(item));
}
