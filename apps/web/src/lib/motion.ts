import { animate, useInView, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Shared motion recipes (docs/DESIGN.md "Motion"). Components ask
 * `useMotionPrefs()` and pass `reduced` on to these helpers so every
 * animation shortens to a fade when the OS asks for less motion.
 *
 * The OS setting (`prefers-reduced-motion`) is the default; settings offers
 * an explicit override for people whose device setting does not match what
 * they want here (WCAG 2.3.3, and DESIGN.md "Motion"). The override lives in
 * localStorage under `molo.motion` and is mirrored onto `<html data-motion>`
 * so the CSS keyframes in styles.css follow it too.
 */

/** Where the explicit override lives. Exported so nothing has to spell it twice. */
export const MOTION_STORAGE_KEY = "molo.motion";
const STORAGE_KEY = MOTION_STORAGE_KEY;
type MotionOverride = boolean | null;

let override: MotionOverride = null;
const listeners = new Set<() => void>();

function readOverride(): MotionOverride {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "reduced" ? true : raw === "full" ? false : null;
  } catch {
    return null; // private mode
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `true` shortens everything, `false` keeps full motion, `null` follows the OS. */
export function setMotionOverride(value: MotionOverride): void {
  override = value;
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value ? "reduced" : "full");
  } catch {
    /* private mode: this tab still follows the choice */
  }
  applyDocumentAttribute();
  for (const listener of listeners) listener();
}

/** Mirrors the override onto `<html data-motion>` so styles.css can honour it. */
export function applyDocumentAttribute(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (override === null) root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", override ? "reduced" : "full");
}

/** Reads the stored override once on the client; safe to call from an effect. */
export function hydrateMotionOverride(): void {
  override = readOverride();
  applyDocumentAttribute();
  for (const listener of listeners) listener();
}

function useOverride(): MotionOverride {
  // SSR renders "follow the OS"; the client corrects after hydration so the
  // markup stays deterministic (same trick as SfxProvider).
  const [value, setValue] = useState<MotionOverride>(null);
  useEffect(() => {
    setValue(override);
    return subscribe(() => setValue(override));
  }, []);
  return value;
}

export function useMotionPrefs(): { reduced: boolean } {
  const os = useReducedMotion() === true;
  const chosen = useOverride();
  return { reduced: chosen ?? os };
}

/** The settings toggle: what the learner chose, and what is in force right now. */
export function useMotionSetting(): {
  override: MotionOverride;
  reduced: boolean;
  set: (value: MotionOverride) => void;
} {
  const os = useReducedMotion() === true;
  const chosen = useOverride();
  return { override: chosen, reduced: chosen ?? os, set: setMotionOverride };
}

/**
 * Whether a looping decoration (a bob, a blink, a flap) should run: motion
 * is allowed and the element is on screen. Loops stop when scrolled away so
 * a long page is not animating things nobody can see. Spread `ref` on the
 * element that loops.
 */
export function useLoop<T extends Element>(
  enabled = true,
): { ref: RefObject<T | null>; live: boolean; reduced: boolean } {
  const { reduced } = useMotionPrefs();
  const ref = useRef<T | null>(null);
  const inView = useInView(ref, { margin: "64px" });
  return { ref, live: enabled && !reduced && inView, reduced };
}

export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Enter: rise 12 px and fade, 220 ms, staggered 40 ms. */
export function riseVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 12 },
    show: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.12 : 0.22, ease: easeOut, delay: reduced ? 0 : i * 0.04 },
    }),
  };
}

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/** Press: scale 0.97 in 90 ms. */
export function pressTransition(reduced: boolean): Transition {
  return { duration: reduced ? 0 : 0.09, ease: easeOut };
}

export const popTransition: Transition = { type: "spring", stiffness: 420, damping: 22, mass: 0.6 };

/** Wrong answer: three shakes of 6 px. */
export const shakeKeyframes = { x: [0, -6, 6, -6, 6, -3, 0] };
export const shakeTransition: Transition = { duration: 0.45, ease: "easeInOut" };

/**
 * The landing hero's one entrance (docs/DESIGN.md "Motion"): the parent
 * staggers its items in reading order, then the birds land. Items carry no
 * delay of their own, so the parent's stagger decides the order.
 */
export function heroVariants(reduced: boolean): Variants {
  return {
    hidden: {},
    show: { transition: reduced ? {} : { delayChildren: 0.05, staggerChildren: 0.09 } },
  };
}

export function heroItem(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0.12 : 0.26, ease: easeOut } },
  };
}

export function heroBirds(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, scale: reduced ? 1 : 0.85 },
    show: {
      opacity: 1,
      scale: 1,
      transition: reduced ? { duration: 0.12 } : { type: "spring", stiffness: 220, damping: 18 },
    },
  };
}

/** One wave: up, a little back, up again, rest. Shared by the sunbird's wing and the penguin's flipper. */
export const WAVE_MS = 1100;
export const waveTransition: Transition = { duration: WAVE_MS / 1000, ease: "easeInOut" };
export function waveKeyframes(lift: number): number[] {
  return [0, lift, lift * 0.3, lift, 0];
}

/**
 * Plays one wave on the element behind the returned ref each time `wave`
 * goes up, while `live`. Imperative on purpose: a declarative `animate`
 * keyed on the counter did not replay on a remounted SVG path in Motion 13.
 * If motion stops mid-wave (reduced motion switched on, the bird scrolled
 * away), the wing snaps back to rest rather than freezing half-raised.
 */
export function useWaveMotion<T extends Element>(
  wave: number | undefined,
  live: boolean,
  lift: number,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !live || !wave) return;
    const controls = animate(el, { rotate: waveKeyframes(lift) }, waveTransition);
    return () => {
      controls.stop();
      animate(el, { rotate: 0 }, { duration: 0 });
    };
  }, [wave, live, lift]);
  return ref;
}

/**
 * A mascot's wave, as a counter: each time it goes up, a mascot given it as
 * `wave` waves once. It goes up once shortly after the page appears (after
 * hydration, so the server's markup is the resting pose) and again on
 * hover, focus and tap of whatever `bind` is spread on. A wave already under
 * way is never restarted, so a restless pointer does not make it flail.
 * Under reduced motion the mascots ignore it (they only move when live).
 */
export function useWave({ greetAfterMs = 400 }: { greetAfterMs?: number | null } = {}): {
  wave: number;
  trigger: () => void;
  bind: {
    onPointerEnter: () => void;
    onPointerDown: () => void;
    onFocus: () => void;
  };
} {
  const [wave, setWave] = useState(0);
  const last = useRef(0);
  const trigger = useCallback(() => {
    const now = Date.now();
    if (now - last.current < WAVE_MS) return;
    last.current = now;
    setWave((n) => n + 1);
  }, []);
  useEffect(() => {
    if (greetAfterMs === null) return;
    const id = setTimeout(trigger, greetAfterMs);
    return () => clearTimeout(id);
  }, [greetAfterMs, trigger]);
  return {
    wave,
    trigger,
    bind: { onPointerEnter: trigger, onPointerDown: trigger, onFocus: trigger },
  };
}
