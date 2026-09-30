import {
  parseGoldenKey,
  type Actor,
  type GoldenAnswerView,
  type PutGoldenAnswer,
} from "@molo/core";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { users } from "../schema/auth.ts";
import { goldenAnswers } from "../schema/tutor.ts";
import { RepoError } from "./errors.ts";
import { assertEditorial } from "./roles.ts";

/**
 * The tutor's golden-forms sheet, saved per card (docs/EDITOR-GUIDE.md,
 * "Golden forms"). Editor and admin only; no learner repository imports this
 * module. Nothing here reads or runs `xh-morph`: an answer is what the tutor
 * typed, and it becomes a golden case only through `molo morph goldens pull`
 * and a reviewed commit.
 */
/**
 * Every saved answer, for `molo morph goldens pull` (an operator's read with
 * database credentials, like every CLI command). Read-only.
 */
export async function goldenAnswersForExport(db: Db): Promise<PutGoldenAnswer[]> {
  return db
    .select({
      caseId: goldenAnswers.caseId,
      form: goldenAnswers.form,
      irregular: goldenAnswers.irregular,
      notes: goldenAnswers.notes,
      tutorName: goldenAnswers.tutorName,
      validatedOn: goldenAnswers.validatedOn,
    })
    .from(goldenAnswers)
    .orderBy(asc(goldenAnswers.caseId));
}

export function goldenAnswersRepo(db: Db, actor: Actor) {
  assertEditorial(actor);

  async function list(): Promise<GoldenAnswerView[]> {
    assertEditorial(actor);
    const rows = await db
      .select({
        caseId: goldenAnswers.caseId,
        form: goldenAnswers.form,
        irregular: goldenAnswers.irregular,
        notes: goldenAnswers.notes,
        tutorName: goldenAnswers.tutorName,
        validatedOn: goldenAnswers.validatedOn,
        authorId: goldenAnswers.authorId,
        authorName: users.name,
        updatedAt: goldenAnswers.updatedAt,
      })
      .from(goldenAnswers)
      .leftJoin(users, eq(users.id, goldenAnswers.authorId))
      .orderBy(asc(goldenAnswers.caseId));
    return rows.map((r) => ({
      ...r,
      authorName: r.authorName ?? null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Saves one card as the tutor left it; the last save wins, and says who made it. */
  async function put(input: PutGoldenAnswer): Promise<GoldenAnswerView> {
    assertEditorial(actor);
    if (!parseGoldenKey(input.caseId))
      throw new RepoError("invalid", `not a golden case key: ${input.caseId}`);
    const now = new Date();
    const values = {
      form: input.form.trim(),
      irregular: input.irregular,
      notes: input.notes,
      tutorName: input.tutorName.trim(),
      validatedOn: input.validatedOn,
      authorId: actor.id,
      updatedAt: now,
    };
    await db
      .insert(goldenAnswers)
      .values({ caseId: input.caseId, ...values })
      .onConflictDoUpdate({ target: goldenAnswers.caseId, set: values });
    const [me] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);
    return {
      caseId: input.caseId,
      ...values,
      authorName: me?.name ?? null,
      updatedAt: now.toISOString(),
    };
  }

  return { list, put };
}
