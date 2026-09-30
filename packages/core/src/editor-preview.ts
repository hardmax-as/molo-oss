import { Schema } from "effect";
import { Either } from "effect";

import { ExerciseView, LessonView, SkillView, UnitResponse, UnitSummary } from "./api.ts";
import { clickSoundById } from "./click-sounds.ts";
import { decodeExercisePayload, referencedClickIds, referencedIds } from "./exercises/index.ts";
import { StatusSchema } from "./status.ts";

export const PreviewExercise = Schema.Struct({ ...ExerciseView.fields, status: StatusSchema });
export const PreviewLesson = Schema.Struct({
  ...LessonView.fields,
  status: StatusSchema,
  exercises: Schema.Array(PreviewExercise),
});
export const PreviewSkill = Schema.Struct({
  ...SkillView.fields,
  status: StatusSchema,
  lessons: Schema.Array(PreviewLesson),
});
export const PreviewUnitSummary = Schema.Struct({ ...UnitSummary.fields, status: StatusSchema });
export const PreviewUnitsResponse = Schema.Struct({ units: Schema.Array(PreviewUnitSummary) });
export const PreviewPathResponse = Schema.Struct({
  units: Schema.Array(
    Schema.Struct({ ...PreviewUnitSummary.fields, skills: Schema.Array(PreviewSkill) }),
  ),
});
export const PreviewUnitResponse = Schema.Struct({
  ...UnitResponse.fields,
  unit: Schema.Struct({ ...PreviewUnitSummary.fields, skills: Schema.Array(PreviewSkill) }),
});
export type PreviewUnitResponse = typeof PreviewUnitResponse.Type;
export type PreviewPathResponse = typeof PreviewPathResponse.Type;

export function mayPreview(
  me: { user: { id: string }; roles: readonly string[] } | null | undefined,
) {
  return !!me?.roles.some((role) => role === "editor" || role === "admin");
}

/** Per-client, in-memory opt-in: never a persisted preference on a learner account. */
export function createPreviewStore() {
  let actorId: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => actorId,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(
      me: { user: { id: string }; roles: readonly string[] } | null | undefined,
      enabled: boolean,
    ) {
      const next = enabled && mayPreview(me) ? me!.user.id : null;
      if (next === actorId) return;
      actorId = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Keep background learner queries and all mutations out of a preview session. */
export function previewRequestAllowed(path: string, method = "GET") {
  if (method.toUpperCase() !== "GET") return false;
  return path.split("?")[0] === "/me" || path.startsWith("/edit/preview/");
}

export function previewExerciseContent(payload: unknown, content: PreviewUnitResponse) {
  const decoded = decodeExercisePayload(payload);
  if (Either.isLeft(decoded))
    return { payload: null, missingContent: true, missingAudio: [] as string[] };
  const ids = referencedIds(decoded.right);
  const words = ids.lexemeIds.map((id) => content.lexemes[id]);
  const sentences = ids.sentenceIds.map((id) => content.sentences[id]);
  return {
    payload: decoded.right,
    missingContent: words.some((word) => !word) || sentences.some((sentence) => !sentence),
    missingAudio: [
      ...words.flatMap((word) => (word && !word.audio ? [word.lemma] : [])),
      ...sentences.flatMap((sentence) => (sentence && !sentence.audio ? [sentence.textXh] : [])),
      ...ids.audioAssetIds.filter((id) => !content.audioAssets[id]).map(() => ""),
      ...referencedClickIds(decoded.right)
        .filter((id) => !content.clickAudio?.[id])
        .map((id) => clickSoundById(id)?.letter ?? id),
    ],
  };
}
