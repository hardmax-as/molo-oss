import { describe, expect, it } from "vitest";

import { isShortcutEnter, overlayOpen, ownsEnter } from "./keys.ts";

/** A stand-in element: its tag, and the selectors its ancestors match. */
function el(tagName: string, inside: string[] = [], isContentEditable = false) {
  return {
    tagName,
    isContentEditable,
    closest: (selector: string) =>
      selector
        .split(",")
        .map((s) => s.trim())
        .some((s) => inside.includes(s))
        ? {}
        : null,
  };
}

const enter = (target: unknown, extra: Record<string, unknown> = {}) => ({
  key: "Enter",
  defaultPrevented: false,
  target,
  ...extra,
});

describe("lesson Enter shortcut (W02)", () => {
  it("continues from the page body", () => {
    expect(isShortcutEnter(enter(el("BODY")), false)).toBe(true);
    expect(isShortcutEnter(enter(null), false)).toBe(true);
  });

  it("never fires while a dialog is open, whatever holds focus", () => {
    expect(isShortcutEnter(enter(el("BODY")), true)).toBe(false);
  });

  it("leaves Enter to the report dialog's controls", () => {
    // The audit's case: a reason radio focused inside the report dialog.
    expect(isShortcutEnter(enter(el("INPUT", ['[role="dialog"]'])), false)).toBe(false);
    expect(isShortcutEnter(enter(el("TEXTAREA")), false)).toBe(false);
    expect(isShortcutEnter(enter(el("DIV", ['[aria-modal="true"]'])), false)).toBe(false);
  });

  it("leaves Enter to a focused button or link, which activate themselves", () => {
    expect(isShortcutEnter(enter(el("BUTTON")), false)).toBe(false);
    expect(isShortcutEnter(enter(el("A")), false)).toBe(false);
  });

  it("respects handlers that already took the key, IME composition and modifiers", () => {
    expect(isShortcutEnter(enter(el("BODY"), { defaultPrevented: true }), false)).toBe(false);
    expect(isShortcutEnter(enter(el("BODY"), { isComposing: true }), false)).toBe(false);
    expect(isShortcutEnter(enter(el("BODY"), { metaKey: true }), false)).toBe(false);
  });

  it("ignores other keys", () => {
    expect(isShortcutEnter({ ...enter(el("BODY")), key: " " }, false)).toBe(false);
  });

  it("treats custom controls and editable regions as owning Enter", () => {
    expect(ownsEnter(el("SPAN", ['[role="radio"]']))).toBe(true);
    expect(ownsEnter(el("DIV", [], true))).toBe(true);
    expect(ownsEnter(el("P"))).toBe(false);
  });

  it("detects an open overlay in the document", () => {
    expect(overlayOpen({ querySelector: () => ({}) as Element })).toBe(true);
    expect(overlayOpen({ querySelector: () => null })).toBe(false);
  });
});
