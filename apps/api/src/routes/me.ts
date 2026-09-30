import { effectValidator } from "@hono/effect-validator";
import {
  ChestClaimResponse,
  CROWN_MIN_STABILITY_DAYS,
  ExerciseReportRequest,
  ExerciseReportResponse,
  ImportProgressRequest,
  LessonCompleteRequest,
  LessonCompleteResponse,
  type LessonCelebration,
  MistakePractiseRequest,
  MistakePractiseResponse,
  MistakesResponse,
  PrefsRequest,
  ProgressResponse,
  PushTokenDeleteRequest,
  PushTokenRequest,
  ReviewRequest,
  ReviewResponse,
  ReviewSessionResponse,
  XP,
  type LexemeView,
  type MistakeEntry,
  deletionConfirmed,
  type DeleteAccountBody,
} from "@molo/core";
import {
  coursesRepo,
  exerciseReportsRepo,
  exportUserData,
  learnerRepo,
  pathRepo,
  registerPushToken,
  removePushTokens,
  mistakesRepo,
  schema,
  type CourseRow,
  type PublishedAudio,
} from "@molo/db";
import {
  activeWeek,
  awardXp,
  completedLessonIds,
  getHearts,
  hasPlus,
  lessonXp,
  loseHeart,
  perfectLessonIds,
  planOf,
  practiceTick,
  progress,
  reviewXp,
  touchStreak,
} from "@molo/gamification";
import {
  buildSession,
  createFsrs,
  dueCount,
  ensureCards,
  learnedWordCount,
  matureLexemeIds,
  recordReview,
  type CardRow,
  type Fsrs,
} from "@molo/scheduler";
import { and, eq } from "drizzle-orm";
import { Schema } from "effect";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import fsrsWasm from "../../../../crates/xh-fsrs/pkg/xh_fsrs_bg.wasm";
import { deleteAccount } from "../account-deletion.ts";
import { enrolledCourse } from "../course.ts";
import type { AppEnv, Bindings } from "../env.ts";
import { lockViewOf, unitLocks } from "../locks.ts";
import { requireUser } from "../middleware.ts";
import { reportRateLimit } from "../ratelimit.ts";
import { publicAudioUrl } from "../signing.ts";

const encodeProgress = Schema.encodeSync(ProgressResponse);
const encodeSession = Schema.encodeSync(ReviewSessionResponse);
const encodeReview = Schema.encodeSync(ReviewResponse);
const encodeLessonComplete = Schema.encodeSync(LessonCompleteResponse);
const encodeMistakes = Schema.encodeSync(MistakesResponse);
const encodeChestClaim = Schema.encodeSync(ChestClaimResponse);
const encodeMistakePractise = Schema.encodeSync(MistakePractiseResponse);
const encodeExerciseReport = Schema.encodeSync(ExerciseReportResponse);

/** How many open mistakes one session serves. */
const MISTAKES_PAGE = 20;

let fsrs: Fsrs | null = null;
function scheduler(): Fsrs {
  fsrs ??= createFsrs(fsrsWasm);
  return fsrs;
}

const decodePushTokenDeleteEither = Schema.decodeUnknownEither(PushTokenDeleteRequest);

/** DELETE carries an optional body, so it is decoded by hand rather than through the validator. */
function decodePushTokenDelete(raw: unknown): PushTokenDeleteRequest | null {
  const r = decodePushTokenDeleteEither(raw ?? {});
  return r._tag === "Right" ? r.right : null;
}

function userId(c: { get: (k: "actor") => AppEnv["Variables"]["actor"] }): string {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  return actor.id;
}

async function audioRef(env: Bindings, a: PublishedAudio) {
  return {
    id: a.id,
    url: publicAudioUrl(env.PUBLIC_AUDIO_BASE_URL, a.r2Key),
    tier: a.tier,
    durationMs: a.durationMs,
    attribution: a.tier === "2_native_forvo" ? "Pronunciation by Forvo" : null,
    speaker: a.speaker,
  };
}

