/**
 * Folding the Phase-0 `unit-1` into the spine's `greet-and-introduce`.
 *
 * Production carries two draft "Unit 1"s: the seed from the spike and the
 * one `molo content curate` wrote from `curriculum/spine.json`
 * (docs/curriculum-audit.md section 1). This plans the move from the first
 * into the second, as a list of steps an editor can read before anything is
 * written. It is a pure function over a snapshot so the dry run and the live
 * run are the same decision, and so every rule can be tested on fixtures.
 *
 * What it plans, in the order it is applied:
 *
 *   1. `hear-the-three-clicks` gains a first lesson of `click_identify`
 *      exercises, one per spine set; the lessons already there move down one.
 *   2. The old `click_drill` exercises join that lesson, after the sets,
 *      exactly as they are (their minimal pairs are still empty and still say
 *      so; tutor-questions.md "Click pairs" asks for them).
 *   3. The old culture card joins `greet-someone`.
 *   4. The relevance guard (`themeVeto`, the rule curation itself now obeys)
 *      takes the words the matcher chose by the wrong sense out of every
 *      exercise in the unit. An exercise that cannot stand without them is
 *      deleted.
 *   5. The grammar notes on `unit-1/classes` move to the skills
 *      `curriculum/grammar-notes.json` now names.
 *   6. The old unit: the status machine has no `draft -> retired` edge, so it
 *      cannot be retired. It stays draft (invisible to learners) unless the
 *      operator asks for it to be deleted, which is the dashboard's own rule
 *      for a row nobody ever published.
 *
 * What it never does: write isiXhosa, choose a word, or set a status. Every
 * payload it writes is either one it found or one it found minus some ids.
 */

import {
  clickIdsForSet,
  decodeExercisePayload,
  referencedIds,
  type ClickIdentifySet,
  type ExercisePayload,
  type Status,
} from "@molo/core";
import { Either } from "effect";

import type { Theme } from "./curriculum/spine.ts";
import { themeVeto } from "./curriculum/themes.ts";

// ---------------------------------------------------------------------------
// the snapshot
// ---------------------------------------------------------------------------

export interface RcExercise {
  readonly id: string;
  readonly order: number;
  readonly type: string;
  readonly status: Status;
  readonly payload: unknown;
}

export interface RcLesson {
  readonly id: string;
  readonly order: number;
  readonly status: Status;
  readonly exercises: readonly RcExercise[];
}

export interface RcSkill {
  readonly id: string;
  readonly slug: string;
  readonly status: Status;
  readonly lessons: readonly RcLesson[];
}

export interface RcUnit {
  readonly id: string;
  readonly slug: string;
  readonly status: Status;
  readonly skills: readonly RcSkill[];
}

export interface RcGrammarNote {
  readonly id: string;
  readonly slug: string;
  readonly status: Status;
  readonly order: number;
  readonly unitSlug: string;
  readonly skillSlug: string;
}

export interface RcLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly nounClassLabel: string | null;
  /** English glosses; the guard reads nothing else. */
  readonly glosses: readonly string[];
}

export interface ReconcileSnapshot {
  readonly oldUnit: RcUnit | null;
  readonly newUnit: RcUnit | null;
  /** Every grammar note whose slug `curriculum/grammar-notes.json` names, wherever it is. */
  readonly notes: readonly RcGrammarNote[];
  /** `unit/skill` -> skill id, for every skill a grammar note may move to. */
  readonly skillIds: Readonly<Record<string, string>>;
  /** Every lexeme an exercise of either unit references, or a sentence of one contains. */
  readonly lexemes: Readonly<Record<string, RcLexeme>>;
  /** Sentence id -> the lexemes its tokens are. */
  readonly sentenceLexemes: Readonly<Record<string, readonly string[]>>;
}

export interface ReconcileSpec {
  readonly oldUnitSlug: string;
  readonly newUnitSlug: string;
  readonly clickSkillSlug: string;
  readonly cultureSkillSlug: string;
  readonly clickSets: readonly ClickIdentifySet[];
  /** Skill slug in the new unit -> its theme; the guard judges each exercise by its skill's. */
  readonly themeBySkill: Readonly<Record<string, Theme>>;
  /** Where each grammar note belongs now, from `curriculum/grammar-notes.json`. */
  readonly notes: readonly {
    readonly slug: string;
    readonly unitSlug: string;
    readonly skillSlug: string;
    readonly order: number;
  }[];
  /** Delete the old unit once it holds nothing that belongs elsewhere. */
  readonly deleteOldUnit: boolean;
}

