import {
  createTechniqueSimulationMemo,
  runAnalysis,
  type AnalysisInput,
  type AnalysisResult,
  type TerminalTechniqueDecisionSummary,
} from "../live-model.ts";
import {
  analyzeSongSelection,
  type SongPolicyEvaluation,
  type SongPolicyInput,
  type SongPolicyResult,
} from "../solver/song-policy.ts";
import {
  evaluateTerminalTechniqueOptions,
  type TerminalTechniqueOptionAssessment,
  type TerminalTechniqueOptionsInput,
} from "../solver/terminal-technique.ts";
import { GRAND_LIVE_POLICY_VERSION } from "./decision-log.ts";

export type ReplayFixture =
  | {
      fixtureVersion: 1;
      id: string;
      kind: "analysis";
      input: Omit<AnalysisInput, "techniqueMemo">;
      expected?: { recommendation?: AnalysisResult["recommendation"] };
    }
  | {
      fixtureVersion: 1;
      id: string;
      kind: "song-policy";
      input: SongPolicyInput;
      expected?: { recommendedId?: string | null };
    }
  | {
      fixtureVersion: 1;
      id: string;
      kind: "terminal-technique";
      input: TerminalTechniqueOptionsInput;
      expected?: { actions?: Record<string, "stop-now" | "expose-and-carry"> };
    };

export type ReplayFixtureResult =
  | { id: string; kind: "analysis"; result: AnalysisResult }
  | { id: string; kind: "song-policy"; result: SongPolicyResult }
  | {
      id: string;
      kind: "terminal-technique";
      result: TerminalTechniqueOptionAssessment[] | null;
    };

export type ReplayEvidenceKind =
  | "historical-recommendation"
  | "user-action"
  | "user-override"
  | "observed-next-state";

export type ReplayReviewStatus =
  | "accepted"
  | "suspected-bug"
  | "confirmed-bug"
  | "unknown";

export type ReplayEvidence = {
  kind: ReplayEvidenceKind;
  source?: string;
  note?: string;
  /** Raw evidence only. It never becomes an expected solver answer. */
  payload?: Record<string, unknown>;
};

type CorpusFixture<T extends ReplayFixture = ReplayFixture> = T extends unknown
  ? Omit<T, "expected">
  : never;

/**
 * P0 corpus cases deliberately cannot contain `expected`: historical output,
 * user actions and overrides are evidence to review, never solver oracles.
 */
export type ReplayCorpusCase = {
  id: string;
  reviewStatus: ReplayReviewStatus;
  evidence: [ReplayEvidence, ...ReplayEvidence[]];
  fixture: CorpusFixture;
};

export type ReplayCorpus = {
  corpusVersion: 1;
  id: string;
  cases: ReplayCorpusCase[];
};

type AnalysisDecisionSnapshot = {
  recommendation: AnalysisResult["recommendation"];
  objective: AnalysisResult["objective"];
  planId: AnalysisResult["planId"] | null;
  goalProbability: number;
  jointGoalProbability: number;
  conditionalGoalProbability: number;
  reachProbability: number;
  failProbability: number;
  anySongShownProbability: number;
  prioritySongShownProbability: number;
  reachAnySongAffordableProbability: number;
  reachPrioritySongAffordableProbability: number;
  expectedBestSongUtility: number;
  immediateBlockProbability: number;
  lateBlockProbability: number;
  expectedWaste: number;
  conditionalWaste: number;
  averageSuccessSpend: number;
  uncertainAtBudgetLimit: boolean;
  terminalDecision: TerminalDecisionSnapshot | null;
};

type SongPolicyDecisionSnapshot = {
  recommended: SongPolicyReference | null;
  coRecommended: SongPolicyReference[];
  safeAlternative: SongPolicyReference | null;
  utilityRobustness: {
    comparedTo: string | null;
    coRecommendationReason:
      SongPolicyResult["utilityRobustness"]["coRecommendationReason"];
    breakpoints: SongPolicyResult["utilityRobustness"]["breakpoints"];
    pairedComparison: null;
  };
  planId: string;
  policies: SongPolicyEvaluationSnapshot[];
};