type LessonCompleteOutcome =
  | {
      readonly ok: true;
      readonly xp: number;
      readonly perfect: boolean;
      readonly cardsCreated: number;
      /** What the streak did, for the celebration sequence's second beat. */
      readonly streak: {
        readonly current: number;
        readonly extended: boolean;
        readonly frozen: boolean;
      };
      /** False when this lesson had already been credited: a replay celebrates no unit. */
      readonly firstTime: boolean;
      /** The published unit this lesson belongs to, read once for the lock. */
      readonly unit: {
        readonly slug: string;
        readonly titleKey: string;
        readonly lessonIds: readonly string[];
      } | null;
    }
  | { readonly ok: false; readonly reason: "not_found" | "unit_locked" };

/**
 * The lesson-complete rules in one place: XP from the server's arithmetic,
 * streak, review cards, and the words that were missed. Refuses a lesson
 * that is not published, and one in a unit whose prerequisite is unfinished
 * — the lock is enforced here, not only drawn in the UI.
 */
async function completeLessonFor(
  db: AppEnv["Variables"]["db"],
  uid: string,
  lessonId: string,
  courseId: string,
  body: {
    correct: number;
    total: number;
    today: string;
    clickDrillCorrect?: number | undefined;
    mistakes?: readonly MistakeEntry[] | undefined;
  },
): Promise<LessonCompleteOutcome> {
  // A lesson outside the enrolled course is simply not this learner's lesson.
  const [owner] = await db
    .select({ courseId: schema.units.courseId })
    .from(schema.lessons)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.lessons.skillId))
    .innerJoin(schema.units, eq(schema.units.id, schema.skills.unitId))
    .where(eq(schema.lessons.id, lessonId))
    .limit(1);
  if (!owner || owner.courseId !== courseId) return { ok: false, reason: "not_found" };
  const exercises = await db
    .select({ lexemeIds: schema.exercises.lexemeIds })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.lessonId, lessonId), eq(schema.exercises.status, "published")));
  if (exercises.length === 0) return { ok: false, reason: "not_found" };
  // One read of the unit graph, scoped to the enrolled course: it answers the
  // lock and, further down, the "you finished the unit" beat.
  const locks = await unitLocks(db, uid, courseId);
  const unitId = locks.unitOfLesson.get(lessonId);
  if (unitId !== undefined && lockViewOf(locks, unitId).locked)
    return { ok: false, reason: "unit_locked" };
  const unit = unitId === undefined ? undefined : locks.units.get(unitId);
  const [prior] = await db
    .select({ id: schema.xpEvents.id })
    .from(schema.xpEvents)
    .where(
      and(
        eq(schema.xpEvents.userId, uid),
        eq(schema.xpEvents.refKind, "lesson"),
        eq(schema.xpEvents.refId, lessonId),
      ),
    )
    .limit(1);
  const total = Math.min(body.total, exercises.length);
  const { xp, perfect } = lessonXp({
    correct: Math.min(body.correct, total),
    total,
    ...(body.clickDrillCorrect !== undefined ? { clickDrillCorrect: body.clickDrillCorrect } : {}),
  });
  await awardXp(db, uid, xp, perfect ? "perfect_lesson" : "lesson", {
    kind: "lesson",
    id: lessonId,
  });
  const streak = await touchStreak(db, uid, body.today, { plus: await hasPlus(db, uid) });
  const taught = new Set(exercises.flatMap((e) => e.lexemeIds));
  const cardsCreated = await ensureCards(db, uid, [...taught]);
  // Only words this lesson actually teaches can be filed as its mistakes.
  const missed = (body.mistakes ?? []).filter((m) => taught.has(m.lexemeId));
  if (missed.length > 0) await mistakesRepo(db).record(uid, missed);
  return {
    ok: true,
    xp,
    perfect,
    cardsCreated,
    streak: { current: streak.current, extended: streak.extended, frozen: streak.frozen },
    firstTime: !prior,
    unit:
      unit && unitId
        ? {
            slug: unit.slug,
            titleKey: unit.titleKey,
            lessonIds: locks.lessonsOfUnit.get(unitId) ?? [],
          }
        : null,
  };
}

