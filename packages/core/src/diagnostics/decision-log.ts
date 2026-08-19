import type { Message } from "../i18n/messages.ts";
import type {
  AnalysisObjective,
  AnalysisResult,
  Balance,
  GenerationProfile,
  Period,
  RiskProfile,
  ResourceDemand,
  TerminalTechniqueDecisionSummary,
  TokenShadowPrice,
} from "../live-model.ts";
import type { StrategicPlan } from "../planner/strategic-plan.ts";
import type { TechniqueRankReason } from "../solver/technique-dp.ts";
import type { HuntDecision, HuntState } from "../solver/hunt-state.ts";
import { TOKEN_KEYS, subtractCost } from "../live-model.ts";
import { wilsonIntervalFromProbability } from "../monte-carlo.ts";
import {
  GRAND_LIVE_RULES,
  applyPromotionalLiveTransition,
  type TimingMode,
} from "../domain/live-rules.ts";
import {
  nullDecisionSink,
  type DecisionSink,
  type DecisionSinkStatus,
} from "../ports/decision-sink.ts";
import {
  volatileDecisionSession,
  type DecisionSession,
} from "../ports/decision-session.ts";

/**
 * The engine owns the entry schema and the sequencing. It owns neither the
 * storage nor the application identity: both are injected once at start-up so
 * that the same log code serves the browser build and the desktop build.
 */
export type DecisionLogConfig = {
  appVersion: string;
  sink: DecisionSink;
  session?: DecisionSession;
};

let appVersion = "0.0.0-unconfigured";
let sink: DecisionSink = nullDecisionSink;
let session: DecisionSession = volatileDecisionSession();
let writeQueue: Promise<DecisionSinkStatus | null> = Promise.resolve(null);

/** Policy identity is deliberately separate from the mechanical rule-set id. */
export const GRAND_LIVE_POLICY_VERSION = "grand-live-v8";

export const configureDecisionLog = (config: DecisionLogConfig): void => {
  appVersion = config.appVersion;
  sink = config.sink;
  session = config.session ?? volatileDecisionSession();
  writeQueue = Promise.resolve(null);
};

/** Pure accounting helpers used both for reconstruction and tracked UI state. */
export const loggedBalanceAfterPurchase = (
  tokens: Balance,
  cost: Balance,
): Balance => subtractCost(tokens, cost);

export const loggedBalanceAfterConcert = (
  tokens: Balance,
  completedConcertIndex: number,
): Balance => applyPromotionalLiveTransition(tokens, completedConcertIndex);

/** State written in the log must match the state the UI actually keeps. */
export const loggedTrackedBalanceAfterPurchase = (
  tokens: Balance,
  cost: Balance,
  trackingEnabled: boolean,
): Balance =>
  trackingEnabled ? loggedBalanceAfterPurchase(tokens, cost) : { ...tokens };

export const loggedTrackedBalanceAfterConcert = (
  tokens: Balance,
  completedConcertIndex: number,
  trackingEnabled: boolean,
): Balance =>
  trackingEnabled
    ? loggedBalanceAfterConcert(tokens, completedConcertIndex)
    : { ...tokens };

export type SolverBreakdown = {
  totalMs: number;
  tokenPressureMs?: number;
  runAnalysisMs?: number;
  transitionMs?: number;
  pageDpMs?: number;
  capacityMs?: number;
  crossSectionMs?: number;
  runAnalysisSamples?: number;
  transitionSamples?: number;
  capacityCacheHits?: number;
  capacityCacheMisses?: number;
  cacheHit?: boolean;
};

export type PipelineTimings = {
  captureMs?: number;
  decodeMs?: number;
  ocrPrimaryMs?: number;
  ocrRetryMs?: number;
  ocrTotalMs?: number;
  solverMs?: number;
  overlayMs?: number;
  totalMs?: number;
  solverBreakdown?: SolverBreakdown;
};

export type DecisionLogState = {
  concertIndex: number;
  /** Actual period of the run/concert. */
  concertPeriod?: Period;
  /** Period that generated the currently visible technique page, when it was carried through a Live. */
  techniqueOfferPeriod?: Period | null;
  songCycle: number;
  techniquesDone: number;
  techniquesTarget: number;
  songsThisSection: number;
  totalSongs: number;
  timingMode: TimingMode;
  tokens: Balance;
  visibleSongIds: string[];
  /** Compatibility key: when non-null, contains the complete carried song page (up to three IDs). */
  carryoverSongIds: string[] | null;
  abandonedChaseTargetIds?: string[];
  huntState?: HuntState | null;
  solverMode: "express" | "expert";
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  objective: AnalysisObjective;
  plan: {
    id: string;
    mode: string;
    label: string;
  };
  /** PR-5 shared downstream economy used by song and technique policies. */
  resourceEconomy?: {
    demands: ResourceDemand[];
    shadowPrices: TokenShadowPrice[];
  };
  stateSignature: string;
};