// ---------------------------------------------------------------------------
// the plan
// ---------------------------------------------------------------------------

/** A lesson that exists, or the one step 1 creates. */
export type LessonRef = { readonly id: string } | { readonly created: "click-identify" };

export interface RemovedWord {
  readonly lexemeId: string;
  readonly lemma: string;
  readonly gloss: string;
  readonly why: string;
}

export type ReconcileStep =
  | {
      readonly kind: "shift_lesson";
      readonly lessonId: string;
      readonly skill: string;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: "create_lesson";
      readonly ref: "click-identify";
      readonly skillId: string;
      readonly skill: string;
      readonly order: number;
    }
  | {
      readonly kind: "create_exercise";
      readonly lesson: LessonRef;
      readonly order: number;
      readonly type: "click_identify";
      readonly payload: ExercisePayload;
      readonly note: string;
    }
  | {
      readonly kind: "move_exercise";
      readonly exerciseId: string;
      readonly type: string;
      readonly from: string;
      readonly to: string;
      readonly lesson: LessonRef;
      readonly order: number;
    }
  | {
      readonly kind: "update_exercise";
      readonly exerciseId: string;
      readonly type: string;
      readonly where: string;
      readonly payload: ExercisePayload;
      readonly removed: readonly RemovedWord[];
    }
  | {
      readonly kind: "delete_exercise";
      readonly exerciseId: string;
      readonly type: string;
      readonly where: string;
      readonly why: string;
      readonly removed: readonly RemovedWord[];
    }
  | {
      readonly kind: "move_grammar_note";
      readonly noteId: string;
      readonly slug: string;
      readonly from: string;
      readonly to: string;
      readonly skillId: string;
      readonly order: number;
    }
  | {
      readonly kind: "delete_old_unit";
      readonly unitId: string;
      readonly slug: string;
      /** What goes with it, so the dry run says what is lost. */
      readonly remaining: readonly string[];
    };

export interface ReconcilePlan {
  readonly steps: readonly ReconcileStep[];
  /** Things the plan could not do and why; the operator reads these. */
  readonly problems: readonly string[];
  /** What the old unit is left holding once the steps are applied. */
  readonly oldUnitLeft: readonly string[];
}

const NEVER_PUBLISHED: ReadonlySet<Status> = new Set(["draft", "ai_draft"]);

export const CLICK_IDENTIFY_NOTE =
  "Added by `molo content reconcile-unit-1` from curriculum/spine.json (clickIdentifySets). " +
  "Draft: bare clicks only, no word. Cannot publish until every click in the set has a " +
  "published tier-1 studio recording.";

