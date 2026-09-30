/**
 * `molo content reconcile-unit-1` — fold the Phase-0 `unit-1` into the
 * spine's `greet-and-introduce` (docs/curriculum-audit.md section 1).
 *
 * The plan is `planReconcileUnit1` in `@molo/content`, a pure function over
 * a snapshot of both units; this command reads the snapshot, prints the
 * plan, and with `--live` applies it in one transaction through
 * `editorRepo`, so every write is role-checked and lands in
 * `content_revisions`. It is idempotent: a second run finds nothing to do.
 *
 * Nothing becomes `published`, and no isiXhosa is written: the only new
 * payloads are `click_identify` sets, which name bare clicks by their
 * `CLICK_SOUNDS` id. The old unit cannot be retired (the status machine has
 * no `draft -> retired` edge); `--delete-old-unit` deletes it instead, the
 * dashboard's own rule for a row nobody ever published, and refuses while
 * anything under it has been in review or still belongs elsewhere.
 */

import { Command, Options } from "@effect/cli";
import {
  loadCurriculum,
  loadGrammarNotes,
  planReconcileUnit1,
  wordsAfter,
  type LessonRef,
  type ReconcilePlan,
  type ReconcileSpec,
  type ReconcileStep,
  type Theme,
} from "@molo/content";
import { isClickIdentifySet } from "@molo/core";
import { actorForRef, editorRepo, unitReconcileSnapshot, type Db } from "@molo/db";
import { Effect } from "effect";

import { fail, gate, kv, out, table, withDb } from "../context.ts";
import { molo } from "../root.ts";

const OLD_UNIT = "unit-1";
const NEW_UNIT = "greet-and-introduce";
const CLICK_SKILL = "hear-the-three-clicks";
const CULTURE_SKILL = "greet-someone";

const asActor = Options.text("as").pipe(
  Options.withDefault("dev_editor"),
  Options.withDescription("Email or user id acting as editor; every change is attributed to them"),
);
const deleteOldUnitFlag = Options.boolean("delete-old-unit").pipe(
  Options.withDescription(
    "Also delete the old unit-1 once nothing in it belongs elsewhere (it cannot be retired: no draft -> retired edge)",
  ),
);

export const reconcileUnit1 = Command.make(
  "reconcile-unit-1",
  { as: asActor, deleteOldUnit: deleteOldUnitFlag },
  ({ as, deleteOldUnit }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const { spine, themes } = loadCurriculum();
      const notesFile = loadGrammarNotes();
      const unit = spine.units.find((u) => u.slug === NEW_UNIT);
      if (!unit) return yield* fail(`curriculum/spine.json has no unit ${NEW_UNIT}`);
      const themeBySkill: Record<string, Theme> = {};
      for (const s of unit.skills) {
        const theme = themes.themes[s.theme];
        if (theme) themeBySkill[s.slug] = theme;
      }
      const clickSets = (
        unit.skills.find((s) => s.slug === CLICK_SKILL)?.clickIdentifySets ?? []
      ).filter(isClickIdentifySet);
      const spec: ReconcileSpec = {
        oldUnitSlug: OLD_UNIT,
        newUnitSlug: NEW_UNIT,
        clickSkillSlug: CLICK_SKILL,
        cultureSkillSlug: CULTURE_SKILL,
        clickSets,
        themeBySkill,
        notes: notesFile.notes.map((n) => ({
          slug: n.slug,
          unitSlug: n.unitSlug,
          skillSlug: n.skillSlug,
          order: n.order,
        })),
        deleteOldUnit,
      };

      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const snapshot = () =>
            unitReconcileSnapshot(db, {
              oldUnitSlug: OLD_UNIT,
              newUnitSlug: NEW_UNIT,
              noteSlugs: spec.notes.map((n) => n.slug),
              noteTargets: spec.notes.map((n) => `${n.unitSlug}/${n.skillSlug}`),
            });
          const before = yield* Effect.promise(snapshot);
          const plan = planReconcileUnit1(before, spec);
          const words = wordsAfter(before, plan, spec);

          yield* out(g, { plan, wordsAfter: words }, () => render(plan, words, spec));

          if (plan.steps.length === 0) {
            if (!g.json) console.log("\nnothing to do: the unit is already reconciled.");
            return;
          }
          const apply = yield* gate(
            g,
            `apply ${plan.steps.length} steps to ${NEW_UNIT} and ${OLD_UNIT} as drafts ` +
              `(nothing is published; every change is logged in content_revisions)`,
          );
          if (!apply) return;

          const actor = yield* Effect.promise(() => actorForRef(db, as));
          if (!actor) return yield* fail(`no user matches ${as} (pass an email or a user id)`);
          if (!actor.roles.some((r) => r === "editor" || r === "admin"))
            return yield* fail(`user ${as} has no editorial role`);

          yield* Effect.tryPromise({
            try: () => applyPlan(db, actor, plan.steps),
            catch: (e) => new Error(e instanceof Error ? e.message : String(e)),
          }).pipe(Effect.catchAll((e) => fail(`nothing was written: ${e.message}`)));

          const after = planReconcileUnit1(yield* Effect.promise(snapshot), spec);
          yield* out(g, { applied: plan.steps.length, stepsLeft: after.steps.length }, () => {
            console.log(`\napplied ${plan.steps.length} steps.`);
            console.log(
              after.steps.length === 0
                ? "a second run would do nothing."
                : `a second run would still do ${after.steps.length} steps; check the problems above.`,
            );
          });
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Fold the Phase-0 unit-1 into greet-and-introduce: click sets, drills, culture card, grammar notes, off-topic words (--live writes)",
  ),
);

