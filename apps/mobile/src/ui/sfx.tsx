import type { SoundName } from "@molo/sfx";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { usePrefs } from "~/lib/prefs.tsx";

/**
 * UI sounds from packages/sfx, bundled by Metro (the monorepo root is a
 * watch folder in SDK 57). One player per sound, created on first use.
 * Rules from docs/DESIGN.md: a settings toggle mutes everything, and
 * nothing plays over a pronunciation clip; AudioButton flags clip
 * playback through `setClipPlaying`.
 */
const sources: Record<SoundName, number> = {
  correct: require("../../../../packages/sfx/sounds/correct.wav"),
  wrong: require("../../../../packages/sfx/sounds/wrong.wav"),
  tap: require("../../../../packages/sfx/sounds/tap.wav"),
  lesson_complete: require("../../../../packages/sfx/sounds/lesson_complete.wav"),
  perfect: require("../../../../packages/sfx/sounds/perfect.wav"),
  streak: require("../../../../packages/sfx/sounds/streak.wav"),
  level_up: require("../../../../packages/sfx/sounds/level_up.wav"),
  crown: require("../../../../packages/sfx/sounds/crown.wav"),
  cue: require("../../../../packages/sfx/sounds/cue.wav"),
};

interface Sfx {
  play: (name: SoundName) => void;
  setClipPlaying: (playing: boolean) => void;
  enabled: boolean;
}

const Ctx = createContext<Sfx>({
  play: () => undefined,
  setClipPlaying: () => undefined,
  enabled: false,
});

export function SfxProvider({ children }: { children: ReactNode }) {
  const { sound } = usePrefs();
  const players = useRef<Partial<Record<SoundName, AudioPlayer>>>({});
  const clip = useRef(false);

  useEffect(() => {
    const current = players.current;
    return () => {
      for (const p of Object.values(current)) p?.remove();
    };
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!sound || clip.current) return;
      try {
        let p = players.current[name];
        if (!p) {
          p = createAudioPlayer(sources[name]);
          players.current[name] = p;
        }
        void p.seekTo(0);
        p.play();
      } catch {
        // A missing asset or an audio session hiccup must never break a lesson.
      }
    },
    [sound],
  );

  const value = useMemo<Sfx>(
    () => ({
      play,
      setClipPlaying: (playing) => {
        clip.current = playing;
      },
      enabled: sound,
    }),
    [play, sound],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSfx(): Sfx {
  return useContext(Ctx);
}

/** Pure mapping used by tests and by the runner: which sound a moment gets. */
export function soundFor(
  moment:
    | "correct"
    | "wrong"
    | "tap"
    | "finish"
    | "perfect"
    | "streak"
    | "levelUp"
    | "crown"
    | "cue",
): SoundName {
  switch (moment) {
    case "finish":
      return "lesson_complete";
    case "levelUp":
      return "level_up";
    default:
      return moment;
  }
}