type TerminalTechniqueDecisionSnapshot = {
  candidates: TerminalDecisionSnapshot[] | null;
};

export type ReplayDecisionSnapshot =
  | { kind: "analysis"; result: AnalysisDecisionSnapshot }
  | { kind: "song-policy"; result: SongPolicyDecisionSnapshot }
  | { kind: "terminal-technique"; result: TerminalTechniqueDecisionSnapshot };

export type ReplayCaseSnapshot = {
  id: string;
  reviewStatus: ReplayReviewStatus;
  evidence: ReplayEvidence[];
  decision: ReplayDecisionSnapshot;
};

export type ReplayCorpusSnapshot = {
  snapshotVersion: 1;
  corpusId: string;
  /** Traceability only. Snapshot diff compares decisions, not this label. */
  policyVersion: string;
  cases: ReplayCaseSnapshot[];
};

export type ReplayValueDifference = {
  path: string;
  before: unknown;
  after: unknown;
};

export type ReplayCaseDifference = {
  id: string;
  reviewStatus: ReplayReviewStatus;
  differences: ReplayValueDifference[];
};

export type ReplaySnapshotDiff = {
  same: boolean;
  leftCorpusId: string;
  rightCorpusId: string;
  leftPolicyVersion: string;
  rightPolicyVersion: string;
  addedCases: string[];
  removedCases: string[];
  changedCases: ReplayCaseDifference[];
};

type SongPolicyReference = {
  id: string;
  action: SongPolicyEvaluation["action"];
  songId: string | null;
};

type SongPolicyEvaluationSnapshot = SongPolicyReference & {
  carriedSongIds: string[];
  valid: boolean;
  affordable: boolean | null;
  overrideEligible: boolean;
  nextSongProbability: number;
  priorityAffordableProbability: number;
  greatSuccessProbability: number | null;
  checkpoint16Status: SongPolicyEvaluation["checkpoint16Status"];
  checkpoint18Status: SongPolicyEvaluation["checkpoint18Status"];
  finalGateStatus: SongPolicyEvaluation["finalGateStatus"];
  conditionalPagesProbability: number;
  exactPageEnumeration: boolean;
  lateFailureProbability: number;
  expectedWaste: number;
  criticalCost: number;
  continuationRecommendation: SongPolicyEvaluation["continuationRecommendation"];
  postPurchasePlanId: SongPolicyEvaluation["postPurchasePlanId"] | null;
  postPurchaseObjective: SongPolicyEvaluation["postPurchaseObjective"] | null;
  abandonsHunt: boolean;
  huntAbandonReasonCode: string | null;
  decisionVector: SongPolicyEvaluation["decisionVector"];
  valueOutcome: SongPolicyEvaluation["valueOutcome"];
  reasonCodes: string[];
};

