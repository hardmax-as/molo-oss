import { describe, expect, it } from "vitest";

import {
  ASSIST_MODEL,
  buildUserPrompt,
  planAssist,
  runAssist,
  type AssistInput,
  type FetchLike,
} from "./assist.ts";

const input: AssistInput = {
  lemma: "inja",
  pos: "noun",
  nounClass: "9",
  infinitive: null,
  register: "neutral",
  sourceGlossEn: "dog",
  sourceNote: null,
  examples: [],
  existing: ["en"],
};

function messageResponse(body: unknown, extra: Record<string, unknown> = {}): FetchLike {
  return async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: sent.model,
        content: [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 40 },
        ...extra,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

const draft = {
  en: {
    gloss: "dog",
    usage_note: "",
    contrastive_note: "Plural is marked by a prefix, not a suffix.",
  },
  nb: {
    gloss: "hund",
    usage_note: "",
    contrastive_note: "Tonen er som tonelag i bønder/bønner, ikke trykk.",
  },
  confidence: "high",
  caveat: "",
};

describe("assist prompt", () => {
  it("carries the lemma verbatim and forbids writing isiXhosa", () => {
    const req = planAssist(input);
    expect(req.model).toBe(ASSIST_MODEL);
    expect(req.system).toContain("Never write any isiXhosa");
    expect(req.user).toContain("inja");
    expect(req.user).toContain("noun class 9");
    expect(req.user).toContain("A human gloss already exists for: en");
  });

  it("omits empty sections", () => {
    const p = buildUserPrompt({ ...input, sourceGlossEn: null, existing: [] });
    expect(p).toContain("(none)");
    expect(p).not.toContain("already exists");
    expect(p).not.toContain("Example sentences");
  });
});

describe("runAssist", () => {
  it("sends structured-output config and decodes the draft", async () => {
    let sent: Record<string, unknown> = {};
    const capture: FetchLike = async (url, init) => {
      sent = JSON.parse(String(init?.body));
      return messageResponse(draft)(url, init);
    };
    const r = await runAssist("test-key", planAssist(input), capture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.nb.gloss).toBe("hund");
    expect(r.usage).toEqual({ input: 120, output: 40 });
    expect(sent["model"]).toBe(ASSIST_MODEL);
    expect((sent["output_config"] as { format: { type: string } }).format.type).toBe("json_schema");
    expect(sent["messages"]).toEqual([{ role: "user", content: buildUserPrompt(input) }]);
  });

  it("reports a refusal instead of a draft", async () => {
    const r = await runAssist(
      "test-key",
      planAssist(input),
      messageResponse("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "other" },
      }),
    );
    expect(r).toEqual({ ok: false, reason: "model refused (other)" });
  });

  it("rejects output that is not the schema", async () => {
    const bad = await runAssist(
      "test-key",
      planAssist(input),
      messageResponse({ en: { gloss: "dog" } }),
    );
    expect(bad.ok).toBe(false);
    const notJson = await runAssist("test-key", planAssist(input), messageResponse("not json"));
    expect(notJson).toEqual({ ok: false, reason: "model returned no JSON" });
  });
});
