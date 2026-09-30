/**
 * What a tutor is asked to supply (docs/EDITOR-GUIDE.md, "Write the
 * sentences" and "Check the culture cards").
 *
 * Two things live here, both editor-only:
 *
 *   - **Sentence requests.** English-first prompts waiting for a speaker. A
 *     request is not content and has no content status; answering one
 *     creates an ordinary `draft` sentence through `editorRepo`, so the
 *     sentence runs the same token check, the same gloss rule and the same
 *     publish gate as one typed into the sentence builder.
 *   - **Culture cards.** `culture_card` exercises a model drafted, loaded at
 *     `ai_draft` with their caveat in `exercises.note`.
 *
 * Nothing in this module writes `published`. Every row it creates goes
 * through `editorRepo`, which will not take a status argument at all.
 */

import {
  TUTOR_SENTENCE_LICENCE,
  TUTOR_SENTENCE_SOURCE,
  decodePayloadForType,
  tutorProvenance,
  type Actor,
  type CultureCardView,
  type ExercisePayload,
  type SentenceRequestView,
  type SourceLang,
  type Status,
} from "@molo/core";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Either } from "effect";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";
import { users } from "../schema/auth.ts";
import { courses, exercises, lessons, skills, units } from "../schema/curriculum.ts";
import { contentRevisions } from "../schema/editorial.ts";
import { glosses, lexemes, sentenceLexemes, sentences } from "../schema/lexicon.ts";
import { sentenceRequests } from "../schema/tutor.ts";
import { editorRepo, type MorphPort, noMorph } from "./editor.ts";
import { RepoError } from "./errors.ts";
import { assertEditorial } from "./roles.ts";

export interface SentenceToLink {
  readonly sentenceId: string;
  readonly textXh: string;
  readonly status: string;
  readonly unitSlug: string;
  readonly skillSlug: string;
  readonly requestSlug: string;
  readonly targetLexemeIds: readonly string[];
}

export interface TutorSkill {
  readonly id: string;
  readonly slug: string;
  readonly unitSlug: string;
  readonly titleKey: string;
}

export interface NewSentenceRequest {
  readonly skillId: string;
  readonly slug: string;
  readonly order: number;
  readonly promptEn: string;
  readonly promptNb: string | null;
  readonly note: string | null;
  readonly targetLexemeIds: readonly string[];
}

export interface FulfilInput {
  readonly textXh: string;
  readonly promptEn?: string | undefined;
  readonly promptNb?: string | undefined;
}

/** A fulfilled request whose sentence could become a translate_tap in its skill. */
export interface TapCandidate {
  readonly requestId: string;
  readonly requestSlug: string;
  readonly skillId: string;
  readonly skillSlug: string;
  readonly unitSlug: string;
  readonly sentenceId: string;
  readonly sentenceStatus: Status;
  /** In position order; a tap exercise's tiles are these tokens. */
  readonly tokenLexemeIds: readonly string[];
  /** The exercise already built from this sentence in this skill, if any. */
  readonly existingExerciseId: string | null;
}

/** Marks a culture card as the one `curriculum/culture-cards.json` calls `slug`. */
export function cultureCardMarker(slug: string): string {
  return `culture-cards.json: ${slug}`;
}

