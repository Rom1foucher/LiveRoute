/**
 * The only DOM-aware area of `@glcp/core`. `core-purity.test.ts` forbids these
 * globals everywhere else under `src/`. Both applications run in a browser
 * engine, so both use this adapter; the desktop build layers a durable file
 * sink on top of it rather than replacing it.
 */
import type { DecisionLogEntry } from "../diagnostics/decision-log.ts";
import type {
  DecisionSink,
  DecisionSinkStatus,
} from "../ports/decision-sink.ts";
import type { DecisionSession } from "../ports/decision-session.ts";

const STORAGE_KEY = "grand-live-decision-log-v2";
const SESSION_KEY = "grand-live-decision-log-session-v2";
const SEQUENCE_KEY = "grand-live-decision-log-sequence-v2";

/** Bounded so a long session cannot exhaust the localStorage quota. */
const MAX_BROWSER_ENTRIES = 500;

/**
 * The entry count alone does not bound the quota: a single decision entry
 * carries its canonical diagnostics and observed offers, and real runs produce
 * entries from a few hundred bytes to over a hundred kilobytes. Five hundred of
 * them reach several megabytes, which is the whole localStorage budget for the
 * origin, so the log alone would starve every other key. The byte budget is the
 * binding limit; the entry count only caps an unrealistic run of tiny entries.
 */
const MAX_BROWSER_BYTES = 1_000_000;

const randomId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

const readEntries = (): DecisionLogEntry[] => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as DecisionLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toNdjson = (entries: readonly DecisionLogEntry[]): string => {
  const content = entries.map((entry) => JSON.stringify(entry)).join("\n");
  return content ? `${content}\n` : "";
};

/**
 * Keeps the most recent entries that fit the byte budget. The newest entry is
 * always kept, even when it exceeds the budget on its own: losing the decision
 * that is being written would hide exactly the state a bug report needs. The
 * serialised array is measured, so the returned list is what `setItem` stores.
 */
const withinBudget = (
  entries: readonly DecisionLogEntry[],
): DecisionLogEntry[] => {
  const bounded = entries.slice(-MAX_BROWSER_ENTRIES);
  let start = 0;
  while (
    start < bounded.length - 1 &&
    JSON.stringify(bounded.slice(start)).length > MAX_BROWSER_BYTES
  ) {
    start += 1;
  }
  return bounded.slice(start);
};

const statusOf = (): DecisionSinkStatus => {
  const entries = readEntries();
  const content = toNdjson(entries);
  return {
    path: STORAGE_KEY,
    storage: "browser",
    exists: content.length > 0,
    sizeBytes: content.length,
    entryCount: entries.length,
    maximumEntries: MAX_BROWSER_ENTRIES,
  };
};

export const browserDecisionSink = (): DecisionSink => ({
  initialize: async () => statusOf(),
  append: async (_line, entry) => {
    let next = withinBudget([...readEntries(), entry]);
    // A quota rejection can still happen when other keys already fill the
    // origin budget. Halving keeps the newest decisions rather than dropping
    // the whole write, and the run continues either way.
    while (next.length > 0) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        break;
      } catch {
        if (next.length === 1) break;
        next = next.slice(Math.ceil(next.length / 2));
      }
    }
    return statusOf();
  },
  read: async () => toNdjson(readEntries()),
  clear: async () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    return statusOf();
  },
  status: async () => statusOf(),
});

export const browserDecisionSession = (): DecisionSession => {
  let sequence = 0;
  return {
    id: () => {
      try {
        const current = window.sessionStorage.getItem(SESSION_KEY);
        if (current) return current;
        const created = randomId();
        window.sessionStorage.setItem(SESSION_KEY, created);
        return created;
      } catch {
        return `volatile-${randomId()}`;
      }
    },
    nextSequence: () => {
      try {
        const persisted = Number.parseInt(
          window.sessionStorage.getItem(SEQUENCE_KEY) ?? "0",
          10,
        );
        sequence =
          Math.max(sequence, Number.isFinite(persisted) ? persisted : 0) + 1;
        window.sessionStorage.setItem(SEQUENCE_KEY, String(sequence));
        return sequence;
      } catch {
        sequence += 1;
        return sequence;
      }
    },
  };
};

/** Turns NDJSON content into a download. Presentation concern, not engine. */
export const downloadDecisionLog = (content: string): void => {
  const blob = new Blob([content], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `grand-live-decision-log-${new Date()
    .toISOString()
    .slice(0, 10)}.ndjson`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