type TerminalDecisionSnapshot = {
  candidateId?: string;
  action: TerminalTechniqueDecisionSummary["action"];
  reasonCode: string;
  canonicalActionKey: string;
  trials: number;
  maxTrials: number;
  converged: boolean;
  uncertainAtBudgetLimit: boolean;
  coRecommended: readonly ("stop-now" | "expose-and-carry")[];
  coRecommendationReason:
    TerminalTechniqueDecisionSummary["coRecommendationReason"];
  calibrationSensitiveParameters: readonly string[];
  calibrationBreakpoints: TerminalTechniqueDecisionSummary["calibrationBreakpoints"];
  pairedUtility: TerminalTechniqueDecisionSummary["pairedUtility"];
  timeBudgetExceeded: boolean;
  reachProbability: number;
  expectedCommittedCost: number;
  expectedWeightedCommittedCost: number;
  expectedOpportunityCost: number;
  riskThreshold: number;
  catastropheFloor: number;
  admissionThreshold: number;
  reachConfidenceInterval: readonly [number, number];
  reachConfidenceLowerBound: number;
  grossValue: number;
  riskPenalty: number;
  netValue: number;
  stopCheckpointProbability: number;
  pushCheckpointProbability: number;
  stopTargetProbability: number;
  pushTargetProbability: number;
  stopFriendship10Probability: number;
  pushFriendship10Probability: number;
  stopEffectiveFriendship10Probability: number;
  pushEffectiveFriendship10Probability: number;
  stopExpectedFriendshipBonus: number;
  pushExpectedFriendshipBonus: number;
  stopExpectedFriendshipTrainingExposure: number;
  pushExpectedFriendshipTrainingExposure: number;
  stopExpectedSpTrainingExposure: number;
  pushExpectedSpTrainingExposure: number;
  stopExpectedPracticeTrainingExposure: number;
  pushExpectedPracticeTrainingExposure: number;
  stopExpectedStructuralPurchases: number;
  pushExpectedStructuralPurchases: number;
  decisionVector: readonly number[];
};

const replayEvidenceKinds = new Set<ReplayEvidenceKind>([
  "historical-recommendation",
  "user-action",
  "user-override",
  "observed-next-state",
]);
const replayReviewStatuses = new Set<ReplayReviewStatus>([
  "accepted",
  "suspected-bug",
  "confirmed-bug",
  "unknown",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function assertReplayCorpus(
  value: unknown,
): asserts value is ReplayCorpus {
  if (!isRecord(value) || value.corpusVersion !== 1) {
    throw new Error("replay corpus: unsupported or missing corpusVersion");
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error("replay corpus: id is required");
  }
  if (!Array.isArray(value.cases)) {
    throw new Error("replay corpus: cases must be an array");
  }
  const seen = new Set<string>();
  for (const rawCase of value.cases) {
    if (!isRecord(rawCase) || typeof rawCase.id !== "string") {
      throw new Error("replay corpus: every case requires an id");
    }
    if (seen.has(rawCase.id)) {
      throw new Error(`replay corpus: duplicate case id ${rawCase.id}`);
    }
    seen.add(rawCase.id);
    if (!replayReviewStatuses.has(rawCase.reviewStatus as ReplayReviewStatus)) {
      throw new Error(`replay corpus ${rawCase.id}: invalid reviewStatus`);
    }
    if (!Array.isArray(rawCase.evidence) || rawCase.evidence.length === 0) {
      throw new Error(`replay corpus ${rawCase.id}: classified evidence is required`);
    }
    for (const evidence of rawCase.evidence) {
      if (
        !isRecord(evidence) ||
        !replayEvidenceKinds.has(evidence.kind as ReplayEvidenceKind)
      ) {
        throw new Error(`replay corpus ${rawCase.id}: invalid evidence kind`);
      }
    }
    if (!isRecord(rawCase.fixture)) {
      throw new Error(`replay corpus ${rawCase.id}: fixture is required`);
    }
    if ("expected" in rawCase.fixture) {
      throw new Error(
        `replay corpus ${rawCase.id}: expected is forbidden; evidence is not an oracle`,
      );
    }
    if (rawCase.fixture.id !== rawCase.id) {
      throw new Error(`replay corpus ${rawCase.id}: fixture id must match case id`);
    }
  }
}

/**
 * Pure replay oracle for standalone JSON fixtures. File I/O deliberately lives
 * in `scripts/replay-fixture.ts`, outside the engine.
 */
export const replayFixture = (fixture: ReplayFixture): ReplayFixtureResult => {
  switch (fixture.kind) {
    case "analysis":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: runAnalysis({
          ...fixture.input,
          techniqueMemo: createTechniqueSimulationMemo(),
        }),
      };
    case "song-policy":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: analyzeSongSelection(fixture.input),
      };
    case "terminal-technique":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: evaluateTerminalTechniqueOptions(fixture.input),
      };
  }
};

