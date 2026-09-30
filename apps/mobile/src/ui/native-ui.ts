import type * as ExpoUiModule from "@expo/ui";
import type * as ExpoUiMenuModule from "@expo/ui/community/menu";
import type * as ExpoUiSegmentedControlModule from "@expo/ui/community/segmented-control";
import type * as ExpoUiSwiftUiModifiersModule from "@expo/ui/swift-ui/modifiers";
import { requireOptionalNativeModule } from "expo";

/**
 * The one place that knows about `@expo/ui`.
 *
 * `@expo/ui` renders SwiftUI on iOS and Jetpack Compose on Android through a
 * single native module called `ExpoUI`. Several of its entry points reach for
 * that module at **import** time — `@expo/ui/swift-ui/modifiers` calls
 * `requireNativeModule('ExpoUI')` at module scope, and the iOS build of the
 * universal `Switch` imports it — so a plain `import` at the top of a screen
 * crashes the bundle anywhere the module is not linked (a JS-only reload
 * against an older native build, a future web target). Every wrapper in this
 * folder therefore asks {@link nativeUiAvailable} first and pulls the package
 * in lazily, and renders the plain React Native control when the answer is no.
 *
 * See the library notes for the shapes these types are built from.
 */

export type ExpoUi = typeof ExpoUiModule;
export type ExpoUiMenu = typeof ExpoUiMenuModule;
export type ExpoUiSegmentedControl = typeof ExpoUiSegmentedControlModule;
export type ExpoUiSwiftUiModifiers = typeof ExpoUiSwiftUiModifiersModule;

/**
 * What "the native toolkit is here" means, given whatever
 * `requireOptionalNativeModule` handed back. Pure, so the spec can exercise
 * both branches without a native runtime.
 */
export function nativeUiFrom(module: unknown): boolean {
  return module !== null && module !== undefined;
}

let availability: boolean | undefined;

/** Whether `ExpoUI` is linked into this binary. Memoised; the answer cannot change at runtime. */
export function nativeUiAvailable(): boolean {
  if (availability === undefined) {
    try {
      availability = nativeUiFrom(requireOptionalNativeModule("ExpoUI"));
    } catch {
      availability = false;
    }
  }
  return availability;
}

/**
 * Runs `loader` only when the native module is there, and answers null — "use
 * the fallback" — when it is not, or when the import blows up anyway because
 * a sub-module of `@expo/ui` reached for `ExpoUI` and did not find it. Pure in
 * its inputs so the spec can drive both branches.
 */
export function loadWhenAvailable<T>(available: boolean, loader: () => T): T | null {
  if (!available) return null;
  try {
    return loader();
  } catch {
    return null;
  }
}

const load = <T>(loader: () => T): T | null => loadWhenAvailable(nativeUiAvailable(), loader);

let ui: ExpoUi | null | undefined;
let menu: ExpoUiMenu | null | undefined;
let segmented: ExpoUiSegmentedControl | null | undefined;
let modifiers: ExpoUiSwiftUiModifiers | null | undefined;

/** The universal components (`Host`, `Switch`, `BottomSheet`, …), or null. */
export function expoUi(): ExpoUi | null {
  ui ??= load(() => require("@expo/ui") as ExpoUi);
  return ui;
}

/** The native dropdown menu — our own view is the trigger, the popup is the platform's. */
export function expoUiMenu(): ExpoUiMenu | null {
  menu ??= load(() => require("@expo/ui/community/menu") as ExpoUiMenu);
  return menu;
}

/** UISegmentedControl on iOS, a Material 3 segmented button row on Android. */
export function expoUiSegmentedControl(): ExpoUiSegmentedControl | null {
  segmented ??= load(
    () => require("@expo/ui/community/segmented-control") as ExpoUiSegmentedControl,
  );
  return segmented;
}

/**
 * SwiftUI view modifiers. iOS only: on Android nothing consumes them, and the
 * module throws on import where `ExpoUI` is missing.
 */
export function expoUiSwiftUiModifiers(): ExpoUiSwiftUiModifiers | null {
  modifiers ??= load(() => require("@expo/ui/swift-ui/modifiers") as ExpoUiSwiftUiModifiers);
  return modifiers;
}

/**
 * Index of `selected` in `values`. A segmented control always has exactly one
 * segment chosen, so an unknown value falls back to the first.
 */
export function segmentIndex<T>(values: readonly T[], selected: T): number {
  const found = values.indexOf(selected);
  return found === -1 ? 0 : found;
}

/** The value a segment index stands for; null when the native side reports an index we do not have. */
export function segmentValue<T>(values: readonly T[], index: number): T | null {
  return values[index] ?? null;
}

/** Voice preferences, in the order they are offered. Mirrors apps/web's select. */
export const VOICE_PREFERENCES = ["any", "female", "male", "child"] as const;
export type VoicePreference = (typeof VOICE_PREFERENCES)[number];

/** A stored preference the server has never heard of still has to render as something. */
export function voicePreference(value: string | undefined): VoicePreference {
  return (VOICE_PREFERENCES as readonly string[]).includes(value ?? "")
    ? (value as VoicePreference)
    : "any";
}