export function planReconcileUnit1(snap: ReconcileSnapshot, spec: ReconcileSpec): ReconcilePlan {
  const steps: ReconcileStep[] = [];
  const problems: string[] = [];
  const oldUnit = snap.oldUnit;
  const newUnit = snap.newUnit;

  if (!newUnit) {
    problems.push(
      `unit ${spec.newUnitSlug} does not exist; run \`molo content curate --live\` first`,
    );
    return { steps, problems, oldUnitLeft: describe(oldUnit, new Set(), snap) };
  }
  const skillBySlug = new Map(newUnit.skills.map((s) => [s.slug, s]));
  /** Where each exercise ends up, for the guard: exercise id -> skill slug. */
  const destination = new Map<string, string>();
  for (const s of newUnit.skills)
    for (const l of s.lessons) for (const e of l.exercises) destination.set(e.id, s.slug);
  const moved = new Set<string>();
  const exerciseById = new Map<string, RcExercise>();
  for (const u of [oldUnit, newUnit])
    for (const s of u?.skills ?? [])
      for (const l of s.lessons) for (const e of l.exercises) exerciseById.set(e.id, e);

  // ---- 1. the click-identify lesson ------------------------------------
  const clickSkill = skillBySlug.get(spec.clickSkillSlug);
  let identifyLesson: LessonRef | null = null;
  let nextOrderInIdentify = 1;
  if (!clickSkill) {
    problems.push(`skill ${spec.newUnitSlug}/${spec.clickSkillSlug} does not exist`);
  } else {
    const holding = clickSkill.lessons.find((l) =>
      l.exercises.some((e) => e.type === "click_identify"),
    );
    if (holding) {
      identifyLesson = { id: holding.id };
      nextOrderInIdentify = maxOrder(holding.exercises) + 1;
      const have = new Set(
        holding.exercises.flatMap((e) => {
          const p = decoded(e.payload);
          return p?.type === "click_identify" ? [p.set] : [];
        }),
      );
      for (const set of spec.clickSets) {
        if (have.has(set)) continue;
        steps.push(identifyStep(identifyLesson, nextOrderInIdentify++, set));
      }
    } else {
      for (const l of [...clickSkill.lessons].sort((a, b) => b.order - a.order)) {
        steps.push({
          kind: "shift_lesson",
          lessonId: l.id,
          skill: clickSkill.slug,
          from: l.order,
          to: l.order + 1,
        });
      }
      steps.push({
        kind: "create_lesson",
        ref: "click-identify",
        skillId: clickSkill.id,
        skill: clickSkill.slug,
        order: 1,
      });
      identifyLesson = { created: "click-identify" };
      for (const set of spec.clickSets)
        steps.push(identifyStep(identifyLesson, nextOrderInIdentify++, set));
    }
  }

  // ---- 2 + 3. what moves out of the old unit ----------------------------
  const oldExercises = (oldUnit?.skills ?? []).flatMap((s) =>
    [...s.lessons]
      .sort((a, b) => a.order - b.order)
      .flatMap((l) =>
        [...l.exercises]
          .sort((a, b) => a.order - b.order)
          .map((e) => ({ e, where: `${oldUnit?.slug}/${s.slug}/lesson ${l.order}` })),
      ),
  );
  const drills = oldExercises
    .filter((x) => x.e.type === "click_drill")
    .sort((a, b) => setOf(a.e).localeCompare(setOf(b.e)));
  for (const { e, where } of drills) {
    if (!identifyLesson) break;
    if (!NEVER_PUBLISHED.has(e.status)) {
      problems.push(`click drill ${e.id} is ${e.status}; only a draft moves, left in ${where}`);
      continue;
    }
    steps.push({
      kind: "move_exercise",
      exerciseId: e.id,
      type: e.type,
      from: where,
      to: `${spec.newUnitSlug}/${spec.clickSkillSlug}/lesson 1`,
      lesson: identifyLesson,
      order: nextOrderInIdentify++,
    });
    moved.add(e.id);
    destination.set(e.id, spec.clickSkillSlug);
  }

  const cultureSkill = skillBySlug.get(spec.cultureSkillSlug);
  const cards = oldExercises.filter((x) => x.e.type === "culture_card");
  if (cards.length > 0) {
    const first = cultureSkill
      ? [...cultureSkill.lessons].sort((a, b) => a.order - b.order)[0]
      : undefined;
    if (!cultureSkill || !first) {
      problems.push(
        `skill ${spec.newUnitSlug}/${spec.cultureSkillSlug} has no lesson to take the culture card`,
      );
    } else {
      let order = maxOrder(first.exercises) + 1;
      for (const { e, where } of cards) {
        if (!NEVER_PUBLISHED.has(e.status)) {
          problems.push(
            `culture card ${e.id} is ${e.status}; only a draft moves, left in ${where}`,
          );
          continue;
        }
        steps.push({
          kind: "move_exercise",
          exerciseId: e.id,
          type: e.type,
          from: where,
          to: `${spec.newUnitSlug}/${spec.cultureSkillSlug}/lesson ${first.order}`,
          lesson: { id: first.id },
          order: order++,
        });
        moved.add(e.id);
        destination.set(e.id, spec.cultureSkillSlug);
      }
    }
  }

  // ---- 4. the relevance guard -------------------------------------------
  for (const [exerciseId, skillSlug] of destination) {
    const e = exerciseById.get(exerciseId);
    const theme = spec.themeBySkill[skillSlug];
    if (!e || !theme) continue;
    const payload = decoded(e.payload);
    if (!payload) continue;
    const bad = new Map<string, RemovedWord>();
    const judge = (id: string) => {
      if (bad.has(id)) return true;
      const lx = snap.lexemes[id];
      if (!lx) return false;
      const why = themeVeto(theme, lx);
      if (why === null) return false;
      bad.set(id, { lexemeId: id, lemma: lx.lemma, gloss: lx.glosses.join("; "), why });
      return true;
    };
    const result = stripOffTopic(
      payload,
      judge,
      snap,
      (id) => snap.lexemes[id]?.nounClassLabel ?? null,
    );
    if (result.kind === "unchanged") continue;
    const where = `${spec.newUnitSlug}/${skillSlug}${moved.has(e.id) ? " (moved)" : ""}`;
    if (!NEVER_PUBLISHED.has(e.status)) {
      problems.push(
        `${e.type} ${e.id} in ${where} uses off-topic words but is ${e.status}; retire it by hand`,
      );
      continue;
    }
    if (result.kind === "drop") {
      steps.push({
        kind: "delete_exercise",
        exerciseId: e.id,
        type: e.type,
        where,
        why: result.why,
        removed: [...bad.values()],
      });
    } else {
      steps.push({
        kind: "update_exercise",
        exerciseId: e.id,
        type: e.type,
        where,
        payload: result.payload,
        removed: [...bad.values()],
      });
    }
  }

  // ---- 5. grammar notes ---------------------------------------------------
  const movedNotes = new Set<string>();
  for (const want of spec.notes) {
    const target = `${want.unitSlug}/${want.skillSlug}`;
    const rows = snap.notes.filter((n) => n.slug === want.slug);
    const onOld = rows.filter((n) => n.unitSlug === spec.oldUnitSlug);
    const atTarget = rows.find((n) => `${n.unitSlug}/${n.skillSlug}` === target);
    if (onOld.length === 0) continue;
    if (atTarget) {
      problems.push(
        `grammar note ${want.slug} is already on ${target} and also on ${spec.oldUnitSlug}; delete the old copy by hand`,
      );
      continue;
    }
    const skillId = snap.skillIds[target];
    if (!skillId) {
      problems.push(
        `grammar note ${want.slug} belongs on ${target}, which does not exist; run \`molo content curate --live\` first`,
      );
      continue;
    }
    const [note, ...extra] = onOld;
    if (!note) continue;
    if (extra.length > 0)
      problems.push(
        `grammar note ${want.slug} is on ${spec.oldUnitSlug} more than once; moving one`,
      );
    if (!NEVER_PUBLISHED.has(note.status)) {
      problems.push(`grammar note ${want.slug} is ${note.status}; only a draft moves`);
      continue;
    }
    steps.push({
      kind: "move_grammar_note",
      noteId: note.id,
      slug: note.slug,
      from: `${note.unitSlug}/${note.skillSlug}`,
      to: target,
      skillId,
      order: want.order,
    });
    movedNotes.add(note.id);
  }

  // ---- 6. the old unit ------------------------------------------------------
  const left = describe(oldUnit, moved, snap, movedNotes);
  if (oldUnit && spec.deleteOldUnit) {
    const blocking = [
      ...(NEVER_PUBLISHED.has(oldUnit.status) ? [] : [`the unit is ${oldUnit.status}`]),
      ...oldUnit.skills.flatMap((s) => [
        ...(NEVER_PUBLISHED.has(s.status) ? [] : [`skill ${s.slug} is ${s.status}`]),
        ...s.lessons.flatMap((l) => [
          ...(NEVER_PUBLISHED.has(l.status) ? [] : [`${s.slug} lesson ${l.order} is ${l.status}`]),
          ...l.exercises
            .filter((e) => !moved.has(e.id) && !NEVER_PUBLISHED.has(e.status))
            .map((e) => `${e.type} ${e.id} is ${e.status}`),
        ]),
      ]),
      ...snap.notes
        .filter((n) => n.unitSlug === oldUnit.slug && !movedNotes.has(n.id))
        .map((n) => `grammar note ${n.slug} has not moved (deleting the unit would delete it)`),
    ];
    if (blocking.length > 0) {
      problems.push(`not deleting ${oldUnit.slug}: ${blocking.join("; ")}`);
    } else {
      steps.push({
        kind: "delete_old_unit",
        unitId: oldUnit.id,
        slug: oldUnit.slug,
        remaining: left,
      });
    }
  }
  return { steps, problems, oldUnitLeft: left };
}

