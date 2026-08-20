import { readFile } from "node:fs/promises";

export type GoldenReviewStatus =
  | "accepted"
  | "suspected-bug"
  | "confirmed-bug"
  | "unknown";

export type GoldenSource = {
  id: string;
  fileName: string;
  note?: string;
};

export type GoldenRun = {
  id: string;
  sourceId: string;
  sessionId: string;
  sequenceRange?: readonly [number, number];
  reviewStatus: GoldenReviewStatus;
  note?: string;
};

export type GoldenCheckpoint = {
  id: string;
  runId: string;
  category: string;
  reviewStatus: GoldenReviewStatus;
  selector: {
    event: "recommendation" | "choice" | "snapshot" | "pipeline";
    sequence: number;
    stateHash: string;
  };
  expect?: {
    choiceKind?: string;
    choiceId?: string;
    matchedRecommendation?: boolean;
    recommendationNormal?: string;
    terminalCandidateId?: string;
    terminalAction?: "expose-and-carry" | "stop-now";
  };
  reason: string;
};

export type GoldenManifest = {
  manifestVersion: 1;
  id: string;
  baseline: {
    releaseTag: string;
    commit: string;
    policyVersion: string;
    ruleSetId: string;
    note?: string;
  };
  sources: GoldenSource[];
  excludedSessions?: Array<{ sessionId: string; reason: string }>;
  runs: GoldenRun[];
  checkpoints: GoldenCheckpoint[];
  knownNonGoldenPatterns?: Array<{ kind: string; reason: string }>;
};

type LogEntry = Record<string, unknown> & {
  schemaVersion?: unknown;
  policyVersion?: unknown;
  ruleSetId?: unknown;
  sessionId?: unknown;
  sequence?: unknown;
  stateHash?: unknown;
  event?: unknown;
  timestamp?: unknown;
  state?: unknown;
  stateAfter?: unknown;
  stateAfterHash?: unknown;
  recommendation?: unknown;
  choice?: unknown;
};

export type GoldenEvidenceCheckpoint = {
  id: string;
  runId: string;
  category: string;
  reviewStatus: GoldenReviewStatus;
  reason: string;
  sourceId: string;
  sourceFile: string;
  selector: GoldenCheckpoint["selector"];
  evidence: {
    schemaVersion: unknown;
    policyVersion: unknown;
    ruleSetId: unknown;
    sessionId: unknown;
    sequence: unknown;
    stateHash: unknown;
    timestamp: unknown;
    state: unknown;
    stateAfter: unknown;
    stateAfterHash: unknown;
    recommendation: unknown;
    choice: unknown;
  };
};

export type GoldenEvidenceSnapshot = {
  snapshotVersion: 1;
  manifestId: string;
  baseline: GoldenManifest["baseline"];
  checkpoints: GoldenEvidenceCheckpoint[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const reviewStatuses = new Set<GoldenReviewStatus>([
  "accepted",
  "suspected-bug",
  "confirmed-bug",
  "unknown",
]);

const eventKinds = new Set([
  "recommendation",
  "choice",
  "snapshot",
  "pipeline",
]);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`golden manifest: ${label} must be a non-empty string`);
  }
  return value;
};

const requireInteger = (value: unknown, label: string): number => {
  if (!Number.isInteger(value)) {
    throw new Error(`golden manifest: ${label} must be an integer`);
  }
  return value as number;
};

