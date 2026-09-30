import { createI18n, isUiLanguage, type TranslationKey, type UiLanguage } from "@molo/i18n";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

const STORAGE_KEY = "molo.lang";

interface LangContext {
  lang: UiLanguage;
  setLang: (l: UiLanguage) => void;
}

const Ctx = createContext<LangContext | null>(null);

export function detectLanguage(): UiLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isUiLanguage(stored)) return stored;
  } catch {
    /* private mode */
  }
  return navigator.language.toLowerCase().startsWith("nb") ||
    navigator.language.toLowerCase().startsWith("no")
    ? "nb"
    : "en";
}

/**
 * `<html lang>` follows the live UI language (WCAG 3.1.1). The root renders
 * it once from the detected preference; the header switch changes the
 * language here, below the root, so this keeps the document in step without
 * a reload or a remount of the whole app (W09).
 */
export function syncDocumentLang(
  doc: { documentElement: { lang: string } } | undefined,
  lang: UiLanguage,
): void {
  if (doc && doc.documentElement.lang !== lang) doc.documentElement.lang = lang;
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial: UiLanguage }) {
  const [lang, setLangState] = useState<UiLanguage>(initial);
  const i18n = useMemo(() => createI18n(lang), [lang]);
  useEffect(() => syncDocumentLang(document, lang), [lang]);
  const value = useMemo<LangContext>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        try {
          window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* ignore */
        }
      },
    }),
    [lang],
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