/**
 * The words the new unit will reference once the plan is applied, skill by
 * skill: every lexeme its exercises name, distractors included, after the
 * moves, updates and deletions. What a tutor guide for the unit is built on.
 */
export function wordsAfter(
  snap: ReconcileSnapshot,
  plan: ReconcilePlan,
  spec: Pick<ReconcileSpec, "clickSkillSlug" | "cultureSkillSlug">,
): { readonly skill: string; readonly words: readonly RcLexeme[] }[] {
  const payloadOf = new Map<string, unknown>();
  const skillOf = new Map<string, string>();
  for (const s of snap.newUnit?.skills ?? [])
    for (const l of s.lessons)
      for (const e of l.exercises) {
        payloadOf.set(e.id, e.payload);
        skillOf.set(e.id, s.slug);
      }
  const oldById = new Map(
    (snap.oldUnit?.skills ?? []).flatMap((s) =>
      s.lessons.flatMap((l) => l.exercises.map((e) => [e.id, e] as const)),
    ),
  );
  for (const step of plan.steps) {
    if (step.kind === "move_exercise") {
      payloadOf.set(step.exerciseId, oldById.get(step.exerciseId)?.payload);
      skillOf.set(
        step.exerciseId,
        step.type === "culture_card" ? spec.cultureSkillSlug : spec.clickSkillSlug,
      );
    } else if (step.kind === "update_exercise") payloadOf.set(step.exerciseId, step.payload);
    else if (step.kind === "delete_exercise") payloadOf.delete(step.exerciseId);
  }
  const bySkill = new Map<string, Set<string>>();
  for (const [id, payload] of payloadOf) {
    const p = decoded(payload);
    const skill = skillOf.get(id);
    if (!p || !skill) continue;
    const set = bySkill.get(skill) ?? new Set<string>();
    const refs = referencedIds(p);
    for (const lx of refs.lexemeIds) set.add(lx);
    for (const s of refs.sentenceIds) for (const lx of snap.sentenceLexemes[s] ?? []) set.add(lx);
    bySkill.set(skill, set);
  }
  const order = (snap.newUnit?.skills ?? []).map((s) => s.slug);
  return order.map((skill) => ({
    skill,
    words: [...(bySkill.get(skill) ?? [])]
      .flatMap((id) => snap.lexemes[id] ?? [])
      .sort((a, b) => a.lemma.localeCompare(b.lemma, "en")),
  }));
}

