import type { AudioBacklog, AudioQueueItem, AudioQueueResponse, StudioSpeaker } from "@molo/core";
import type { EditorLexemeDetail, EditorReviewItem } from "@molo/core";
import { ACCOUNT_DELETE_CONFIRMATION, previewRequestAllowed } from "@molo/core";
import type {
  WebPurchaseView,
  LeagueProfile,
  LeagueProfileRequest,
  BulkTransitionResponse,
  GrammarReferenceResponse,
  ContentReport,
  CreateSentenceRequest,
  ExerciseReportRequest,
  ExerciseReportResponse,
  ExerciseReportsResponse,
  LessonCompleteRequest,
  LessonCompleteResponse,
  MistakePractiseRequest,
  MistakePractiseResponse,
  MistakesResponse,
  PatchSentenceRequest,
  ProgressResponse,
  SentenceTokenInput,
  TokenVerification,
  ReviewRequest,
  ReviewResponse,
  ReviewSessionResponse,
  ChestClaimResponse,
  PathResponse,
  TransitionRequest,
  ContentNote,
  ContentNoteRequest,
  ReviewApproveResponse,
  TransitionResponse,
  UnitResponse,
  UnitSummary,
} from "@molo/core";

import { previewStore } from "./preview-state.ts";

/**
 * Thin typed client for apps/api. Cookies are sent so Better Auth sessions
 * work across the two origins (the API allows WEB_ORIGIN with credentials).
 */
export function apiUrl(): string {
  return (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8787";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const preview = previewStore.getSnapshot() !== null;
  if (preview && !previewRequestAllowed(path, init.method)) {
    throw new ApiError(403, "preview_read_only", "preview is read-only");
  }
  const res = await fetch(`${apiUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(preview ? { "X-Molo-Preview": "1" } : {}),
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return body as T;
}

// ---- learner ---------------------------------------------------------------

/** A course: a curriculum over a target language (docs/ARCHITECTURE.md section 2.6). */
export interface Course {
  id: string;
  slug: string;
  targetLang: string;
  titleKey: string;
  order: number;
  isDefault: boolean;
}

export interface Me {
  leagueProfile?: LeagueProfile;
  user: { id: string; name: string; email: string; country?: string | null };
  roles: string[];
  /** A one-tap Apple/Google account that has not given its birth year and country yet. */
  ageRequired?: boolean;
  sourceLang: "en" | "nb";
  /** The resolved enrolment; `prefs.courseId` null means "the default course". */
  course: Course;
  prefs: {
    sourceLang: "en" | "nb";
    courseId: string | null;
    dailyGoalXp: number;
    reminderOptIn: boolean;
    listeningEnabled: boolean;
    speakingEnabled: boolean;
    onboardedAt: string | null;
    preferredVoice: string;
  };
  plan: {
    plan: "free" | "plus";
    expiresAt: string | null;
    source: string | null;
    withdrawn?: boolean;
  };
}

export const getMe = () => api<Me | null>("/me");
/** The age step after a one-tap Apple/Google sign-up; below the minimum age the account is deleted. */
export const confirmAge = (body: { birthYear: number; country: string; ageReached: boolean }) =>
  api<{ ageRequired: false }>("/me/age", { method: "POST", body: JSON.stringify(body) });
/** Published courses a learner may enrol in. One today; the picker is there so the plumbing is real. */
export const getCourses = () =>
  api<{ courses: Course[]; enrolledCourseId: string | null }>("/courses");
export const getUnits = () => api<{ units: UnitSummary[] }>("/units");
export const getUnit = (slug: string, lang: string) =>
  api<UnitResponse>(`/units/${encodeURIComponent(slug)}?lang=${lang}`);
/** The whole path: every published unit with its skills, nodes and this learner's state. */
export const getPath = () => api<PathResponse>("/path");
/** The grammar reference: every published note of the enrolled course, with this learner's unlocks. */
export const getGrammar = (lang: string) => api<GrammarReferenceResponse>(`/grammar?lang=${lang}`);

// ---- progress and review ---------------------------------------------------

export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Minutes to add to local time to reach UTC, as `getTimezoneOffset` reports
 * it. Sent with `localToday()`, because a date alone does not say when that
 * day began: without it a learner east of UTC has no experience points at
 * all between local midnight and UTC midnight.
 */
export function localTzOffset(): number {
  return new Date().getTimezoneOffset();
}

/** `today` and the offset, for the endpoints that take them in the query string. */
export function todayQuery(): string {
  return `today=${localToday()}&tz=${localTzOffset()}`;
}

export const getProgress = () => api<ProgressResponse>(`/me/progress?${todayQuery()}`);
export const completeLesson = (lessonId: string, body: LessonCompleteRequest) =>
  api<LessonCompleteResponse>(`/lessons/${lessonId}/complete`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Opens the chest at the end of a skill. Idempotent: a second call grants nothing. */
export const claimChest = (skillId: string) =>
  api<ChestClaimResponse>(`/path/chests/${encodeURIComponent(skillId)}/claim?${todayQuery()}`, {
    method: "POST",
  });
export const getReviewSession = (lang: string) =>
  api<ReviewSessionResponse>(`/review/session?lang=${lang}`);
export const rateCard = (cardId: string, body: ReviewRequest) =>
  api<ReviewResponse>(`/review/${cardId}`, { method: "POST", body: JSON.stringify(body) });

// ---- practise mistakes -----------------------------------------------------

export type { MistakePractiseResponse, MistakesResponse };

/** The words this learner got wrong, hydrated like a review session. */
export const getMistakes = (lang: string) => api<MistakesResponse>(`/me/mistakes?lang=${lang}`);
/** One answer in a mistakes session: right clears the word, wrong bumps its counter. */
export const practiseMistake = (body: MistakePractiseRequest) =>
  api<MistakePractiseResponse>("/me/mistakes/practise", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ---- reporting an exercise -------------------------------------------------

/** A note against one exercise, from the check bar. Never changes content. */
export const reportExercise = (exerciseId: string, body: ExerciseReportRequest) =>
  api<ExerciseReportResponse>(`/exercises/${exerciseId}/report`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** The editor's side: what learners have reported. */
export const getExerciseReports = (open: boolean) =>
  api<ExerciseReportsResponse>(`/edit/reports?open=${open ? "true" : "false"}`);

export const resolveExerciseReport = (id: string, resolved: boolean) =>
  api<{ ok: true }>(`/edit/reports/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolved }),
  });

