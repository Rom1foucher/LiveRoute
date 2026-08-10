import type {
  AnalysisObjective,
  AnalysisResult,
  Balance,
  GenerationProfile,
  Period,
  RiskProfile,
  SongTarget,
  TokenKey,
  PipelineTimings,
  calculateTokenPressure,
  calculateTokenReservePlan,
  evaluateTechniqueStrategy,
} from "@glcp/core";
import type {
  ConcertTransitionBlockReason,
  DecisionSinkStatus,
  TimingMode,
} from "@glcp/core";
import type { selectCarryoverPolicy } from "@glcp/core";
import type { StrategicPlan } from "@glcp/core";
import type { SongPolicyEvaluation, SongPolicyResult } from "@glcp/core";
import type {
  SongChoiceAssessment,
  TechniqueChoiceAssessment,
} from "@glcp/core";
import type { Song } from "@glcp/core";
import type { CONCERTS } from "./constants.tsx";
import type {
  OptionAnalysis,
  QuickTechniqueBuilder,
  SolverMode,
  WorkflowMode,
} from "./constants.tsx";

export type Concert = (typeof CONCERTS)[number];

/**
 * The panels below take grouped props rather than 30-50 individual ones.
 * The groups are not new abstractions: they are the clusters the values
 * already formed inside App(), finally given names.
 */

/** Where the run currently stands, and what the rules make of it. */
export type RunView = {
  tokens: Balance;
  tokenCap: number;
  concert: Concert;
  concertIndex: number;
  songCycle: number;
  songsThisSection: number;
  techniquesDone: number;
  timingMode: TimingMode;
  workflowMode: WorkflowMode;
  target: number;
  remaining: number;
  patternUnsupported: boolean;
  gaugeSongs: number;
  automaticGaugeSongs: number;
  manualGaugeTarget: number;
  ownedSongs: Set<string>;
  visibleSongIds: Set<string>;
  carryoverSongIds: string[] | null;
  availableSongs: Song[];
  selectionSongs: Song[];
  songTargets: SongTarget[];
  expectedOfferCount: number;
  songOfferComplete: boolean;
  songSelectionOpen: boolean;
  nextSongCover: string;
  techniqueInputPeriod: Period;
  concertTransitionBlock: ConcertTransitionBlockReason | null;
  carryoverPolicy: ReturnType<typeof selectCarryoverPolicy>;
  canCarryVisibleSongPage: boolean;
  shouldCarryVisibleSongPage: boolean;
  /** Non-null when a technique page survived a concert with its own prices. */
  techniqueOfferPeriod: Period | null;
  canUndo: boolean;
};

/** Everything the solver produced for the current state. */
export type SolverView = {
  /** True from state intake until the synchronous solver has published a result. */
  isAnalyzing: boolean;
  result: AnalysisResult | null;
  songPolicy: SongPolicyResult | null;
  normalSongPolicy: SongPolicyEvaluation | null;
  strategicPlan: StrategicPlan;
  /** Null until the solver has produced an actual technique decision. */
  recommendation: { label: string; detail: string } | null;
  goalLabel: string;
  techniqueStrategy: ReturnType<typeof evaluateTechniqueStrategy> | null;
  optionAnalyses: OptionAnalysis[];
  pressurePreview: ReturnType<typeof calculateTokenPressure>;
  reservePlanPreview: ReturnType<typeof calculateTokenReservePlan>;
  isStale: boolean;
};

/** Blocking proofs and safety classification for the displayed choices. */
export type DiagnosticsView = {
  techniqueChoiceAssessments: TechniqueChoiceAssessment[];
  songChoiceAssessments: SongChoiceAssessment[];
  displayedBlocking: boolean;
  displayedBlockingAssessment:
    TechniqueChoiceAssessment | SongChoiceAssessment | null;
  displayedResultTone: string;
  pipelineTimings: PipelineTimings | null;
  decisionLogStatus: DecisionSinkStatus | null;
  decisionLogError: string | null;
  setDecisionLogStatus: (value: DecisionSinkStatus | null) => void;
  setDecisionLogError: (value: string | null) => void;
};

