import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { UI_EN } from "./ui-en.ts";
import { UI_FR, type Labels } from "./ui-fr.ts";
import { formatMessage, type Language } from "@glcp/core/i18n";
import type { Message } from "@glcp/core/i18n";

const STORAGE_KEY = "gl-language";

const CATALOGUES: Record<Language, Labels> = { fr: UI_FR, en: UI_EN };

const detectLanguage = (): Language => {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "fr" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  /** Static UI copy. */
  L: Labels;
  /** Solver / planner messages, rendered from their codes. */
  t: (message: Message) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // A saturated quota must not break the render; the language stays in
      // memory for this session.
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((value: Language) => {
    setLanguageState(value);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      L: CATALOGUES[language],
      t: (message: Message) => formatMessage(message, language),
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return value;
}

/** Shorthand for components that only need the static catalogue. */
export const useLabels = (): Labels => useLanguage().L;
