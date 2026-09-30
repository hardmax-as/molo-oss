import { createI18n, isUiLanguage, type TranslationKey, type UiLanguage } from "@molo/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

/**
 * UI language: device locale first, then the learner's stored choice.
 * Stored in AsyncStorage, not SecureStore: it is a preference, not a secret,
 * and the keychain is for session cookies.
 */
const STORAGE_KEY = "molo.lang";

interface LangContext {
  lang: UiLanguage;
  setLang: (l: UiLanguage) => void;
  ready: boolean;
}

const Ctx = createContext<LangContext | null>(null);

export function deviceLanguage(): UiLanguage {
  const code = getLocales()[0]?.languageCode?.toLowerCase() ?? "en";
  return code === "nb" || code === "no" || code === "nn" ? "nb" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(deviceLanguage());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isUiLanguage(stored)) setLangState(stored);
      } catch {
        // No stored preference (or storage unavailable): keep the device language.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const i18n = useMemo(() => createI18n(lang), [lang]);
  const value = useMemo<LangContext>(
    () => ({
      lang,
      ready,
      setLang: (l) => {
        setLangState(l);
        AsyncStorage.setItem(STORAGE_KEY, l).catch(() => undefined);
      },
    }),
    [lang, ready],
  );
  return (
    <Ctx.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </Ctx.Provider>
  );
}

export function useLang(): LangContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang outside I18nProvider");
  return v;
}

/** Typed `t`: only keys that exist in en.json compile. */
export function useT() {
  const { t } = useTranslation();
  return (key: TranslationKey, opts?: Record<string, unknown>) =>
    (opts ? t(key, opts) : t(key)) as string;
}

/**
 * Unit and skill title keys arrive from the API, so they cannot be typed.
 * A missing key falls back to the slug instead of leaking the raw key.
 */
export function useContentTitle() {
  const { t, i18n } = useTranslation();
  return (key: string, fallback: string) =>
    i18n.exists(key) ? (t(key as never) as string) : fallback;
}
