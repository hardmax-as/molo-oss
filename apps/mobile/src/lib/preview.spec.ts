import { api, getUnits } from "./api.ts";
import { previewStore } from "./preview-state.ts";

jest.mock("./auth.ts", () => ({ authClient: { getCookie: () => "fixture=session" } }));
const editor = { user: { id: "editor" }, roles: ["editor"] };
const originalFetch = global.fetch;
const request = jest.fn();
beforeEach(() => {
  previewStore.set(null, false);
  request
    .mockReset()
    .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ units: [] }) });
  global.fetch = request;
});
afterEach(() => {
  previewStore.set(null, false);
  global.fetch = originalFetch;
});

describe("mobile preview request boundary", () => {
  it("reads only the editorial namespace with the session and preview marker", async () => {
    previewStore.set(editor, true);
    await api("/edit/preview/path");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/edit/preview/path"),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: "fixture=session", "X-Molo-Preview": "1" }),
      }),
    );
  });

  it.each(["/me/review", "/me/lessons/id/complete", "/me/hearts/consume", "/me/progress/import"])(
    "never sends a preview mutation to %s",
    async (path) => {
      previewStore.set(editor, true);
      await expect(api(path, { method: "POST", body: "{}" })).rejects.toMatchObject({
        status: 403,
        code: "preview_read_only",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("does not fall back to cached learner content and restores published reads on exit", async () => {
    previewStore.set(editor, true);
    await expect(getUnits()).rejects.toMatchObject({ status: 403 });
    expect(request).not.toHaveBeenCalled();
    previewStore.set(editor, false);
    await getUnits();
    expect(request).toHaveBeenCalledWith(expect.stringMatching(/\/units$/), expect.any(Object));
  });

  it("a learner cannot turn on preview", async () => {
    previewStore.set({ user: { id: "learner" }, roles: ["learner"] }, true);
    expect(previewStore.getSnapshot()).toBeNull();
    await getUnits();
    expect(request).toHaveBeenCalledWith(expect.stringMatching(/\/units$/), expect.any(Object));
  });
});
