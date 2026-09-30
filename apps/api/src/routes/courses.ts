/**
 * Courses (ARCHITECTURE section 2.6). `GET /courses` is the list a learner
 * may enrol in: published courses only, like every other learner read.
 *
 * There is one course, and the clients show a picker that is disabled with
 * "more languages later" — the plumbing is exercised rather than theoretical.
 */

import { CoursesResponse } from "@molo/core";
import { coursesRepo } from "@molo/db";
import { Schema } from "effect";
import { Hono } from "hono";

import type { AppEnv } from "../env.ts";

const encodeCourses = Schema.encodeSync(CoursesResponse);

export const courseRoutes = new Hono<AppEnv>().get("/courses", async (c) => {
  const repo = coursesRepo(c.get("db"));
  const actor = c.get("actor");
  const [courses, enrolled] = await Promise.all([
    repo.listPublished(),
    repo.enrolled(actor?.id ?? null).catch(() => null),
  ]);
  return c.json(encodeCourses({ courses, enrolledCourseId: enrolled?.id ?? null }));
});