/**
 * The facts behind the end-of-lesson celebration (docs/DESIGN.md "After a
 * lesson"): what the streak did this week, how many words the learner had
 * met before and after, and whether this lesson was the one that finished
 * its unit. Which of those become beats is the clients' pure
 * `celebrationBeats`; this only supplies the numbers.
 */
async function lessonCelebration(
  db: AppEnv["Variables"]["db"],
  uid: string,
  today: string,
  outcome: Extract<LessonCompleteOutcome, { ok: true }>,
  targetLang: string,
): Promise<LessonCelebration> {
  const [week, wordsLearned] = await Promise.all([
    activeWeek(db, uid, today),
    learnedWordCount(db, uid, { targetLang }),
  ]);
  const unit = outcome.unit;
  let unitCompleted: LessonCelebration["unitCompleted"] = null;
  // A replay of a lesson the learner already finished re-celebrates nothing.
  if (unit && outcome.firstTime && unit.lessonIds.length > 0) {
    const done = await completedLessonIds(db, uid, unit.lessonIds);
    if (unit.lessonIds.every((id) => done.has(id))) {
      const clean = await perfectLessonIds(db, uid, unit.lessonIds);
      unitCompleted = {
        slug: unit.slug,
        titleKey: unit.titleKey,
        flawless: unit.lessonIds.every((id) => clean.has(id)),
      };
    }
  }
  return {
    streakExtended: outcome.streak.extended,
    streakDays: outcome.streak.current,
    streakFrozen: outcome.streak.frozen,
    streakWeek: week.week,
    streakTodayIndex: week.todayIndex,
    wordsLearned,
    wordsLearnedBefore: Math.max(0, wordsLearned - outcome.cardsCreated),
    unitCompleted,
  };
}

/**
 * Takes the chest at the end of a skill. The repository decides whether it
 * may be taken — published skill, every lesson finished, not taken before —
 * and the unique row it writes is what makes "once" true; the XP follows
 * only when that row is new, so a retry costs nothing and grants nothing.
 */
async function claimChestFor(
  db: AppEnv["Variables"]["db"],
  uid: string,
  skillId: string,
): Promise<{ xp: number; alreadyClaimed: boolean } | { reason: "not_found" | "not_ready" }> {
  const outcome = await pathRepo(db).claimChest(uid, skillId, XP.skillChest);
  if (!outcome.ok) return { reason: outcome.reason };
  if (!outcome.alreadyClaimed && outcome.xp > 0)
    await awardXp(db, uid, outcome.xp, "chest", { kind: "skill", id: skillId });
  return { xp: outcome.xp, alreadyClaimed: outcome.alreadyClaimed };
}

const cardView = (r: CardRow) => ({
  cardId: r.id,
  lexemeId: r.lexemeId ?? "",
  state: r.state,
  dueAt: r.dueAt.toISOString(),
  reps: r.reps,
  lapses: r.lapses,
  stability: r.stability,
});

/** The learner's voice preference, so every audio ref is ordered the way they chose. */
async function preferredVoiceOf(db: AppEnv["Variables"]["db"], uid: string): Promise<string> {
  const [row] = await db
    .select({ v: schema.userPrefs.preferredVoice })
    .from(schema.userPrefs)
    .where(eq(schema.userPrefs.userId, uid))
    .limit(1);
  return row?.v ?? "any";
}

/** The client's UTC offset from a query string, clamped to a real one. */
function tzFromQuery(raw: string | undefined): number {
  const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= -840 && n <= 840 ? n : 0;
}

async function progressFor(
  c: { get: (k: "db") => AppEnv["Variables"]["db"] },
  uid: string,
  today: string,
  course: CourseRow,
  tzOffsetMinutes = 0,
) {
  const db = c.get("db");
  const [p, due, hearts, plan] = await Promise.all([
    progress(db, uid, today, tzOffsetMinutes),
    // XP, streaks and hearts are the learner's and stay global; the due
    // count is about words, so it follows the enrolled course's language.
    dueCount(db, uid, { targetLang: course.targetLang }),
    getHearts(db, uid),
    planOf(db, uid),
  ]);
  return encodeProgress({ ...p, dueCount: due, hearts, plan });
}

