import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Device-side preferences (not secrets, not server prefs): sound on/off and
 * the reduce-motion override. Server-side prefs (daily goal, source language,
 * preferred voice) live behind PUT /me/prefs.
 */
const SOUND_KEY = "molo.sound";
/** Same key and same values as apps/web, so the two settings screens read alike. */
const MOTION_KEY = "molo.motion";

/** `true` shortens everything, `false` keeps full motion, `null` follows the OS. */
export type MotionOverride = boolean | null;

interface Prefs {
  sound: boolean;
  setSound: (on: boolean) => void;
  /** What the learner chose in settings; `null` until they choose. */
  motion: MotionOverride;
  setMotion: (value: MotionOverride) => void;
}

const Ctx = createContext<Prefs>({
  sound: true,
  setSound: () => undefined,
  motion: null,
  setMotion: () => undefined,
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [sound, setSoundState] = useState(true);
  const [motion, setMotionState] = useState<MotionOverride>(null);
  useEffect(() => {
    AsyncStorage.multiGet([SOUND_KEY, MOTION_KEY])
      .then((entries) => {
        for (const [key, value] of entries) {
          if (key === SOUND_KEY && value === "off") setSoundState(false);
          if (key === MOTION_KEY && (value === "reduced" || value === "full"))
            setMotionState(value === "reduced");
        }
        return null;
      })
      .catch(() => undefined);
  }, []);
  const value = useMemo<Prefs>(
    () => ({
      sound,
      setSound: (on) => {
        setSoundState(on);
        AsyncStorage.setItem(SOUND_KEY, on ? "on" : "off").catch(() => undefined);
      },
      motion,
      setMotion: (next) => {
        setMotionState(next);
        const write =
          next === null
            ? AsyncStorage.removeItem(MOTION_KEY)
            : AsyncStorage.setItem(MOTION_KEY, next ? "reduced" : "full");
        write.catch(() => undefined);
      },
    }),
    [sound, motion],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(Ctx);
}