export const replayFixtureMatchesExpected = (
  fixture: ReplayFixture,
  replay: ReplayFixtureResult,
): boolean => {
  if (!fixture.expected) return true;
  if (fixture.kind === "analysis" && replay.kind === "analysis") {
    return (
      fixture.expected.recommendation === undefined ||
      replay.result.recommendation === fixture.expected.recommendation
    );
  }
  if (fixture.kind === "song-policy" && replay.kind === "song-policy") {
    return (
      fixture.expected.recommendedId === undefined ||
      (replay.result.recommended?.id ?? null) === fixture.expected.recommendedId
    );
  }
  if (
    fixture.kind === "terminal-technique" &&
    replay.kind === "terminal-technique"
  ) {
    if (!fixture.expected.actions) return true;
    const terminalResult = replay.result;
    if (!terminalResult) return false;
    return Object.entries(fixture.expected.actions).every(([id, action]) =>
      terminalResult.some(
        (candidate) =>
          candidate.candidateId === id && candidate.action === action,
      ),
    );
  }
  return false;
};

const terminalSnapshot = (
  result: TerminalTechniqueDecisionSummary,
  candidateId?: string,
): TerminalDecisionSnapshot => ({
  ...(candidateId === undefined ? {} : { candidateId }),
  action: result.action,
  reasonCode: result.reason.code,
  canonicalActionKey: result.canonicalActionKey,
  trials: result.trials,
  maxTrials: result.maxTrials,
  converged: result.converged,
  uncertainAtBudgetLimit: result.uncertainAtBudgetLimit,
  coRecommended: [...result.coRecommended],
  coRecommendationReason: result.coRecommendationReason,
  calibrationSensitiveParameters: [...result.calibrationSensitiveParameters],
  calibrationBreakpoints: result.calibrationBreakpoints.map((breakpoint) => ({
    ...breakpoint,
  })),
  pairedUtility: {
    ...result.pairedUtility,
    interval: [...result.pairedUtility.interval] as readonly [number, number],
  },
  timeBudgetExceeded: result.timeBudgetExceeded ?? false,
  reachProbability: result.reachProbability,
  expectedCommittedCost: result.expectedCommittedCost,
  expectedWeightedCommittedCost: result.expectedWeightedCommittedCost,
  expectedOpportunityCost: result.expectedOpportunityCost,
  riskThreshold: result.riskThreshold,
  catastropheFloor: result.catastropheFloor,
  admissionThreshold: result.admissionThreshold,
  reachConfidenceInterval: [...result.reachConfidenceInterval] as readonly [
    number,
    number,
  ],
  reachConfidenceLowerBound: result.reachConfidenceLowerBound,
  grossValue: result.grossValue,
  riskPenalty: result.riskPenalty,
  netValue: result.netValue,
  stopCheckpointProbability: result.stopCheckpointProbability,
  pushCheckpointProbability: result.pushCheckpointProbability,
  stopTargetProbability: result.stopTargetProbability,
  pushTargetProbability: result.pushTargetProbability,
  stopFriendship10Probability: result.stopFriendship10Probability,
  pushFriendship10Probability: result.pushFriendship10Probability,
  stopEffectiveFriendship10Probability:
    result.stopEffectiveFriendship10Probability,
  pushEffectiveFriendship10Probability:
    result.pushEffectiveFriendship10Probability,
  stopExpectedFriendshipBonus: result.stopExpectedFriendshipBonus,
  pushExpectedFriendshipBonus: result.pushExpectedFriendshipBonus,
  stopExpectedFriendshipTrainingExposure:
    result.stopExpectedFriendshipTrainingExposure,
  pushExpectedFriendshipTrainingExposure:
    result.pushExpectedFriendshipTrainingExposure,
  stopExpectedSpTrainingExposure: result.stopExpectedSpTrainingExposure,
  pushExpectedSpTrainingExposure: result.pushExpectedSpTrainingExposure,
  stopExpectedPracticeTrainingExposure:
    result.stopExpectedPracticeTrainingExposure,
  pushExpectedPracticeTrainingExposure:
    result.pushExpectedPracticeTrainingExposure,
  stopExpectedStructuralPurchases: result.stopExpectedStructuralPurchases,
  pushExpectedStructuralPurchases: result.pushExpectedStructuralPurchases,
  decisionVector: [...result.decisionVector],
});

