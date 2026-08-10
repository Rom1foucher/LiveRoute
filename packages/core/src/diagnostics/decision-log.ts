import type { Message } from "../i18n/messages.ts";
import type {
  AnalysisObjective,
  AnalysisResult,
  Balance,
  GenerationProfile,
  Period,
  RiskProfile,
  TerminalTechniqueDecisionSummary,
} from "../live-model.ts";
import type { StrategicPlan } from "../planner/strategic-plan.ts";
import { subtractCost } from "../live-model.ts";
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
  carryoverSongIds: string[] | null;
  abandonedChaseTargetIds?: string[];
  solverMode: "express" | "expert";
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  objective: AnalysisObjective;
  plan: {
    id: string;
    mode: string;
    label: string;
  };
  stateSignature: string;
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

export type DecisionLogEntry = {
  schemaVersion: 3;
  appVersion: string;
  ruleSetId: string;
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
  recommendation?: {
    page: "techniques" | "songs";
    normal: string;
    displayed: string;
    overrideActive: boolean;
    reasons: Message[];
    candidates: Array<{
      id: string;
      label: string | null;
      safety: string;
      valid?: boolean;
      overrideEligible?: boolean;
      reachProbability?: number;
      goalProbability?: number;
      action?: string;
      cost?: Balance;
      blockingReason?: Message;
      advisoryReason?: Message;
      rankReason?: Message;
      reasons?: Message[];
      greatSuccessProbability?: number | null;
      continuationRecommendation?: AnalysisResult["recommendation"] | null;
      postPurchasePlanId?: StrategicPlan["id"];
      postPurchaseObjective?: AnalysisObjective;
      abandonsHunt?: boolean;
      huntAbandonReason?: Message;
      checkpoint16Status?: string;
      checkpoint18Status?: string;
      finalGateStatus?: string;
      valueOutcome?: {
        lessonSkillPoints: number;
        greatSuccessStatGain: number;
        practiceBonusValue: number;
        liveBonusValue: number;
      };
      nextSectionReadiness?: {
        horizonSections: 1 | 2;
        valueConcertIndex: number;
        checkpointRequired: number | null;
        checkpointProbability: number;
        friendship10Probability: number;
        expectedFriendshipBonus: number;
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
    }>;
  };
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
    schemaVersion: 3,
    appVersion,
    ruleSetId: GRAND_LIVE_RULES.id,
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
