import { describe, expect, it } from "vitest";

import { createPreviewStore, mayPreview, previewRequestAllowed } from "./editor-preview.ts";

describe("editor preview isolation", () => {
  it("only editors and admins can opt in, and the opt-in belongs to one account", () => {
    const store = createPreviewStore();
    const learner = { user: { id: "learner" }, roles: ["learner"] };
    const editor = { user: { id: "editor" }, roles: ["editor"] };
    expect(mayPreview(null)).toBe(false);
    expect(mayPreview(learner)).toBe(false);
    expect(mayPreview(editor)).toBe(true);
    expect(mayPreview({ ...editor, roles: ["admin"] })).toBe(true);
    store.set(learner, true);
    expect(store.getSnapshot()).toBeNull();
    store.set(editor, true);
    expect(store.getSnapshot()).toBe("editor");
    store.set(learner, true);
    expect(store.getSnapshot()).toBeNull();
  });

  it("never persists across a fresh client and notifies subscribers when leaving", () => {
    const store = createPreviewStore();
    let updates = 0;
    const unsubscribe = store.subscribe(() => {
      updates++;
    });
    store.set({ user: { id: "editor" }, roles: ["editor"] }, true);
    expect(createPreviewStore().getSnapshot()).toBeNull();
    store.set(null, false);
    expect(updates).toBe(2);
    unsubscribe();
  });

  it.each([
    "/me/lessons/id/complete",
    "/me/review",
    "/me/hearts/consume",
    "/me/progress/import",
    "/me/skills/id/chest",
    "/edit/preview/units",
  ])("refuses every mutation before fetch: %s", (path) => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect(previewRequestAllowed(path, method)).toBe(false);
  });

  it("only allows identity and editorial preview reads while preview is enabled", () => {
    expect(previewRequestAllowed("/me")).toBe(true);
    expect(previewRequestAllowed("/edit/preview/path?lang=nb")).toBe(true);
    for (const path of [
      "/path",
      "/units",
      "/me/hearts",
      "/me/progress",
      "/edit/preview-other/path",
    ])
      expect(previewRequestAllowed(path)).toBe(false);
  });
});