const policyReference = (
  policy: SongPolicyEvaluation | null,
): SongPolicyReference | null =>
  policy
    ? { id: policy.id, action: policy.action, songId: policy.songId }
    : null;

const policySnapshot = (
  policy: SongPolicyEvaluation,
): SongPolicyEvaluationSnapshot => ({
  id: policy.id,
  action: policy.action,
  songId: policy.songId,
  carriedSongIds: [...(policy.carriedSongIds ?? [])].sort(),
  valid: policy.valid,
  affordable: policy.affordable ?? null,
  overrideEligible: policy.overrideEligible,
  nextSongProbability: policy.nextSongProbability,
  priorityAffordableProbability: policy.priorityAffordableProbability,
  greatSuccessProbability: policy.greatSuccessProbability,
  checkpoint16Status: policy.checkpoint16Status,
  checkpoint18Status: policy.checkpoint18Status,
  finalGateStatus: policy.finalGateStatus,
  conditionalPagesProbability: policy.conditionalPagesProbability,
  exactPageEnumeration: policy.exactPageEnumeration,
  lateFailureProbability: policy.lateFailureProbability,
  expectedWaste: policy.expectedWaste,
  criticalCost: policy.criticalCost,
  continuationRecommendation: policy.continuationRecommendation,
  postPurchasePlanId: policy.postPurchasePlanId ?? null,
  postPurchaseObjective: policy.postPurchaseObjective ?? null,
  abandonsHunt: policy.abandonsHunt,
  huntAbandonReasonCode: policy.huntAbandonReason?.code ?? null,
  decisionVector: {
    ...policy.decisionVector,
    certain: policy.decisionVector.certain
      ? [...policy.decisionVector.certain]
      : undefined,
    prospective: policy.decisionVector.prospective
      ? [...policy.decisionVector.prospective]
      : undefined,
    continuation: [...policy.decisionVector.continuation],
  },
  valueOutcome: { ...policy.valueOutcome },
  reasonCodes: policy.reasons.map((reason) => reason.code),
});

