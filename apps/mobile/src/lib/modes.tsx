import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { putPrefs } from "./api.ts";
import { useMe } from "./session.tsx";

/**
 * Exercise modes: listening and speaking can be switched off (a bus, a
 * library). Signed-in learners keep the choice on the server
 * (`/me` prefs, same keys as web); anonymous ones keep it in AsyncStorage.
 * A session-only "quiet mode" from the lesson header overrides listening
 * without persisting anything.
 */
export interface Modes {
  readonly listening: boolean;
  readonly speaking: boolean;
}

interface ModesContext extends Modes {
  /** Persisted preference (server or device). */
  setMode: (kind: keyof Modes, on: boolean) => void;
  /** Session-only override for listening; null means "follow the preference". */
  quiet: boolean | null;
  setQuiet: (on: boolean | null) => void;
}

const KEY = "molo.modes";

const Ctx = createContext<ModesContext>({
  listening: true,
  speaking: true,
  setMode: () => undefined,
  quiet: null,
  setQuiet: () => undefined,
});

export function ModesProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Modes>({ listening: true, speaking: true });
  const [quiet, setQuiet] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw)
          setLocal({ listening: true, speaking: true, ...(JSON.parse(raw) as Partial<Modes>) });
        return null;
      })
      .catch(() => undefined);
  }, []);
  const server = me.data?.prefs;
  const base: Modes = {
    listening: server?.listeningEnabled ?? local.listening,
    speaking: server?.speakingEnabled ?? local.speaking,
  };
  const value = useMemo<ModesContext>(
    () => ({
      listening: quiet === null ? base.listening : !quiet,
      speaking: base.speaking,
      quiet,
      setQuiet,
      setMode: (kind, on) => {
        const next = { ...base, [kind]: on };
        setLocal(next);
        AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
        if (me.data) {
          putPrefs(kind === "listening" ? { listeningEnabled: on } : { speakingEnabled: on })
            .then(() => qc.invalidateQueries({ queryKey: ["me"] }))
            .catch(() => undefined);
        }
      },
    }),
    // base is derived from me.data and local; listing its parts keeps the memo honest.
    [base.listening, base.speaking, quiet, me.data, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModes(): ModesContext {
  return useContext(Ctx);
}
