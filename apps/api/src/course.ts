/**
 * The course a request is about (ARCHITECTURE section 2.6).
 *
 * Every learner read is scoped to the caller's enrolled course rather than
 * to "the" curriculum. There is exactly one course, so this resolves to
 * isiXhosa for everybody today — but the endpoints no longer assume it, and
 * the integrity suite seeds a second course and asserts it stays invisible.
 *
 * Resolved per request rather than in the session middleware, so editor and
 * webhook routes pay nothing for it.
 */

import { coursesRepo, type CourseRow } from "@molo/db";

import type { AppEnv } from "./env.ts";

type Ctx = {
  get: <K extends "db" | "actor">(k: K) => AppEnv["Variables"][K];
};

/** The signed-in learner's enrolment, or the default course for a guest. */
export function enrolledCourse(c: Ctx): Promise<CourseRow> {
  return coursesRepo(c.get("db")).enrolled(c.get("actor")?.id ?? null);
}
