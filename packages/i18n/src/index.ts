/**
 * UI strings for both source languages (the project rules: never hard-code
 * copy). Keys are typed from the English file; `nb` must carry every key,
 * which `keys.test.ts` asserts.
 */

import type { i18n as I18n } from "i18next";
import { createInstance } from "i18next";

import en from "./locales/en.json" with { type: "json" };
import nb from "./locales/nb.json" with { type: "json" };

export const resources = {
  en: { translation: en },
  nb: { translation: nb },
} as const;

export const UI_LANGUAGES = ["en", "nb"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

type Leaves<T, P extends string = ""> = T extends string
  ? P
  : {
      [K in keyof T & string]: Leaves<T[K], P extends "" ? K : `${P}.${K}`>;
    }[keyof T & string];

/** Every dotted key in en.json, e.g. `"lesson.check"`. */
export type TranslationKey = Leaves<typeof en>;

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "en" || value === "nb";
}

/** Creates an isolated i18next instance (one per request on the server, one per app on the client). */
export function createI18n(lng: UiLanguage): I18n {
  const instance = createInstance();
  void instance.init({
    resources,
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

/** Flattens a locale object to dotted keys, for completeness checks. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}
