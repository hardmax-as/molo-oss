import { ACCOUNT_DELETE_CONFIRMATION, previewRequestAllowed } from "@molo/core";
import type {
  ClickSoundsResponse,
  LeagueProfile,
  LeagueProfileRequest,
  ChestClaimResponse,
  ExerciseReportRequest,
  ExerciseReportResponse,
  GrammarReferenceResponse,
  ImportProgressRequest,
  LessonCompleteResponse,
  MistakeEntry,
  MistakePractiseRequest,
  MistakePractiseResponse,
  MistakesResponse,
  ProgressResponse,
  ReviewRequest,
  ReviewResponse,
  PathResponse,
  ReviewSessionResponse,
  UnitResponse,
  UnitSummary,
} from "@molo/core";

import { apiUrl } from "./api-url.ts";
import { authClient } from "./auth.ts";
import type { HeartsState } from "./hearts-format.ts";
import { previewStore } from "./preview-state.ts";

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

/**
 * Typed client for apps/api. React Native has no cookie jar, so the session
 * cookie Better Auth stored in SecureStore is attached by hand.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const preview = previewStore.getSnapshot() !== null;
  if (preview && !previewRequestAllowed(path, init.method)) {
    throw new ApiError(403, "preview_read_only", "preview is read-only");
  }
  const cookie = await authClient.getCookie();
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      ...(preview ? { "X-Molo-Preview": "1" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
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

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

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
  user: { id: string; name: string; email: string };
  roles: string[];
  /** A one-tap Apple/Google account that has not given its birth year and country yet. */
  ageRequired?: boolean;
  sourceLang: "en" | "nb";
  /** The resolved enrolment; optional so an older server still works. */
  course?: Course;
  /** Present once the API ships prefs on /me; optional so older servers still work. */
  prefs?: {
    sourceLang: "en" | "nb";
    courseId?: string | null;
    dailyGoalXp: number;
    reminderOptIn: boolean;
    listeningEnabled: boolean;
    speakingEnabled: boolean;
    onboardedAt?: string | null;
    /** "any" | "female" | "male" | "child" | a speaker id (packages/core `VoicePreference`). */
    preferredVoice?: string;
  };
  /** Present once the API ships plans on /me (docs/MONETISATION.md). */
  plan?: {
    plan: "free" | "plus";
    expiresAt: string | null;
    source: string | null;
    withdrawn?: boolean;
  };
}

/** Public: the greeting to play on the welcome screen and where the first lesson is. */
export interface WelcomeResponse {
  greeting: {
    lemma: string;
    gloss: string;
    audio: { url: string; attribution: string | null } | null;
  } | null;
  firstUnitSlug: string | null;
}
export const getWelcome = () => api<WelcomeResponse>("/welcome");
/** Published bare-click recordings only; empty until an editor approves one. */
export const getClickSounds = () => api<ClickSoundsResponse>("/clicks");

export const getMe = () => api<Me | null>("/me");
/** The age step after a one-tap Apple/Google sign-up; below the minimum age the account is deleted. */
export const confirmAge = (body: { birthYear: number; country: string; ageReached: boolean }) =>
  api<{ ageRequired: false }>("/me/age", { method: "POST", body: JSON.stringify(body) });
/** Published courses a learner may enrol in. One today; the picker exercises the plumbing. */
export const getCourses = () =>
  api<{ courses: Course[]; enrolledCourseId: string | null }>("/courses");
export const getUnits = () => api<{ units: UnitSummary[] }>("/units");
export const getUnit = (slug: string, lang: string) =>
  api<UnitResponse>(`/units/${encodeURIComponent(slug)}?lang=${lang}`);
/** The whole path with this learner's state on it: nodes, crowns and chests. */
export const getLearningPath = () => api<PathResponse>("/path");
/** The grammar reference: every published note of the enrolled course, with this learner's unlocks. */
export const getGrammar = (lang: string) => api<GrammarReferenceResponse>(`/grammar?lang=${lang}`);

/** Local calendar date, so a streak day is the learner's day, not the server's. */
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

export type { ProgressResponse, ReviewResponse, ReviewSessionResponse };

/** The decoded `LessonCompleteResponse`, celebration facts included. */
export type LessonCompleteResult = LessonCompleteResponse;

/** Server-side XP for a finished lesson; the server does the arithmetic and caps it. */
export const completeLesson = (
  lessonId: string,
  body: {
    correct: number;
    total: number;
    today: string;
    /** Minutes to UTC, so the server counts today from the learner's midnight. */
    tzOffsetMinutes?: number;
    /** Words answered wrong, for "practise mistakes". */
    mistakes?: readonly MistakeEntry[];
  },
) => post<LessonCompleteResult>(`/lessons/${lessonId}/complete`, body);

