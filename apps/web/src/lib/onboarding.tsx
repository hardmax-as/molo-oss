import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { putPrefs } from "./api.ts";
import { useMe } from "./session.tsx";

const KEY = "molo.onboarded";
const DRAFT = "molo.onboarding-draft";

export interface OnboardingChoices {
  sourceLang: "en" | "nb";
  dailyGoalXp: number;
  listening: boolean;
  speaking: boolean;
}

/**
 * Whether the first-run flow is done. A signed-in learner's server flag
 * wins; otherwise the browser remembers. `null` while unknown (SSR, first
 * paint) so the home page does not flash before redirecting.
 */
export function useOnboarded(): boolean | null {
  const me = useMe();
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setLocal(localStorage.getItem(KEY) === "1");
    } catch {
      setLocal(true);
    }
  }, []);
  if (me.isPending || local === null) return null;
  if (me.data) return me.data.prefs.onboardedAt !== null || local;
  return local;
}

function readDraft(): OnboardingChoices | null {
  try {
    const raw = localStorage.getItem(DRAFT);
    return raw ? (JSON.parse(raw) as OnboardingChoices) : null;
  } catch {
    return null;
  }
}

function prefsFrom(choices: OnboardingChoices | null) {
  return choices
    ? {
        sourceLang: choices.sourceLang,
        dailyGoalXp: choices.dailyGoalXp,
        listeningEnabled: choices.listening,
        speakingEnabled: choices.speaking,
      }
    : {};
}

/** Marks onboarding done locally and, when signed in, on the server together with the choices. */
export function useFinishOnboarding() {
  const me = useMe();
  const qc = useQueryClient();
  return useCallback(
    async (choices: OnboardingChoices | null) => {
      try {
        localStorage.setItem(KEY, "1");
        if (choices) localStorage.setItem(DRAFT, JSON.stringify(choices));
      } catch {
        // private mode: the server flag still covers signed-in learners
      }
      if (me.data) {
        await putPrefs({ onboarded: true, ...prefsFrom(choices) });
        await qc.invalidateQueries({ queryKey: ["me"] });
      }
    },
    [me.data, qc],
  );
}

/**
 * After a guest signs up: apply the draft choices once and mark onboarded
 * on the server, so the flow does not show again on another device.
 */
export function useSyncOnboardingDraft() {
  const me = useMe();
  const qc = useQueryClient();
  useEffect(() => {
    if (!me.data || me.data.prefs.onboardedAt !== null) return;
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(KEY) === "1";
    } catch {
      return;
    }
    if (!onboarded) return;
    void putPrefs({ onboarded: true, ...prefsFrom(readDraft()) }).then(() =>
      qc.invalidateQueries({ queryKey: ["me"] }),
    );
  }, [me.data, qc]);
}
