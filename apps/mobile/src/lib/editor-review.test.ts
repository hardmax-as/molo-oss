import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./auth.ts", () => ({ authClient: { getCookie: async () => "session=editor-fixture" } }));
vi.mock("./api-url.ts", () => ({ apiUrl: () => "https://molo.test" }));

import { getEditorQueue, getReviewLexeme, reviewItem } from "./editor-review.ts";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("mobile editor uses web's existing API", () => {
  it("reads only in-review words and glosses from the shared queue", async () => {
    server.use(
      http.get("https://molo.test/edit/review-queue", ({ request }) => {
        expect(new URL(request.url).searchParams.get("filter")).toBe("all");
        expect(request.headers.get("cookie")).toBe("session=editor-fixture");
        return HttpResponse.json({
          items: [
            { entityKind: "lexeme", entityId: "word", lexemeId: "word", status: "in_review" },
            { entityKind: "gloss", entityId: "gloss", lexemeId: "word", status: "in_review" },
            { entityKind: "sentence", entityId: "sentence", status: "in_review" },
            { entityKind: "lexeme", entityId: "published-word", status: "published" },
          ],
        });
      }),
    );
    expect((await getEditorQueue()).map((item) => item.entityId)).toEqual(["word", "gloss"]);
  });

  it("reads the parent's detail, including origin, audio and revision notes", async () => {
    const detail = {
      lexeme: { id: "word", lemma: "zz-fixture" },
      glosses: [{ id: "gloss", origin: "llm" }],
      audio: [{ url: "https://molo.test/audio/clip" }],
      revisions: [{ note: "Check the recording" }],
    };
    server.use(http.get("https://molo.test/edit/lexemes/word", () => HttpResponse.json(detail)));
    expect(await getReviewLexeme("word")).toEqual(detail);
  });

  it.each(["lexeme", "gloss"] as const)(
    "approves a %s with web's exact transition payload",
    async (kind) => {
      server.use(
        http.post("https://molo.test/edit/transition", async ({ request }) => {
          expect(request.headers.get("cookie")).toBe("session=editor-fixture");
          expect(await request.json()).toEqual({ kind, id: "item", to: "published" });
          return HttpResponse.json({ ok: true, status: "published" });
        }),
      );
      await expect(reviewItem(kind, "item", "approve", "unused note")).resolves.toEqual({
        ok: true,
        status: "published",
      });
    },
  );

  it.each(["lexeme", "gloss"] as const)(
    "sends a %s back with web's exact transition payload and note",
    async (kind) => {
      server.use(
        http.post("https://molo.test/edit/transition", async ({ request }) => {
          expect(await request.json()).toEqual({
            kind,
            id: "item",
            to: "draft",
            note: "Check the recording",
          });
          return HttpResponse.json({ ok: true, status: "draft" });
        }),
      );
      await reviewItem(kind, "item", "send-back", "  Check the recording  ");
    },
  );

  it("does not submit a send-back without a note", async () => {
    await expect(reviewItem("gloss", "item", "send-back", "  ")).rejects.toThrow(
      "review_note_required",
    );
  });

  it("keeps the server's publication refusal as a failure", async () => {
    server.use(
      http.post("https://molo.test/edit/transition", () =>
        HttpResponse.json({ ok: false, reason: "four-eyes" }, { status: 409 }),
      ),
    );
    await expect(reviewItem("lexeme", "item", "approve")).rejects.toMatchObject({ status: 409 });
  });

  it("does not queue or retry an offline decision", async () => {
    let attempts = 0;
    server.use(
      http.post("https://molo.test/edit/transition", () => {
        attempts++;
        return HttpResponse.error();
      }),
    );
    await expect(reviewItem("gloss", "item", "approve")).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
