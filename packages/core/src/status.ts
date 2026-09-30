/**
 * The content status machine (ARCHITECTURE section 2.1).
 *
 * This module owns the ONLY code path that sets `published`. Everything
 * else in the system is a producer of `draft` / `ai_draft` rows or a human
 * moving them forward through `transition()`. `bun run test:integrity`
 * asserts that no other write path can set `published`.
 *
 * Pure: no I/O. The caller (a repository function) persists the result.
 */

import { Schema } from "effect";

export const STATUSES = ["draft", "ai_draft", "in_review", "published", "retired"] as const;
export type Status = (typeof STATUSES)[number];
export const StatusSchema = Schema.Literal(...STATUSES);

export const ROLES = ["learner", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = Schema.Literal(...ROLES);

/** Roles allowed to move content forward. Learners never are. */
export const EDITORIAL_ROLES: readonly Role[] = ["editor", "admin"];

export interface Actor {
  readonly id: string;
  readonly roles: readonly Role[];
}

export function isEditorial(actor: Actor): boolean {
  return actor.roles.some((r) => EDITORIAL_ROLES.includes(r));
}

/** The status-bearing fields every content entity carries. */
export interface Statusable {
  readonly status: Status;
  readonly createdBy: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
}

/**
 * The edges of the machine. There is deliberately no edge into `published`
 * from anywhere but `in_review`, and none out of `ai_draft` except to
 * `in_review`. Adding an edge here is a product decision, not a bug fix.
 */
export const EDGES: ReadonlyArray<readonly [from: Status, to: Status]> = [
  ["draft", "in_review"],
  ["ai_draft", "in_review"],
  ["in_review", "published"],
  ["in_review", "draft"],
  ["published", "retired"],
];

export function hasEdge(from: Status, to: Status): boolean {
  return EDGES.some(([f, t]) => f === from && t === to);
}

/** Every status reachable from `from` by following edges. */
export function reachableFrom(from: Status): ReadonlySet<Status> {
  const seen = new Set<Status>();
  const stack: Status[] = [from];
  while (stack.length > 0) {
    const cur = stack.pop() as Status;
    for (const [f, t] of EDGES) {
      if (f === cur && !seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  return seen;
}

/** A publish-gate verdict; produced by `publish-gate.ts`, consumed here. */
export interface GateVerdict {
  readonly ok: boolean;
  readonly failures: ReadonlyArray<{ readonly code: string; readonly detail?: string }>;
}

/** Written into the revision when an admin approves their own item. */
export const ADMIN_SELF_APPROVAL_NOTE = "Approved by an admin without a second editor.";

export interface TransitionInput {
  readonly entity: Statusable;
  readonly to: Status;
  readonly actor: Actor;
  /** Required for reject (in_review -> draft) and retire. */
  readonly note?: string;
  /** Required for in_review -> published. Must be a passing verdict. */
  readonly gate?: GateVerdict;
  readonly now?: Date;
}

export type TransitionError =
  | { readonly _tag: "NoSuchEdge"; readonly from: Status; readonly to: Status }
  | { readonly _tag: "Forbidden"; readonly reason: string }
  | { readonly _tag: "FourEyes"; readonly actorId: string }
  | { readonly _tag: "GateMissing" }
  | { readonly _tag: "GateFailed"; readonly failures: GateVerdict["failures"] }
  | { readonly _tag: "NoteRequired"; readonly to: Status };

export interface TransitionOutcome {
  readonly status: Status;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  /** What to write into `content_revisions`. */
  readonly revision: {
    readonly from: Status;
    readonly to: Status;
    readonly actorId: string;
    readonly note: string | null;
    readonly at: Date;
  };
}

export type TransitionResult =
  | { readonly ok: true; readonly next: TransitionOutcome }
  | { readonly ok: false; readonly error: TransitionError };

/**
 * The one function that moves content between statuses.
 *
 * - Learners can never transition anything.
 * - `in_review -> published` needs an editorial actor who is not the
 *   creator (four eyes) and a passing publish-gate verdict. The one
 *   exception is an `admin`, who may approve their own work; the revision
 *   says so (`ADMIN_SELF_APPROVAL_NOTE`), so it is never silent. The operator
 *   chose this on 2026-09-27: a one-tutor team cannot always find a second
 *   editor, and the publish gate still applies in full.
 * - Rejecting and retiring need a note.
 * - Anything not in `EDGES` is refused, including every route that would
 *   take `ai_draft` or `draft` straight to `published`.
 */
export function transition(input: TransitionInput): TransitionResult {
  const { entity, to, actor } = input;
  const from = entity.status;
  const now = input.now ?? new Date();

  if (!hasEdge(from, to)) {
    return { ok: false, error: { _tag: "NoSuchEdge", from, to } };
  }
  if (!isEditorial(actor)) {
    return { ok: false, error: { _tag: "Forbidden", reason: "actor has no editorial role" } };
  }

  const note = input.note?.trim() ?? "";
  const revision = { from, to, actorId: actor.id, note: note === "" ? null : note, at: now };

  switch (to) {
    case "in_review":
      return { ok: true, next: { status: to, approvedBy: null, approvedAt: null, revision } };

    case "draft":
      if (note === "") return { ok: false, error: { _tag: "NoteRequired", to } };
      return { ok: true, next: { status: to, approvedBy: null, approvedAt: null, revision } };

    case "retired":
      if (note === "") return { ok: false, error: { _tag: "NoteRequired", to } };
      return {
        ok: true,
        next: {
          status: to,
          approvedBy: entity.approvedBy,
          approvedAt: entity.approvedAt,
          revision,
        },
      };

    case "published": {
      const own = entity.createdBy !== null && entity.createdBy === actor.id;
      if (own && !actor.roles.includes("admin")) {
        return { ok: false, error: { _tag: "FourEyes", actorId: actor.id } };
      }
      if (!input.gate) return { ok: false, error: { _tag: "GateMissing" } };
      if (!input.gate.ok) {
        return { ok: false, error: { _tag: "GateFailed", failures: input.gate.failures } };
      }
      const logged = own
        ? {
            ...revision,
            note: revision.note
              ? `${ADMIN_SELF_APPROVAL_NOTE} ${revision.note}`
              : ADMIN_SELF_APPROVAL_NOTE,
          }
        : revision;
      return {
        ok: true,
        next: { status: to, approvedBy: actor.id, approvedAt: now, revision: logged },
      };
    }

    case "ai_draft":
      // Unreachable: no edge leads here. Kept for exhaustiveness.
      return { ok: false, error: { _tag: "NoSuchEdge", from, to } };
  }
}

export function describeTransitionError(e: TransitionError): string {
  switch (e._tag) {
    case "NoSuchEdge":
      return `no transition from ${e.from} to ${e.to}`;
    case "Forbidden":
      return `forbidden: ${e.reason}`;
    case "FourEyes":
      return `four-eyes: the creator (${e.actorId}) cannot approve their own content`;
    case "GateMissing":
      return "publish gate verdict missing";
    case "GateFailed":
      return `publish gate failed: ${e.failures.map((f) => f.code + (f.detail ? ` (${f.detail})` : "")).join(", ")}`;
    case "NoteRequired":
      return `a note is required to move to ${e.to}`;
  }
}
