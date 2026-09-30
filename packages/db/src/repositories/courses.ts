/**
 * Courses and enrolment (ARCHITECTURE section 2.6).
 *
 * A course is a curriculum over a target language. The learner's enrolment
 * lives in `user_prefs.course_id`; null means the default course, which is
 * what every learner gets today because there is exactly one course.
 *
 * `listPublished` is a learner-facing read and filters on `published`
 * unconditionally, like every other function in this directory.
 */

import { and, asc, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { courses } from "../schema/curriculum.ts";
import { userPrefs } from "../schema/learners.ts";
import { RepoError } from "./errors.ts";

const PUBLISHED = "published" as const;

export interface CourseRow {
  readonly id: string;
  readonly slug: string;
  readonly targetLang: string;
  readonly titleKey: string;
  readonly order: number;
  readonly isDefault: boolean;
}

const columns = {
  id: courses.id,
  slug: courses.slug,
  targetLang: courses.targetLang,
  titleKey: courses.titleKey,
  order: courses.order,
  isDefault: courses.isDefault,
};

export function coursesRepo(db: Db) {
  /** The default course: the one flagged `is_default`, else the lowest-ordered published one. */
  async function defaultCourse(): Promise<CourseRow | null> {
    const [flagged] = await db
      .select(columns)
      .from(courses)
      .where(eq(courses.isDefault, true))
      .limit(1);
    if (flagged) return flagged;
    const [first] = await db
      .select(columns)
      .from(courses)
      .where(eq(courses.status, PUBLISHED))
      .orderBy(asc(courses.order))
      .limit(1);
    return first ?? null;
  }

  return {
    defaultCourse,

    /** Every course a learner may enrol in. */
    async listPublished(): Promise<CourseRow[]> {
      return db
        .select(columns)
        .from(courses)
        .where(eq(courses.status, PUBLISHED))
        .orderBy(asc(courses.order));
    },

    /** Every course at every status, for the editor dashboard's selector. */
    async listAll(): Promise<Array<CourseRow & { status: string }>> {
      return db
        .select({ ...columns, status: courses.status })
        .from(courses)
        .orderBy(asc(courses.order));
    },

    async byId(id: string): Promise<CourseRow | null> {
      const [row] = await db.select(columns).from(courses).where(eq(courses.id, id)).limit(1);
      return row ?? null;
    },

    async bySlug(slug: string): Promise<CourseRow | null> {
      const [row] = await db.select(columns).from(courses).where(eq(courses.slug, slug)).limit(1);
      return row ?? null;
    },

    /**
     * The course this learner is studying: their enrolment when it still
     * points at a published course, otherwise the default one. A guest
     * (`userId` null) gets the default course.
     */
    async enrolled(userId: string | null): Promise<CourseRow> {
      if (userId !== null) {
        const [row] = await db
          .select(columns)
          .from(userPrefs)
          .innerJoin(courses, eq(courses.id, userPrefs.courseId))
          .where(and(eq(userPrefs.userId, userId), eq(courses.status, PUBLISHED)))
          .limit(1);
        if (row) return row;
      }
      const fallback = await defaultCourse();
      if (!fallback) throw new RepoError("not_found", "no course is available");
      return fallback;
    },

    /**
     * Sets the enrolment. Only a published course may be chosen; null goes
     * back to the default. The check is here rather than at the boundary so
     * no caller can enrol a learner into a draft curriculum.
     */
    async assertEnrollable(courseId: string): Promise<void> {
      const [row] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, courseId), eq(courses.status, PUBLISHED)))
        .limit(1);
      if (!row) throw new RepoError("invalid", `course ${courseId} is not open for enrolment`);
    },
  };
}

export type CoursesRepo = ReturnType<typeof coursesRepo>;
