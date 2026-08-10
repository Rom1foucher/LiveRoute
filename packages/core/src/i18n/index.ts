import { renderEn } from "./en.ts";
import { renderFr } from "./fr.ts";
import type { Message } from "./messages.ts";

export type Language = "fr" | "en";

export const LANGUAGES: readonly Language[] = ["fr", "en"] as const;

export const DEFAULT_LANGUAGE: Language = "fr";

const RENDERERS: Record<Language, (message: Message) => string> = {
  fr: renderFr,
  en: renderEn,
};

export const formatMessage = (
  message: Message,
  language: Language = DEFAULT_LANGUAGE,
): string => RENDERERS[language](message);

export const formatMessages = (
  messages: readonly Message[],
  language: Language = DEFAULT_LANGUAGE,
): string[] => messages.map((message) => formatMessage(message, language));

export type { Message } from "./messages.ts";
export { sameMessage } from "./messages.ts";