function identifyStep(lesson: LessonRef, order: number, set: ClickIdentifySet): ReconcileStep {
  return {
    kind: "create_exercise",
    lesson,
    order,
    type: "click_identify",
    payload: { type: "click_identify", set, clicks: clickIdsForSet(set) },
    note: CLICK_IDENTIFY_NOTE,
  };
}

function maxOrder(rows: readonly { readonly order: number }[]): number {
  return rows.reduce((m, r) => Math.max(m, r.order), 0);
}

function decoded(payload: unknown): ExercisePayload | null {
  const r = decodeExercisePayload(payload);
  return Either.isRight(r) ? r.right : null;
}

function setOf(e: RcExercise): string {
  const p = decoded(e.payload);
  return p?.type === "click_drill" ? p.set : "";
}

/** What the old unit still holds after the plan, one line per exercise and note. */
function describe(
  unit: RcUnit | null,
  moved: ReadonlySet<string>,
  snap: ReconcileSnapshot,
  movedNotes: ReadonlySet<string> = new Set(),
): string[] {
  if (!unit) return [];
  const out: string[] = [];
  for (const s of unit.skills)
    for (const l of s.lessons)
      for (const e of l.exercises)
        if (!moved.has(e.id))
          out.push(`${s.slug}/lesson ${l.order}/${e.order} ${e.type} (${e.status})`);
  for (const n of snap.notes)
    if (n.unitSlug === unit.slug && !movedNotes.has(n.id))
      out.push(`grammar note ${n.slug} on ${n.skillSlug} (${n.status})`);
  return out;
}

type Stripped =
  | { readonly kind: "unchanged" }
  | { readonly kind: "drop"; readonly why: string }
  | { readonly kind: "update"; readonly payload: ExercisePayload };

/**
 * The payload without the words `isBad` refuses, or why the exercise cannot
 * stand without them. Only ids are removed; nothing is added or reworded.
 */
