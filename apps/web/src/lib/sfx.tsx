import type { SoundName } from "@molo/sfx";
import correctUrl from "@molo/sfx/sounds/correct.wav?url";
import crownUrl from "@molo/sfx/sounds/crown.wav?url";
import cueUrl from "@molo/sfx/sounds/cue.wav?url";
import lessonCompleteUrl from "@molo/sfx/sounds/lesson_complete.wav?url";
import levelUpUrl from "@molo/sfx/sounds/level_up.wav?url";
import perfectUrl from "@molo/sfx/sounds/perfect.wav?url";
import streakUrl from "@molo/sfx/sounds/streak.wav?url";
import tapUrl from "@molo/sfx/sounds/tap.wav?url";
import wrongUrl from "@molo/sfx/sounds/wrong.wav?url";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * UI sounds (docs/DESIGN.md "Sound"). One AudioContext, created on the
 * first gesture, decoded buffers cached per sound. `hold()` mutes effects
 * while a pronunciation clip plays: the word is the point, not the chime.
 * The on/off preference lives in localStorage under `molo.sound`.
 */

const URLS: Record<SoundName, string> = {
  correct: correctUrl,
  wrong: wrongUrl,
  tap: tapUrl,
  lesson_complete: lessonCompleteUrl,
  perfect: perfectUrl,
  streak: streakUrl,
  level_up: levelUpUrl,
  crown: crownUrl,
  cue: cueUrl,
};

const STORAGE_KEY = "molo.sound";

interface SfxApi {
  readonly enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Fire and forget; silently does nothing when off, held, or unsupported. */
  play: (name: SoundName) => void;
  /** Mute effects until the returned function is called (a clip is playing). */
  hold: () => () => void;
}

const Ctx = createContext<SfxApi | null>(null);

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function SfxProvider({ children }: { children: ReactNode }) {
  // SSR renders "on"; the client corrects after hydration so markup stays deterministic.
  const [enabled, setEnabledState] = useState(true);
  useEffect(() => setEnabledState(readEnabled()), []);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<SoundName, Promise<AudioBuffer>>());
  const holds = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const context = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctxRef.current ??= new Ctor();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const load = useCallback(
    (name: SoundName): Promise<AudioBuffer> | null => {
      const ctx = context();
      if (!ctx) return null;
      let p = buffers.current.get(name);
      if (!p) {
        p = fetch(URLS[name])
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b));
        buffers.current.set(name, p);
      }
      return p;
    },
    [context],
  );

  const play = useCallback(
    (name: SoundName) => {
      if (!enabledRef.current || holds.current > 0) return;
      const ctx = context();
      const p = load(name);
      if (!ctx || !p) return;
      p.then((buffer) => {
        if (!enabledRef.current || holds.current > 0) return false;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.9;
        src.connect(gain).connect(ctx.destination);
        src.start();
        return true;
      }).catch(() => undefined);
    },
    [context, load],
  );

  const hold = useCallback(() => {
    holds.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds.current = Math.max(0, holds.current - 1);
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      /* private mode */
    }
  }, []);

  const api = useMemo<SfxApi>(
    () => ({ enabled, setEnabled, play, hold }),
    [enabled, setEnabled, play, hold],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

const noop: SfxApi = {
  enabled: false,
  setEnabled: () => undefined,
  play: () => undefined,
  hold: () => () => undefined,
};

export function useSfx(): SfxApi {
  return useContext(Ctx) ?? noop;
}
