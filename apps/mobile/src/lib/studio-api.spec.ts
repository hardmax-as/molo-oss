/** @jest-environment node */
import type { AudioQueueItem } from "@molo/core";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

jest.mock("./auth.ts", () => ({ authClient: { getCookie: async () => "session=editor-fixture" } }));
jest.mock("./api-url.ts", () => ({ apiUrl: () => "https://molo.test" }));

import {
  CLICKS_SELECTION,
  getStudioQueue,
  getStudioSpeakers,
  uploadStudioTake,
} from "./studio-api.ts";

const server = setupServer();
const WebFormData = globalThis.FormData;
const fileParts: unknown[] = [];
// Native FormData reads { uri, type, name } from disk. Substitute just that native file read;
// MSW receives and parses an actual multipart HTTP body, including its generated boundary.
class NativeFileFormData extends WebFormData {
  override append(name: string, value: unknown, filename?: string) {
    if (value && typeof value === "object" && "uri" in value) {
      fileParts.push(value);
      const file = value as { uri: string; type: string; name: string };
      super.append(name, new Blob(["fixture recording"], { type: file.type }), file.name);
    } else if (typeof value === "string") super.append(name, value);
    else super.append(name, value as Blob, filename);
  }
}

beforeAll(() => {
  globalThis.FormData = NativeFileFormData;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  fileParts.length = 0;
});
afterAll(() => {
  server.close();
  globalThis.FormData = WebFormData;
});

const item: AudioQueueItem = {
  kind: "lexeme",
  id: "00000000-0000-4000-8000-000000000001",
  text: "zz-fixture",
  gloss: { en: "fixture gloss", nb: "fiksturglosse" },
  status: "in_review",
  unitSlugs: ["zz-unit"],
  audio: [],
};
const speakerId = "00000000-0000-4000-8000-000000000002";
const result = { jobId: "fixture-job", uploadKey: "incoming/fixture-job/take.m4a", queued: true };

describe("mobile studio uses the web upload contract", () => {
  it("offers only speakers with both recorded consent and a scope", async () => {
    server.use(
      http.get("https://molo.test/edit/speakers", () =>
        HttpResponse.json({
          speakers: [
            { id: "yes", consentRecordedAt: "2026-09-21T00:00:00Z", consentScope: "commercial" },
            { id: "no-date", consentRecordedAt: null, consentScope: "commercial" },
            { id: "no-scope", consentRecordedAt: "2026-09-21T00:00:00Z", consentScope: null },
          ],
        }),
      ),
    );
    expect((await getStudioSpeakers()).map((speaker) => speaker.id)).toEqual(["yes"]);
  });

  it.each([undefined, "zz-unit"])(
    "requests the missing queue for a speaker, with optional unit %s",
    async (unit) => {
      server.use(
        http.get("https://molo.test/edit/audio/queue", ({ request }) => {
          expect(request.headers.get("cookie")).toBe("session=editor-fixture");
          const params = new URL(request.url).searchParams;
          expect(params.get("speaker")).toBe(speakerId);
          expect(params.get("missing")).toBe("1");
          expect(params.get("unit")).toBe(unit ?? null);
          return HttpResponse.json({ items: [item], total: 1 });
        }),
      );
      expect((await getStudioQueue(speakerId, unit)).items).toEqual([item]);
    },
  );

  it("asks for the bare clicks by kind, never by unit", async () => {
    server.use(
      http.get("https://molo.test/edit/audio/queue", ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("kind")).toBe("click");
        expect(params.get("unit")).toBeNull();
        expect(params.get("speaker")).toBe(speakerId);
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    expect((await getStudioQueue(speakerId, CLICKS_SELECTION)).items).toEqual([]);
  });

  it.each(["lexeme", "sentence"] as const)(
    "uploads a %s as multipart with the exact web fields and no client status",
    async (kind) => {
      server.use(
        http.post("https://molo.test/edit/audio", async ({ request }) => {
          expect(request.headers.get("cookie")).toBe("session=editor-fixture");
          expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
          const body = await request.formData();
          expect([...body.keys()].sort()).toEqual([
            "file",
            "licence",
            "speakerId",
            "targetId",
            "targetKind",
            "tier",
          ]);
          expect(body.get("targetKind")).toBe(kind);
          expect(body.get("targetId")).toBe(item.id);
          expect(body.get("speakerId")).toBe(speakerId);
          expect(body.get("tier")).toBe("1_native_studio");
          expect(body.get("licence")).toBe("proprietary-molo");
          const file = body.get("file") as File;
          expect(file.name).toBe(`${kind}-${item.id}.m4a`);
          expect(file.type).toBe("audio/mp4");
          expect(await file.text()).toBe("fixture recording");
          return HttpResponse.json(result, { status: 202 });
        }),
      );
      await expect(
        uploadStudioTake({ ...item, kind }, speakerId, "file:///cache/take.m4a"),
      ).resolves.toEqual(result);
      expect(fileParts).toEqual([
        { uri: "file:///cache/take.m4a", type: "audio/mp4", name: `${kind}-${item.id}.m4a` },
      ]);
    },
  );

  it.each([403, 503])(
    "rejects status %s without retrying or treating the upload as accepted",
    async (status) => {
      let calls = 0;
      server.use(
        http.post("https://molo.test/edit/audio", () => {
          calls++;
          return HttpResponse.json({ error: { code: "fixture_failure" } }, { status });
        }),
      );
      await expect(
        uploadStudioTake(item, speakerId, "file:///cache/take.m4a"),
      ).rejects.toMatchObject({ status });
      expect(calls).toBe(1);
    },
  );

  it.each([
    { ...result, queued: false },
    { ...result, jobId: "" },
  ])("requires a queued job acknowledgement before resolving", async (response) => {
    server.use(
      http.post("https://molo.test/edit/audio", () => HttpResponse.json(response, { status: 202 })),
    );
    await expect(uploadStudioTake(item, speakerId, "file:///cache/take.m4a")).rejects.toThrow(
      "audio_upload_not_queued",
    );
  });
});
