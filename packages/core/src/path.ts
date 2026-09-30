/**
 * The learning path (docs/DESIGN.md "The path"). A path is a place, not a
 * list: units are stretches, skills are runs of lesson nodes, and a chest
 * closes each skill. Every rule here is pure so the server, the web app and
 * the mobile app draw the same node for the same lesson — a node that says
 * "listening" on one client and "mixed" on the other is a bug the type
 * system cannot catch, so the rule lives in exactly one place.
 */

import type { ExerciseType } from "./exercises/index.ts";

// ---------------------------------------------------------------------------
// What a lesson is
// ---------------------------------------------------------------------------

export const LESSON_KINDS = ["listen", "speak", "culture", "test", "mixed"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/** Exercises led by the ear. */
const LISTENING: ReadonlySet<string> = new Set<ExerciseType>([
  "listen_select",
  "select_listen",
  "click_identify",
]);
/** Exercises that ask the learner to say something out loud. */
const SPEAKING: ReadonlySet<string> = new Set<ExerciseType>(["speak", "click_drill"]);

/**
 * What a lesson drills, from the exercises it actually contains. The unit's
 * last lesson is its test whatever it holds — that is a position, not a
 * payload, so the caller passes it in.
 *
 * Speaking wins ties with listening: a click drill also plays audio, so
 * "you will be asked to speak" is the rarer and more useful warning.
 */
export function lessonKindOf(input: {
  readonly types: readonly ExerciseType[];
  readonly final?: boolean;
}): LessonKind {
  if (input.final === true) return "test";
  const types = input.types;
  if (types.length === 0) return "mixed";
  if (types.every((t) => t === "culture_card")) return "culture";
  const speaking = types.filter((t) => SPEAKING.has(t)).length;
  const listening = types.filter((t) => LISTENING.has(t)).length;
  if (speaking * 2 >= types.length) return "speak";
  if (listening * 2 >= types.length) return "listen";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Crowns and chests
// ---------------------------------------------------------------------------

/** A lesson node fills up as it is repeated; five is as full as it gets. */
export const MAX_CROWN_LEVEL = 5;

/** Crown level from the number of times a learner has finished the lesson. */
export function crownLevelOf(completions: number): number {
  if (!Number.isFinite(completions) || completions <= 0) return 0;
  return Math.min(MAX_CROWN_LEVEL, Math.floor(completions));
}

export type ChestState = "locked" | "ready" | "claimed";

/**
 * The chest at the end of a skill. It opens once every lesson in the skill
 * has been finished at least once, and only once ever: the claim is server
 * state (`skill_chests`), so it cannot be farmed by replaying a lesson.
 */
export function chestStateOf(input: {
  readonly lessons: readonly { readonly crownLevel: number }[];
  readonly claimed: boolean;
}): ChestState {
  if (input.claimed) return "claimed";
  if (input.lessons.length === 0) return "locked";
  return input.lessons.every((l) => l.crownLevel > 0) ? "ready" : "locked";
}

// ---------------------------------------------------------------------------
// The path itself
// ---------------------------------------------------------------------------

/**
 * `current` is the one node the learner is being pointed at; `open` is any
 * other node they may play; `done` has been finished at least once;
 * `locked` never navigates (a locked unit, or a guest past the free lesson).
 */
export type PathNodeState = "locked" | "current" | "open" | "done";

export interface PathLessonInput {
  readonly id: string;
  readonly order: number;
  readonly kind: LessonKind;
  readonly estimatedMinutes: number;
  readonly exerciseCount: number;
  /** How many times this learner has finished it. */
  readonly crownLevel: number;
}

export interface PathSkillInput {
  readonly id: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly kind: string;
  readonly lessons: readonly PathLessonInput[];
  readonly chestClaimed: boolean;
}

export interface PathUnitInput {
  readonly id: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly cefrBand: string;
  readonly locked: boolean;
  readonly prerequisiteSlug: string | null;
  readonly prerequisiteTitleKey: string | null;
  readonly skills: readonly PathSkillInput[];
}

export interface PathUnitRow {
  readonly type: "unit";
  readonly key: string;
  readonly unitId: string;
  readonly unitSlug: string;
  readonly titleKey: string;
  readonly cefrBand: string;
  readonly locked: boolean;
  readonly prerequisiteSlug: string | null;
  readonly prerequisiteTitleKey: string | null;
  /** 1-based position in the path, for "Unit 3". */
  readonly unitNumber: number;
  /** Lessons in this unit already finished, and how many there are. */
  readonly done: number;
  readonly total: number;
}

export interface PathSkillRow {
  readonly type: "skill";
  readonly key: string;
  readonly unitId: string;
  readonly unitSlug: string;
  readonly skillId: string;
  readonly titleKey: string;
  readonly kind: string;
}

export interface PathLessonRow {
  readonly type: "lesson";
  readonly key: string;
  readonly unitId: string;
  readonly unitSlug: string;
  readonly skillId: string;
  readonly lessonId: string;
  readonly order: number;
  readonly kind: LessonKind;
  readonly estimatedMinutes: number;
  readonly exerciseCount: number;
  readonly crownLevel: number;
  readonly state: PathNodeState;
  /** −1, 0 or 1: how far off the spine the node sits, so the path winds. */
  readonly offset: -1 | 0 | 1;
  /** Position among the nodes of the whole path, for staggered entrances. */
  readonly index: number;
}

export interface PathChestRow {
  readonly type: "chest";
  readonly key: string;
  readonly unitId: string;
  readonly unitSlug: string;
  readonly skillId: string;
  readonly titleKey: string;
  readonly state: ChestState;
  readonly xp: number;
  readonly index: number;
}

export type PathRow = PathUnitRow | PathSkillRow | PathLessonRow | PathChestRow;

/** The winding: a gentle four-step S, centred every other node. */
const OFFSETS: readonly (-1 | 0 | 1)[] = [0, 1, 0, -1];

export interface BuildPathOptions {
  /** Lessons the learner may not open even though the unit is unlocked (the guest wall). */
  readonly lockedLessonIds?: ReadonlySet<string>;
  /** XP a chest grants; passed in so the constant stays with the other XP numbers. */
  readonly chestXp: number;
}

/**
 * Flattens the path into the rows a client renders in order. One list for
 * both clients: the web page maps it to elements, the mobile screen feeds
 * it to a windowed `FlatList`, and the unit headers are exactly the rows a
 * sticky header can key on.
 */
export function buildPath(
  units: readonly PathUnitInput[],
  options: BuildPathOptions,
): readonly PathRow[] {
  const locked = options.lockedLessonIds ?? new Set<string>();
  const rows: PathRow[] = [];
  let node = 0;
  let currentTaken = false;

  units.forEach((unit, unitIndex) => {
    const lessons = unit.skills.flatMap((s) => s.lessons);
    rows.push({
      type: "unit",
      key: `unit:${unit.id}`,
      unitId: unit.id,
      unitSlug: unit.slug,
      titleKey: unit.titleKey,
      cefrBand: unit.cefrBand,
      locked: unit.locked,
      prerequisiteSlug: unit.prerequisiteSlug,
      prerequisiteTitleKey: unit.prerequisiteTitleKey,
      unitNumber: unitIndex + 1,
      done: lessons.filter((l) => l.crownLevel > 0).length,
      total: lessons.length,
    });

    for (const skill of unit.skills) {
      rows.push({
        type: "skill",
        key: `skill:${skill.id}`,
        unitId: unit.id,
        unitSlug: unit.slug,
        skillId: skill.id,
        titleKey: skill.titleKey,
        kind: skill.kind,
      });

      for (const lesson of skill.lessons) {
        const done = lesson.crownLevel > 0;
        const shut = unit.locked || locked.has(lesson.id);
        let state: PathNodeState;
        if (shut) state = "locked";
        else if (done) state = "done";
        else if (!currentTaken) {
          state = "current";
          currentTaken = true;
        } else state = "open";
        rows.push({
          type: "lesson",
          key: `lesson:${lesson.id}`,
          unitId: unit.id,
          unitSlug: unit.slug,
          skillId: skill.id,
          lessonId: lesson.id,
          order: lesson.order,
          kind: lesson.kind,
          estimatedMinutes: lesson.estimatedMinutes,
          exerciseCount: lesson.exerciseCount,
          crownLevel: lesson.crownLevel,
          state,
          offset: OFFSETS[node % OFFSETS.length] ?? 0,
          index: node,
        });
        node++;
      }

      rows.push({
        type: "chest",
        key: `chest:${skill.id}`,
        unitId: unit.id,
        unitSlug: unit.slug,
        skillId: skill.id,
        titleKey: skill.titleKey,
        state: unit.locked
          ? "locked"
          : chestStateOf({ lessons: skill.lessons, claimed: skill.chestClaimed }),
        xp: options.chestXp,
        index: node,
      });
      node++;
    }
  });

  return rows;
}

// ---------------------------------------------------------------------------
// The guide
// ---------------------------------------------------------------------------

/** A week away is long enough that a word from the guide is welcome, not noise. */
export const LONG_ABSENCE_DAYS = 7;

/** Nothing at all is the normal case: the crane only speaks when it has cause. */
export type GuideSpeech = "first" | "back" | null;

/**
 * Whether the crane says something. Both clients keep the last visit
 * themselves (localStorage, AsyncStorage) and ask this the same question,
 * so the guide behaves identically on web and on the phone.
 */
export function guideSpeechFor(lastSeen: string | null, today: string): GuideSpeech {
  if (!lastSeen) return "first";
  const then = Date.parse(`${lastSeen}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return "first";
  return now - then >= LONG_ABSENCE_DAYS * 86_400_000 ? "back" : null;
}

/** The lesson the mascot stands beside, or null when there is nothing to do. */
export function currentNodeKey(rows: readonly PathRow[]): string | null {
  const lesson = rows.find((r) => r.type === "lesson" && r.state === "current");
  if (lesson) return lesson.key;
  const chest = rows.find((r) => r.type === "chest" && r.state === "ready");
  return chest ? chest.key : null;
}

// ---------------------------------------------------------------------------
// The trail between the nodes
// ---------------------------------------------------------------------------

/** Where a node sits across the path, in steps off the spine. */
export type NodeOffset = -1 | 0 | 1;

/** The rows that are stops on the trail. */
export type PathStopRow = PathLessonRow | PathChestRow;

/** Lessons wind; a chest sits on the spine, the pause in the winding. */
export function nodeOffsetOf(row: PathStopRow): NodeOffset {
  return row.type === "lesson" ? row.offset : 0;
}

/**
 * `done` is walked: the stop above is finished and the stop below reached
 * (a lesson done or current, a chest ready or claimed), which in the usual
 * order is every stretch up to the current node. `ahead` is still to walk.
 * `locked` touches a stop that cannot be played (a locked unit, the guest
 * wall).
 */
export type LinkState = "done" | "ahead" | "locked";

/** One stretch of trail between two stops of the same skill. */
export interface PathLink {
  /** `link:` and the row key of the stop above: at most one link leaves a stop. */
  readonly key: string;
  readonly unitId: string;
  /** Offsets of the stop above and the stop below. */
  readonly from: NodeOffset;
  readonly to: NodeOffset;
  readonly state: LinkState;
  /**
   * The last walked link of its unit. A client may draw it on once, the
   * first time it sees it walked, so finishing a lesson visibly extends the
   * trail; every other link is simply there.
   */
  readonly latest: boolean;
}

/** The links whose halves a stop's row draws. */
export interface NodeLinks {
  /** Arriving from the stop above; null where a run of the trail starts. */
  readonly above: PathLink | null;
  /** Leaving for the stop below; null where a run of the trail ends. */
  readonly below: PathLink | null;
}

function stopShut(row: PathStopRow, unitLocked: boolean): boolean {
  return row.type === "lesson" ? row.state === "locked" : unitLocked;
}

function stopWalked(row: PathStopRow): boolean {
  return row.type === "lesson" ? row.state === "done" : row.state !== "locked";
}

function stopReached(row: PathStopRow): boolean {
  return row.type === "lesson"
    ? row.state === "done" || row.state === "current"
    : row.state !== "locked";
}

/**
 * The trail, keyed by the row key of each stop. It breaks at every skill
 * title and unit header: the chest closes its skill, and a title the line
 * had to cross (or detour round) would be harder to read. So the first
 * lesson of a skill has nothing above it, and a chest nothing below.
 */
export function pathLinks(rows: readonly PathRow[]): ReadonlyMap<string, NodeLinks> {
  interface Draft {
    key: string;
    unitId: string;
    from: NodeOffset;
    to: NodeOffset;
    state: LinkState;
    latest: boolean;
    upper: string;
    lower: string;
  }
  const drafts: Draft[] = [];
  const stops: string[] = [];
  let unitLocked = false;
  let prev: PathStopRow | null = null;

  for (const row of rows) {
    if (row.type === "unit") {
      unitLocked = row.locked;
      prev = null;
      continue;
    }
    if (row.type === "skill") {
      prev = null;
      continue;
    }
    stops.push(row.key);
    if (prev) {
      const state: LinkState =
        stopShut(prev, unitLocked) || stopShut(row, unitLocked)
          ? "locked"
          : stopWalked(prev) && stopReached(row)
            ? "done"
            : "ahead";
      drafts.push({
        key: `link:${prev.key}`,
        unitId: row.unitId,
        from: nodeOffsetOf(prev),
        to: nodeOffsetOf(row),
        state,
        latest: false,
        upper: prev.key,
        lower: row.key,
      });
    }
    prev = row;
  }

  const lastWalked = new Map<string, Draft>();
  for (const d of drafts) if (d.state === "done") lastWalked.set(d.unitId, d);
  for (const d of lastWalked.values()) d.latest = true;

  const above = new Map<string, PathLink>();
  const below = new Map<string, PathLink>();
  for (const { upper, lower, ...link } of drafts) {
    below.set(upper, link);
    above.set(lower, link);
  }
  const out = new Map<string, NodeLinks>();
  for (const key of stops)
    out.set(key, { above: above.get(key) ?? null, below: below.get(key) ?? null });
  return out;
}

/**
 * How both clients draw the trail. Units are points on the phone and, on
 * the web, CSS pixels at the default text size (the web scales the drawing
 * with rem through a viewBox, as it does the nodes).
 */
export const LINK_STYLE = {
  /** A node one step off the spine: the web's `translate-x-14`, mobile's `SHIFT`. */
  shift: 56,
  /** The drawing box, centred on the spine: the widest step and a round cap either side. */
  width: 128,
  stroke: 5,
  /** Dash and gap of a stretch still to walk; each round cap adds half the stroke to a dash. */
  dash: 6,
  gap: 12,
  /** How far the curve leans at a row edge; one number, so two halves meet without a kink. */
  lean: 12,
  /** A newly walked link draws on over this long, the stop above's half first. */
  drawMs: 900,
} as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One stop's half of a link, as a cubic Bézier. */
export interface LinkCurve {
  /** The row edge, two controls, and the point under the node's centre. */
  readonly points: readonly [Point, Point, Point, Point];
  /** SVG path data for `points`. */
  readonly d: string;
  /** Arc length, for drawing it on. */
  readonly length: number;
  /** Dash offset for a straight run that carries on from the curve's end. */
  readonly runDashOffset: number;
}

/** Where every half's dashes begin: half a dash in, so two halves meeting at a row edge make one whole dash. */
export const LINK_DASH_START = LINK_STYLE.dash / 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bezierAt(p: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  };
}

/** Points along a curve, for measuring it and for tests that it stays in its lane. */
export function sampleCurve(
  points: readonly [Point, Point, Point, Point],
  steps: number = 48,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) out.push(bezierAt(points, i / steps));
  return out;
}

/**
 * One stop's half of the link to a neighbour, from the two nodes' offsets.
 *
 * The box is `width` wide with the spine down its middle; y = 0 is the row
 * edge the link crosses and y grows towards the node. The half below a
 * node is the same drawing mirrored top to bottom, so a client flips that
 * box rather than asking for different geometry.
 *
 * The halves meet on the row edge halfway between the two nodes, leaning
 * by the same `lean` from both sides, so the join is smooth whatever the
 * two rows' heights; each half arrives at its node travelling straight
 * down, `reach` from the edge (the row edge to the node's centre). Both
 * halves start at the edge, so their dashes are in phase there without
 * either knowing the other's length. The curve never leaves the band
 * between the join and its node, which keeps it clear of anything beside
 * the node.
 */
export function linkHalf(input: {
  readonly self: NodeOffset;
  readonly other: NodeOffset;
  readonly reach: number;
  readonly shift?: number;
  readonly lean?: number;
  readonly width?: number;
}): LinkCurve {
  const shift = input.shift ?? LINK_STYLE.shift;
  const width = input.width ?? LINK_STYLE.width;
  const reach = Math.max(0, input.reach);
  const lean = Math.min(input.lean ?? LINK_STYLE.lean, reach / 2);
  const spine = width / 2;
  const edgeX = spine + (shift * (input.self + input.other)) / 2;
  const nodeX = spine + shift * input.self;
  const points: [Point, Point, Point, Point] = [
    { x: edgeX, y: 0 },
    { x: edgeX + (nodeX - edgeX) / 2, y: lean },
    { x: nodeX, y: reach / 2 },
    { x: nodeX, y: reach },
  ];
  let length = 0;
  const samples = sampleCurve(points);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const [p0, p1, p2, p3] = points;
  const d =
    `M${round2(p0.x)} ${round2(p0.y)}` +
    `C${round2(p1.x)} ${round2(p1.y)} ${round2(p2.x)} ${round2(p2.y)} ${round2(p3.x)} ${round2(p3.y)}`;
  return {
    points,
    d,
    length,
    runDashOffset: (LINK_DASH_START + length) % (LINK_STYLE.dash + LINK_STYLE.gap),
  };
}

/**
 * Remembers, per unit, which walked link a client has already shown, so a
 * newly walked one draws on exactly once. The two halves of a link live in
 * different rows and ask separately: the first to ask starts the clock and
 * the second is given the same start for as long as the draw lasts. The
 * first sighting of a unit only records, so opening the app never replays
 * old progress. One instance per client, at module level.
 */
export function createLinkDrawMemory(drawMs: number = LINK_STYLE.drawMs): {
  /** When the draw-on of `link` began (ms), or null when it should simply be there. */
  readonly start: (link: Pick<PathLink, "key" | "unitId">, now: number) => number | null;
} {
  const shown = new Map<string, string>();
  const began = new Map<string, number>();
  return {
    start(link, now) {
      const at = began.get(link.key);
      if (at !== undefined) {
        if (now - at < drawMs) return at;
        began.delete(link.key);
      }
      const before = shown.get(link.unitId);
      shown.set(link.unitId, link.key);
      if (before === undefined || before === link.key) return null;
      began.set(link.key, now);
      return now;
    },
  };
}

/**
 * The share of a draw-on one half plays. The trail is walked downwards, so
 * the half in the upper stop's row (that stop's `below`) draws in the first
 * half of the time and the half in the lower stop's row (its `above`) in
 * the second. Null when that half's turn is already over.
 */
export function linkDrawWindow(
  half: keyof NodeLinks,
  started: number,
  now: number,
  drawMs: number = LINK_STYLE.drawMs,
): { readonly delay: number; readonly duration: number } | null {
  const share = drawMs / 2;
  const from = half === "below" ? 0 : share;
  const until = from + share;
  const elapsed = Math.max(0, now - started);
  if (elapsed >= until) return null;
  return { delay: Math.max(0, from - elapsed), duration: until - Math.max(from, elapsed) };
}