export function tutorRepo(db: Db, actor: Actor, deps: { morph: MorphPort } = { morph: noMorph }) {
  assertEditorial(actor);

  /** Every skill of one course (or all), keyed `unit/skill`. */
  async function skillsByKey(courseId?: string | undefined): Promise<Map<string, TutorSkill>> {
    const rows = await db
      .select({
        id: skills.id,
        slug: skills.slug,
        titleKey: skills.titleKey,
        unitSlug: units.slug,
      })
      .from(skills)
      .innerJoin(units, eq(units.id, skills.unitId))
      .where(courseId ? eq(units.courseId, courseId) : undefined)
      .orderBy(asc(units.order), asc(skills.order));
    return new Map(rows.map((r) => [`${r.unitSlug}/${r.slug}`, r]));
  }

  /**
   * The words each skill teaches: every lexeme its exercises name, in
   * lesson then exercise order, without repeats. This is the same list the
   * dashboard's curriculum tree counts, read from the rows rather than the
   * spine, so an editor's change to a skill shows up here at once.
   */
  async function skillWords(skillIds: readonly string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await db
      .select({ skillId: lessons.skillId, lexemeIds: exercises.lexemeIds })
      .from(exercises)
      .innerJoin(lessons, eq(lessons.id, exercises.lessonId))
      .where(inArray(lessons.skillId, [...skillIds]))
      .orderBy(asc(lessons.order), asc(exercises.order));
    for (const r of rows) {
      const list = out.get(r.skillId) ?? [];
      for (const id of r.lexemeIds) if (!list.includes(id)) list.push(id);
      out.set(r.skillId, list);
    }
    return out;
  }

  // ---- sentence requests ---------------------------------------------------

  async function findRequest(skillId: string, slug: string): Promise<{ id: string } | null> {
    const [row] = await db
      .select({ id: sentenceRequests.id })
      .from(sentenceRequests)
      .where(and(eq(sentenceRequests.skillId, skillId), eq(sentenceRequests.slug, slug)))
      .limit(1);
    return row ?? null;
  }

  async function createRequest(input: NewSentenceRequest): Promise<string> {
    assertEditorial(actor);
    const [row] = await db
      .insert(sentenceRequests)
      .values({
        skillId: input.skillId,
        slug: input.slug,
        order: input.order,
        promptEn: input.promptEn.trim(),
        promptNb: input.promptNb?.trim() || null,
        note: input.note?.trim() || null,
        targetLexemeIds: [...input.targetLexemeIds],
        createdBy: actor.id,
      })
      .onConflictDoNothing({ target: [sentenceRequests.skillId, sentenceRequests.slug] })
      .returning({ id: sentenceRequests.id });
    if (!row) throw new RepoError("conflict", `request ${input.slug} already exists in its skill`);
    return row.id;
  }

  /** Every request of one course (or all), in curriculum order, with the words it names. */
  async function listRequests(
    opts: { courseId?: string | undefined; unitSlug?: string | undefined } = {},
  ): Promise<SentenceRequestView[]> {
    const conds = [];
    if (opts.courseId) conds.push(eq(units.courseId, opts.courseId));
    if (opts.unitSlug) conds.push(eq(units.slug, opts.unitSlug));
    const rows = await db
      .select({
        id: sentenceRequests.id,
        unitSlug: units.slug,
        skillSlug: skills.slug,
        skillTitleKey: skills.titleKey,
        slug: sentenceRequests.slug,
        order: sentenceRequests.order,
        promptEn: sentenceRequests.promptEn,
        promptNb: sentenceRequests.promptNb,
        note: sentenceRequests.note,
        status: sentenceRequests.status,
        targetLexemeIds: sentenceRequests.targetLexemeIds,
        dismissedReason: sentenceRequests.dismissedReason,
        sentenceId: sentences.id,
        sentenceText: sentences.textXh,
        sentenceStatus: sentences.status,
        sentenceSourceRef: sentences.sourceRef,
      })
      .from(sentenceRequests)
      .innerJoin(skills, eq(skills.id, sentenceRequests.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .leftJoin(sentences, eq(sentences.id, sentenceRequests.fulfilledSentenceId))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(asc(units.order), asc(skills.order), asc(sentenceRequests.order));

    const ids = [...new Set(rows.flatMap((r) => r.targetLexemeIds))];
    const words = new Map<
      string,
      { lemma: string; pos: string; gloss: Partial<Record<SourceLang, string>> }
    >();
    if (ids.length > 0) {
      const lx = await db
        .select({ id: lexemes.id, lemma: lexemes.lemma, pos: lexemes.pos })
        .from(lexemes)
        .where(inArray(lexemes.id, ids));
      for (const l of lx) words.set(l.id, { lemma: l.lemma, pos: l.pos, gloss: {} });
      // Every gloss a human or a model wrote: the tutor is reading them for
      // meaning, not publishing them, and a missing Norwegian gloss is common.
      const gl = await db
        .select({ lexemeId: glosses.lexemeId, lang: glosses.sourceLang, gloss: glosses.gloss })
        .from(glosses)
        .where(inArray(glosses.lexemeId, ids));
      for (const g of gl) {
        const w = words.get(g.lexemeId);
        if (w) w.gloss[g.lang] = g.gloss;
      }
    }

    return rows.map((r) => ({
      id: r.id,
      unitSlug: r.unitSlug,
      skillSlug: r.skillSlug,
      skillTitleKey: r.skillTitleKey,
      slug: r.slug,
      order: r.order,
      promptEn: r.promptEn,
      promptNb: r.promptNb,
      note: r.note,
      status: r.status,
      dismissedReason: r.dismissedReason,
      words: r.targetLexemeIds.flatMap((id) => {
        const w = words.get(id);
        return w ? [{ lexemeId: id, lemma: w.lemma, pos: w.pos, gloss: w.gloss }] : [];
      }),
      fulfilled:
        r.sentenceId && r.sentenceText !== null && r.sentenceStatus !== null
          ? {
              sentenceId: r.sentenceId,
              textXh: r.sentenceText,
              status: r.sentenceStatus,
              sourceRef: r.sentenceSourceRef,
            }
          : null,
    }));
  }

  async function loadRequest(id: string) {
    const [row] = await db
      .select({
        id: sentenceRequests.id,
        slug: sentenceRequests.slug,
        status: sentenceRequests.status,
        promptEn: sentenceRequests.promptEn,
        promptNb: sentenceRequests.promptNb,
        targetLexemeIds: sentenceRequests.targetLexemeIds,
        skillSlug: skills.slug,
        unitSlug: units.slug,
        cefrBand: units.cefrBand,
        targetLang: courses.targetLang,
      })
      .from(sentenceRequests)
      .innerJoin(skills, eq(skills.id, sentenceRequests.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .innerJoin(courses, eq(courses.id, units.courseId))
      .where(eq(sentenceRequests.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `sentence request ${id}`);
    return row;
  }

  /**
   * The tutor's answer. Creates a `draft` sentence exactly as typed, with
   * provenance "tutor, <name>, <date>", and its glosses:
   *
   *   - **English** as a human gloss. The tutor wrote the isiXhosa *for* this
   *     English, and edited it if it did not fit; that is a speaker vouching
   *     for the pairing, which is what a human gloss means.
   *   - **Norwegian** as `ai_draft` unless the tutor edited it. A tutor who
   *     does not read Norwegian cannot vouch for it, so it waits for an
   *     editor who does, and the sentence cannot publish until one has.
   *
   * All in one transaction: a request is never left pointing at half a
   * sentence, and a failed save leaves nothing behind to collide with.
   */
  async function fulfilRequest(id: string, input: FulfilInput): Promise<{ sentenceId: string }> {
    assertEditorial(actor);
    const textXh = input.textXh.trim();
    if (textXh === "") throw new RepoError("invalid", "the sentence is empty");
    const req = await loadRequest(id);
    if (req.status !== "open")
      throw new RepoError("conflict", `request ${req.slug} is ${req.status}, not open`);
    const [me] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);
    const now = new Date();
    const promptEn = input.promptEn?.trim() || req.promptEn;
    const editedNb = input.promptNb !== undefined && input.promptNb.trim() !== "";
    const promptNb = editedNb ? (input.promptNb as string).trim() : req.promptNb;

    return db.transaction(async (tx) => {
      const repo = editorRepo(tx as unknown as Db, actor, deps);
      const sentenceId = await repo.createSentence({
        targetLang: req.targetLang,
        textXh,
        cefrBand: req.cefrBand,
        source: TUTOR_SENTENCE_SOURCE,
        sourceRef: tutorProvenance(me?.name ?? actor.id, now),
        licence: TUTOR_SENTENCE_LICENCE,
        grammarTags: {
          sentenceRequest: req.id,
          skill: `${req.unitSlug}/${req.skillSlug}`,
          targetLexemeIds: req.targetLexemeIds,
        },
        origin: "human",
      });
      await repo.upsertSentenceGloss(sentenceId, {
        sourceLang: "en",
        gloss: promptEn,
        origin: "human",
      });
      if (promptNb) {
        await repo.upsertSentenceGloss(sentenceId, {
          sourceLang: "nb",
          gloss: promptNb,
          origin: editedNb ? "human" : "llm",
        });
      }
      await tx
        .update(sentenceRequests)
        .set({
          status: "fulfilled",
          fulfilledSentenceId: sentenceId,
          fulfilledBy: actor.id,
          fulfilledAt: now,
          promptEn,
          promptNb,
          updatedAt: now,
        })
        .where(eq(sentenceRequests.id, id));
      return { sentenceId };
    });
  }

  /** Sets a request aside with a reason; the tutor's "this does not work in isiXhosa". */
  async function dismissRequest(id: string, reason: string): Promise<void> {
    assertEditorial(actor);
    const req = await loadRequest(id);
    if (req.status !== "open")
      throw new RepoError("conflict", `request ${req.slug} is ${req.status}, not open`);
    await db
      .update(sentenceRequests)
      .set({ status: "dismissed", dismissedReason: reason.trim(), updatedAt: new Date() })
      .where(eq(sentenceRequests.id, id));
  }

  /** Undoes a dismissal. A fulfilled request stays fulfilled: its sentence is edited instead. */
  /**
   * Puts a request back to "to write". A set-aside request just reopens. A
   * written one can be taken back while its sentence is still a draft that
   * nothing uses: the sentence is deleted (its glosses and word links go with
   * it) and the request is open again, so a test or a slip can be rewritten.
   * Only the person who wrote it or an admin may take a sentence back.
   */
  async function reopenRequest(id: string): Promise<void> {
    assertEditorial(actor);
    const req = await loadRequest(id);
    if (req.status === "dismissed") {
      await db
        .update(sentenceRequests)
        .set({ status: "open", dismissedReason: null, updatedAt: new Date() })
        .where(eq(sentenceRequests.id, id));
      return;
    }
    if (req.status !== "fulfilled")
      throw new RepoError("conflict", `request ${req.slug} is ${req.status}`);
    const [link] = await db
      .select({
        sentenceId: sentenceRequests.fulfilledSentenceId,
        fulfilledBy: sentenceRequests.fulfilledBy,
        status: sentences.status,
        textXh: sentences.textXh,
      })
      .from(sentenceRequests)
      .leftJoin(sentences, eq(sentences.id, sentenceRequests.fulfilledSentenceId))
      .where(eq(sentenceRequests.id, id))
      .limit(1);
    if (link?.fulfilledBy !== actor.id && !actor.roles.includes("admin"))
      throw new RepoError("forbidden", "only the writer or an admin can take a sentence back");
    const sentenceId = link?.sentenceId ?? null;
    if (sentenceId) {
      if (link?.status !== "draft" && link?.status !== "ai_draft")
        throw new RepoError(
          "conflict",
          `the sentence is ${link?.status}; only a draft can be taken back`,
        );
      const [audio] = await db
        .select({ id: audioAssets.id })
        .from(audioAssets)
        .where(and(eq(audioAssets.targetKind, "sentence"), eq(audioAssets.targetId, sentenceId)))
        .limit(1);
      if (audio)
        throw new RepoError("conflict", "the sentence has a recording; delete the take first");
      const [used] = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(sql`${exercises.sentenceIds} @> array[${sentenceId}]::uuid[]`)
        .limit(1);
      if (used) throw new RepoError("conflict", "an exercise uses the sentence");
    }
    await db.transaction(async (tx) => {
      if (sentenceId) {
        await tx.insert(contentRevisions).values({
          entityKind: "sentence",
          entityId: sentenceId,
          diff: { deleted: { status: link?.status, textXh: link?.textXh, request: req.slug } },
          actorId: actor.id,
          note: "taken back: the request is open again",
        });
        await tx.delete(sentences).where(eq(sentences.id, sentenceId));
      }
      await tx
        .update(sentenceRequests)
        .set({
          status: "open",
          fulfilledSentenceId: null,
          fulfilledBy: null,
          fulfilledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(sentenceRequests.id, id));
    });
  }

  // ---- translate_tap from an answered request ------------------------------

  /** Every fulfilled request with its sentence's status, tokens and any tap already built. */
  async function tapCandidates(unitSlug?: string | undefined): Promise<TapCandidate[]> {
    const rows = await db
      .select({
        requestId: sentenceRequests.id,
        requestSlug: sentenceRequests.slug,
        skillId: skills.id,
        skillSlug: skills.slug,
        unitSlug: units.slug,
        sentenceId: sentences.id,
        sentenceStatus: sentences.status,
      })
      .from(sentenceRequests)
      .innerJoin(skills, eq(skills.id, sentenceRequests.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .innerJoin(sentences, eq(sentences.id, sentenceRequests.fulfilledSentenceId))
      .where(
        and(
          eq(sentenceRequests.status, "fulfilled"),
          unitSlug ? eq(units.slug, unitSlug) : undefined,
        ),
      )
      .orderBy(asc(units.order), asc(skills.order), asc(sentenceRequests.order));
    const out: TapCandidate[] = [];
    for (const r of rows) {
      const tokens = await db
        .select({ lexemeId: sentenceLexemes.lexemeId })
        .from(sentenceLexemes)
        .where(eq(sentenceLexemes.sentenceId, r.sentenceId))
        .orderBy(asc(sentenceLexemes.position));
      const [existing] = await db
        .select({ id: exercises.id })
        .from(exercises)
        .innerJoin(lessons, eq(lessons.id, exercises.lessonId))
        .where(
          and(
            eq(lessons.skillId, r.skillId),
            eq(exercises.type, "translate_tap"),
            sql`${exercises.sentenceIds} @> array[${r.sentenceId}]::uuid[]`,
          ),
        )
        .limit(1);
      out.push({
        ...r,
        tokenLexemeIds: tokens.map((t) => t.lexemeId),
        existingExerciseId: existing?.id ?? null,
      });
    }
    return out;
  }

  /**
   * Sentences tutors wrote for requests whose words are not linked yet, with
   * the words each request asked for. Published and retired ones are left
   * alone: linking changes a sentence, so it is for drafts and review only.
   */
  async function sentencesToLink(unitSlug?: string | undefined): Promise<SentenceToLink[]> {
    return db
      .select({
        sentenceId: sentences.id,
        textXh: sentences.textXh,
        status: sentences.status,
        unitSlug: units.slug,
        skillSlug: skills.slug,
        requestSlug: sentenceRequests.slug,
        targetLexemeIds: sentenceRequests.targetLexemeIds,
      })
      .from(sentenceRequests)
      .innerJoin(skills, eq(skills.id, sentenceRequests.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .innerJoin(sentences, eq(sentences.id, sentenceRequests.fulfilledSentenceId))
      .where(
        and(
          eq(sentenceRequests.status, "fulfilled"),
          inArray(sentences.status, ["draft", "ai_draft", "in_review"]),
          sql`not exists (select 1 from ${sentenceLexemes} where ${sentenceLexemes.sentenceId} = ${sentences.id})`,
          unitSlug ? eq(units.slug, unitSlug) : undefined,
        ),
      )
      .orderBy(asc(units.order), asc(skills.order), asc(sentenceRequests.order));
  }

  /** The skill's lessons, each with whether every exercise in it is a culture card. */
  async function lessonsOf(skillId: string) {
    const rows = await db
      .select({ id: lessons.id, order: lessons.order })
      .from(lessons)
      .where(eq(lessons.skillId, skillId))
      .orderBy(asc(lessons.order));
    const out: Array<{ id: string; order: number; types: string[]; maxOrder: number }> = [];
    for (const l of rows) {
      const ex = await db
        .select({ type: exercises.type, order: exercises.order })
        .from(exercises)
        .where(eq(exercises.lessonId, l.id));
      out.push({
        id: l.id,
        order: l.order,
        types: ex.map((e) => e.type),
        maxOrder: ex.reduce((m, e) => Math.max(m, e.order), 0),
      });
    }
    return out;
  }

  /**
   * Appends a `draft` translate_tap to the last ordinary lesson of the skill
   * (a new lesson if the skill has none). The payload is checked against the
   * exercise schema by `createExercise`, the same as every other exercise.
   */
  async function addTranslateTap(input: {
    skillId: string;
    sentenceId: string;
    distractorLexemeIds: readonly string[];
    note: string;
  }): Promise<string> {
    assertEditorial(actor);
    const repo = editorRepo(db, actor, deps);
    const all = await lessonsOf(input.skillId);
    const ordinary = all.filter(
      (l) => !(l.types.length > 0 && l.types.every((t) => t === "culture_card")),
    );
    let target = ordinary.at(-1);
    if (!target) {
      const order = all.reduce((m, l) => Math.max(m, l.order), 0) + 1;
      const id = await repo.createLesson({ skillId: input.skillId, order });
      target = { id, order, types: [], maxOrder: 0 };
    }
    return repo.createExercise({
      lessonId: target.id,
      order: target.maxOrder + 1,
      type: "translate_tap",
      payload: {
        type: "translate_tap",
        sentenceId: input.sentenceId,
        distractorLexemeIds: [...input.distractorLexemeIds],
      },
      note: input.note,
    });
  }

  // ---- culture cards -------------------------------------------------------

  /** The card `curriculum/culture-cards.json` calls `slug`, if a previous run loaded it. */
  async function findCultureCard(
    skillId: string,
    slug: string,
    titleEn: string,
  ): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: exercises.id, note: exercises.note, payload: exercises.payload })
      .from(exercises)
      .innerJoin(lessons, eq(lessons.id, exercises.lessonId))
      .where(and(eq(lessons.skillId, skillId), eq(exercises.type, "culture_card")));
    const marker = cultureCardMarker(slug);
    // The marker first; the English title as a fallback, so an editor who
    // tidied the note does not get the card loaded a second time.
    const hit =
      rows.find((r) => r.note?.split("\n")[0]?.trim() === marker) ??
      rows.find((r) => {
        const p = r.payload as { title?: Partial<Record<SourceLang, string>> };
        return p.title?.en?.trim() === titleEn.trim();
      });
    return hit ? { id: hit.id } : null;
  }

  /**
   * Loads a model-drafted culture card at `ai_draft`, in the skill's culture
   * lesson (one whose every exercise is a culture card), or a new lesson at
   * the end of the skill if it has none. The caveat goes in `exercises.note`,
   * which no learner route ever returns.
   */
  async function addCultureCard(input: {
    skillId: string;
    slug: string;
    payload: ExercisePayload;
    caveat: string;
  }): Promise<string> {
    assertEditorial(actor);
    const repo = editorRepo(db, actor, deps);
    const all = await lessonsOf(input.skillId);
    let target = all.find((l) => l.types.length > 0 && l.types.every((t) => t === "culture_card"));
    if (!target) {
      const order = all.reduce((m, l) => Math.max(m, l.order), 0) + 1;
      const id = await repo.createLesson({ skillId: input.skillId, order, estimatedMinutes: 2 });
      target = { id, order, types: [], maxOrder: 0 };
    }
    return repo.createExercise({
      lessonId: target.id,
      order: target.maxOrder + 1,
      type: "culture_card",
      payload: input.payload,
      note: `${cultureCardMarker(input.slug)}\n${input.caveat.trim()}`,
      origin: "llm",
    });
  }

  /** Every culture card in one course (or all), any status, with the words it names. */
  async function cultureCards(courseId?: string | undefined): Promise<CultureCardView[]> {
    const rows = await db
      .select({
        id: exercises.id,
        lessonId: exercises.lessonId,
        status: exercises.status,
        note: exercises.note,
        payload: exercises.payload,
        lexemeIds: exercises.lexemeIds,
        updatedAt: exercises.updatedAt,
        skillSlug: skills.slug,
        unitSlug: units.slug,
      })
      .from(exercises)
      .innerJoin(lessons, eq(lessons.id, exercises.lessonId))
      .innerJoin(skills, eq(skills.id, lessons.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .where(
        and(
          eq(exercises.type, "culture_card"),
          courseId ? eq(units.courseId, courseId) : undefined,
        ),
      )
      .orderBy(asc(units.order), asc(skills.order), asc(lessons.order), asc(exercises.order));
    const ids = [...new Set(rows.flatMap((r) => r.lexemeIds))];
    const lx =
      ids.length > 0
        ? await db
            .select({ id: lexemes.id, lemma: lexemes.lemma, status: lexemes.status })
            .from(lexemes)
            .where(inArray(lexemes.id, ids))
        : [];
    const byId = new Map(lx.map((l) => [l.id, l]));
    // The newest revision per card: who last edited it or moved its status.
    const cardIds = rows.map((r) => r.id);
    const revs =
      cardIds.length > 0
        ? await db
            .selectDistinctOn([contentRevisions.entityId], {
              entityId: contentRevisions.entityId,
              diff: contentRevisions.diff,
              at: contentRevisions.createdAt,
              actorName: users.name,
            })
            .from(contentRevisions)
            .leftJoin(users, eq(users.id, contentRevisions.actorId))
            .where(
              and(
                eq(contentRevisions.entityKind, "exercise"),
                inArray(contentRevisions.entityId, cardIds),
              ),
            )
            .orderBy(contentRevisions.entityId, desc(contentRevisions.createdAt))
        : [];
    const lastEdit = new Map(
      revs.map((r) => [
        r.entityId,
        {
          actorName: r.actorName ?? null,
          at: r.at.toISOString(),
          what:
            "status" in r.diff
              ? ("status" as const)
              : "created" in r.diff
                ? ("created" as const)
                : ("edit" as const),
        },
      ]),
    );
    return rows.flatMap((r) => {
      const decoded = decodePayloadForType("culture_card", r.payload);
      if (Either.isLeft(decoded)) return [];
      return [
        {
          id: r.id,
          unitSlug: r.unitSlug,
          skillSlug: r.skillSlug,
          lessonId: r.lessonId,
          status: r.status,
          caveat: r.note,
          payload: decoded.right,
          words: r.lexemeIds.flatMap((id) => {
            const l = byId.get(id);
            return l ? [{ lexemeId: id, lemma: l.lemma, status: l.status }] : [];
          }),
          updatedAt: r.updatedAt.toISOString(),
          lastEdit: lastEdit.get(r.id) ?? null,
        },
      ];
    });
  }

  return {
    skillsByKey,
    skillWords,
    findRequest,
    createRequest,
    listRequests,
    fulfilRequest,
    dismissRequest,
    reopenRequest,
    tapCandidates,
    sentencesToLink,
    addTranslateTap,
    findCultureCard,
    addCultureCard,
    cultureCards,
  };
}
