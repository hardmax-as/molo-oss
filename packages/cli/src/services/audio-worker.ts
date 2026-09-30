/**
 * Who a processed asset is attributed to. `uploader` (the default) is the
 * editor who uploaded the take through /edit/audio: the message carries
 * their id, and the upload route only accepts editorial accounts. That keeps
 * `created_by` honest, and it means the four-eyes rule applies to audio as it
 * does to everything else: the person who recorded a take cannot approve it.
 * Any other value is a user id or email that every asset is attributed to.
 */
export const UPLOADER = "uploader";

export function actorRefFor(as: string, uploadedBy: string): string {
  return as === UPLOADER ? uploadedBy : as;
}

/** Visibility for one pulled batch: two minutes a recording, five at least, twelve hours at most. */
export const visibilityMsFor = (batch: number) =>
  Math.min(12 * 3_600_000, Math.max(5 * 60_000, batch * 2 * 60_000));