export const assertGoldenManifest = (
  value: unknown,
): asserts value is GoldenManifest => {
  if (!isRecord(value) || value.manifestVersion !== 1) {
    throw new Error("golden manifest: unsupported or missing manifestVersion");
  }
  requireString(value.id, "id");
  if (!isRecord(value.baseline)) {
    throw new Error("golden manifest: baseline is required");
  }
  for (const key of [
    "releaseTag",
    "commit",
    "policyVersion",
    "ruleSetId",
  ] as const) {
    requireString(value.baseline[key], `baseline.${key}`);
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new Error("golden manifest: sources must be a non-empty array");
  }
  if (!Array.isArray(value.runs) || value.runs.length === 0) {
    throw new Error("golden manifest: runs must be a non-empty array");
  }
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length === 0) {
    throw new Error("golden manifest: checkpoints must be a non-empty array");
  }

  const sourceIds = new Set<string>();
  for (const [index, raw] of value.sources.entries()) {
    if (!isRecord(raw)) {
      throw new Error(`golden manifest: sources[${index}] invalid`);
    }
    const id = requireString(raw.id, `sources[${index}].id`);
    requireString(raw.fileName, `sources[${index}].fileName`);
    if (sourceIds.has(id)) {
      throw new Error(`golden manifest: duplicate source id ${id}`);
    }
    sourceIds.add(id);
  }

  const runIds = new Set<string>();
  for (const [index, raw] of value.runs.entries()) {
    if (!isRecord(raw)) {
      throw new Error(`golden manifest: runs[${index}] invalid`);
    }
    const id = requireString(raw.id, `runs[${index}].id`);
    const sourceId = requireString(raw.sourceId, `runs[${index}].sourceId`);
    requireString(raw.sessionId, `runs[${index}].sessionId`);
    if (!sourceIds.has(sourceId)) {
      throw new Error(
        `golden manifest: run ${id} references unknown source ${sourceId}`,
      );
    }
    if (!reviewStatuses.has(raw.reviewStatus as GoldenReviewStatus)) {
      throw new Error(`golden manifest: run ${id} has invalid reviewStatus`);
    }
    if (raw.sequenceRange !== undefined) {
      if (
        !Array.isArray(raw.sequenceRange) ||
        raw.sequenceRange.length !== 2 ||
        !Number.isInteger(raw.sequenceRange[0]) ||
        !Number.isInteger(raw.sequenceRange[1]) ||
        Number(raw.sequenceRange[0]) > Number(raw.sequenceRange[1])
      ) {
        throw new Error(`golden manifest: run ${id} has invalid sequenceRange`);
      }
    }
    if (runIds.has(id)) {
      throw new Error(`golden manifest: duplicate run id ${id}`);
    }
    runIds.add(id);
  }

  const checkpointIds = new Set<string>();
  const selectorKeys = new Set<string>();
  for (const [index, raw] of value.checkpoints.entries()) {
    if (!isRecord(raw)) {
      throw new Error(`golden manifest: checkpoints[${index}] invalid`);
    }
    const id = requireString(raw.id, `checkpoints[${index}].id`);
    const runId = requireString(raw.runId, `checkpoints[${index}].runId`);
    requireString(raw.category, `checkpoints[${index}].category`);
    requireString(raw.reason, `checkpoints[${index}].reason`);
    if (!runIds.has(runId)) {
      throw new Error(
        `golden manifest: checkpoint ${id} references unknown run ${runId}`,
      );
    }
    if (!reviewStatuses.has(raw.reviewStatus as GoldenReviewStatus)) {
      throw new Error(
        `golden manifest: checkpoint ${id} has invalid reviewStatus`,
      );
    }
    if (raw.expect !== undefined) {
      if (!isRecord(raw.expect)) {
        throw new Error(
          `golden manifest: checkpoint ${id} expect must be an object`,
        );
      }
      for (const key of [
        "choiceKind",
        "choiceId",
        "recommendationNormal",
        "terminalCandidateId",
      ] as const) {
        if (raw.expect[key] !== undefined) {
          requireString(raw.expect[key], `checkpoint ${id} expect.${key}`);
        }
      }
      if (
        raw.expect.matchedRecommendation !== undefined &&
        typeof raw.expect.matchedRecommendation !== "boolean"
      ) {
        throw new Error(
          `golden manifest: checkpoint ${id} expect.matchedRecommendation must be boolean`,
        );
      }
      if (
        raw.expect.terminalAction !== undefined &&
        raw.expect.terminalAction !== "expose-and-carry" &&
        raw.expect.terminalAction !== "stop-now"
      ) {
        throw new Error(
          `golden manifest: checkpoint ${id} has invalid expect.terminalAction`,
        );
      }
      if (
        raw.expect.terminalAction !== undefined &&
        raw.expect.terminalCandidateId === undefined
      ) {
        throw new Error(
          `golden manifest: checkpoint ${id} terminalAction requires terminalCandidateId`,
        );
      }
    }
    if (!isRecord(raw.selector)) {
      throw new Error(`golden manifest: checkpoint ${id} selector is required`);
    }
    if (!eventKinds.has(raw.selector.event as string)) {
      throw new Error(`golden manifest: checkpoint ${id} has invalid event`);
    }
    const sequence = requireInteger(
      raw.selector.sequence,
      `checkpoint ${id} sequence`,
    );
    const stateHash = requireString(
      raw.selector.stateHash,
      `checkpoint ${id} stateHash`,
    );
    if (checkpointIds.has(id)) {
      throw new Error(`golden manifest: duplicate checkpoint id ${id}`);
    }
    checkpointIds.add(id);
    const selectorKey = `${runId}:${String(
      raw.selector.event,
    )}:${sequence}:${stateHash}`;
    if (selectorKeys.has(selectorKey)) {
      throw new Error(
        `golden manifest: duplicate checkpoint selector ${selectorKey}`,
      );
    }
    selectorKeys.add(selectorKey);
  }
};

