/**
 * The knobs store, and the banner that admits it is on.
 *
 * DEVELOPER-ONLY. Everything here is inert until the gate has said yes — a
 * development build, or an `admin` account (`access.ts`) — so a release
 * build in a learner's hands resolves every value to the shipped constant
 * and renders no banner. The model, and the reasoning about what an
 * override may and may not touch, is in `knobs.ts`.
 *
 * Storage is `AsyncStorage`, which is this install and this install only —
 * the same place the sound and reduce-motion preferences live
 * (`~/lib/prefs.tsx`). The server is never told and never asked.
 *
 * The one real difference from the web panel: `localStorage` is synchronous
 * and `AsyncStorage` is not, so the record is read once at start into a
 * module-level cache and every read after that is synchronous. A write
 * updates the cache and notifies immediately, then persists in the
 * background — a knob must move the screen on the same frame it was turned.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import {
  ARMED_KEY,
  DEFAULT_TUNING,
  isOverriding,
  NO_OVERRIDES,
  overrideCount,
  parseKnobState,
  resolveTuning,
  serialiseKnobState,
  STORAGE_KEY,
  type FakeState,
  type KnobId,
  type KnobState,
  type Tuning,
} from "./knobs.ts";
import { DEV_STRINGS } from "./strings.ts";

const S = DEV_STRINGS.knobs;

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
/** Written only by `armKnobs`; `__DEV__` short-circuits it entirely. */
let armed = false;
let stateCache: KnobState = NO_OVERRIDES;

function emit(): void {
  for (const l of listeners) l();
}

/** Whether an override may apply at all. */
export function knobsArmed(): boolean {
  return __DEV__ || armed;
}

/**
 * Reads the record once, at start. Cheap — one `multiGet` — and it has to
 * happen before the first screen renders, because everything downstream of
 * here is synchronous. A failure leaves the shipped constants in place.
 */
export async function hydrateKnobs(): Promise<void> {
  try {
    const entries = await AsyncStorage.multiGet([ARMED_KEY, STORAGE_KEY]);
    const map = new Map(entries);
    armed = map.get(ARMED_KEY) === "1";
    stateCache = knobsArmed() ? parseKnobState(map.get(STORAGE_KEY) ?? null) : NO_OVERRIDES;
  } catch {
    stateCache = NO_OVERRIDES;
  }
  emit();
}

/**
 * Called by the developer screen once it knows the answer, in both
 * directions. That is the only place the flag is ever written, so on a
 * release build an override can only apply to an account the gate has
 * called `admin` — and stops applying the moment it stops saying so.
 */
export function armKnobs(allowed: boolean): void {
  if (allowed === armed) return;
  armed = allowed;
  if (!allowed) stateCache = NO_OVERRIDES;
  void (allowed ? AsyncStorage.setItem(ARMED_KEY, "1") : AsyncStorage.removeItem(ARMED_KEY)).catch(
    () => undefined,
  );
  if (allowed) void hydrateKnobs();
  else emit();
}

function readState(): KnobState {
  return knobsArmed() ? stateCache : NO_OVERRIDES;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useKnobState(): KnobState {
  return useSyncExternalStore(subscribe, readState);
}

export function writeKnobState(next: KnobState): void {
  if (!knobsArmed()) return;
  stateCache = next;
  emit();
  void AsyncStorage.setItem(STORAGE_KEY, serialiseKnobState(next)).catch(() => undefined);
}

export function resetKnobs(): void {
  stateCache = NO_OVERRIDES;
  emit();
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}

/** Everything the panel needs: the state, and the ways to change it. */
export function useKnobs() {
  const state = useKnobState();
  const setKnob = useCallback(
    (id: KnobId, value: number | null) => {
      const overrides = { ...state.overrides };
      if (value === null) delete overrides[id];
      else overrides[id] = value;
      writeKnobState({ ...state, overrides });
    },
    [state],
  );
  const setFake = useCallback(
    (patch: Partial<FakeState>) => writeKnobState({ ...state, fake: { ...state.fake, ...patch } }),
    [state],
  );
  return {
    state,
    tuning: resolveTuning(state),
    active: isOverriding(state),
    count: overrideCount(state),
    setKnob,
    setFake,
    reset: resetKnobs,
  };
}

/**
 * The resolved numbers. Every screen that shows one of them reads this
 * rather than the constant, so the gallery and the real app agree — which
 * is the whole point of the panel.
 */
export function useTuning(): Tuning {
  const state = useKnobState();
  return state === NO_OVERRIDES ? DEFAULT_TUNING : resolveTuning(state);
}

/** The fabricated learner state, if any. */
export function useFakeState(): FakeState {
  return useKnobState().fake;
}

/**
 * The resolved numbers, read at the moment they are needed rather than
 * subscribed to. For the inside of an event handler — scoring an answer —
 * which is where the exercises reach for XP: the value that matters is the
 * one in force when the button was pressed. Everything that *displays* a
 * number uses `useTuning`.
 */
export function currentTuning(): Tuning {
  const state = readState();
  return state === NO_OVERRIDES ? DEFAULT_TUNING : resolveTuning(state);
}

/** The developer gate, arming the store in both directions. */
export function useArmKnobs(allowed: boolean): void {
  useEffect(() => {
    armKnobs(allowed);
  }, [allowed]);
}

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------

/**
 * Mounted by the root layout. It renders only while something is
 * overridden, which is the point: nobody should spend an hour debugging a
 * screen that a stale knob is driving. One tap clears the lot.
 *
 * It sits at the bottom because the toast pill already owns the top, and in
 * the full-window overlay on iOS for the same reason the pill does — the
 * sign-in and Plus sheets are native modals above the root view.
 */
export function KnobsBanner() {
  const state = useKnobState();
  const insets = useSafeAreaInsets();
  if (!isOverriding(state)) return null;
  const bar = (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12, zIndex: 60 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${S.bannerTitle} ${S.bannerCount(overrideCount(state))} ${S.reset}`}
        onPress={resetKnobs}
        className="min-h-11 flex-row items-center gap-2 rounded-full bg-sun px-4 py-2"
        testID="knobs-banner"
      >
        <Text className="font-body-bold text-xs text-indigo" numberOfLines={1}>
          {S.bannerTitle}
        </Text>
        <Text className="flex-1 font-body text-xs text-indigo" numberOfLines={1}>
          {S.bannerCount(overrideCount(state))} {S.bannerServer}
        </Text>
        <Text className="font-body-bold text-xs text-indigo underline">{S.reset}</Text>
      </Pressable>
    </View>
  );
  return Platform.OS === "ios" ? <FullWindowOverlay>{bar}</FullWindowOverlay> : bar;
}
