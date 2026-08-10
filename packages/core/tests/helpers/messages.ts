import { formatMessage, formatMessages } from "../../src/i18n/index.ts";
import type { Message, MessageCode } from "../../src/i18n/messages.ts";

/**
 * Two ways to assert on engine output, and the distinction matters.
 *
 * `codes()` checks *which* reason fired. It is stable across rewording, so it
 * is the default for behavioural regressions: the test says the solver
 * abandoned the hunt, not how the sentence reads today.
 *
 * `fr()` renders the message and is used only when the assertion is about an
 * interpolated value (a token count, a song name), which also exercises the
 * renderer itself.
 */
export const codes = (messages: readonly Message[]): MessageCode[] =>
  messages.map((message) => message.code);

export const hasCode = (
  messages: readonly Message[],
  code: MessageCode,
): boolean => codes(messages).includes(code);

export const fr = (message: Message | undefined | null): string =>
  message ? formatMessage(message, "fr") : "";

export const frAll = (messages: readonly Message[]): string =>
  formatMessages(messages, "fr").join(" ");

/** Placeholder for fixtures that need a well-formed message they never read. */
export const FIXTURE_MESSAGE: Message = { code: "reserve.noNearbyTarget" };
