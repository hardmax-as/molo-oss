export type RepoErrorCode =
  | "forbidden"
  | "not_found"
  | "invalid"
  | "transition"
  | "consent_missing"
  | "conflict";

export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RepoError";
  }
}