/**
 * Signed-in learner routes: progress, preferences, lesson completion (XP,
 * streak, cards), and the review loop. Scheduling goes through
 * @molo/scheduler and XP through @molo/gamification; this layer only maps
 * HTTP to those two.
 */
export const meRoutes = new Hono<AppEnv>()
  .use("*", requireUser)

  .get("/me/progress", async (c) => {
    const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
    const tz = tzFromQuery(c.req.query("tz"));
    return c.json(await progressFor(c, userId(c), today, await enrolledCourse(c), tz));
  })

  .put("/me/prefs", effectValidator("json", PrefsRequest), async (c) => {
    const uid = userId(c);
    const body = c.req.valid("json");
    // Enrolment is checked here, not at the boundary: only a published
    // course may be chosen, and null goes back to the default one.
    if (body.courseId != null) await coursesRepo(c.get("db")).assertEnrollable(body.courseId);
    const set = {
      ...(body.sourceLang !== undefined ? { sourceLang: body.sourceLang } : {}),
      ...(body.courseId !== undefined ? { courseId: body.courseId } : {}),
      ...(body.dailyGoalXp !== undefined ? { dailyGoalXp: body.dailyGoalXp } : {}),
      ...(body.reminderOptIn !== undefined ? { reminderOptIn: body.reminderOptIn } : {}),
      ...(body.listeningEnabled !== undefined ? { listeningEnabled: body.listeningEnabled } : {}),
      ...(body.speakingEnabled !== undefined ? { speakingEnabled: body.speakingEnabled } : {}),
      ...(body.onboarded ? { onboardedAt: new Date() } : {}),
      ...(body.preferredVoice !== undefined ? { preferredVoice: body.preferredVoice } : {}),
      updatedAt: new Date(),
    };
    await c
      .get("db")
      .insert(schema.userPrefs)
      .values({ userId: uid, ...set })
      .onConflictDoUpdate({ target: schema.userPrefs.userId, set });
    return c.json({ ok: true });
  })

  // ---- push notifications (streak reminders on mobile) ----------------------
  /**
   * Registers or refreshes this device's Expo push token. Idempotent on the
   * token, so the app can call it on every start; a token that moved to
   * another account moves with it rather than being pushed to twice.
   */
  .post("/me/push-token", effectValidator("json", PushTokenRequest), async (c) => {
    const body = c.req.valid("json");
    await registerPushToken(c.get("db"), userId(c), {
      token: body.token,
      platform: body.platform,
      ...(body.appVersion !== undefined ? { appVersion: body.appVersion } : {}),
    });
    return c.json({ ok: true });
  })
  /** Sign-out: forget this device, or every device of this learner when no token is sent. */
  .delete("/me/push-token", async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = decodePushTokenDelete(raw);
    if (parsed === null) throw new HTTPException(400, { message: "invalid push token" });
    const removed = await removePushTokens(c.get("db"), userId(c), parsed.token);
    return c.json({ removed });
  })

  /** Lesson finished: award XP (server-computed), touch the streak, and create review cards for the lesson's lexemes. */
  .post(
    "/lessons/:lessonId/complete",
    effectValidator("json", LessonCompleteRequest),
    async (c) => {
      const uid = userId(c);
      const db = c.get("db");
      const body = c.req.valid("json");
      const course = await enrolledCourse(c);
      const r = await completeLessonFor(db, uid, c.req.param("lessonId"), course.id, body);
      if (!r.ok && r.reason === "unit_locked") {
        return c.json(
          {
            error: {
              code: "unit_locked",
              message: "finish the unit this one depends on first",
            },
          },
          403,
        );
      }
      if (!r.ok) throw new HTTPException(404, { message: "lesson not found or not published" });
      const [progressJson, celebration] = await Promise.all([
        progressFor(c, uid, body.today, course, body.tzOffsetMinutes ?? 0),
        lessonCelebration(db, uid, body.today, r, course.targetLang),
      ]);
      return c.json(
        encodeLessonComplete({
          xp: r.xp,
          perfect: r.perfect,
          cardsCreated: r.cardsCreated,
          progress: progressJson,
          celebration,
        }),
      );
    },
  )
  /**
   * The chest at the end of a skill. Server state, so it cannot be farmed:
   * the row in `skill_chests` is unique per learner and skill, and a second
   * request is answered with `alreadyClaimed` and no XP rather than an error.
   */
  .post("/path/chests/:skillId/claim", async (c) => {
    const uid = userId(c);
    const skillId = c.req.param("skillId");
    const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
    const tz = tzFromQuery(c.req.query("tz"));
    const r = await claimChestFor(c.get("db"), uid, skillId);
    if ("reason" in r) {
      if (r.reason === "not_found")
        throw new HTTPException(404, { message: "skill not found or not published" });
      return c.json(
        { error: { code: "chest_not_ready", message: "finish every lesson in this skill first" } },
        403,
      );
    }
    return c.json(
      encodeChestClaim({
        skillId,
        ...r,
        progress: await progressFor(c, uid, today, await enrolledCourse(c), tz),
      }),
    );
  })
  /**
   * A guest's local progress after they create an account: each lesson is
   * replayed once (lessons already credited to this user are skipped), so
   * the XP, streak and review cards they earned as a guest are theirs.
   * Chests they opened on the device are re-claimed the same way, and the
   * server refuses any whose lessons did not actually land.
   */
  .post("/me/import-progress", effectValidator("json", ImportProgressRequest), async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const body = c.req.valid("json");
    const course = await enrolledCourse(c);
    let imported = 0;
    let skipped = 0;
    let today = new Date().toISOString().slice(0, 10);
    for (const lesson of body.lessons) {
      const [already] = await db
        .select({ id: schema.xpEvents.id })
        .from(schema.xpEvents)
        .where(
          and(
            eq(schema.xpEvents.userId, uid),
            eq(schema.xpEvents.refKind, "lesson"),
            eq(schema.xpEvents.refId, lesson.lessonId),
          ),
        )
        .limit(1);
      if (already) {
        skipped++;
        continue;
      }
      // A locked unit — or a lesson outside the enrolled course — is
      // skipped, never an error: the rest of the import still lands.
      const r = await completeLessonFor(db, uid, lesson.lessonId, course.id, lesson);
      if (r.ok) imported++;
      else skipped++;
      today = lesson.today;
    }
    // Chests come after the lessons: the readiness check the repository runs
    // only passes once the lessons above have been credited.
    let chests = 0;
    for (const skillId of body.chests ?? []) {
      const r = await claimChestFor(db, uid, skillId);
      if (!("reason" in r) && !r.alreadyClaimed) chests++;
    }
    return c.json({
      imported,
      skipped,
      chests,
      progress: await progressFor(c, uid, today, course, tzFromQuery(c.req.query("tz"))),
    });
  })

  /** Due cards ∪ new cards (limit), hydrated for the learner's source language. */
  // ---- the learner's own data (GDPR) ---------------------------------------
  .get("/me/export", async (c) => {
    const data = await exportUserData(c.get("db"), userId(c));
    c.header(
      "content-disposition",
      `attachment; filename="molo-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return c.json(data);
  })
  /**
   * Deletes the account and everything learner-side; the body must repeat the
   * email as consent. A Sign in with Apple grant is revoked at Apple first.
   */
  .delete("/me", async (c) => {
    const uid = userId(c);
    const body = (await c.req.json().catch(() => null)) as DeleteAccountBody | null;
    const [user] = await c
      .get("db")
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, uid))
      .limit(1);
    // The typed confirmation word's token, or the email from builds before it.
    if (!user || !deletionConfirmed(body, user.email)) {
      throw new HTTPException(400, { message: "confirm the deletion" });
    }
    await deleteAccount(c.get("db"), c.env, uid);
    return c.json({ ok: true });
  })

  // ---- hearts (docs/MONETISATION.md) ----------------------------------------
  .get("/me/hearts", async (c) => c.json(await getHearts(c.get("db"), userId(c))))
  /** A wrong answer in a lesson. The client calls this per mistake; the server never goes below zero. */
  .post("/me/hearts/lose", async (c) => c.json(await loseHeart(c.get("db"), userId(c))))

  .get("/review/session", async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const lang = c.get("sourceLang");
    const newLimit = Math.min(Number(c.req.query("new") ?? 10), 30);
    // Review cards belong to the enrolled course through its language: the
    // cards are about words, and a word belongs to a language.
    const course = await enrolledCourse(c);
    const session = await buildSession(db, uid, { newLimit, targetLang: course.targetLang });
    const ids = [
      ...new Set(
        [...session.due, ...session.fresh].map((r) => r.lexemeId).filter((x): x is string => !!x),
      ),
    ];
    const lexemes = await learnerRepo(db).getLexemes(ids, lang, await preferredVoiceOf(db, uid));
    const views: Record<string, LexemeView> = {};
    for (const l of lexemes) {
      views[l.id] = {
        id: l.id,
        lemma: l.lemma,
        pos: l.pos,
        nounClass: l.nounClass,
        isPlural: l.isPlural,
        infinitive: l.infinitive,
        register: l.register,
        gloss: l.gloss,
        audio: l.audio ? await audioRef(c.env, l.audio) : null,
        voices: await Promise.all(l.voices.map((v) => audioRef(c.env, v))),
      };
    }
    return c.json(
      encodeSession({
        sourceLang: lang,
        due: session.due.map(cardView),
        fresh: session.fresh.map(cardView),
        dueTotal: session.dueTotal,
        lexemes: views,
      }),
    );
  })

  /** One rating on one card. */
  .post("/review/:cardId", effectValidator("json", ReviewRequest), async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const { rating, today, tzOffsetMinutes } = c.req.valid("json");
    const outcome = await recordReview(db, scheduler(), uid, c.req.param("cardId"), rating);
    if (!outcome) throw new HTTPException(404, { message: "card not found" });
    const xp = reviewXp(rating);
    await awardXp(db, uid, xp, "review", { kind: "review_card", id: outcome.card.id });
    await touchStreak(db, uid, today, { plus: await hasPlus(db, uid) });
    // Practice earns hearts back: every fifth rating returns one.
    const practice = await practiceTick(db, uid);
    return c.json(
      encodeReview({
        hearts: practice.state,
        heartEarned: practice.earned,
        card: {
          cardId: outcome.card.id,
          lexemeId: outcome.card.lexemeId ?? "",
          state: outcome.next.state,
          dueAt: new Date(outcome.next.due_at_ms).toISOString(),
          reps: outcome.next.reps,
          lapses: outcome.next.lapses,
          stability: outcome.next.stability,
        },
        xp,
        progress: await progressFor(c, uid, today, await enrolledCourse(c), tzOffsetMinutes ?? 0),
      }),
    );
  })

  // ---- practise mistakes -----------------------------------------------------

  /**
   * The words this learner got wrong, hydrated exactly like a review
   * session so the same UI can run them. Published rows only: the
   * repository filters on status, so a word pulled back into review
   * silently leaves the list.
   */
  .get("/me/mistakes", async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const lang = c.get("sourceLang");
    const repo = mistakesRepo(db);
    // Mistakes are about words, so they follow the enrolled course's language.
    const { targetLang } = await enrolledCourse(c);
    const [rows, count] = await Promise.all([
      repo.open(uid, MISTAKES_PAGE, targetLang),
      repo.openCount(uid, targetLang),
    ]);
    const lexemes = await learnerRepo(db).getLexemes(
      [...new Set(rows.map((r) => r.lexemeId))],
      lang,
      await preferredVoiceOf(db, uid),
    );
    const views = new Map<string, LexemeView>();
    for (const l of lexemes) {
      views.set(l.id, {
        id: l.id,
        lemma: l.lemma,
        pos: l.pos,
        nounClass: l.nounClass,
        isPlural: l.isPlural,
        infinitive: l.infinitive,
        register: l.register,
        gloss: l.gloss,
        audio: l.audio ? await audioRef(c.env, l.audio) : null,
        voices: await Promise.all(l.voices.map((v) => audioRef(c.env, v))),
      });
    }
    return c.json(
      encodeMistakes({
        sourceLang: lang,
        count,
        mistakes: rows.flatMap((r) => {
          const lexeme = views.get(r.lexemeId);
          return lexeme
            ? [
                {
                  lexemeId: r.lexemeId,
                  exerciseType: r.exerciseType,
                  timesWrong: r.timesWrong,
                  lastWrongAt: r.lastWrongAt.toISOString(),
                  lexeme,
                },
              ]
            : [];
        }),
      }),
    );
  })

  /**
   * One answer in a mistakes session. Right clears the row, wrong bumps the
   * counter. This is remediation, not a lesson: it never costs a heart.
   */
  .post("/me/mistakes/practise", effectValidator("json", MistakePractiseRequest), async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const body = c.req.valid("json");
    const repo = mistakesRepo(db);
    const course = await enrolledCourse(c);
    const outcome = await repo.resolve(uid, body.lexemeId, body.correct, {
      exerciseType: body.exerciseType,
    });
    if (!outcome) throw new HTTPException(404, { message: "no open mistake for that word" });
    // Getting it right earns the same as a correct answer anywhere else.
    const xp = body.correct ? XP.correct : 0;
    if (xp > 0) {
      await awardXp(db, uid, xp, "review", { kind: "mistake", id: body.lexemeId });
      await touchStreak(db, uid, body.today, { plus: await hasPlus(db, uid) });
    }
    return c.json(
      encodeMistakePractise({
        ...outcome,
        remaining: await repo.openCount(uid, course.targetLang),
        xp,
        progress: await progressFor(c, uid, body.today, course, body.tzOffsetMinutes ?? 0),
      }),
    );
  })

  /**
   * "Report this exercise" from the check bar. A note for an editor, never
   * a status change: the repository refuses anything that is not a
   * published exercise, and resolving it later is a separate editor action.
   *
   * `reportRateLimit` is the cap across the app; the repository's
   * per-exercise, per-reason deduplication is the cap within one exercise.
   */
  .post(
    "/exercises/:id/report",
    reportRateLimit,
    effectValidator("json", ExerciseReportRequest),
    async (c) => {
      const uid = userId(c);
      const body = c.req.valid("json");
      const outcome = await exerciseReportsRepo(c.get("db")).file(uid, {
        exerciseId: c.req.param("id"),
        reason: body.reason,
        note: body.note ?? null,
        sourceLang: c.get("sourceLang"),
      });
      return c.json(
        encodeExerciseReport({ ok: true, alreadyReported: outcome.alreadyReported }),
        201,
      );
    },
  )

  /** Unit crown check: every lexeme of the unit in state review with stability ≥ 21 days (ARCHITECTURE section 4). */
  .get("/units/:slug/crown", async (c) => {
    const uid = userId(c);
    const db = c.get("db");
    const unit = await learnerRepo(db).getUnitBySlug(
      c.req.param("slug"),
      (await enrolledCourse(c)).id,
    );
    if (!unit) throw new HTTPException(404, { message: "unit not found" });
    const lexemeIds = [
      ...new Set(
        unit.skills.flatMap((s) =>
          s.lessons.flatMap((l) => l.exercises.flatMap((e) => e.lexemeIds)),
        ),
      ),
    ];
    const mature = await matureLexemeIds(db, uid, lexemeIds, CROWN_MIN_STABILITY_DAYS);
    return c.json({
      total: lexemeIds.length,
      mature: mature.length,
      crowned: lexemeIds.length > 0 && mature.length === lexemeIds.length,
    });
  });
