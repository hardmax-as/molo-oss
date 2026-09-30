import { DEFAULT_MODES, type Modes } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { putPrefs } from "./api.ts";
import { useMe } from "./session.tsx";

const KEY = "molo.modes";

function readLocal(): Modes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_MODES;
    const v = JSON.parse(raw) as Partial<Modes>;
    return { listening: v.listening ?? true, speaking: v.speaking ?? true };
  } catch {
    return DEFAULT_MODES;
  }
}

/**
 * Listening and speaking modes: server prefs for a signed-in learner,
 * localStorage otherwise. The lesson runner and the settings page share it.
 */
export function useModes(): {
  modes: Modes;
  set: (patch: Partial<Modes>) => Promise<void>;
  saving: boolean;
} {
  const me = useMe();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Modes>(() =>
    typeof window === "undefined" ? DEFAULT_MODES : readLocal(),
  );
  const [saving, setSaving] = useState(false);
  const modes: Modes = me.data
    ? { listening: me.data.prefs.listeningEnabled, speaking: me.data.prefs.speakingEnabled }
    : local;
  const set = useCallback(
    async (patch: Partial<Modes>) => {
      if (me.data) {
        setSaving(true);
        try {
          await putPrefs({
            ...(patch.listening !== undefined ? { listeningEnabled: patch.listening } : {}),
            ...(patch.speaking !== undefined ? { speakingEnabled: patch.speaking } : {}),
          });
          await qc.invalidateQueries({ queryKey: ["me"] });
        } finally {
          setSaving(false);
        }
        return;
      }
      const next = { ...local, ...patch };
      setLocal(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // private mode: keep it in memory for this page
      }
    },
    [me.data, local, qc],
  );
  return { modes, set, saving };
}
