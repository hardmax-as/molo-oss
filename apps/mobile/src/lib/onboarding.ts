import AsyncStorage from "@react-native-async-storage/async-storage";

import { putPrefs } from "./api.ts";

export {
  GOAL_PRESETS,
  nextStep,
  onboardingClickUrl,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "./onboarding-steps.ts";

/**
 * First-run onboarding state. Signed-in learners carry `onboardedAt` on the
 * server; guests carry a flag here. Choices made as a guest are parked in
 * `molo.onboarding_prefs` and pushed to the server right after the first
 * sign-in, so nothing the learner chose is lost.
 */
const FLAG = "molo.onboarded";
const PENDING = "molo.onboarding_prefs";

export interface OnboardingChoices {
  readonly sourceLang?: "en" | "nb";
  readonly dailyGoalXp?: number;
  readonly listeningEnabled?: boolean;
  readonly speakingEnabled?: boolean;
}

export async function localOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG)) === "1";
  } catch {
    return true; // storage unavailable: never trap the learner in onboarding
  }
}

/** Marks onboarding done: server when signed in (with the choices), device otherwise. */
export async function finishOnboarding(
  choices: OnboardingChoices,
  signedIn: boolean,
): Promise<void> {
  try {
    await AsyncStorage.setItem(FLAG, "1");
    if (signedIn) {
      await putPrefs({ ...choices, onboarded: true });
    } else {
      await AsyncStorage.setItem(PENDING, JSON.stringify(choices));
    }
  } catch {
    /* best effort; the flag is what matters */
  }
}

/** Settings → "Show the intro again": clears the device flag so the welcome flow runs once more. */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FLAG);
  } catch {
    /* nothing to reset */
  }
}

/** After sign-in: push choices a guest made during onboarding, then forget them. */
export async function flushPendingOnboarding(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING);
    if (!raw) return;
    await putPrefs({ ...(JSON.parse(raw) as OnboardingChoices), onboarded: true });
    await AsyncStorage.removeItem(PENDING);
  } catch {
    /* retried on the next sign-in */
  }
}
