import {
  loadWhenAvailable,
  nativeUiFrom,
  segmentIndex,
  segmentValue,
  voicePreference,
  VOICE_PREFERENCES,
} from "./native-ui.ts";

/**
 * The two paths every wrapper in this folder has: the native one, where
 * `ExpoUI` is linked and `@expo/ui` renders SwiftUI or Jetpack Compose, and
 * the fallback, where the getters answer null and `Switch`, `Segmented`,
 * `MenuSelect` and `Sheet` render plain React Native. Both are decided here,
 * so both are tested here — no native runtime needed.
 *
 * (`jest-expo` mocks Expo's native modules, so the real `requireOptional-
 * NativeModule` answers "present" under Jest. That is why the decision is a
 * parameter rather than something the spec reads from the environment.)
 */

describe("nativeUiFrom", () => {
  it("treats a module handle as the native toolkit being present", () => {
    expect(nativeUiFrom({})).toBe(true);
    expect(nativeUiFrom({ name: "ExpoUI" })).toBe(true);
  });
  it("treats a missing module as absent", () => {
    expect(nativeUiFrom(null)).toBe(false);
    expect(nativeUiFrom(undefined)).toBe(false);
  });
});

describe("loadWhenAvailable", () => {
  it("hands back the native module when ExpoUI is linked", () => {
    const module = { Host: () => null };
    expect(loadWhenAvailable(true, () => module)).toBe(module);
  });
  it("never even imports @expo/ui when ExpoUI is missing", () => {
    let imported = false;
    const loaded = loadWhenAvailable(false, () => {
      imported = true;
      return {};
    });
    expect(loaded).toBeNull();
    expect(imported).toBe(false);
  });
  it("falls back rather than crashing when the import itself throws", () => {
    // `@expo/ui/swift-ui/modifiers` calls `requireNativeModule` at module
    // scope, so a stale JS bundle can still throw here (the library notes).
    expect(
      loadWhenAvailable(true, () => {
        throw new Error("Cannot find native module 'ExpoUI'");
      }),
    ).toBeNull();
  });
});

describe("segmentIndex", () => {
  it("finds the chosen segment", () => {
    expect(segmentIndex(["en", "nb"], "nb")).toBe(1);
  });
  it("falls back to the first segment for a value that is not offered", () => {
    expect(segmentIndex(["en", "nb"], "de")).toBe(0);
    expect(segmentIndex([], "en")).toBe(0);
  });
});

describe("segmentValue", () => {
  it("maps the native index back to our value", () => {
    expect(segmentValue(["en", "nb"], 1)).toBe("nb");
  });
  it("answers null for an index we do not have", () => {
    expect(segmentValue(["en", "nb"], 5)).toBeNull();
    expect(segmentValue(["en", "nb"], -1)).toBeNull();
  });
});

describe("voicePreference", () => {
  it("keeps every preference the API offers", () => {
    for (const v of VOICE_PREFERENCES) expect(voicePreference(v)).toBe(v);
  });
  it("falls back to any voice for a speaker id or a missing value", () => {
    expect(voicePreference("8f0b1a2c-speaker")).toBe("any");
    expect(voicePreference(undefined)).toBe("any");
    expect(voicePreference("")).toBe("any");
  });
});
