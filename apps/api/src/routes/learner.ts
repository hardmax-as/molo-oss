import {
  GrammarReferenceResponse,
  PathResponse,
  UnitResponse,
  UnitsResponse,
  momentFor,
  unseenAmong,
  type ExerciseMoment,
  type GrammarNoteView,
  type LexemeView,
  type SentenceView,
} from "@molo/core";
import {
  DEFAULT_PREFS,
  XP,
  clickSoundById,
  decodeExercisePayload,
  referencedClickIds,
  type ClickSoundsResponse,
} from "@molo/core";
import {
  grammarRepo,
  learnerRepo,
  getLeagueProfile,
  mistakesRepo,
  pathRepo,
  schema,
  type PublishedGrammarNote,
  type PublishedAudio,
} from "@molo/db";
import { planOf } from "@molo/gamification";
import { and, eq } from "drizzle-orm";
import { Either, Schema } from "effect";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { createAuth } from "../auth.ts";
import { publishedJson } from "../content-cache.ts";
import { enrolledCourse } from "../course.ts";
import type { AppEnv, Bindings } from "../env.ts";
import { lockViewOf, unitLocks } from "../locks.ts";
import { publicAudioUrl } from "../signing.ts";

const encodeUnits = Schema.encodeSync(UnitsResponse);
const encodeGrammar = Schema.encodeSync(GrammarReferenceResponse);
const encodeUnit = Schema.encodeSync(UnitResponse);
const encodePath = Schema.encodeSync(PathResponse);

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

/** A published note at the boundary. Audio stays an id; the caller hydrates it. */
function grammarNoteView(n: PublishedGrammarNote): GrammarNoteView {
  return {
    id: n.id,
    slug: n.slug,
    skillId: n.skillId,
    order: n.order,
    rowHeaderKey: n.rowHeaderKey,
    sourceLang: n.sourceLang,
    title: n.title,
    rule: n.rule,
    correction: n.correction,
    cells: n.cells.map((c) => ({
      id: c.id,
      role: c.role,
      order: c.order,
      rowLabel: c.rowLabel,
      colKey: c.colKey,
      surfaceForm: c.surfaceForm,
      morphemes: c.morphemes,
      lexemeId: c.lexemeId,
      audioAssetId: c.audioAssetId,
    })),
  };
}

/** The signed-in learner's voice preference; "any" for guests. */
async function preferredVoiceOf(c: { get: (k: "db" | "actor") => unknown }): Promise<string> {
  const actor = c.get("actor") as { id: string } | null;
  if (!actor) return "any";
  const db = c.get("db") as Parameters<typeof learnerRepo>[0];
  const [row] = await db
    .select({ v: schema.userPrefs.preferredVoice })
    .from(schema.userPrefs)
    .where(eq(schema.userPrefs.userId, actor.id))
    .limit(1);
  return row?.v ?? "any";
}

/**
 * Learner reads. Everything comes through `learnerRepo`, which filters on
 * `published` unconditionally; this layer only hydrates and signs URLs, and
 * scopes every curriculum read to the caller's enrolled course
 * (ARCHITECTURE section 2.6).
 */