export function stripOffTopic(
  p: ExercisePayload,
  isBad: (lexemeId: string) => boolean,
  snap: Pick<ReconcileSnapshot, "sentenceLexemes">,
  classOf: (lexemeId: string) => string | null,
): Stripped {
  const sentenceBad = (id: string) => (snap.sentenceLexemes[id] ?? []).some((x) => isBad(x));
  // Every id is judged, not only the first bad one, so the report lists them all.
  const judgeAll = (ids: readonly string[]) => ids.map((id) => isBad(id)).some(Boolean);
  switch (p.type) {
    case "listen_select":
    case "select_listen": {
      const promptBad = isBad(p.prompt.lexemeId);
      const optionsBad = judgeAll(p.options.map((o) => o.lexemeId));
      if (!promptBad && !optionsBad) return { kind: "unchanged" };
      if (promptBad) return { kind: "drop", why: "the word it asks about is off-topic" };
      const options = p.options.filter((o) => !isBad(o.lexemeId));
      if (options.length < 2) return { kind: "drop", why: "fewer than two options would be left" };
      return { kind: "update", payload: { ...p, options } };
    }
    case "match_pairs": {
      if (!judgeAll(p.pairs.map((x) => x.lexemeId))) return { kind: "unchanged" };
      const pairs = p.pairs.filter((x) => !isBad(x.lexemeId));
      if (pairs.length < 2) return { kind: "drop", why: "fewer than two pairs would be left" };
      return { kind: "update", payload: { ...p, pairs } };
    }
    case "class_sort": {
      if (!judgeAll(p.items.map((x) => x.lexemeId))) return { kind: "unchanged" };
      const items = p.items.filter((x) => !isBad(x.lexemeId));
      const classes = new Set(items.map((i) => classOf(i.lexemeId)));
      const buckets = p.buckets.filter((b) => classes.has(b));
      if (items.length < 2 || buckets.length < 2)
        return { kind: "drop", why: "fewer than two words or two classes would be left to sort" };
      return { kind: "update", payload: { ...p, items, buckets } };
    }
    case "translate_tap": {
      const inSentence = sentenceBad(p.sentenceId);
      const distractorsBad = judgeAll(p.distractorLexemeIds);
      if (!inSentence && !distractorsBad) return { kind: "unchanged" };
      if (inSentence) return { kind: "drop", why: "its sentence uses an off-topic word" };
      return {
        kind: "update",
        payload: { ...p, distractorLexemeIds: p.distractorLexemeIds.filter((id) => !isBad(id)) },
      };
    }
    case "translate_type":
      return sentenceBad(p.sentenceId)
        ? { kind: "drop", why: "its sentence uses an off-topic word" }
        : { kind: "unchanged" };
    case "concord_fill": {
      const blanksBad = judgeAll(p.blanks.map((b) => b.lexemeId));
      if (sentenceBad(p.sentenceId) || blanksBad)
        return { kind: "drop", why: "its sentence uses an off-topic word" };
      return { kind: "unchanged" };
    }
    case "speak":
      return "lexemeId" in p.prompt && isBad(p.prompt.lexemeId)
        ? { kind: "drop", why: "the word it asks for is off-topic" }
        : "sentenceId" in p.prompt && sentenceBad(p.prompt.sentenceId)
          ? { kind: "drop", why: "its sentence uses an off-topic word" }
          : { kind: "unchanged" };
    case "click_drill": {
      const sides = p.pairs.flatMap((x) => [x.a.lexemeId, x.b.lexemeId]);
      if (!judgeAll([...sides, ...p.contrastWords.map((w) => w.lexemeId)]))
        return { kind: "unchanged" };
      const pairs = p.pairs.filter((x) => !isBad(x.a.lexemeId) && !isBad(x.b.lexemeId));
      const contrastWords = p.contrastWords.filter((w) => !isBad(w.lexemeId));
      if (pairs.length === 0 && contrastWords.length === 0)
        return { kind: "drop", why: "no word would be left to carry a click" };
      return { kind: "update", payload: { ...p, pairs, contrastWords } };
    }
    case "culture_card": {
      if (!judgeAll(p.lexemeIds)) return { kind: "unchanged" };
      return {
        kind: "update",
        payload: { ...p, lexemeIds: p.lexemeIds.filter((id) => !isBad(id)) },
      };
    }
    case "click_identify":
      return { kind: "unchanged" };
  }
}
