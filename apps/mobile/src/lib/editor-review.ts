import type {
  EditorLexemeDetail,
  EditorReviewItem,
  TransitionRequest,
  TransitionResponse,
} from "@molo/core";

import { api } from "./api.ts";

export const EDITOR_REVIEW_KEY = "editor-review";

export async function getEditorQueue(): Promise<EditorReviewItem[]> {
  const result = await api<{ items: EditorReviewItem[] }>("/edit/review-queue?filter=all");
  return result.items.filter(
    (item) =>
      item.status === "in_review" && (item.entityKind === "lexeme" || item.entityKind === "gloss"),
  );
}

export const getReviewLexeme = (id: string) =>
  api<EditorLexemeDetail>(`/edit/lexemes/${encodeURIComponent(id)}`);

/** The same transition request as web. No optimistic status change or offline queue. */
export async function reviewItem(
  kind: "lexeme" | "gloss",
  id: string,
  action: "approve" | "send-back",
  note?: string,
) {
  if (action === "send-back" && !note?.trim()) throw new Error("review_note_required");
  const body: TransitionRequest = {
    kind,
    id,
    to: action === "approve" ? "published" : "draft",
    ...(action === "send-back" ? { note: note!.trim() } : {}),
  };
  const result = await api<TransitionResponse>("/edit/transition", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error("review_rejected");
  return result;
}
