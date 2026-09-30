/**
 * Page-level keyboard shortcuts must not steal keys from the control that
 * owns them (WCAG 2.1.1). A lesson's Enter-to-continue listens on `window`,
 * so without these checks Enter on a report reason advanced the lesson and
 * threw the report away (docs/design-audit-2026-09-web.md, W02).
 */

/** The part of a DOM element these checks read; kept small so it is testable without a DOM. */
export type KeyTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
} | null;

/** Anything that is its own Enter target, or where Enter means something else. */
const OWNS_ENTER = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY", "OPTION"]);

/** An open overlay; while one is up the page behind it takes no shortcuts. */
export const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

export function ownsEnter(eventTarget: unknown): boolean {
  const target = eventTarget as KeyTarget;
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  if (target.tagName && OWNS_ENTER.has(target.tagName.toUpperCase())) return true;
  // A custom control (a radio group, a listbox, a slider) or anything inside an overlay.
  return Boolean(
    target.closest?.(
      `[role="radio"], [role="checkbox"], [role="option"], [role="listbox"], [role="slider"], [role="textbox"], [role="combobox"], [role="menuitem"], ${OVERLAY_SELECTOR}`,
    ),
  );
}

/**
 * Whether a window-level Enter should run the lesson's Continue. Not when
 * another handler already took the key, when an IME is composing, when a
 * modifier is held, when the focused element handles Enter itself (a focused
 * Continue button activates natively), or while any overlay is open.
 */
export function isShortcutEnter(
  e: {
    key: string;
    defaultPrevented: boolean;
    isComposing?: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    target: unknown;
  },
  overlayShown: boolean,
): boolean {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return false;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  if (overlayShown) return false;
  return !ownsEnter(e.target);
}

/** Whether the document currently shows an overlay (dialog, alert dialog, modal). */
export function overlayOpen(doc: Pick<Document, "querySelector"> = document): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