export type ProbabilityConfidenceInterval = {
  method: "wilson-95";
  lower: number;
  upper: number;
};

export type MonteCarloSampleTrace = {
  purpose: "page-reach" | "transition-lookahead" | "terminal";
  seedKey: string;
  trials: number;
  maxTrials: number;
  stopReason:
    | "adaptive-converged"
    | "budget-limit"
    | "uncertain-at-budget-limit"
    | "fixed-budget"
    | "not-run";
  confidence: Record<string, ProbabilityConfidenceInterval>;
};

export type DecisionSamplingTrace = {
  runs: MonteCarloSampleTrace[];
};

export type DecisionProbabilityBreakdown = {
  /** Physical probability of reaching the next exposed lesson page. */
  pageReachProbability: number;
  /** Probability that terminal rollout both reaches a page and finds a usable terminal action. */
  terminalUsableOutcomeProbability?: number;
  /** P(relevant target appears | page reached), before affordability. */
  targetAppearProbabilityGivenReach: number;
  /**
   * @deprecated v5 P1′: numeric compatibility field. Use
   * zeroIncomeFundabilityProbability so an unavailable conditioning event can
   * remain unknown instead of becoming 0.
   */
  targetAffordableProbabilityGivenAppearance: number;
  /** P(target is fundable | target appears and page was reached), zero income. */
  zeroIncomeFundabilityProbability: number | null;
  /** P(find and fund | page reached). */
  findAndFundProbabilityGivenReach: number;
  /** P(page reached and target found and funded). */
  totalFindAndFundProbability: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** 95% Wilson score interval, shared with solver convergence. */
export const wilson95 = (
  probability: number,
  samples: number,
): ProbabilityConfidenceInterval => {
  const [lower, upper] = wilsonIntervalFromProbability(probability, samples);
  return { method: "wilson-95", lower, upper };
};

export const samplingTraceFromRuns = (
  runs: readonly {
    purpose: MonteCarloSampleTrace["purpose"];
    seedKey: string;
    trials: number;
    maxTrials: number;
    converged: boolean;
    uncertainAtBudgetLimit?: boolean;
    probabilities: Record<string, number>;
  }[],
): DecisionSamplingTrace => ({
  runs: runs.map((run) => ({
    purpose: run.purpose,
    seedKey: run.seedKey,
    trials: run.trials,
    maxTrials: run.maxTrials,
    stopReason:
      run.trials <= 0
        ? "not-run"
        : run.converged
          ? "adaptive-converged"
          : run.uncertainAtBudgetLimit
            ? "uncertain-at-budget-limit"
            : "budget-limit",
    confidence: Object.fromEntries(
      Object.entries(run.probabilities).map(([key, probability]) => [
        key,
        wilson95(probability, run.trials),
      ]),
    ),
  })),
});

export const analysisProbabilityBreakdown = (
  result: AnalysisResult,
): DecisionProbabilityBreakdown => {
  const targetAppearProbabilityGivenReach =
    result.objective === "priority-song"
      ? result.prioritySongShownProbability
      : result.objective === "any-song"
        ? result.anySongShownProbability
        : 1;
  const totalFindAndFundProbability =
    result.objective === "carryover"
      ? result.reachProbability
      : result.goalProbability;
  const findAndFundProbabilityGivenReach =
    result.reachProbability > 0
      ? clamp01(totalFindAndFundProbability / result.reachProbability)
      : 0;
  const zeroIncomeFundabilityProbability =
    result.zeroIncomeFundabilityProbability;
  const targetAffordableProbabilityGivenAppearance =
    zeroIncomeFundabilityProbability ?? 0;
  return {
    pageReachProbability: result.reachProbability,
    terminalUsableOutcomeProbability: result.terminalDecision?.reachProbability,
    targetAppearProbabilityGivenReach,
    targetAffordableProbabilityGivenAppearance,
    zeroIncomeFundabilityProbability,
    findAndFundProbabilityGivenReach,
    totalFindAndFundProbability,
  };
};

export const analysisSamplingTrace = (
  result: AnalysisResult,
  seedKey: string,
): DecisionSamplingTrace => {
  const primaryStopReason: MonteCarloSampleTrace["stopReason"] = !result.valid
    ? "not-run"
    : result.converged
      ? "adaptive-converged"
      : result.uncertainAtBudgetLimit
        ? "uncertain-at-budget-limit"
        : "budget-limit";
  const primary: MonteCarloSampleTrace = {
    purpose: "page-reach",
    seedKey,
    trials: result.trials,
    maxTrials: result.maxTrials,
    stopReason: primaryStopReason,
    confidence: {
      pageReachProbability: wilson95(result.reachProbability, result.trials),
      totalFindAndFundProbability: wilson95(
        result.objective === "carryover"
          ? result.reachProbability
          : result.goalProbability,
        result.trials,
      ),
    },
  };
  const terminal: MonteCarloSampleTrace | undefined = result.terminalDecision
    ? {
        purpose: "terminal",
        seedKey: result.terminalDecision.seedKey,
        trials: result.terminalDecision.trials,
        maxTrials: result.terminalDecision.maxTrials,
        stopReason: result.terminalDecision.converged
          ? ("adaptive-converged" as const)
          : result.terminalDecision.uncertainAtBudgetLimit
            ? ("uncertain-at-budget-limit" as const)
            : ("budget-limit" as const),
        confidence: {
          terminalUsableOutcomeProbability: wilson95(
            result.terminalDecision.reachProbability,
            result.terminalDecision.trials,
          ),
        },
      }
    : undefined;
  return { runs: terminal ? [primary, terminal] : [primary] };
};

export type DecisionLogChoice = {
  kind: "technique" | "song" | "concert" | "override";
  id: string;
  label: string;
  cost?: Balance;
  tokenAccounting?:
    | "exact-cost"
    | "known-cost-not-applied"
    | "untracked-cost"
    | "verified-concert-credit"
    | "verified-concert-credit-not-applied"
    | "none";
  recommended: boolean;
  matchedRecommendation?: boolean;
  safety?: "recommended" | "safe-alternative" | "secondary" | "hard-blocking";
  blockingReason?: Message;
  advisoryReason?: Message;
};

export type DecisionLogCandidateBase = {
  id: string;
  label: string | null;
  safety: string;
  valid?: boolean;
  overrideEligible?: boolean;
  /** @deprecated v4: use probabilities.pageReachProbability. */
  reachProbability?: number;
  /** @deprecated v4: use probabilities.totalFindAndFundProbability. */
  goalProbability?: number;
  action?: string;
  cost?: Balance;
  blockingReason?: Message;
  advisoryReason?: Message;
  reasons?: Message[];
  greatSuccessProbability?: number | null;
  continuationRecommendation?: AnalysisResult["recommendation"] | null;
  postPurchasePlanId?: StrategicPlan["id"];
  postPurchaseObjective?: AnalysisObjective;
  abandonsHunt?: boolean;
  huntAbandonReason?: Message;
  huntDecision?: HuntDecision;
  checkpoint16Status?: string;
  checkpoint18Status?: string;
  finalGateStatus?: string;
  probabilities?: DecisionProbabilityBreakdown;
  sampling?: DecisionSamplingTrace;
  valueOutcome?: {
    lessonSkillPoints: number;
    greatSuccessStatGain: number;
    practiceBonusValue: number;
    liveBonusValue: number;
    practiceTrainingExposure: number;
    spTrainingExposure: number;
    friendshipTrainingExposure: number;
  };
  nextSectionReadiness?: {
    horizonSections: 1 | 2;
    valueConcertIndex: number;
    checkpointRequired: number | null;
    checkpointProbability: number;
    friendship10Probability: number;
    effectiveFriendship10Probability: number;
    expectedFriendshipBonus: number;
    expectedFriendshipTrainingExposure: number;
    expectedSpTrainingExposure: number;
    expectedPracticeTrainingExposure: number;
    expectedLessonSkillPoints: number;
    expectedRetainedBalance: Balance;
  };
  terminalDecision?: TerminalTechniqueDecisionSummary;
  decisionVector?: {
    hard: number;
    riskAdmissible: number;
    prospective?: number[];
    structural: number;
    continuation: number[];
    retainedTokens: number;
    committedCost: number;
  };
};

export type DecisionLogTechniqueCandidate = DecisionLogCandidateBase & {
  /** First material comparator that separated this candidate from its reference. */
  rankReasonCode: TechniqueRankReason;
};

export type DecisionLogSongCandidate = DecisionLogCandidateBase & {
  rankReasonCode?: never;
};

type DecisionLogRecommendationBase = {
  normal: string;
  displayed: string;
  overrideActive: boolean;
  reasons: Message[];
};

export type DecisionLogRecommendation =
  | (DecisionLogRecommendationBase & {
      page: "techniques";
      candidates: DecisionLogTechniqueCandidate[];
    })
  | (DecisionLogRecommendationBase & {
      page: "songs";
      candidates: DecisionLogSongCandidate[];
    });

export type DecisionLogEntry = {
  schemaVersion: 5;
  appVersion: string;
  ruleSetId: string;
  policyVersion: string;
  sessionId: string;
  sequence: number;
  stateHash: string;
  id: string;
  timestamp: string;
  event: "recommendation" | "choice" | "snapshot" | "pipeline";
  source: "manual" | "ocr" | "system";
  state: DecisionLogState;
  stateAfter?: DecisionLogState;
  stateAfterHash?: string;
  recommendation?: DecisionLogRecommendation;
  choice?: DecisionLogChoice;
  snapshot?: unknown;
  timings?: PipelineTimings;
  previousDecisionId?: string | null;
};

export type DecisionLogEntryDraft = Omit<
  DecisionLogEntry,
  | "schemaVersion"
  | "appVersion"
  | "ruleSetId"
  | "policyVersion"
  | "sessionId"
  | "sequence"
  | "stateHash"
>;

const randomId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

const hashText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
};