export const getProgress = () => api<ProgressResponse>(`/me/progress?${todayQuery()}`);

export interface ImportProgressResult {
  imported: number;
  skipped: number;
  /** Chests replayed from the device and actually granted. */
  chests: number;
  progress: ProgressResponse;
}

/** Replays lessons finished as a guest on the new account; lessons already credited are skipped. */
export const importProgress = (body: ImportProgressRequest) =>
  post<ImportProgressResult>("/me/import-progress", body);

/** Which sign-in methods this deployment offers; social ones need credentials on the server. */
export interface AuthProviders {
  email: boolean;
  magicLink: boolean;
  apple: boolean;
  google: boolean;
}
export const getAuthProviders = () => api<AuthProviders>("/auth/providers");

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

// ---- push reminders --------------------------------------------------------

/** Registers or refreshes this device for streak reminders; idempotent on the token. */
export const putPushToken = (body: {
  token: string;
  platform: "ios" | "android";
  appVersion?: string;
}) => post<{ ok: true }>("/me/push-token", body);

/** Sign-out, or the toggle going off: the server forgets this device. */
export const deletePushToken = (token: string | null) =>
  api<{ removed: number }>("/me/push-token", {
    method: "DELETE",
    body: JSON.stringify(token ? { token } : {}),
  });

export const getReviewSession = (lang: string) =>
  api<ReviewSessionResponse>(`/review/session?lang=${lang}`);

export const rateCard = (cardId: string, body: ReviewRequest) =>
  post<ReviewResponse>(`/review/${cardId}`, body);

// ---- practise mistakes -----------------------------------------------------

export type { MistakePractiseResponse, MistakesResponse };

/** The words this learner got wrong, hydrated like a review session. */
export const getMistakes = (lang: string) => api<MistakesResponse>(`/me/mistakes?lang=${lang}`);
/** One answer in a mistakes session: right clears the word, wrong bumps its counter. */
export const practiseMistake = (body: MistakePractiseRequest) =>
  post<MistakePractiseResponse>("/me/mistakes/practise", body);

/** Opens the chest at the end of a skill. Idempotent: a second call grants nothing. */
export const claimChest = (skillId: string) =>
  post<ChestClaimResponse>(`/path/chests/${encodeURIComponent(skillId)}/claim?${todayQuery()}`, {});

export const getCrown = (slug: string) =>
  api<{ total: number; mature: number; crowned: boolean }>(
    `/units/${encodeURIComponent(slug)}/crown`,
  );

/**
 * A note against one exercise, filed from the check bar. It reaches an
 * editor's review queue; it never changes a status by itself.
 */
export const reportExercise = (exerciseId: string, body: ExerciseReportRequest) =>
  post<ExerciseReportResponse>(`/exercises/${encodeURIComponent(exerciseId)}/report`, body);

// ---- leagues (contract agreed with the API workstream) ---------------------

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
export const getLeague = () => api<LeagueResponse>("/leagues/current");
export const getLeagueHistory = () => api<LeagueHistoryResponse>("/leagues/history");
/** Reports another member's name (Apple 1.2); it is hidden for you at the same time. */
export const reportLeagueMember = (userId: string) =>
  post<{ ok: true }>("/leagues/report", { userId });
export const hideLeagueMember = (userId: string) => post<{ ok: true }>("/leagues/hide", { userId });
export const showLeagueMember = (userId: string) =>
  api<{ ok: true }>(`/leagues/hide/${encodeURIComponent(userId)}`, { method: "DELETE" });

// ---- your data ---------------------------------------------------------------

/** Everything Molo holds about the learner, as one JSON document. */
export const exportMyData = () => api<Record<string, unknown>>("/me/export");
/** Deletes the account and all learner data; the email is repeated as consent. */
export const deleteAccount = () =>
  api<{ ok: true }>("/me", {
    method: "DELETE",
    body: JSON.stringify({ confirm: ACCOUNT_DELETE_CONFIRMATION }),
  });

// ---- hearts and Molo Plus (docs/MONETISATION.md) ---------------------------

export type { HeartsState } from "./hearts-format.ts";

export const getHearts = () => api<HeartsState>("/me/hearts");
/** One wrong answer in a lesson; the server never goes below zero and ignores Plus. */
export const loseHeart = () => api<HeartsState>("/me/hearts/lose", { method: "POST" });

export const putLeagueProfile = (body: LeagueProfileRequest) =>
  api<LeagueProfile>("/me/league-profile", { method: "PUT", body: JSON.stringify(body) });

/** The first password on an Apple/Google-only account; refused once one exists. */
export const setFirstPassword = (newPassword: string) =>
  api<{ ok: true }>("/me/password", { method: "POST", body: JSON.stringify({ newPassword }) });
