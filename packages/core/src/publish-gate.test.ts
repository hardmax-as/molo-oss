import { describe, expect, it } from "vitest";

import {
  containerPublishGate,
  graphPublishGate,
  lexemePublishGate,
  sentencePublishGate,
  type LexemeGateInput,
  type SentenceGateInput,
} from "./publish-gate.ts";

const ctx = { sourceLanguages: ["en", "nb"] };
const editor = { id: "editor-1", roles: ["editor"] as const };

const goodLexeme: LexemeGateInput = {
  pos: "noun",
  morphGenerator: "xh-morph",
  nounClass: "9",
  hasPluralLink: false,
  canGeneratePlural: true,
  glossLanguages: ["en", "nb"],
  audio: [{ tier: "1_native_studio", status: "published" }],
  licence: "CC-BY-SA-4.0",
  source: "isixhosa.click",
  createdBy: "creator-1",
  approver: editor,
};

const codes = (r: { failures: readonly { code: string }[] }) => r.failures.map((f) => f.code);

describe("lexemePublishGate", () => {
  it("passes a complete lexeme", () => {
    expect(lexemePublishGate(goodLexeme, ctx).ok).toBe(true);
  });

  it("rejects a missing nb gloss rather than falling back to English", () => {
    const r = lexemePublishGate({ ...goodLexeme, glossLanguages: ["en"] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.failures).toContainEqual({ code: "gloss_missing", detail: "nb" });
  });

  it("rejects when only tier-3 or unpublished audio exists", () => {
    expect(
      codes(
        lexemePublishGate({ ...goodLexeme, audio: [{ tier: "3_tts", status: "published" }] }, ctx),
      ),
    ).toContain("audio_missing");
    expect(
      codes(
        lexemePublishGate(
          { ...goodLexeme, audio: [{ tier: "1_native_studio", status: "in_review" }] },
          ctx,
        ),
      ),
    ).toContain("audio_missing");
    expect(
      codes(
        lexemePublishGate(
          { ...goodLexeme, audio: [{ tier: "2_native_forvo", status: "published" }] },
          ctx,
        ),
      ),
    ).not.toContain("audio_missing");
  });

  it("rejects a noun without a class, or whose plural xh-morph cannot generate", () => {
    expect(codes(lexemePublishGate({ ...goodLexeme, nounClass: null }, ctx))).toContain(
      "noun_class_missing",
    );
    expect(codes(lexemePublishGate({ ...goodLexeme, canGeneratePlural: false }, ctx))).toContain(
      "plural_not_generable",
    );
    expect(
      codes(
        lexemePublishGate({ ...goodLexeme, canGeneratePlural: false, hasPluralLink: true }, ctx),
      ),
    ).not.toContain("plural_not_generable");
    expect(
      codes(
        lexemePublishGate(
          { ...goodLexeme, pos: "verb", nounClass: null, canGeneratePlural: null },
          ctx,
        ),
      ),
    ).toEqual([]);
  });

  it("refuses morphology-dependent publishing when the language has no generator", () => {
    // A course whose language has no generator: nothing can vouch for a
    // plural, so the noun publishes only on an editor's plural_of link.
    const noGenerator = { ...goodLexeme, morphGenerator: null, canGeneratePlural: null };
    expect(codes(lexemePublishGate(noGenerator, ctx))).toContain("no_morphology_generator");
    expect(codes(lexemePublishGate(noGenerator, ctx))).not.toContain("plural_not_generable");
    expect(codes(lexemePublishGate({ ...noGenerator, hasPluralLink: true }, ctx))).not.toContain(
      "no_morphology_generator",
    );
    // Nothing morphological is asked of a verb, so it publishes either way.
    expect(codes(lexemePublishGate({ ...noGenerator, pos: "verb", nounClass: null }, ctx))).toEqual(
      [],
    );
  });

  it("rejects the creator approving their own work and non-editorial approvers", () => {
    expect(codes(lexemePublishGate({ ...goodLexeme, createdBy: editor.id }, ctx))).toContain(
      "four_eyes",
    );
    expect(
      codes(lexemePublishGate({ ...goodLexeme, approver: { id: "l", roles: ["learner"] } }, ctx)),
    ).toContain("approver_not_editorial");
  });

  it("rejects missing licence, source or pos", () => {
    expect(
      codes(lexemePublishGate({ ...goodLexeme, licence: null, source: null, pos: null }, ctx)),
    ).toEqual(expect.arrayContaining(["licence_missing", "source_missing", "pos_missing"]));
  });
});

describe("sentencePublishGate", () => {
  const good: SentenceGateInput = {
    morphGenerator: "xh-morph",
    glossLanguages: ["en", "nb"],
    audio: [{ tier: "1_native_studio", status: "published" }],
    licence: "proprietary-molo",
    source: "editor",
    createdBy: "creator-1",
    approver: editor,
    lexemes: [
      {
        lexemeId: "a",
        status: "published",
        surfaceForm: { morphVerified: true, irregular: false, note: null },
      },
      {
        lexemeId: "b",
        status: "published",
        surfaceForm: { morphVerified: false, irregular: true, note: "amehlo" },
      },
    ],
  };

  it("passes with verified or irregular-with-note surface forms over published lexemes", () => {
    expect(sentencePublishGate(good, ctx).ok).toBe(true);
  });

  it("rejects an unpublished lexeme and an unverified surface form", () => {
    const r = sentencePublishGate(
      {
        ...good,
        lexemes: [
          {
            lexemeId: "a",
            status: "in_review",
            surfaceForm: { morphVerified: true, irregular: false, note: null },
          },
          {
            lexemeId: "b",
            status: "published",
            surfaceForm: { morphVerified: false, irregular: true, note: "" },
          },
          {
            lexemeId: "c",
            status: "published",
            surfaceForm: { morphVerified: false, irregular: false, note: null },
          },
        ],
      },
      ctx,
    );
    expect(codes(r)).toEqual(
      expect.arrayContaining(["lexeme_not_published", "surface_form_unverified"]),
    );
    expect(r.failures.filter((f) => f.code === "surface_form_unverified")).toHaveLength(2);
  });

  it("says once why an unverified form can never clear without a generator", () => {
    const unverified = {
      lexemeId: "c",
      status: "published" as const,
      surfaceForm: { morphVerified: false, irregular: false, note: null },
    };
    const r = sentencePublishGate(
      { ...good, morphGenerator: null, lexemes: [...good.lexemes, unverified] },
      ctx,
    );
    expect(codes(r)).toContain("no_morphology_generator");
    expect(r.failures.filter((f) => f.code === "no_morphology_generator")).toHaveLength(1);
    // Nothing here needs the generator: one form is already verified, the
    // other is irregular with a note.
    expect(codes(sentencePublishGate({ ...good, morphGenerator: null }, ctx))).not.toContain(
      "no_morphology_generator",
    );
  });
});

describe("graphPublishGate", () => {
  it("rejects while any referenced entity is unpublished", () => {
    const r = graphPublishGate({
      createdBy: "creator-1",
      approver: editor,
      references: [
        { kind: "lexeme", id: "x", status: "published" },
        { kind: "audio_asset", id: "y", status: "in_review" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toContainEqual({
      code: "referenced_entity_not_published",
      detail: "audio_asset:y",
    });
  });
});

describe("containerPublishGate (lessons, skills, units)", () => {
  const editorB = { id: "editor-b", roles: ["editor"] as const };
  const child = (
    status: "draft" | "ai_draft" | "in_review" | "published" | "retired",
    id: string = status,
  ) => ({
    kind: "exercise" as const,
    id,
    status,
  });
  const gate = (children: ReturnType<typeof child>[]) =>
    containerPublishGate({ children, createdBy: "editor-a", approver: editorB });

  it("publishes with the ready children while drafts wait outside", () => {
    expect(gate([child("published"), child("draft", "d1"), child("ai_draft", "d2")]).ok).toBe(true);
  });

  it("is held back by a child in review", () => {
    expect(codes(gate([child("published"), child("in_review")]))).toContain(
      "referenced_entity_not_published",
    );
  });

  it("needs at least one published child; retired ones never count", () => {
    expect(codes(gate([child("draft")]))).toEqual(["no_published_children"]);
    expect(codes(gate([child("retired")]))).toEqual(["no_published_children"]);
    expect(codes(gate([]))).toEqual(["no_published_children"]);
  });

  it("keeps four eyes for an editor", () => {
    expect(
      codes(
        containerPublishGate({
          children: [child("published")],
          createdBy: "editor-b",
          approver: editorB,
        }),
      ),
    ).toContain("four_eyes");
  });
});