export const parseNdjson = (text: string, sourceName: string): LogEntry[] => {
  const entries: LogEntry[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(
        `${sourceName}:${index + 1}: invalid NDJSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!isRecord(parsed)) {
      throw new Error(`${sourceName}:${index + 1}: log entry is not an object`);
    }
    entries.push(parsed as LogEntry);
  }
  return entries;
};

const readChoiceField = (entry: LogEntry, key: string): unknown =>
  isRecord(entry.choice) ? entry.choice[key] : undefined;

const readRecommendationField = (entry: LogEntry, key: string): unknown =>
  isRecord(entry.recommendation) ? entry.recommendation[key] : undefined;

const terminalDecisions = (entry: LogEntry): Record<string, unknown>[] => {
  if (!isRecord(entry.recommendation)) return [];
  const candidates = entry.recommendation.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.terminalDecision)) return [];
    return [candidate.terminalDecision];
  });
};

const assertCheckpointExpectation = (
  checkpoint: GoldenCheckpoint,
  entry: LogEntry,
): void => {
  const expected = checkpoint.expect;
  if (!expected) return;
  if (
    expected.choiceKind !== undefined &&
    readChoiceField(entry, "kind") !== expected.choiceKind
  ) {
    throw new Error(
      `${checkpoint.id}: expected choice kind ${expected.choiceKind}, got ${String(
        readChoiceField(entry, "kind"),
      )}`,
    );
  }
  if (
    expected.choiceId !== undefined &&
    readChoiceField(entry, "id") !== expected.choiceId
  ) {
    throw new Error(
      `${checkpoint.id}: expected choice id ${expected.choiceId}, got ${String(
        readChoiceField(entry, "id"),
      )}`,
    );
  }
  if (
    expected.matchedRecommendation !== undefined &&
    readChoiceField(entry, "matchedRecommendation") !==
      expected.matchedRecommendation
  ) {
    throw new Error(
      `${checkpoint.id}: expected matchedRecommendation=${String(
        expected.matchedRecommendation,
      )}, got ${String(readChoiceField(entry, "matchedRecommendation"))}`,
    );
  }
  if (
    expected.recommendationNormal !== undefined &&
    readRecommendationField(entry, "normal") !== expected.recommendationNormal
  ) {
    throw new Error(
      `${checkpoint.id}: expected recommendation.normal=${expected.recommendationNormal}, got ${String(
        readRecommendationField(entry, "normal"),
      )}`,
    );
  }
  if (
    expected.terminalCandidateId !== undefined ||
    expected.terminalAction !== undefined
  ) {
    const decisions = terminalDecisions(entry);
    const decision = decisions.find(
      (item) =>
        expected.terminalCandidateId === undefined ||
        item.candidateId === expected.terminalCandidateId,
    );
    if (!decision) {
      throw new Error(
        `${checkpoint.id}: expected terminal candidate ${String(
          expected.terminalCandidateId,
        )}, but no matching terminal decision was logged`,
      );
    }
    if (
      expected.terminalAction !== undefined &&
      decision.action !== expected.terminalAction
    ) {
      throw new Error(
        `${checkpoint.id}: expected terminal action ${expected.terminalAction}, got ${String(
          decision.action,
        )}`,
      );
    }
  }
};

export const extractGoldenEvidence = (
  manifest: GoldenManifest,
  entriesBySource: ReadonlyMap<string, readonly LogEntry[]>,
): GoldenEvidenceSnapshot => {
  const runById = new Map(manifest.runs.map((run) => [run.id, run] as const));
  const sourceById = new Map(
    manifest.sources.map((source) => [source.id, source] as const),
  );
  const excluded = new Set(
    (manifest.excludedSessions ?? []).map((entry) => entry.sessionId),
  );
  const checkpoints: GoldenEvidenceCheckpoint[] = [];

  for (const checkpoint of manifest.checkpoints) {
    const run = runById.get(checkpoint.runId);
    if (!run) {
      throw new Error(`${checkpoint.id}: missing run ${checkpoint.runId}`);
    }
    if (excluded.has(run.sessionId)) {
      throw new Error(
        `${checkpoint.id}: run session ${run.sessionId} is explicitly excluded`,
      );
    }
    const source = sourceById.get(run.sourceId);
    if (!source) {
      throw new Error(`${checkpoint.id}: missing source ${run.sourceId}`);
    }
    const entries = entriesBySource.get(source.id);
    if (!entries) {
      throw new Error(`${checkpoint.id}: source ${source.id} was not loaded`);
    }

    const matches = entries.filter((entry) => {
      if (entry.sessionId !== run.sessionId) return false;
      if (entry.event !== checkpoint.selector.event) return false;
      if (entry.sequence !== checkpoint.selector.sequence) return false;
      if (entry.stateHash !== checkpoint.selector.stateHash) return false;
      if (run.sequenceRange) {
        const sequence = Number(entry.sequence);
        if (
          sequence < run.sequenceRange[0] ||
          sequence > run.sequenceRange[1]
        ) {
          return false;
        }
      }
      return true;
    });

    if (matches.length !== 1) {
      throw new Error(
        `${checkpoint.id}: expected exactly one matching log entry, found ${matches.length}`,
      );
    }
    const entry = matches[0]!;
    if (entry.policyVersion !== manifest.baseline.policyVersion) {
      throw new Error(
        `${checkpoint.id}: policyVersion ${String(
          entry.policyVersion,
        )} != ${manifest.baseline.policyVersion}`,
      );
    }
    if (entry.ruleSetId !== manifest.baseline.ruleSetId) {
      throw new Error(
        `${checkpoint.id}: ruleSetId ${String(
          entry.ruleSetId,
        )} != ${manifest.baseline.ruleSetId}`,
      );
    }
    assertCheckpointExpectation(checkpoint, entry);

    checkpoints.push({
      id: checkpoint.id,
      runId: checkpoint.runId,
      category: checkpoint.category,
      reviewStatus: checkpoint.reviewStatus,
      reason: checkpoint.reason,
      sourceId: source.id,
      sourceFile: source.fileName,
      selector: checkpoint.selector,
      evidence: {
        schemaVersion: entry.schemaVersion,
        policyVersion: entry.policyVersion,
        ruleSetId: entry.ruleSetId,
        sessionId: entry.sessionId,
        sequence: entry.sequence,
        stateHash: entry.stateHash,
        timestamp: entry.timestamp,
        state: entry.state,
        stateAfter: entry.stateAfter,
        stateAfterHash: entry.stateAfterHash,
        recommendation: entry.recommendation,
        choice: entry.choice,
      },
    });
  }

  return {
    snapshotVersion: 1,
    manifestId: manifest.id,
    baseline: manifest.baseline,
    checkpoints,
  };
};

export const loadGoldenEvidenceFromDirectory = async (
  manifest: GoldenManifest,
  directory: URL | string,
): Promise<GoldenEvidenceSnapshot> => {
  const base =
    typeof directory === "string"
      ? new URL(
          `file://${directory.endsWith("/") ? directory : `${directory}/`}`,
        )
      : directory;
  const entriesBySource = new Map<string, LogEntry[]>();
  for (const source of manifest.sources) {
    const fileUrl = new URL(source.fileName, base);
    const text = await readFile(fileUrl, "utf8");
    entriesBySource.set(source.id, parseNdjson(text, source.fileName));
  }
  return extractGoldenEvidence(manifest, entriesBySource);
};
