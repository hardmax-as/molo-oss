import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus plumbing for overlays and for content that replaces the page under
 * the learner's feet. No dependency: React Aria's `FocusScope` would do the
 * same, but the two hooks here are twenty lines and keep the overlay markup
 * ours (docs/ACCESSIBILITY.md).
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      // An aria-hidden element must never take focus, however focusable the
      // tag is: the celebration's tap-anywhere backdrop is one such button.
      !el.closest("[aria-hidden='true']") &&
      (el.offsetParent !== null || el === document.activeElement),
  );
}

/**
 * Traps Tab inside `ref` while `active`, sends Escape to `onEscape`, moves
 * focus in on open and back to the opener on close (WCAG 2.1.2, 2.4.3).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  // Callers pass an inline arrow, so keep the handler out of the deps: a new
  // identity every render would tear the trap down and put focus back on the
  // opener mid-render.
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusable(root)[0] ?? root;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escape.current) {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0] as HTMLElement;
      const lastItem = items[items.length - 1] as HTMLElement;
      const current = document.activeElement;
      if (e.shiftKey && (current === firstItem || !root.contains(current))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (current === lastItem || !root.contains(current))) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus();
    };
  }, [ref, active]);
}

/**
 * Moves focus to the element once, when it appears. For content that swaps
 * in where the learner was working — the account wall, the out-of-hearts
 * card — so a keyboard or screen-reader user is not left on a dead node.
 */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
