/**
 * The landing page's promise is that a figure links to the rows it counted.
 * The counting is asserted against the gate itself in
 * `packages/testkit/integrity/editor-queue.test.ts`; what is left to hold
 * here is the other half — that each refusal is sent somewhere with the
 * filters that reproduce it.
 */

import type { GateBlockerCount } from "@molo/core";
import { describe, expect, it } from "vitest";

import { blockerDestination } from "./editor-queue.ts";

const blocker = (
  kind: GateBlockerCount["kind"],
  code: GateBlockerCount["code"],
  detail: string | null = null,
): GateBlockerCount => ({ kind, code, detail, rows: 1 });

describe("blockerDestination", () => {
  it("sends a missing gloss to the list filtered to that language and the pending rows", () => {
    expect(blockerDestination(blocker("lexeme", "gloss_missing", "nb"))).toEqual({
      to: "/edit/content",
      search: { status: "pending", missingGloss: "nb" },
    });
    expect(blockerDestination(blocker("sentence", "gloss_missing", "en"))).toEqual({
      to: "/edit/sentences",
      search: { status: "pending", missingGloss: "en" },
    });
  });

  it("sends a missing recording to the grid's missing-audio filter, and a sentence's to the studio", () => {
    expect(blockerDestination(blocker("lexeme", "audio_missing"))).toEqual({
      to: "/edit/content",
      search: { status: "pending", missingAudio: true },
    });
    expect(blockerDestination(blocker("sentence", "audio_missing"))).toEqual({
      to: "/edit/studio",
    });
  });

  it("sends a morphology refusal to the goldens sheet, because the class is what is unblocked", () => {
    for (const code of ["plural_not_generable", "no_morphology_generator"] as const) {
      expect(blockerDestination(blocker("lexeme", code))).toEqual({ to: "/edit/goldens" });
    }
  });

  it("falls back to the pending rows rather than nowhere", () => {
    expect(blockerDestination(blocker("lexeme", "licence_missing"))).toEqual({
      to: "/edit/content",
      search: { status: "pending" },
    });
    expect(blockerDestination(blocker("sentence", "surface_form_unverified"))).toEqual({
      to: "/edit/sentences",
      search: { status: "pending" },
    });
  });

  it("never sends an editor to a route outside the dashboard", () => {
    const codes: GateBlockerCount["code"][] = [
      "pos_missing",
      "noun_class_missing",
      "plural_not_generable",
      "no_morphology_generator",
      "gloss_missing",
      "audio_missing",
      "licence_missing",
      "source_missing",
      "lexeme_not_published",
      "surface_form_unverified",
      "referenced_entity_not_published",
    ];
    for (const kind of ["lexeme", "sentence"] as const) {
      for (const code of codes) {
        expect(blockerDestination(blocker(kind, code)).to).toMatch(/^\/edit\//);
      }
    }
  });
});