/** One transaction: a failure halfway leaves the database as it was. */
async function applyPlan(
  db: Db,
  actor: Parameters<typeof editorRepo>[1],
  steps: readonly ReconcileStep[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // `editorRepo` takes a client; a transaction is one (its own nested
    // transactions become savepoints).
    const repo = editorRepo(tx as unknown as Db, actor);
    const created = new Map<string, string>();
    const lessonId = (ref: LessonRef): string => {
      if ("id" in ref) return ref.id;
      const id = created.get(ref.created);
      if (!id) throw new Error(`lesson ${ref.created} was not created before it was used`);
      return id;
    };
    for (const step of steps) {
      switch (step.kind) {
        case "shift_lesson":
          await repo.updateLesson(step.lessonId, { order: step.to });
          break;
        case "create_lesson":
          created.set(
            step.ref,
            await repo.createLesson({ skillId: step.skillId, order: step.order }),
          );
          break;
        case "create_exercise":
          await repo.createExercise({
            lessonId: lessonId(step.lesson),
            order: step.order,
            type: step.type,
            payload: step.payload,
            note: step.note,
          });
          break;
        case "move_exercise":
          await repo.moveExercise(step.exerciseId, {
            lessonId: lessonId(step.lesson),
            order: step.order,
          });
          break;
        case "update_exercise":
          await repo.updateExercise(step.exerciseId, { payload: step.payload });
          break;
        case "delete_exercise":
          await repo.deleteDraft("exercise", step.exerciseId);
          break;
        case "move_grammar_note":
          await repo.moveGrammarNote(step.noteId, { skillId: step.skillId, order: step.order });
          break;
        case "delete_old_unit":
          await repo.deleteDraft("unit", step.unitId);
          break;
      }
    }
  });
}

function render(
  plan: ReconcilePlan,
  words: ReturnType<typeof wordsAfter>,
  spec: ReconcileSpec,
): void {
  console.log(
    `reconcile ${spec.oldUnitSlug} into ${spec.newUnitSlug} (drafts only; nothing is published)\n`,
  );
  const describe = (s: ReconcileStep): Record<string, string> => {
    switch (s.kind) {
      case "shift_lesson":
        return { step: "shift lesson", what: `${s.skill} lesson ${s.from} -> ${s.to}` };
      case "create_lesson":
        return { step: "create lesson", what: `${s.skill} lesson ${s.order} (bare clicks)` };
      case "create_exercise":
        return {
          step: "create exercise",
          what: `${s.type} set ${s.payload.type === "click_identify" ? s.payload.set : ""} at ${s.order}`,
        };
      case "move_exercise":
        return { step: "move exercise", what: `${s.type} ${s.from} -> ${s.to} at ${s.order}` };
      case "update_exercise":
        return {
          step: "remove words",
          what: `${s.type} in ${s.where}: ${s.removed.map((w) => w.lemma).join(", ")}`,
        };
      case "delete_exercise":
        return { step: "delete exercise", what: `${s.type} in ${s.where}: ${s.why}` };
      case "move_grammar_note":
        return {
          step: "move grammar note",
          what: `${s.slug}: ${s.from} -> ${s.to} (order ${s.order})`,
        };
      case "delete_old_unit":
        return {
          step: "delete old unit",
          what: `${s.slug}, with ${s.remaining.length} exercises/notes still in it`,
        };
    }
  };
  table(plan.steps.map(describe));

  const removed = new Map<string, { lemma: string; gloss: string; why: string }>();
  for (const s of plan.steps)
    if (s.kind === "update_exercise" || s.kind === "delete_exercise")
      for (const w of s.removed) removed.set(w.lexemeId, w);
  if (removed.size > 0) {
    console.log("\noff-topic words taken out (the relevance guard in curriculum/themes.json):");
    table([...removed.values()].map((w) => ({ lemma: w.lemma, gloss: w.gloss, why: w.why })));
  }

  if (plan.problems.length > 0) {
    console.log("\nnot done, and why:");
    for (const p of plan.problems) console.log(`  - ${p}`);
  }

  console.log(`\n${spec.oldUnitSlug} afterwards`);
  kv({
    left_in_it: plan.oldUnitLeft.length,
    status: "stays draft: the status machine has no draft -> retired edge",
    to_remove_it: spec.deleteOldUnit
      ? "--delete-old-unit is set (see the plan above)"
      : "re-run with --delete-old-unit, or delete it in the dashboard",
  });
  for (const line of plan.oldUnitLeft) console.log(`    ${line}`);

  console.log(`\n${spec.newUnitSlug} words afterwards (every lexeme its exercises name):`);
  for (const s of words) {
    console.log(`  ${s.skill}`);
    for (const w of s.words) console.log(`    ${w.lemma}  ${w.glosses.join("; ")}`);
  }
}
