import type {
  AudioQueueItem,
  AudioQueueResponse,
  AudioUploadResponse,
  StudioSpeaker,
} from "@molo/core";

import { api } from "./api.ts";

export const EDITOR_STUDIO_KEY = "editor-studio";

/** Same consent fields as the web studio. The server still validates the recording. */
export async function getStudioSpeakers(signal?: AbortSignal) {
  const { speakers } = await api<{ speakers: StudioSpeaker[] }>("/edit/speakers", {
    signal: signal ?? null,
  });
  return speakers.filter((speaker) => !!speaker.consentRecordedAt && !!speaker.consentScope);
}

/**
 * The unit menu's entry for the bare clicks. Clicks belong to no unit, so
 * choosing it asks the queue for `kind=click` instead of a unit.
 */
export const CLICKS_SELECTION = "__clicks__";

export function getStudioQueue(speakerId: string, unit?: string, signal?: AbortSignal) {
  const clicks = unit === CLICKS_SELECTION;
  const query = new URLSearchParams({
    speaker: speakerId,
    kind: clicks ? "click" : "all",
    missing: "1",
    limit: "500",
  });
  if (unit && !clicks) query.set("unit", unit);
  return api<AudioQueueResponse>(`/edit/audio/queue?${query}`, {
    signal: signal ?? null,
  });
}

/** Native FormData reads the recorder's cache file; no base64 copy or offline upload queue. */
export async function uploadStudioTake(
  item: AudioQueueItem,
  speakerId: string,
  uri: string,
  signal?: AbortSignal,
) {
  const form = new FormData();
  // React Native's FormData accepts this file descriptor (Libraries/Network/FormData.js).
  form.append("file", {
    uri,
    type: "audio/mp4",
    name: `${item.kind}-${item.id}.m4a`,
  } as unknown as Blob);
  form.append("targetKind", item.kind);
  form.append("targetId", item.id);
  form.append("speakerId", speakerId);
  form.append("tier", "1_native_studio");
  form.append("licence", "proprietary-molo");
  const result = await api<typeof AudioUploadResponse.Type>("/edit/audio", {
    method: "POST",
    body: form,
    signal: signal ?? null,
  });
  if (result.queued !== true || !result.jobId) throw new Error("audio_upload_not_queued");
  return result;
}