/** What the forced-push override and the option picker currently display. */
export type DisplayView = {
  displayedOverride: boolean;
  displayedSongId: string | null;
  displayedSongPolicy: SongPolicyEvaluation | null;
  displayedTechniqueIndex: number | null;
  displayedTechniqueResult: AnalysisResult | null;
  forcePushOverride: boolean;
  forcedTechnique: { index: number; result: AnalysisResult } | null;
  alternativeTechniqueIndex: number | null;
  analysisOpen: boolean;
};

/** Solver knobs exposed to the user, with their setters. */
export type SettingsView = {
  solverMode: SolverMode;
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  analysisObjective: AnalysisObjective;
  dynamicSpending: boolean;
  setSolverMode: (value: SolverMode) => void;
  setRiskProfile: (value: RiskProfile) => void;
  setGenerationProfile: (value: GenerationProfile) => void;
  setAnalysisObjective: (value: AnalysisObjective) => void;
  setDynamicSpending: (value: boolean) => void;
  setTimingMode: (value: TimingMode) => void;
};

/**
 * State captured outside the manual entry flow — today by the desktop OCR
 * pipeline, tomorrow by anything that can read a run.
 *
 * Deliberately expressed in the shell's own vocabulary rather than the capture
 * pipeline's: `packages/ui` must not learn what a `VisionSnapshot` is. The
 * surface that captured the state is responsible for translating it.
 */
export type ExternalStateIntake = {
  /** Recorded in the decision log, so a run can be replayed by provenance. */
  source: "ocr" | "import";
  page: "songs" | "techniques";
  /** Only the tokens actually read; the others keep their current value. */
  tokens: Partial<Record<TokenKey, number>>;
  /** One entry per option slot on a technique page. `null` leaves the slot empty. */
  techniqueCosts?: (Balance | null)[];
  /** Song ids recognised on a song page, filtered by the shell to what is available. */
  recognizedSongIds?: string[];
  /** Opaque payload attached to the log entry for later inspection. */
  logPayload?: unknown;
  timings?: PipelineTimings;
};

/** Everything the panels can do to the run. */
export type ActionsView = {
  advanceConcert: () => boolean;
  /** Returns whether the purchase was actually applied. */
  buySong: (song: Song) => boolean;
  /** Returns whether the purchase was actually applied. */
  recordTechniquePurchase: (optionIndex?: number) => boolean;
  /** Replaces the manually entered state with externally captured state. */
  applyExternalState: (intake: ExternalStateIntake) => void;
  undoLastAction: () => void;
  setPipelineTimings: (timings: PipelineTimings | null) => void;
  runCurrentAnalysis: () => void;
  toggleVisibleSong: (id: string) => void;
  setSongCycle: (value: number) => void;
  setSongsThisSection: (value: number) => void;
  setTechniquesDone: (value: number) => void;
  setAnalysisOpen: (value: boolean) => void;
  setTokenValue: (key: TokenKey, value: number) => void;
  changeForcePushOverride: (enabled: boolean) => void;
};

/** Manual technique entry: the three option builders and their scratch state. */
export type TechniqueEntryView = {
  candidateCosts: Balance[];
  candidateTotals: number[];
  quickBuilders: QuickTechniqueBuilder[];
  hasIncompleteQuickOption: boolean;
  setCandidateValue: (
    optionIndex: number,
    key: TokenKey,
    value: number,
  ) => void;
  cycleTechniqueKind: (
    optionIndex: number,
    kind: "mono" | "duo" | "hint" | "energy",
  ) => void;
  toggleTechniqueToken: (optionIndex: number, key: TokenKey) => void;
  commitQuickBuilder: (
    optionIndex: number,
    builder: QuickTechniqueBuilder,
  ) => void;
  resetTechniqueOptions: () => void;
};