export const replayDecisionSnapshot = (
  replay: ReplayFixtureResult,
): ReplayDecisionSnapshot => {
  switch (replay.kind) {
    case "analysis": {
      const result = replay.result;
      return {
        kind: replay.kind,
        result: {
          recommendation: result.recommendation,
          objective: result.objective,
          planId: result.planId ?? null,
          goalProbability: result.goalProbability,
          jointGoalProbability: result.jointGoalProbability,
          conditionalGoalProbability: result.conditionalGoalProbability,
          reachProbability: result.reachProbability,
          failProbability: result.failProbability,
          anySongShownProbability: result.anySongShownProbability,
          prioritySongShownProbability: result.prioritySongShownProbability,
          reachAnySongAffordableProbability:
            result.reachAnySongAffordableProbability,
          reachPrioritySongAffordableProbability:
            result.reachPrioritySongAffordableProbability,
          expectedBestSongUtility: result.expectedBestSongUtility,
          immediateBlockProbability: result.immediateBlockProbability,
          lateBlockProbability: result.lateBlockProbability,
          expectedWaste: result.expectedWaste,
          conditionalWaste: result.conditionalWaste,
          averageSuccessSpend: result.averageSuccessSpend,
          uncertainAtBudgetLimit: result.uncertainAtBudgetLimit,
          terminalDecision: result.terminalDecision
            ? terminalSnapshot(result.terminalDecision)
            : null,
        },
      };
    }
    case "song-policy":
      return {
        kind: replay.kind,
        result: {
          recommended: policyReference(replay.result.recommended),
          coRecommended: replay.result.coRecommended
            .map(policyReference)
            .filter((value): value is SongPolicyReference => value !== null),
          safeAlternative: policyReference(replay.result.safeAlternative),
          utilityRobustness: {
            comparedTo: replay.result.utilityRobustness.comparedTo,
            coRecommendationReason:
              replay.result.utilityRobustness.coRecommendationReason,
            breakpoints: replay.result.utilityRobustness.breakpoints,
            pairedComparison: null,
          },
          planId: replay.result.plan.id,
          policies: [...replay.result.policies]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(policySnapshot),
        },
      };
    case "terminal-technique":
      return {
        kind: replay.kind,
        result: {
          candidates: replay.result
            ? [...replay.result]
                .sort((left, right) =>
                  left.candidateId.localeCompare(right.candidateId),
                )
                .map((candidate) =>
                  terminalSnapshot(candidate, candidate.candidateId),
                )
            : null,
        },
      };
  }
};

export const replayCorpus = (corpus: ReplayCorpus): ReplayCorpusSnapshot => {
  assertReplayCorpus(corpus);
  return {
    snapshotVersion: 1,
    corpusId: corpus.id,
    policyVersion: GRAND_LIVE_POLICY_VERSION,
    cases: [...corpus.cases]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => ({
        id: entry.id,
        reviewStatus: entry.reviewStatus,
        evidence: entry.evidence.map((evidence) => ({ ...evidence })),
        decision: replayDecisionSnapshot(
          replayFixture(entry.fixture as ReplayFixture),
        ),
      })),
  };
};

const sameScalar = (left: unknown, right: unknown): boolean =>
  Object.is(left, right);

const diffValues = (
  left: unknown,
  right: unknown,
  path: string,
  differences: ReplayValueDifference[],
): void => {
  if (sameScalar(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      diffValues(left[index], right[index], `${path}/${index}`, differences);
    }
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      diffValues(left[key], right[key], `${path}/${key}`, differences);
    }
    return;
  }
  differences.push({ path, before: left, after: right });
};

export const diffReplaySnapshots = (
  left: ReplayCorpusSnapshot,
  right: ReplayCorpusSnapshot,
): ReplaySnapshotDiff => {
  const leftCases = new Map(left.cases.map((entry) => [entry.id, entry]));
  const rightCases = new Map(right.cases.map((entry) => [entry.id, entry]));
  const addedCases = [...rightCases.keys()]
    .filter((id) => !leftCases.has(id))
    .sort();
  const removedCases = [...leftCases.keys()]
    .filter((id) => !rightCases.has(id))
    .sort();
  const changedCases: ReplayCaseDifference[] = [];

  for (const id of [...leftCases.keys()].filter((key) => rightCases.has(key)).sort()) {
    const before = leftCases.get(id);
    const after = rightCases.get(id);
    if (!before || !after) continue;
    const differences: ReplayValueDifference[] = [];
    diffValues(before.decision, after.decision, "/decision", differences);
    if (differences.length > 0) {
      changedCases.push({
        id,
        reviewStatus: after.reviewStatus,
        differences,
      });
    }
  }

  return {
    same:
      addedCases.length === 0 &&
      removedCases.length === 0 &&
      changedCases.length === 0,
    leftCorpusId: left.corpusId,
    rightCorpusId: right.corpusId,
    leftPolicyVersion: left.policyVersion,
    rightPolicyVersion: right.policyVersion,
    addedCases,
    removedCases,
    changedCases,
  };
};
