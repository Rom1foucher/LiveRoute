import {
  browserDecisionSink,
  downloadDecisionLog,
} from "@glcp/core/adapters/browser";
import type { DecisionSink, DecisionSinkStatus } from "@glcp/core/ports";
import {
  appendDecisionLogLine,
  clearDecisionLogFile,
  decisionLogStatus,
  initializeDecisionLogFile,
  openDecisionLogFolder,
  readDecisionLogFile,
} from "../vision/desktop.ts";

/**
 * Composed rather than substituted: the durable file is authoritative when the
 * Tauri runtime answers, and the browser store keeps working underneath it.
 * That matters because the desktop build runs `vite dev` in a plain browser
 * during development, where no Rust backend exists — the session still logs.
 *
 * Every file call is allowed to return `null`, which is how `vision/desktop.ts`
 * reports "not running under Tauri". A `null` is not an error, it is the signal
 * to fall back.
 */
export const tauriDecisionSink = (): DecisionSink => {
  const browser = browserDecisionSink();

  return {
    initialize: async () =>
      (await initializeDecisionLogFile()) ?? browser.initialize(),

    append: async (line, entry) => {
      const [file] = await Promise.all([
        appendDecisionLogLine(line),
        browser.append(line, entry),
      ]);
      return file ?? browser.status();
    },

    read: async () => (await readDecisionLogFile()) ?? browser.read(),

    clear: async () => {
      const [file] = await Promise.all([
        clearDecisionLogFile(),
        browser.clear(),
      ]);
      return file ?? browser.status();
    },

    status: async (): Promise<DecisionSinkStatus | null> =>
      (await decisionLogStatus()) ?? browser.status(),

    reveal: openDecisionLogFolder,
  };
};

export { downloadDecisionLog };
