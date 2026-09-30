import type { Actor, Role } from "@molo/core";
import { EDITORIAL_ROLES } from "@molo/core";
import { and, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { userRoles, users } from "../schema/auth.ts";
import { RepoError } from "./errors.ts";

export async function rolesOf(db: Db, userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

/** Loads an `Actor` from `user_roles`. A user with no rows is a learner. */
export async function actorFor(db: Db, userId: string): Promise<Actor> {
  const roles = await rolesOf(db, userId);
  return { id: userId, roles: roles.length === 0 ? ["learner"] : roles };
}

/**
 * Resolves what a person typed into an actor: a user id, or the email of an
 * account.
 *
 * `actorFor` takes an id and only an id, and a caller that hands it an email
 * gets an actor with no roles rather than an error — which then surfaces as
 * "no editorial role" and sends the reader looking in the wrong place. Every
 * `--as` on the CLI is written by a person, so it resolves here instead.
 * Null means no such user, which is a different sentence from "has no role".
 */
export async function actorForRef(db: Db, ref: string): Promise<Actor | null> {
  const direct = await rolesOf(db, ref);
  if (direct.length > 0) return { id: ref, roles: direct };
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, ref)).limit(1);
  if (row) return actorFor(db, row.id);
  // No roles and no such email: it is an id we have never seen, or a learner
  // with no rows. `actorFor` is right about the second, so defer to it.
  const [byId] = await db.select({ id: users.id }).from(users).where(eq(users.id, ref)).limit(1);
  return byId ? actorFor(db, byId.id) : null;
}

export async function hasRole(db: Db, userId: string, role: Role): Promise<boolean> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
    .limit(1);
  return rows.length === 1;
}

export function assertEditorial(actor: Actor): void {
  if (!actor.roles.some((r) => EDITORIAL_ROLES.includes(r))) {
    throw new RepoError("forbidden", `actor ${actor.id} has no editorial role`);
  }
}

export function assertAdmin(actor: Actor): void {
  if (!actor.roles.includes("admin")) {
    throw new RepoError("forbidden", `actor ${actor.id} is not an admin`);
  }
}

/** Grant a role. Admin only; the first admin is created by the seed. */
export async function grantRole(db: Db, actor: Actor, userId: string, role: Role): Promise<void> {
  assertAdmin(actor);
  await db.insert(userRoles).values({ userId, role, grantedBy: actor.id }).onConflictDoNothing();
}
