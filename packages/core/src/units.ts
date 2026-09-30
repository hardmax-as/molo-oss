/**
 * Unit prerequisites (ARCHITECTURE section 2.2: `units.prerequisite_unit_id`).
 * A unit is locked until the learner has finished the unit it depends on —
 * every lesson completed, or a crown. The rule is pure so the server can
 * compute it for a signed-in learner and the guest clients can compute the
 * same thing from their local lesson tally.
 */

export interface UnitLockRow {
  readonly id: string;
  readonly prerequisiteUnitId: string | null;
}

/**
 * Ids of the units that are locked. A unit is locked when its prerequisite
 * is not finished, or when the prerequisite is itself locked (chains). A
 * prerequisite that is not in the list at all (retired, unpublished) does
 * not lock anything: content that no learner can reach cannot gate them.
 * Cycles — which the editor refuses to create — resolve as unlocked rather
 * than looping.
 */
export function lockedUnitIds(
  units: readonly UnitLockRow[],
  finished: ReadonlySet<string>,
): Set<string> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const locked = new Set<string>();
  const resolving = new Set<string>();
  const resolved = new Set<string>();

  const isLocked = (id: string): boolean => {
    if (resolved.has(id)) return locked.has(id);
    if (resolving.has(id)) return false; // cycle: never lock the whole chain out
    const unit = byId.get(id);
    if (!unit) return false;
    resolving.add(id);
    const prereqId = unit.prerequisiteUnitId;
    const value =
      prereqId !== null && byId.has(prereqId) && (!finished.has(prereqId) || isLocked(prereqId));
    resolving.delete(id);
    resolved.add(id);
    if (value) locked.add(id);
    return value;
  };

  for (const u of units) isLocked(u.id);
  return locked;
}

/**
 * Units a guest has finished: every published lesson of the unit is in
 * their local tally. Guests have no crowns, so completion is the only way
 * a prerequisite lifts for them.
 */
export function guestFinishedUnits(
  units: readonly { readonly id: string; readonly slug: string; readonly lessonCount: number }[],
  lessons: readonly { readonly unitSlug: string; readonly lessonId: string }[],
): Set<string> {
  const doneBySlug = new Map<string, Set<string>>();
  for (const l of lessons) {
    const set = doneBySlug.get(l.unitSlug) ?? new Set<string>();
    set.add(l.lessonId);
    doneBySlug.set(l.unitSlug, set);
  }
  const finished = new Set<string>();
  for (const u of units) {
    if (u.lessonCount <= 0) continue;
    if ((doneBySlug.get(u.slug)?.size ?? 0) >= u.lessonCount) finished.add(u.id);
  }
  return finished;
}