// ---- editor ----------------------------------------------------------------

/**
 * The editor landing page's one round trip (ARCHITECTURE section 7). The
 * same `ContentReport` the Monday Slack post is built from, so a figure on
 * the screen and a figure in the channel can never disagree.
 */
export const getEditorOverview = () => api<ContentReport>("/edit/overview");

export interface GridLexeme {
  id: string;
  lemma: string;
  pos: string;
  nounClass: string | null;
  isPlural: boolean;
  status: string;
  register: string;
  cefrBand: string | null;
  frequencyRank: number | null;
  source: string;
  licence: string;
  updatedAt: string;
  glossLangs: string[];
  audioCount: number;
}

export interface GridQuery {
  q?: string;
  status?: string;
  pos?: string;
  class?: string;
  missingGloss?: string;
  missingAudio?: string;
  limit?: number;
  offset?: number;
}

export function listLexemes(query: GridQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== "") params.set(k, String(v));
  return api<{ lexemes: GridLexeme[]; limit: number; offset: number }>(`/edit/lexemes?${params}`);
}

export type LexemeDetail = EditorLexemeDetail;

export const getLexeme = (id: string) => api<LexemeDetail>(`/edit/lexemes/${id}`);
export const patchLexeme = (id: string, patch: Record<string, unknown>) =>
  api<{ ok: true }>(`/edit/lexemes/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const upsertGloss = (
  id: string,
  lang: string,
  body: {
    gloss: string;
    usageNote?: string | null;
    contrastiveNote?: string | null;
    origin: "human" | "llm";
  },
) =>
  api<{ id: string }>(`/edit/lexemes/${id}/glosses/${lang}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
export interface AssistResponse {
  draft: {
    en: { gloss: string; usage_note: string; contrastive_note: string };
    nb: { gloss: string; usage_note: string; contrastive_note: string };
    confidence: "high" | "medium" | "low";
    caveat: string;
  };
  /** Languages written as ai_draft (only those with no human gloss). */
  saved: string[];
  usage: { input: number; output: number };
  model: string;
}
/** Editor LLM assist. 503 when the server has no ANTHROPIC_API_KEY. */
export const assistLexeme = (id: string) =>
  api<AssistResponse>(`/edit/lexemes/${id}/assist`, { method: "POST" });

export type MorphPreview =
  | { applicable: false; reason: string }
  | {
      applicable: true;
      lemma: string;
      nounClass: string;
      validated: boolean;
      forms: { form: string; surface: string | null; error: string | null }[];
    };
export const morphPreview = (id: string) => api<MorphPreview>(`/edit/lexemes/${id}/morph`);

export const transition = (req: TransitionRequest) =>
  api<TransitionResponse>("/edit/transition", { method: "POST", body: JSON.stringify(req) });

/** Approve and publish many review rows; the server orders them by dependency. */
export const approveReviewItems = (items: { kind: string; id: string }[]) =>
  api<ReviewApproveResponse>("/edit/review-queue/approve", {
    method: "POST",
    body: JSON.stringify({ items }),
  });

/** Deletes an unpublished take (a test, a false start) and its file. */
export const discardAudio = (id: string) =>
  api<{ ok: true }>(`/edit/audio/${id}`, { method: "DELETE" });

/** A note on a word or sentence; it changes nothing but the row's history. */
export const addContentNote = (req: ContentNoteRequest) =>
  api<{ ok: true }>("/edit/notes", { method: "POST", body: JSON.stringify(req) });

export const getContentNotes = (limit = 20) =>
  api<{ notes: ContentNote[] }>(`/edit/notes?limit=${limit}`);

/**
 * A batch of lexeme transitions. The server applies the same per-row rules
 * and gate as a single transition and answers with a verdict per id; a
 * blocked row is reported, never silently skipped.
 */
export const transitionLexemes = (body: { ids: string[]; to: string; note?: string }) =>
  api<BulkTransitionResponse>("/edit/lexemes/transition", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const publishCheck = (kind: string, id: string) =>
  api<{ ok: boolean; failures: { code: string; detail?: string }[] }>(
    `/edit/publish-check/${kind}/${id}`,
  );

export type ReviewItem = EditorReviewItem;
export type ReviewFilter = "all" | "mine" | "unassigned";
export const getReviewQueue = (filter: ReviewFilter = "all") =>
  api<{ items: ReviewItem[]; filter: ReviewFilter }>(`/edit/review-queue?filter=${filter}`);

/** Claim (`assignedTo` = my id), release (`null`) or — admin only — hand over. */
export const assignReview = (body: { kind: string; id: string; assignedTo: string | null }) =>
  api<{ assignedTo: string | null; assignedAt: string | null; assignedBy: string | null }>(
    "/edit/review-queue/assign",
    { method: "POST", body: JSON.stringify(body) },
  );

export interface EditorRef {
  id: string;
  name: string;
  roles: string[];
}
export const getEditors = () => api<{ editors: EditorRef[] }>("/edit/editors");

export type Speaker = StudioSpeaker;
export const getSpeakers = () => api<{ speakers: Speaker[] }>("/edit/speakers");
export const createSpeaker = (body: {
  displayName: string;
  region?: string;
  gender?: string | null;
  ageGroup?: "child" | "teen" | "adult" | "elder" | null;
  consentScope: "internal" | "published" | "commercial";
}) => api<{ id: string }>("/edit/speakers", { method: "POST", body: JSON.stringify(body) });

export async function uploadAudio(input: {
  file: Blob;
  filename: string;
  targetKind: string;
  targetId: string;
  speakerId?: string;
  tier: string;
  licence: string;
}) {
  const form = new FormData();
  form.set("file", input.file, input.filename);
  form.set("targetKind", input.targetKind);
  form.set("targetId", input.targetId);
  if (input.speakerId) form.set("speakerId", input.speakerId);
  form.set("tier", input.tier);
  form.set("licence", input.licence);
  return api<{ jobId: string; uploadKey: string; queued: boolean }>("/edit/audio", {
    method: "POST",
    body: form,
  });
}

// ---- curriculum (editor) --------------------------------------------------

export interface CurriculumExercise {
  id: string;
  order: number;
  type: string;
  status: string;
  note: string | null;
  lexemeCount: number;
  updatedAt: string;
}
export interface CurriculumLesson {
  id: string;
  order: number;
  estimatedMinutes: number;
  status: string;
  exercises: CurriculumExercise[];
}
export interface CurriculumSkill {
  id: string;
  slug: string;
  titleKey: string;
  order: number;
  kind: string;
  status: string;
  lessons: CurriculumLesson[];
}
export interface CurriculumUnit {
  id: string;
  courseId: string;
  slug: string;
  titleKey: string;
  order: number;
  cefrBand: string;
  prerequisiteUnitId: string | null;
  status: string;
  updatedAt: string;
  skills: CurriculumSkill[];
}
export const getCurriculum = (courseId?: string) =>
  api<{ units: CurriculumUnit[]; exerciseTypes: string[] }>(
    `/edit/curriculum${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`,
  );
/** One grammar note as the dashboard sees it: every status, both languages, all its cells. */
export interface EditorGrammarNote {
  id: string;
  skillId: string;
  skillSlug: string;
  skillTitleKey: string;
  unitSlug: string;
  slug: string;
  order: number;
  rowHeaderKey: string;
  caveat: string | null;
  status: string;
  updatedAt: string;
  bodies: Array<{
    id: string;
    sourceLang: "en" | "nb";
    title: string;
    rule: string;
    correction: string | null;
    status: string;
  }>;
  cells: Array<{
    id: string;
    role: "example" | "paradigm";
    order: number;
    rowLabel: string;
    colKey: string;
    surfaceForm: string;
    morphemes: string[];
    lexemeId: string | null;
    audioAssetId: string | null;
  }>;
}
export const getEditorGrammarNotes = (courseId?: string) =>
  api<{ notes: EditorGrammarNote[] }>(
    `/edit/grammar-notes${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`,
  );
export const saveGrammarNoteBody = (
  id: string,
  body: { sourceLang: "en" | "nb"; title: string; rule: string; correction: string | null },
) =>
  api<{ id: string }>(`/edit/grammar-notes/${id}/body`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

/** Every course the dashboard may write into, at every status. */
export const getEditorCourses = () =>
  api<{ courses: Array<Course & { status: string }>; defaultCourseId: string | null }>(
    "/edit/courses",
  );

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
const patchJson = (path: string, body: unknown) =>
  api<{ ok: true }>(path, { method: "PATCH", body: JSON.stringify(body) });

export const createUnit = (body: {
  courseId?: string;
  slug: string;
  titleKey: string;
  order: number;
  cefrBand: string;
  prerequisiteUnitId?: string | null;
}) => post<{ id: string }>("/edit/units", body);
export const patchUnit = (id: string, body: Record<string, unknown>) =>
  patchJson(`/edit/units/${id}`, body);
export const createSkill = (body: {
  unitId: string;
  slug: string;
  titleKey: string;
  order: number;
  kind: string;
}) => post<{ id: string }>("/edit/skills", body);
export const patchSkill = (id: string, body: Record<string, unknown>) =>
  patchJson(`/edit/skills/${id}`, body);
export const createLesson = (body: { skillId: string; order: number; estimatedMinutes?: number }) =>
  post<{ id: string }>("/edit/lessons", body);
export const patchLesson = (id: string, body: Record<string, unknown>) =>
  patchJson(`/edit/lessons/${id}`, body);
export const createExercise = (body: {
  lessonId: string;
  order: number;
  type: string;
  payload: unknown;
  note?: string | null;
}) => post<{ id: string }>("/edit/exercises", body);
export const patchExercise = (id: string, body: Record<string, unknown>) =>
  patchJson(`/edit/exercises/${id}`, body);
export const validateExercise = (type: string, payload: unknown) =>
  post<{ ok: boolean; error?: string }>("/edit/exercises/validate", { type, payload });
export const deleteDraft = (kind: "unit" | "skill" | "lesson" | "exercise", id: string) =>
  api<{ ok: true }>(`/edit/${kind}/${id}`, { method: "DELETE" });

export interface ExerciseDetail {
  exercise: {
    id: string;
    lessonId: string;
    order: number;
    type: string;
    payload: unknown;
    note: string | null;
    status: string;
    createdBy: string | null;
    updatedAt: string;
  };
  context: {
    unit: { id: string; slug: string } | null;
    skill: { id: string; slug: string; unitId: string } | null;
    lesson: { id: string; skillId: string; order: number } | null;
  };
  lexemes: Record<
    string,
    { id: string; lemma: string; pos: string; status: string; gloss: string | null }
  >;
  sentences: Record<string, { id: string; text: string; status: string }>;
  revisions: {
    id: string;
    actorId: string | null;
    diff: unknown;
    note: string | null;
    createdAt: string;
  }[];
}
export const getExercise = (id: string) => api<ExerciseDetail>(`/edit/exercises/${id}`);

/** Lemma search for pickers; any status, so an editor can wire up drafts and see the gate complain. */
export const searchLexemes = (q: string) =>
  api<{ lexemes: GridLexeme[] }>(`/edit/lexemes?q=${encodeURIComponent(q)}&limit=12`);

export const createLexeme = (body: {
  lemma: string;
  pos: string;
  nounClassLabel?: string | null;
  source: string;
  licence: string;
  origin: "human";
}) => api<{ id: string }>("/edit/lexemes", { method: "POST", body: JSON.stringify(body) });

export const putPrefs = (body: {
  sourceLang?: "en" | "nb";
  courseId?: string | null;
  dailyGoalXp?: number;
  reminderOptIn?: boolean;
  listeningEnabled?: boolean;
  speakingEnabled?: boolean;
  onboarded?: true;
  preferredVoice?: string;
}) => api<{ ok: true }>("/me/prefs", { method: "PUT", body: JSON.stringify(body) });
// ---- sentences (editor) ----------------------------------------------------

export type { CreateSentenceRequest, PatchSentenceRequest, SentenceTokenInput, TokenVerification };

export interface SentenceQuery {
  q?: string;
  status?: string;
  missingGloss?: string;
  limit?: number;
  offset?: number;
}

export interface SentenceRow {
  id: string;
  textXh: string;
  status: string;
  register: string;
  cefrBand: string | null;
  source: string;
  licence: string;
  updatedAt: string;
  tokenCount: number;
  /** Tokens that satisfy the gate: xh-morph verified, or irregular with a note. */
  verifiedCount: number;
  glossLangs: string[];
  audioCount: number;
}

export function listSentences(query: SentenceQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== "") params.set(k, String(v));
  return api<{ sentences: SentenceRow[]; limit: number; offset: number }>(
    `/edit/sentences?${params}`,
  );
}

export interface SentenceDetail {
  sentence: {
    id: string;
    textXh: string;
    grammarTags: Record<string, unknown>;
    cefrBand: string | null;
    register: string;
    status: string;
    source: string;
    sourceRef: string | null;
    licence: string;
    createdBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  };
  tokens: {
    id: string;
    position: number;
    lexemeId: string;
    surfaceForm: string;
    morphVerified: boolean;
    irregular: boolean;
    irregularNote: string | null;
    lemma: string;
    pos: string;
    nounClass: string | null;
    lexemeStatus: string;
    verification: TokenVerification | null;
  }[];
  glosses: {
    id: string;
    sourceLang: "en" | "nb";
    gloss: string;
    literalGloss: string | null;
    status: string;
  }[];
  audio: LexemeDetail["audio"];
  revisions: LexemeDetail["revisions"];
}

export const getSentence = (id: string) => api<SentenceDetail>(`/edit/sentences/${id}`);
export const createSentence = (body: CreateSentenceRequest) =>
  api<{ id: string }>("/edit/sentences", { method: "POST", body: JSON.stringify(body) });
export const patchSentence = (id: string, patch: PatchSentenceRequest) =>
  api<{ ok: true }>(`/edit/sentences/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
/** Checks surface forms against xh-morph without saving. */
export const verifySentenceTokens = (tokens: SentenceTokenInput[]) =>
  api<{ tokens: TokenVerification[] }>("/edit/sentences/verify", {
    method: "POST",
    body: JSON.stringify({ tokens }),
  });
/** Replaces the token list; the server computes `morphVerified`. */
export const setSentenceTokens = (id: string, tokens: SentenceTokenInput[]) =>
  api<{ tokens: TokenVerification[] }>(`/edit/sentences/${id}/tokens`, {
    method: "PUT",
    body: JSON.stringify({ tokens }),
  });
export const upsertSentenceGloss = (
  id: string,
  lang: string,
  body: { gloss: string; literalGloss?: string | null; origin: "human" | "llm" },
) =>
  api<{ id: string }>(`/edit/sentences/${id}/glosses/${lang}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

/** Mastery for a unit: lexemes whose review card is stable for 21+ days. Signed-in learners only. */
export const getCrown = (slug: string) =>
  api<{ total: number; mature: number; crowned: boolean }>(`/units/${slug}/crown`);

// ---- leagues (ARCHITECTURE section 4; API contract in the phase-4 branch) --

export type LeagueTier = "bronze" | "silver" | "gold" | "sapphire" | "ruby";
export type LeagueZone = "promote" | "stay" | "demote";
export interface LeagueResponse {
  league: { id: string; tier: LeagueTier; weekStart: string; weekEnd: string; size: number } | null;
  standings: {
    userId: string;
    /** Null when held back: hidden by you, refused by the name filter, or reported. */
    name: string | null;
    /** You hid this learner. */
    hidden: boolean;
    xp: number;
    rank: number;
    isMe: boolean;
  }[];
  me: { rank: number; xp: number; zone: LeagueZone } | null;
  rules: { size: number; promote: number; demote: number };
}
export interface LeagueHistoryResponse {
  weeks: {
    weekStart: string;
    tier: LeagueTier;
    rank: number;
    xp: number;
    outcome: "promoted" | "stayed" | "demoted";
  }[];
}

/** Dev-only stand-in until the endpoint is merged; never used in production builds. */
function leagueFixture(): LeagueResponse {
  const names = [
    "zz-Thandi",
    "zz-Sipho",
    "zz-Nomvula",
    "zz-Anele",
    "zz-Lwazi",
    "zz-Buhle",
    "zz-Kagiso",
    "zz-Zola",
  ];
  const standings = names.map((name, i) => ({
    userId: `zz-${i}`,
    name,
    hidden: false,
    xp: 420 - i * 45,
    rank: i + 1,
    isMe: i === 3,
  }));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return {
    league: {
      id: "zz-fixture",
      tier: "silver",
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10),
      size: 20,
    },
    standings,
    me: { rank: 4, xp: 285, zone: "promote" },
    rules: { size: 20, promote: 5, demote: 5 },
  };
}

export async function getLeague(): Promise<LeagueResponse> {
  try {
    return await api<LeagueResponse>("/leagues/current");
  } catch (e) {
    if (import.meta.env.DEV && e instanceof ApiError && e.status === 404) return leagueFixture();
    throw e;
  }
}
/** Reports another member's name (Apple 1.2); it is hidden for you at the same time. */
export const reportLeagueMember = (userId: string) =>
  api<{ ok: true }>("/leagues/report", { method: "POST", body: JSON.stringify({ userId }) });
export const hideLeagueMember = (userId: string) =>
  api<{ ok: true }>("/leagues/hide", { method: "POST", body: JSON.stringify({ userId }) });
export const showLeagueMember = (userId: string) =>
  api<{ ok: true }>(`/leagues/hide/${encodeURIComponent(userId)}`, { method: "DELETE" });

export async function getLeagueHistory(): Promise<LeagueHistoryResponse> {
  try {
    return await api<LeagueHistoryResponse>("/leagues/history");
  } catch (e) {
    if (import.meta.env.DEV && e instanceof ApiError && e.status === 404) return { weeks: [] };
    throw e;
  }
}

// ---- recording studio ------------------------------------------------------

export type { AudioQueueItem };

/** Uploads the audio worker has not processed yet; `waiting` null means unknown. */
export const getAudioBacklog = () => api<AudioBacklog>("/edit/audio/backlog");

/**
 * Everything not retired that lacks tier-1/2 audio, most-used first. Until
 * the endpoint is merged, dev builds fall back to the lexeme grid's
 * missing-audio filter so the studio stays usable.
 */
export async function getAudioQueue(
  params: {
    kind?: "all" | "lexeme" | "sentence" | "click";
    limit?: number;
    speaker?: string;
    /** false returns recorded items too, so their takes can be reviewed. */
    missing?: boolean;
  } = {},
) {
  const q = new URLSearchParams({ kind: params.kind ?? "all", limit: String(params.limit ?? 500) });
  if (params.missing === false) q.set("missing", "0");
  // With a speaker, "missing" means "not yet recorded by this speaker".
  if (params.speaker) q.set("speaker", params.speaker);
  try {
    return await api<AudioQueueResponse>(`/edit/audio/queue?${q}`);
  } catch (e) {
    if (import.meta.env.DEV && e instanceof ApiError && e.status === 404) {
      const grid = await listLexemes({ missingAudio: "1", limit: params.limit ?? 500 });
      const items: AudioQueueItem[] = grid.lexemes.map((l) => ({
        kind: "lexeme",
        id: l.id,
        text: l.lemma,
        gloss: { en: null, nb: null },
        status: l.status,
        unitSlugs: [],
        audio: [],
      }));
      return { items, total: items.length };
    }
    throw e;
  }
}

export interface WelcomeResponse {
  greeting: {
    lemma: string;
    gloss: string | null;
    audio: { url: string; attribution: string | null } | null;
  } | null;
  firstUnitSlug: string | null;
}
/** First-run onboarding: a real published greeting to hear, and where to start. */
export const getWelcome = () => api<WelcomeResponse>("/welcome");

export interface HeartsState {
  hearts: number;
  max: number;
  unlimited: boolean;
  nextRegenAt: string | null;
  practiceLeft: number;
}
export const getHearts = () => api<HeartsState>("/me/hearts");
/** One wrong answer in a lesson; the server never goes below zero and ignores plus. */
export const loseHeart = () => api<HeartsState>("/me/hearts/lose", { method: "POST" });

/** Everything we hold about the signed-in learner, as JSON (GDPR article 20). */
export const exportMyData = () => api<Record<string, unknown>>("/me/export");
/** Deletes the account; the email is repeated as consent. */
export const deleteMyAccount = () =>
  api<{ ok: true }>("/me", {
    method: "DELETE",
    body: JSON.stringify({ confirm: ACCOUNT_DELETE_CONFIRMATION }),
  });

/** Replays a guest's finished lessons and opened chests on the server, once each. */
export const importProgress = (body: {
  lessons: { lessonId: string; correct: number; total: number; today: string }[];
  chests?: string[];
}) =>
  api<{ imported: number; skipped: number; chests: number; progress: ProgressResponse }>(
    "/me/import-progress",
    { method: "POST", body: JSON.stringify(body) },
  );

export const getAuthProviders = () =>
  api<{ email: boolean; magicLink: boolean; apple: boolean; google: boolean }>("/auth/providers");

export const putLeagueProfile = (body: LeagueProfileRequest) =>
  api<LeagueProfile>("/me/league-profile", { method: "PUT", body: JSON.stringify(body) });

/** The first password on an Apple/Google-only account; refused once one exists. */
export const setFirstPassword = (newPassword: string) =>
  api<{ ok: true }>("/me/password", { method: "POST", body: JSON.stringify({ newPassword }) });

export const recordWebCheckout = (productId: "molo_plus_monthly" | "molo_plus_yearly") =>
  api<{ id: string; consentedAt: string; version: string }>("/me/web-checkout", {
    method: "POST",
    body: JSON.stringify({ productId, expressStart: true }),
  });
export const getWebPurchases = () => api<{ purchases: WebPurchaseView[] }>("/me/web-purchases");
export const withdrawWebPurchase = (purchaseId: string) =>
  api<WebPurchaseView>("/me/withdrawal", { method: "POST", body: JSON.stringify({ purchaseId }) });