export const decisionStateHash = (state: DecisionLogState): string =>
  `C${state.concertIndex + 1}-${hashText(
    JSON.stringify({
      concertIndex: state.concertIndex,
      songCycle: state.songCycle,
      techniquesDone: state.techniquesDone,
      techniquesTarget: state.techniquesTarget,
      songsThisSection: state.songsThisSection,
      totalSongs: state.totalSongs,
      timingMode: state.timingMode,
      tokens: state.tokens,
      visibleSongIds: [...state.visibleSongIds].sort(),
      carryoverSongIds: state.carryoverSongIds
        ? [...state.carryoverSongIds].sort()
        : null,
      abandonedChaseTargetIds: [
        ...(state.abandonedChaseTargetIds ?? []),
      ].sort(),
      huntState: state.huntState
        ? {
            ...state.huntState,
            targetIds: [...state.huntState.targetIds].sort(),
            committedTechniqueCost: TOKEN_KEYS.map(
              (key) => state.huntState?.committedTechniqueCost[key] ?? 0,
            ),
          }
        : null,
      solverMode: state.solverMode,
      riskProfile: state.riskProfile,
      generationProfile: state.generationProfile,
      objective: state.objective,
      plan: state.plan,
    }),
  )}`;

export const nextDecisionLogId = (): string => randomId();

