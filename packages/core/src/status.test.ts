import { describe, expect, it } from "vitest";

import {
  ADMIN_SELF_APPROVAL_NOTE,
  EDGES,
  STATUSES,
  hasEdge,
  reachableFrom,
  transition,
  type Actor,
  type Statusable,
} from "./status.ts";

const editor: Actor = { id: "editor-1", roles: ["editor"] };
const admin: Actor = { id: "admin-1", roles: ["admin"] };
const learner: Actor = { id: "learner-1", roles: ["learner"] };

const entity = (status: Statusable["status"], createdBy = "creator-1"): Statusable => ({
  status,
  createdBy,
  approvedBy: null,
  approvedAt: null,
});

const passing = { ok: true, failures: [] as const };
const failing = { ok: false, failures: [{ code: "gloss_missing", detail: "nb" }] };

describe("status machine edges", () => {
  it("has no edge into published except from in_review", () => {
    for (const from of STATUSES) {
      expect(hasEdge(from, "published")).toBe(from === "in_review");
    }
  });

  it("ai_draft has exactly one way out, to in_review; published is only reachable through it", () => {
    expect(EDGES.filter(([f]) => f === "ai_draft").map(([, t]) => t)).toEqual(["in_review"]);
    // Every path from ai_draft to published passes through in_review, whose
    // only exit to published is transition() with an editorial actor, a
    // passing gate and four eyes (asserted below). That is the guarantee:
    // no automated sequence, not "unreachable".
    const withoutReview = EDGES.filter(([f, t]) => f !== "in_review" && t !== "in_review");
    expect(withoutReview.some(([f]) => f === "ai_draft")).toBe(false);
    expect(withoutReview.some(([, t]) => t === "published")).toBe(false);
  });

  it("draft only reaches published via in_review", () => {
    const paths = EDGES.filter(([f]) => f === "draft").map(([, t]) => t);
    expect(paths).toEqual(["in_review"]);
  });

  it("nothing leaves retired", () => {
    expect(reachableFrom("retired").size).toBe(0);
  });
});

describe("transition()", () => {
  it("refuses every direct route to published", () => {
    for (const from of ["draft", "ai_draft", "published", "retired"] as const) {
      const r = transition({ entity: entity(from), to: "published", actor: admin, gate: passing });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error._tag).toBe("NoSuchEdge");
    }
  });

  it("refuses learners everywhere", () => {
    const r = transition({ entity: entity("draft"), to: "in_review", actor: learner });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error._tag).toBe("Forbidden");
  });

  it("promotes draft and ai_draft to in_review for editors", () => {
    for (const from of ["draft", "ai_draft"] as const) {
      const r = transition({ entity: entity(from), to: "in_review", actor: editor });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.next.status).toBe("in_review");
    }
  });

  it("publishes only with a passing gate and four eyes", () => {
    const missing = transition({ entity: entity("in_review"), to: "published", actor: editor });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error._tag).toBe("GateMissing");

    const failed = transition({
      entity: entity("in_review"),
      to: "published",
      actor: editor,
      gate: failing,
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error._tag).toBe("GateFailed");

    const self = transition({
      entity: entity("in_review", editor.id),
      to: "published",
      actor: editor,
      gate: passing,
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.error._tag).toBe("FourEyes");

    const now = new Date("2026-09-03T12:00:00Z");
    const ok = transition({
      entity: entity("in_review"),
      to: "published",
      actor: editor,
      gate: passing,
      now,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.next.status).toBe("published");
      expect(ok.next.approvedBy).toBe(editor.id);
      expect(ok.next.approvedAt).toEqual(now);
      expect(ok.next.revision).toMatchObject({
        from: "in_review",
        to: "published",
        actorId: editor.id,
      });
    }
  });

  it("requires a note to reject or retire", () => {
    const reject = transition({ entity: entity("in_review"), to: "draft", actor: editor });
    expect(reject.ok).toBe(false);
    const rejectOk = transition({
      entity: entity("in_review"),
      to: "draft",
      actor: editor,
      note: "concord wrong",
    });
    expect(rejectOk.ok).toBe(true);

    const retire = transition({ entity: entity("published"), to: "retired", actor: admin });
    expect(retire.ok).toBe(false);
    const retireOk = transition({
      entity: entity("published"),
      to: "retired",
      actor: admin,
      note: "superseded",
    });
    expect(retireOk.ok).toBe(true);
  });
});

describe("an admin approving their own work", () => {
  it("is allowed, and the revision says so; an editor is still refused", () => {
    const own = transition({
      entity: entity("in_review", admin.id),
      to: "published",
      actor: admin,
      gate: passing,
      note: "checked the takes",
    });
    expect(own.ok).toBe(true);
    if (own.ok) {
      expect(own.next.approvedBy).toBe(admin.id);
      expect(own.next.revision.note).toBe(`${ADMIN_SELF_APPROVAL_NOTE} checked the takes`);
    }
    const quiet = transition({
      entity: entity("in_review", admin.id),
      to: "published",
      actor: admin,
      gate: passing,
    });
    expect(quiet.ok && quiet.next.revision.note).toBe(ADMIN_SELF_APPROVAL_NOTE);

    const editorOwn = transition({
      entity: entity("in_review", editor.id),
      to: "published",
      actor: editor,
      gate: passing,
    });
    expect(editorOwn.ok).toBe(false);
  });

  it("still needs a passing publish gate", () => {
    const r = transition({
      entity: entity("in_review", admin.id),
      to: "published",
      actor: admin,
      gate: { ok: false, failures: [{ code: "audio_missing" }] },
    });
    expect(r.ok).toBe(false);
  });
});
