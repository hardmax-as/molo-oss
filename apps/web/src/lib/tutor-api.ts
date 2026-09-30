import type {
  CultureCardView,
  DismissSentenceRequestBody,
  FulfilSentenceRequestBody,
  GoldenAnswerView,
  PutGoldenAnswer,
  SentenceRequestView,
} from "@molo/core";

import { api } from "./api.ts";

/**
 * The tutor's two pages (docs/EDITOR-GUIDE.md, "A tutor session"): sentence
 * requests to answer and culture cards to check. Kept beside `api.ts` rather
 * than in it, so the two surfaces can change without touching the learner
 * client.
 */

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const getSentenceRequests = (unit?: string) =>
  api<{ requests: SentenceRequestView[] }>(
    `/edit/sentence-requests${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`,
  );

export const fulfilSentenceRequest = (id: string, body: FulfilSentenceRequestBody) =>
  post<{ sentenceId: string }>(`/edit/sentence-requests/${id}/fulfil`, body);

export const dismissSentenceRequest = (id: string, body: DismissSentenceRequestBody) =>
  post<{ ok: true }>(`/edit/sentence-requests/${id}/dismiss`, body);

export const reopenSentenceRequest = (id: string) =>
  post<{ ok: true }>(`/edit/sentence-requests/${id}/reopen`, {});

export const getCultureCards = () => api<{ cards: CultureCardView[] }>("/edit/culture-cards");

/** The tutor's golden-forms sheet, one saved card per case. */
export const getGoldenAnswers = () => api<{ answers: GoldenAnswerView[] }>("/edit/goldens");

export const putGoldenAnswer = (body: PutGoldenAnswer) =>
  api<{ answer: GoldenAnswerView }>("/edit/goldens", {
    method: "PUT",
    body: JSON.stringify(body),
  });