export const appendDecisionLog = async (
  draft: DecisionLogEntryDraft,
): Promise<DecisionSinkStatus | null> => {
  const entry: DecisionLogEntry = {
    ...draft,
    schemaVersion: 5,
    appVersion,
    ruleSetId: GRAND_LIVE_RULES.id,
    policyVersion: GRAND_LIVE_POLICY_VERSION,
    sessionId: session.id(),
    sequence: session.nextSequence(),
    stateHash: decisionStateHash(draft.state),
    stateAfterHash: draft.stateAfter
      ? decisionStateHash(draft.stateAfter)
      : undefined,
    choice: draft.choice
      ? {
          ...draft.choice,
          matchedRecommendation:
            draft.choice.matchedRecommendation ?? draft.choice.recommended,
        }
      : undefined,
  };
  const line = JSON.stringify(entry);
  writeQueue = writeQueue
    .catch(() => null)
    .then(() => sink.append(line, entry));
  return writeQueue;
};

export const initializeDecisionLog =
  async (): Promise<DecisionSinkStatus | null> => sink.initialize();

export const getDecisionLogStatus =
  async (): Promise<DecisionSinkStatus | null> => sink.status();

export const openDecisionLogDirectory = async (): Promise<void> => {
  await sink.reveal?.();
};

/** NDJSON content of the whole log. Presentation layers turn it into a file. */
export const readDecisionLog = async (): Promise<string> => {
  await writeQueue.catch(() => null);
  try {
    return (await sink.read()) ?? "";
  } catch {
    return "";
  }
};

export const clearDecisionLog =
  async (): Promise<DecisionSinkStatus | null> => {
    await writeQueue.catch(() => null);
    return sink.clear();
  };

export type { DecisionSinkStatus } from "../ports/decision-sink.ts";
