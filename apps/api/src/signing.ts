/**
 * Audio URLs. There are two kinds, and the difference is the point.
 *
 * **Published audio is public and its URL is plain.** An object only ever
 * reaches the public bucket when its asset is published, its key is the file's
 * own SHA-256, and the bytes at a key never change. A signature there protected
 * nothing and cost a great deal: because the signature is in the URL and expired
 * after an hour, the URL changed every hour, and a changed URL is a cache miss
 * at every layer. A learner studying daily re-downloaded the same recordings
 * forever, on the most expensive data of any audience we have, and audio is the
 * product (docs/CACHING.md).
 *
 * **Unpublished audio stays signed**, and the worker additionally requires an
 * editorial session, so a leaked editor link is useless to anyone else. That is
 * where the protection was always doing work.
 */

export type AudioBucket = "public" | "private";

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function payload(bucket: AudioBucket, key: string, exp: number): Uint8Array {
  return enc.encode(`${bucket}\n${key}\n${exp}`);
}

/**
 * A key as a URL path. `encodeURIComponent` leaves dots alone, so a segment of
 * "." or ".." would survive into the URL and be normalised away by any client
 * that resolves it, changing which object the worker is asked for. R2 keys are
 * opaque strings with no traversal semantics, so this is tidiness rather than a
 * hole, but a URL that does not round-trip is a bug waiting for a reader.
 */
function keyPath(key: string): string {
  return key
    .split("/")
    .map((seg) =>
      seg === "." || seg === ".."
        ? encodeURIComponent(seg).replace(/\./g, "%2E")
        : encodeURIComponent(seg),
    )
    .join("/");
}

/**
 * The stable, unsigned URL for a published recording. Identical for every
 * learner and for all time, which is exactly what makes it cacheable at an edge
 * near them.
 */
export function publicAudioUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${keyPath(key)}`;
}

export async function signAudioUrl(
  secret: string,
  baseUrl: string,
  bucket: AudioBucket,
  key: string,
  ttlSeconds = 3600,
  now = Date.now(),
): Promise<string> {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const sig = b64url(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), payload(bucket, key, exp)),
  );
  return `${baseUrl.replace(/\/$/, "")}/${keyPath(key)}?b=${bucket}&exp=${exp}&sig=${sig}`;
}

export async function verifyAudioUrl(
  secret: string,
  bucket: string,
  key: string,
  exp: string,
  sig: string,
  now = Date.now(),
): Promise<{ ok: true; bucket: AudioBucket } | { ok: false; reason: string }> {
  if (bucket !== "public" && bucket !== "private") return { ok: false, reason: "bad bucket" };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return { ok: false, reason: "bad exp" };
  if (expNum * 1000 < now) return { ok: false, reason: "expired" };
  const expected = b64url(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), payload(bucket, key, expNum)),
  );
  if (expected.length !== sig.length) return { ok: false, reason: "bad signature" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { ok: true, bucket } : { ok: false, reason: "bad signature" };
}