export const learnerRoutes = new Hono<AppEnv>()
  /** The signed-in user with roles from user_roles, or null. Clients use it for nav and guards only. */
  .get("/me", async (c) => {
    const actor = c.get("actor");
    if (!actor) return c.json(null);
    const auth = createAuth(c.env, c.get("db"));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json(null);
    const [prefs] = await c
      .get("db")
      .select({
        sourceLang: schema.userPrefs.sourceLang,
        courseId: schema.userPrefs.courseId,
        dailyGoalXp: schema.userPrefs.dailyGoalXp,
        reminderOptIn: schema.userPrefs.reminderOptIn,
        listeningEnabled: schema.userPrefs.listeningEnabled,
        speakingEnabled: schema.userPrefs.speakingEnabled,
        onboardedAt: schema.userPrefs.onboardedAt,
        preferredVoice: schema.userPrefs.preferredVoice,
      })
      .from(schema.userPrefs)
      .where(eq(schema.userPrefs.userId, session.user.id))
      .limit(1);
    return c.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        country: session.user.country ?? null,
      },
      roles: actor.roles,
      /**
       * A one-tap Apple/Google account still owes its birth year and country:
       * clients show the age step before anything else, and until then the
       * API refuses every other route with 403 `age_required`.
       */
      ageRequired: c.get("ageRequired") === true,
      sourceLang: c.get("sourceLang"),
      /** The resolved enrolment, not the raw preference: null in prefs means the default course. */
      course: await enrolledCourse(c),
      prefs: prefs
        ? { ...prefs, onboardedAt: prefs.onboardedAt?.toISOString() ?? null }
        : { ...DEFAULT_PREFS, sourceLang: c.get("sourceLang") },
      leagueProfile: await getLeagueProfile(c.get("db"), session.user.id),
      plan: await planOf(c.get("db"), session.user.id),
    });
  })
  /** Which sign-in methods this deployment offers, so clients show only real buttons. */
  .get("/auth/providers", (c) =>
    c.json({
      email: true,
      magicLink: true,
      apple: !!(c.env.APPLE_CLIENT_ID && c.env.APPLE_CLIENT_SECRET),
      google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    }),
  )
  /** First-run onboarding needs one real thing to hear: "molo" if it is published with audio, plus the first unit to start. */
  .get("/welcome", async (c) => {
    const repo = learnerRepo(c.get("db"));
    const lang = c.get("sourceLang");
    const units = await repo.listUnits((await enrolledCourse(c)).id);
    const [greeting] = await c
      .get("db")
      .select({ id: schema.lexemes.id })
      .from(schema.lexemes)
      .where(and(eq(schema.lexemes.lemma, "molo"), eq(schema.lexemes.status, "published")))
      .limit(1);
    const lexemes = greeting ? await repo.getLexemes([greeting.id], lang) : [];
    const lx = lexemes[0];
    const audio = lx?.audio
      ? {
          url: publicAudioUrl(c.env.PUBLIC_AUDIO_BASE_URL, lx.audio.r2Key),
          attribution: lx.audio.tier === "2_native_forvo" ? "Pronunciation by Forvo" : null,
        }
      : null;
    return c.json({
      greeting: lx ? { lemma: lx.lemma, gloss: lx.gloss?.gloss ?? null, audio } : null,
      firstUnitSlug: units[0]?.slug ?? null,
    });
  })
  /**
   * The bare clicks a learner can hear in onboarding's "Meet the clicks":
   * published tier-1 studio takes only (the repository filters; drafts and
   * takes in review never appear). An empty list is normal before anything
   * is approved, and the app then shows no play button.
   */
  .get("/clicks", async (c) => {
    const rows = await learnerRepo(c.get("db")).publishedClickAudio();
    const body: ClickSoundsResponse = {
      clicks: rows.flatMap((r) => {
        const sound = clickSoundById(r.clickId);
        return sound
          ? [
              {
                ...sound,
                audio: {
                  id: r.audio.id,
                  url: publicAudioUrl(c.env.PUBLIC_AUDIO_BASE_URL, r.audio.r2Key),
                  durationMs: r.audio.durationMs,
                },
              },
            ]
          : [];
      }),
    };
    return c.json(body);
  })
  /**
   * The path. `locked` is the prerequisite rule computed for the signed-in
   * learner; a guest gets `locked: false` and applies the same rule to the
   * lessons on the device (`lessonCount` is what it counts against).
   */
  .get("/units", (c) =>
    publishedJson(c, "units", {}, async () => {
      const db = c.get("db");
      const actor = c.get("actor");
      const course = await enrolledCourse(c);
      const [units, locks] = await Promise.all([
        learnerRepo(db).listUnits(course.id),
        unitLocks(db, actor?.id ?? null, course.id),
      ]);
      return encodeUnits({ units: units.map((u) => ({ ...u, ...lockViewOf(locks, u.id) })) });
    }),
  )
  /**
   * The whole path in one read: every published unit strung together with
   * its skills, its lesson nodes and this learner's state on them. Light
   * enough for the home screen — no exercise payloads, no glosses, no
   * audio. A guest gets the same curriculum with the state at zero and
   * overlays what the device remembers.
   */
  .get("/path", (c) =>
    publishedJson(c, "path", {}, async () => {
      const db = c.get("db");
      const actor = c.get("actor");
      const course = await enrolledCourse(c);
      const [summaries, locks, overview] = await Promise.all([
        learnerRepo(db).listUnits(course.id),
        unitLocks(db, actor?.id ?? null, course.id),
        pathRepo(db).overview(actor?.id ?? null),
      ]);
      const skillsByUnit = new Map(overview.map((u) => [u.id, u.skills]));
      return encodePath({
        units: summaries.map((u) => ({
          ...u,
          ...lockViewOf(locks, u.id),
          skills: skillsByUnit.get(u.id) ?? [],
        })),
        chestXp: XP.skillChest,
      });
    }),
  )
  .get("/units/:slug", (c) => {
    const slug = c.req.param("slug");
    return publishedJson(c, "unit", { slug }, () => unitPayload(c, slug));
  })
  /**
   * The reference page (docs/GRAMMAR.md section 1: "a reference page stays
   * available for anyone who wants to go back to it"). Every published note
   * of the enrolled course, in the learner's language, with `unlocked` set
   * from the lessons they have actually finished. A guest gets everything
   * locked and overlays what the device remembers.
   */
  .get("/grammar", async (c) => {
    const db = c.get("db");
    const lang = c.get("sourceLang");
    const course = await enrolledCourse(c);
    const rows = await grammarRepo(db).referenceFor(course.id, lang, c.get("actor")?.id ?? null);
    const audioIds = [
      ...new Set(
        rows.flatMap((n) => n.cells.flatMap((x) => (x.audioAssetId ? [x.audioAssetId] : []))),
      ),
    ];
    const assets = await learnerRepo(db).getAudioAssets(audioIds);
    const audioAssets: Record<string, Awaited<ReturnType<typeof audioRef>>> = {};
    for (const a of assets) audioAssets[a.id] = await audioRef(c.env, a);
    return c.json(
      encodeGrammar({
        notes: rows.map((n) => ({
          ...grammarNoteView(n),
          unitSlug: n.unitSlug,
          unitTitleKey: n.unitTitleKey,
          skillTitleKey: n.skillTitleKey,
          unlocked: n.unlocked,
        })),
        sourceLang: lang,
        audioAssets,
      }),
    );
  })
  .get("/units/:slug", async (c) => {
    const repo = learnerRepo(c.get("db"));
    const lang = c.get("sourceLang");
    const course = await enrolledCourse(c);
    const unit = await repo.getUnitBySlug(c.req.param("slug"), course.id);
    if (!unit) throw new HTTPException(404, { message: "unit not found" });
    const voice = await preferredVoiceOf(c);
    const lock = lockViewOf(
      await unitLocks(c.get("db"), c.get("actor")?.id ?? null, course.id),
      unit.id,
    );

    // The rules a learner is shown before the drill (docs/GRAMMAR.md), in
    // their own language. A skill that teaches none gets an empty list and
    // the lesson opens straight into the exercise.
    const notes = await grammarRepo(c.get("db")).notesForSkills(
      unit.skills.map((s) => s.id),
      lang,
    );

    const lexemeIds = new Set<string>();
    const sentenceIds = new Set<string>();
    const audioIds = new Set<string>();
    for (const list of notes.values())
      for (const n of list)
        for (const cell of n.cells) if (cell.audioAssetId) audioIds.add(cell.audioAssetId);
    for (const s of unit.skills)
      for (const l of s.lessons)
        for (const e of l.exercises) {
          for (const id of e.lexemeIds) lexemeIds.add(id);
          for (const id of e.sentenceIds) sentenceIds.add(id);
          for (const id of e.audioAssetIds) audioIds.add(id);
        }

    // The words of a sentence are not among an exercise's referenced ids
    // (a translate_tap names the sentence, not its tokens), but the word
    // hints in the prompt need their glosses, so they are hydrated too.
    const sentences = await repo.getSentences([...sentenceIds], lang, voice);
    for (const s of sentences) for (const tok of s.tokens) lexemeIds.add(tok.lexemeId);

    const [lexemes, audio] = await Promise.all([
      repo.getLexemes([...lexemeIds], lang, voice),
      repo.getAudioAssets([...audioIds]),
    ]);

    // "New word" and "tricky" are the learner's own history, so they are
    // computed here and never asked of the client. A guest gets nulls and
    // derives the same two badges from the lessons kept on the device.
    const actor = c.get("actor");
    const [seen, tricky] = actor
      ? await Promise.all([
          repo.seenLexemeIds(actor.id),
          mistakesRepo(c.get("db")).openLexemeIds(actor.id),
        ])
      : [null, null];
    const momentOf = (teaches: readonly string[]): ExerciseMoment | null =>
      seen && tricky ? momentFor({ teaches, seen, tricky }) : null;

    const lexemeViews: Record<string, LexemeView> = {};
    for (const l of lexemes) {
      lexemeViews[l.id] = {
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
    const sentenceViews: Record<string, SentenceView> = {};
    for (const s of sentences) {
      sentenceViews[s.id] = {
        id: s.id,
        textXh: s.textXh,
        gloss: s.gloss,
        tokens: s.tokens,
        audio: s.audio ? await audioRef(c.env, s.audio) : null,
        voices: await Promise.all(s.voices.map((v) => audioRef(c.env, v))),
      };
    }
    const audioViews: Record<string, Awaited<ReturnType<typeof audioRef>>> = {};
    for (const a of audio) audioViews[a.id] = await audioRef(c.env, a);

    return c.json(
      encodeUnit({
        unit: {
          id: unit.id,
          slug: unit.slug,
          titleKey: unit.titleKey,
          order: unit.order,
          cefrBand: unit.cefrBand,
          prerequisiteUnitId: unit.prerequisiteUnitId,
          ...lock,
          skills: unit.skills.map((s) => ({
            id: s.id,
            slug: s.slug,
            titleKey: s.titleKey,
            order: s.order,
            kind: s.kind,
            grammarNotes: (notes.get(s.id) ?? []).map(grammarNoteView),
            lessons: s.lessons.map((l) => ({
              id: l.id,
              order: l.order,
              estimatedMinutes: l.estimatedMinutes,
              exercises: l.exercises.map((e) => ({
                id: e.id,
                order: e.order,
                type: e.type,
                payload: e.payload,
                teaches: e.teaches,
                moment: momentOf(e.teaches),
              })),
            })),
          })),
        },
        sourceLang: lang,
        lexemes: lexemeViews,
        sentences: sentenceViews,
        audioAssets: audioViews,
      }),
    );
  });

/**
 * The body of `GET /units/:slug`, built only on a cache miss. Everything it
 * reads is either published content or the caller's own state; the caller's
 * own state is why the assembled result is shared only when there is no
 * caller (apps/api/src/content-cache.ts).
 */
async function unitPayload(c: Context<AppEnv>, slug: string): Promise<unknown> {
  const repo = learnerRepo(c.get("db"));
  const lang = c.get("sourceLang");
  const course = await enrolledCourse(c);
  const unit = await repo.getUnitBySlug(slug, course.id);
  if (!unit) throw new HTTPException(404, { message: "unit not found" });
  const voice = await preferredVoiceOf(c);
  const lock = lockViewOf(
    await unitLocks(c.get("db"), c.get("actor")?.id ?? null, course.id),
    unit.id,
  );

  const lexemeIds = new Set<string>();
  const sentenceIds = new Set<string>();
  // The rule a skill teaches, in the learner's own language. A skill that
  // teaches none gets an empty list and the lesson opens straight into the
  // exercise (docs/GRAMMAR.md section 1). Loaded before the audio is gathered,
  // because a paradigm cell carries its own recording: the audio is part of
  // the rule, not an illustration of it, since tone is not written.
  const notes = await grammarRepo(c.get("db")).notesForSkills(
    unit.skills.map((s) => s.id),
    lang,
  );

  const audioIds = new Set<string>();
  for (const list of notes.values())
    for (const n of list)
      for (const cell of n.cells) if (cell.audioAssetId) audioIds.add(cell.audioAssetId);
  for (const s of unit.skills)
    for (const l of s.lessons)
      for (const e of l.exercises) {
        for (const id of e.lexemeIds) lexemeIds.add(id);
        for (const id of e.sentenceIds) sentenceIds.add(id);
        for (const id of e.audioAssetIds) audioIds.add(id);
      }

  // The words of a sentence are not among an exercise's referenced ids
  // (a translate_tap names the sentence, not its tokens), but the word
  // hints in the prompt need their glosses, so they are hydrated too.
  const sentences = await repo.getSentences([...sentenceIds], lang, voice);
  for (const s of sentences) for (const tok of s.tokens) lexemeIds.add(tok.lexemeId);

  // A click_identify names bare clicks, not audio assets: its recordings are
  // the published tier-1 studio takes of those clicks, looked up by click.
  const clickIds = new Set<string>();
  for (const s of unit.skills)
    for (const l of s.lessons)
      for (const e of l.exercises)
        if (e.type === "click_identify")
          for (const id of clickIdsOfPayload(e.payload)) clickIds.add(id);

  const [lexemes, audio, clicks] = await Promise.all([
    repo.getLexemes([...lexemeIds], lang, voice),
    repo.getAudioAssets([...audioIds]),
    clickIds.size > 0 ? repo.publishedClickAudio([...clickIds]) : Promise.resolve([]),
  ]);

  // "New word" and "tricky" are the learner's own history, so they are
  // computed here and never asked of the client. A guest gets nulls and
  // derives the same two badges from the lessons kept on the device.
  const actor = c.get("actor");
  const [seen, tricky] = actor
    ? await Promise.all([
        repo.seenLexemeIds(actor.id),
        mistakesRepo(c.get("db")).openLexemeIds(actor.id),
      ])
    : [null, null];
  const momentOf = (teaches: readonly string[]): ExerciseMoment | null =>
    seen && tricky ? momentFor({ teaches, seen, tricky }) : null;
  // Which of the unit's words this learner has never met, from the same
  // history: the lesson runner meets each on a card before practising it.
  // `teaches` holds published lexemes only, so this list can hold nothing
  // else. Left out for a guest, whose device answers it.
  const unseen = seen
    ? unseenAmong(
        unit.skills.flatMap((s) => s.lessons.flatMap((l) => l.exercises.flatMap((e) => e.teaches))),
        seen,
      )
    : null;

  const lexemeViews: Record<string, LexemeView> = {};
  for (const l of lexemes) {
    lexemeViews[l.id] = {
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
  const sentenceViews: Record<string, SentenceView> = {};
  for (const s of sentences) {
    sentenceViews[s.id] = {
      id: s.id,
      textXh: s.textXh,
      gloss: s.gloss,
      tokens: s.tokens,
      audio: s.audio ? await audioRef(c.env, s.audio) : null,
      voices: await Promise.all(s.voices.map((v) => audioRef(c.env, v))),
    };
  }
  const audioViews: Record<string, Awaited<ReturnType<typeof audioRef>>> = {};
  for (const a of audio) audioViews[a.id] = await audioRef(c.env, a);
  const clickAudio: Record<string, Awaited<ReturnType<typeof audioRef>>> = {};
  for (const r of clicks) clickAudio[r.clickId] = await audioRef(c.env, r.audio);

  return encodeUnit({
    unit: {
      id: unit.id,
      slug: unit.slug,
      titleKey: unit.titleKey,
      order: unit.order,
      cefrBand: unit.cefrBand,
      prerequisiteUnitId: unit.prerequisiteUnitId,
      ...lock,
      skills: unit.skills.map((s) => ({
        id: s.id,
        slug: s.slug,
        titleKey: s.titleKey,
        order: s.order,
        kind: s.kind,
        grammarNotes: (notes.get(s.id) ?? []).map(grammarNoteView),
        lessons: s.lessons.map((l) => ({
          id: l.id,
          order: l.order,
          estimatedMinutes: l.estimatedMinutes,
          exercises: l.exercises.map((e) => ({
            id: e.id,
            order: e.order,
            type: e.type,
            payload: e.payload,
            teaches: e.teaches,
            moment: momentOf(e.teaches),
          })),
        })),
      })),
    },
    sourceLang: lang,
    lexemes: lexemeViews,
    sentences: sentenceViews,
    audioAssets: audioViews,
    clickAudio,
    ...(unseen ? { unseenLexemeIds: unseen } : {}),
  });
}

/** The `CLICK_SOUNDS` ids a stored click_identify payload lists; nothing for anything else. */
function clickIdsOfPayload(payload: unknown): readonly string[] {
  const decoded = decodeExercisePayload(payload);
  return Either.isRight(decoded) ? referencedClickIds(decoded.right) : [];
}
