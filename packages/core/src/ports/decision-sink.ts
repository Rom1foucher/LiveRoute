import type { DecisionLogEntry } from "../diagnostics/decision-log.ts";

/**
 * Where a decision log line is durably written. The engine owns the entry
 * schema and the sequencing; it never owns the storage.
 *
 * `storage` distinguishes the three concrete backings shipped today: a portable
 * file next to the executable, the OS application log directory, and browser
 * storage. Any future sink adds a member here rather than a branch in the log.
 */
export type DecisionSinkStatus = {
  path: string;
  storage: "portable" | "app-log" | "browser";
  exists: boolean;
  sizeBytes: number;
  /**
   * Only a bounded sink reports these. A durable file has no entry ceiling, so
   * the footer shows a size instead of a count when they are absent.
   */
  entryCount?: number;
  maximumEntries?: number;
};

export interface DecisionSink {
  /** Called once at application start. May return null when unavailable. */
  initialize(): Promise<DecisionSinkStatus | null>;
  /**
   * `line` is the NDJSON serialisation of `entry`. Both are passed so a sink can
   * choose between appending raw text and keeping structured entries.
   */
  append(
    line: string,
    entry: DecisionLogEntry,
  ): Promise<DecisionSinkStatus | null>;
  /** Full log content as NDJSON, or null when the sink cannot read it back. */
  read(): Promise<string | null>;
  clear(): Promise<DecisionSinkStatus | null>;
  status(): Promise<DecisionSinkStatus | null>;
  /** Optional: reveal the log location to the user. Desktop only. */
  reveal?(): Promise<void>;
}

/** Used until an application calls `configureDecisionLog`. Discards everything. */
export const nullDecisionSink: DecisionSink = {
  initialize: async () => null,
  append: async () => null,
  read: async () => null,
  clear: async () => null,
  status: async () => null,
};
