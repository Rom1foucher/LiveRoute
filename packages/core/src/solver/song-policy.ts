import type { Message, MissingToken } from "../i18n/messages.ts";
import {
  TOKEN_KEYS,
  TRAINING_HORIZON_BY_CONCERT,
  acquiredEffectsForSong,
  canAfford,
  createTechniqueSimulationMemo,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  fundingGap,
  resolveStrategicObjective,
  structuralTrainingValue,
  withStructuralTrainingValue,
  runAnalysis,
  subtractCost,
  totalCost,
  weightedFundingGap,
  type AnalysisObjective,
  type AnalysisResult,
  type Balance,
  type GenerationProfile,
  type Period,
  type PhysicalFundingFeasibility,
  type RemainingTrainingsByFacility,
  type RiskProfile,
  type SongTarget,
  type TokenPressure,
  type TokenReservePlan,
} from "../live-model.ts";
import {
  applyPromotionalLiveTransition,
  finalGateSecured,
  isGreatSuccess,
  type CheckpointStatus,
  type TimingMode,
} from "../domain/live-rules.ts";
import {
  deriveStrategicPlan,
  isChaseTarget,
  isReserveTarget,
  isVisibleOptionalTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  canonicalPageSongIds,
  enumeratePageActions,
  pageActionKey,
} from "./page-actions.ts";
import { evaluatePageCoverage, maximumAffordablePurchases } from "./song-dp.ts";
import { assessCheckpointSupply } from "./supply-model.ts";
import { riskThreshold } from "./value.ts";
import {
  createHorizonOutcome,
  outcomeComponent,
  type HorizonOutcome,
  type HorizonOutcomeComponent,
  type OutcomeUncertainty,
} from "./horizon-outcome.ts";
import {
  compareUtilityAssessments,
  decisionVectorFromUtilityAssessment,
  utilityAssessmentFromOutcome,
  utilityBreakpointsBetween,
  type UtilityAssessment,
  type UtilityBreakpoint,
} from "./utility-model.ts";
import { evaluateTransitionAwareSongPages } from "./song-transition.ts";
import {
  alignHuntState,
  createHuntState,
  evaluateHuntDecision,
  observeHuntPage,
  type HuntDecision,
  type HuntState,
} from "./hunt-state.ts";
import {
  buildSharedResourceEconomy,
  deriveReachableDemands,
} from "./resource-economy.ts";
import {
  evaluateCrossSectionReadiness,
  type CrossSectionReadinessResult,
} from "./cross-section.ts";

export type SongPolicyAction =
  | "buy-stop"
  | "buy-continue"
  | "wait-reserve"
  | "carry-page"
  | "stop-and-carry-stock";

export type SongValueOutcome = {
  lessonSkillPoints: number;
  greatSuccessStatGain: number;
  /** Legacy/raw telemetry retained for compatibility. */
  practiceBonusValue: number;
  /** Legacy/raw telemetry retained for compatibility. */
  liveBonusValue: number;
  practiceTrainingExposure: number;
  spTrainingExposure: number;
  friendshipTrainingExposure: number;
};

export type SongPolicySamplingRun = {
  purpose: "page-reach" | "transition-lookahead";
  seedKey: string;
  trials: number;
  maxTrials: number;
  converged: boolean;
  uncertainAtBudgetLimit?: boolean;
  probabilities: Record<string, number>;
};

export type SongPolicyEvaluation = {
  id: string;
  action: SongPolicyAction;
  songId: string | null;
  /** `null` on the no-purchase policies; the UI renders `policy.noPurchase`. */
  songName: string | null;
  /** Complete page preserved by a carry action; absent on non-carry policies. */
  carriedSongIds?: readonly string[];
  valid: boolean;
  /** Exact affordability of a buy policy. Undefined for non-buy actions. */
  affordable?: boolean;
  /** P1′ exact observed-wallet feasibility for a concrete buy action. */
  fundingFeasibility?: PhysicalFundingFeasibility;
  /** Can be exposed by the explicit push override without changing normal policy. */
  overrideEligible: boolean;
  /** Presentation rank only. It is never used to make the decision. */
  score: number;
  nextSongProbability: number;
  priorityAffordableProbability: number;
  greatSuccessProbability: number | null;
  checkpoint16Status: CheckpointStatus;
  checkpoint18Status: CheckpointStatus;
  finalGateStatus: "secured" | "open" | "failed";
  conditionalPagesProbability: number;
  exactPageEnumeration: boolean;
  lateFailureProbability: number;
  expectedWaste: number;
  criticalCost: number;
  continuationRecommendation: AnalysisResult["recommendation"] | null;
  /** Plan recomputed after this concrete purchase, before any technique. */
  postPurchasePlanId?: StrategicPlan["id"];
  /** Objective used by both the projection and the real post-purchase screen. */
  postPurchaseObjective?: AnalysisObjective;
  /** This terminal action deliberately ends the active SP hunt. */
  abandonsHunt: boolean;
  huntAbandonReason?: Message;
  /** PR-6 marginal HUNT vs HOLD comparison. */
  huntDecision?: HuntDecision;
  /** T1a canonical typed consequences. */
  horizonOutcome: HorizonOutcome;
  /** T1b stat-point utility derived from the same outcome. */
  utilityAssessment: UtilityAssessment;
  decisionVector: ReturnType<typeof decisionVectorFromUtilityAssessment>;
  nextSectionReadiness: CrossSectionReadinessResult | null;
  valueOutcome: SongValueOutcome;
  /** MC runs that materially informed this policy. Diagnostics only. */
  sampling?: SongPolicySamplingRun[];
  reasons: Message[];
};

export type SongPolicyInput = {
  period: Period;
  firstOfferPeriod?: Period;
  tokens: Balance;
  visibleSongs: SongTarget[];
  remainingSongs: SongTarget[];
  futureSongs?: SongTarget[];
  laterSongs?: SongTarget[];
  techniquesToNextSong: number;
  songsThisSection: number;
  totalSongs: number;
  concertIndex: number;
  generationProfile?: GenerationProfile;
  /** Current 1 + Friendship Training Effectiveness from active concert bonuses. */
  friendshipSongMultiplier?: number;
  /** Exact click horizon when known; otherwise a section/profile estimate is used. */
  remainingTrainingsByFacility?: RemainingTrainingsByFacility;
  riskProfile?: RiskProfile;
  trials?: number;
  nextSongCycle?: number;
  continuationObjective?: AnalysisObjective;
  timingMode?: TimingMode;
  maxSongPages?: number;
  abandonedChaseTargetIds?: readonly string[];
  /** Section-local persistent HUNT state. When omitted, standalone callers treat the current visible page as the first observation. */
  huntState?: HuntState | null;
};

export type SongPolicyDiagnostics = {
  totalMs: number;
  tokenPressureMs: number;
  runAnalysisMs: number;
  transitionMs: number;
  pageDpMs: number;
  capacityMs: number;
  crossSectionMs: number;
  runAnalysisSamples: number;
  transitionSamples: number;
  capacityCacheHits: number;
  capacityCacheMisses: number;
  cacheHit: boolean;
};

export type SongPolicyResult = {
  recommended: SongPolicyEvaluation | null;
  safeAlternative: SongPolicyEvaluation | null;
  utilityRobustness: {
    comparedTo: string | null;
    breakpoints: readonly UtilityBreakpoint[];
  };
  policies: SongPolicyEvaluation[];
  tokenPressure: TokenPressure[];
  tokenReservePlan: TokenReservePlan;
  plan: StrategicPlan;
  diagnostics: SongPolicyDiagnostics;
};

type PurchaseCapacity = ReturnType<typeof maximumAffordablePurchases>;

const SONG_POLICY_CACHE_LIMIT = 24;
const songPolicyCache = new Map<string, SongPolicyResult>();

const canonicalSongPolicyInput = (input: SongPolicyInput): string => {
  const songKey = (songs: SongTarget[]): unknown[] =>
    [...songs]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((song) => ({
        id: song.id,
        cost: TOKEN_KEYS.map((key) => song.cost[key]),
        utility: song.utility,
        policyValue: song.policyValue ?? null,
        priority: song.priority,
        roles: [...(song.roles ?? [])].sort(),
        immediateValue: song.immediateValue ?? null,
        liveValue: song.liveValue ?? null,
        practiceBonus: song.practiceBonus ?? null,
        practiceValue: song.practiceValue ?? null,
      }));
  return JSON.stringify({
    period: input.period,
    firstOfferPeriod: input.firstOfferPeriod ?? input.period,
    tokens: TOKEN_KEYS.map((key) => input.tokens[key]),
    visibleSongs: songKey(input.visibleSongs),
    remainingSongs: songKey(input.remainingSongs),
    futureSongs: songKey(input.futureSongs ?? []),
    laterSongs: songKey(input.laterSongs ?? []),
    techniquesToNextSong: input.techniquesToNextSong,
    songsThisSection: input.songsThisSection,
    totalSongs: input.totalSongs,
    concertIndex: input.concertIndex,
    generationProfile: input.generationProfile ?? "speed-wit",
    friendshipSongMultiplier: input.friendshipSongMultiplier ?? 1,
    remainingTrainingsByFacility: input.remainingTrainingsByFacility ?? null,
    riskProfile: input.riskProfile ?? "standard",
    trials: input.trials ?? 10000,
    nextSongCycle: input.nextSongCycle ?? 1,
    continuationObjective: input.continuationObjective ?? null,
    timingMode: input.timingMode ?? "section-open",
    maxSongPages: input.maxSongPages ?? 4,
    abandonedChaseTargetIds: [...(input.abandonedChaseTargetIds ?? [])].sort(),
    huntState: input.huntState
      ? {
          ...input.huntState,
          targetIds: [...input.huntState.targetIds].sort(),
          committedTechniqueCost: TOKEN_KEYS.map(
            (key) => input.huntState?.committedTechniqueCost[key] ?? 0,
          ),
        }
      : null,
  });
};

const cacheSongPolicy = (key: string, result: SongPolicyResult): void => {
  if (songPolicyCache.has(key)) songPolicyCache.delete(key);
  songPolicyCache.set(key, result);
  while (songPolicyCache.size > SONG_POLICY_CACHE_LIMIT) {
    const oldest = songPolicyCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    songPolicyCache.delete(oldest);
  }
};

const statusFor = ({
  totalSongs,
  requiredSongs,
  balance,
  pool,
  timingMode,
  capacity,
}: {
  totalSongs: number;
  requiredSongs: number;
  balance: Balance;
  pool: SongTarget[];
  timingMode: TimingMode;
  capacity?: PurchaseCapacity;
}) => {
  const resolvedCapacity =
    capacity ?? maximumAffordablePurchases(balance, pool);
  return assessCheckpointSupply({
    totalSongs,
    requiredSongs,
    currentStockCapacity: resolvedCapacity.count,
    currentStockCapacityExact: resolvedCapacity.exact,
    timingMode,
  });
};

const timingForCheckpoint = (
  checkpoint: 16 | 18,
  concertIndex: number,
  timingMode: TimingMode,
): TimingMode => {
  // 16 is a pacing reference only. Missing it at the end of C4 does not make
  // the run impossible because the Grand Live section can still buy songs.
  if (checkpoint === 16) return "section-open";
  return concertIndex >= 4 ? timingMode : "section-open";
};

const missingTokens = (tokens: Balance, song: SongTarget): MissingToken[] =>
  TOKEN_KEYS.flatMap((key) => {
    const missing = Math.max(0, song.cost[key] - tokens[key]);
    return missing > 0 ? [{ key, amount: missing }] : [];
  });

const planReasonMessage = (plan: StrategicPlan): Message => ({
  code: "reason.plan",
  planId: plan.id,
  mode: plan.mode,
});

const statusReasons = (
  status16: CheckpointStatus,
  status18: CheckpointStatus,
): Message[] => {
  const reasons: Message[] = [];
  // The 16-song value is intentionally absent from hard-failure wording: it is
  // a pacing reference, not a gate. The dedicated UI diagnostic can still show
  // whether it is already reached or requires later purchases.
  if (status18 === "impossible") {
    reasons.push({ code: "reason.gate18Impossible" });
  }
  if (status18 === "reachable-with-future-supply") {
    reasons.push({ code: "reason.gate18FutureSupply" });
  }
  if (status16 === "indeterminate" || status18 === "indeterminate") {
    reasons.push({ code: "reason.capacityIndeterminate" });
  }
  return reasons;
};

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const analyzeSongSelection = (
  input: SongPolicyInput,
): SongPolicyResult => {
  const startedAt = nowMs();
  const cacheKey = canonicalSongPolicyInput(input);
  const cached = songPolicyCache.get(cacheKey);
  if (cached) {
    songPolicyCache.delete(cacheKey);
    songPolicyCache.set(cacheKey, cached);
    return {
      ...cached,
      diagnostics: {
        ...cached.diagnostics,
        totalMs: nowMs() - startedAt,
        cacheHit: true,
      },
    };
  }
  const {
    period,
    firstOfferPeriod = period,
    tokens,
    visibleSongs: rawVisibleSongs,
    remainingSongs: rawRemainingSongs,
    futureSongs: rawFutureSongs = [],
    laterSongs: rawLaterSongs = [],
    techniquesToNextSong,
    songsThisSection,
    totalSongs,
    concertIndex,
    generationProfile = "speed-wit",
    friendshipSongMultiplier = 1,
    remainingTrainingsByFacility: explicitRemainingTrainings,
    riskProfile = "standard",
    trials = 10000,
    nextSongCycle = 1,
    continuationObjective,
    timingMode = "section-open",
    maxSongPages = 4,
    abandonedChaseTargetIds = [],
    huntState: inputHuntState = null,
  } = input;
  const remainingTrainings =
    explicitRemainingTrainings ??
    estimateRemainingTrainingsByFacility(generationProfile, concertIndex);
  const withStateDependentPracticeValue = (song: SongTarget): SongTarget =>
    withStructuralTrainingValue(
      song,
      remainingTrainings,
      friendshipSongMultiplier,
    );
  const visibleSongs = rawVisibleSongs.map(withStateDependentPracticeValue);
  const remainingSongs = rawRemainingSongs.map(withStateDependentPracticeValue);
  const futureSongs = rawFutureSongs.map(withStateDependentPracticeValue);
  const laterSongs = rawLaterSongs.map(withStateDependentPracticeValue);
  const diagnostics: SongPolicyDiagnostics = {
    totalMs: 0,
    tokenPressureMs: 0,
    runAnalysisMs: 0,
    transitionMs: 0,
    pageDpMs: 0,
    capacityMs: 0,
    crossSectionMs: 0,
    runAnalysisSamples: 0,
    transitionSamples: 0,
    capacityCacheHits: 0,
    capacityCacheMisses: 0,
    cacheHit: false,
  };
  const allReserveSongs = [...remainingSongs, ...futureSongs, ...laterSongs];
  const plan = deriveStrategicPlan({
    concertIndex,
    timingMode,
    remainingSongs: allReserveSongs,
    songsThisSection,
    abandonedChaseTargetIds,
  });
  const alignedHuntState =
    plan.mode === "hunt"
      ? alignHuntState(inputHuntState, plan.chaseTargets.ids)
      : null;
  const huntState =
    plan.mode !== "hunt"
      ? null
      : inputHuntState
        ? alignedHuntState
        : observeHuntPage({
            state: alignedHuntState ?? createHuntState(plan.chaseTargets.ids),
            targetIds: plan.chaseTargets.ids,
            visibleSongIds: visibleSongs.map((song) => song.id),
            pageKey: `standalone:${concertIndex}:${nextSongCycle}`,
          });
  const huntTargetTrainingExposure =
    plan.mode === "hunt"
      ? Math.max(
          0,
          ...allReserveSongs
            .filter((song) => isChaseTarget(song, plan))
            .map((song) => {
              if (remainingTrainings) {
                return structuralTrainingValue(
                  song.practiceBonus ?? "",
                  remainingTrainings,
                  friendshipSongMultiplier,
                );
              }
              const gain = song.roles?.includes("sp3-target")
                ? 3
                : song.roles?.includes("sp2-target")
                  ? 2
                  : 0;
              const horizon =
                TRAINING_HORIZON_BY_CONCERT[
                  Math.max(0, Math.min(4, Math.trunc(concertIndex)))
                ] ?? 0;
              return gain * horizon * Math.max(1, friendshipSongMultiplier);
            }),
        )
      : 0;
  const protectedReserveSongs = allReserveSongs.filter((song) =>
    isReserveTarget(song, plan),
  );
  const pressureStartedAt = nowMs();
  const reserveFeasibility = {
    period,
    firstOfferPeriod,
    concertIndex,
    nextSongCycle: Math.max(1, nextSongCycle - 1),
    techniquesToNextSong: 0,
    visibleSongs,
    reserveSongIds: remainingSongs.map((song) => song.id),
  } as const;
  const resourceEconomy = buildSharedResourceEconomy({
    tokens,
    currentSongs: remainingSongs,
    futureSongs,
    laterSongs,
    visibleSongIds: visibleSongs.map((song) => song.id),
    plan,
    concertIndex,
    timingMode,
    requiredPurchases:
      timingMode === "deadline-now"
        ? Math.max(0, plan.manualGaugeTarget - songsThisSection)
        : 0,
    generationProfile,
    reserveFeasibility,
  });
  const { tokenPressure, tokenReservePlan } = resourceEconomy;
  diagnostics.tokenPressureMs += nowMs() - pressureStartedAt;
  const policies: SongPolicyEvaluation[] = [];
  const threshold = riskThreshold(riskProfile);
  const finalGreatSuccessAlreadySecured =
    concertIndex === 4 && isGreatSuccess(4, songsThisSection);
  const terminalConversionActive =
    concertIndex === 4 && finalGreatSuccessAlreadySecured;
  // The raw 18-song counter is diagnostic only. At Grand Live, the only hard
  // mechanical obligation kept in the decision vector is the manual-song gauge
  // required for final Great Success. Once that gauge is secured, ordinary
  // opportunity-cost logic resumes.
  const finalGaugeHardActive =
    timingMode === "deadline-now" &&
    concertIndex === 4 &&
    !finalGreatSuccessAlreadySecured;
  const pacingTarget =
    timingMode === "deadline-now" ? plan.checkpointRequired : null;
  const pageHorizon = Math.max(
    1,
    Math.min(
      maxSongPages,
      plan.mode === "hunt" ? 4 : plan.mode === "hold" ? 1 : 3,
    ),
  );
  const capacityCache = new Map<string, PurchaseCapacity>();
  // Every visible purchase is evaluated against common random technique pages.
  // Sharing this memo makes that modelling choice computational as well as
  // statistical: identical future offers are generated once per decision.
  const runAnalysisTechniqueMemo = createTechniqueSimulationMemo();
  const crossSectionTechniqueMemo = createTechniqueSimulationMemo();
  const capacityFor = (
    balance: Balance,
    pool: SongTarget[],
    stopAfter: number,
  ): PurchaseCapacity => {
    const key = `${Math.max(0, stopAfter)}:${TOKEN_KEYS.map((token) => balance[token]).join(",")}:${pool
      .map((song) => song.id)
      .sort()
      .join("|")}`;
    const cached = capacityCache.get(key);
    if (cached) {
      diagnostics.capacityCacheHits += 1;
      return cached;
    }
    diagnostics.capacityCacheMisses += 1;
    const capacityStartedAt = nowMs();
    const computed = maximumAffordablePurchases(balance, pool, 6000, stopAfter);
    diagnostics.capacityMs += nowMs() - capacityStartedAt;
    capacityCache.set(key, computed);
    return computed;
  };
  const analysisTrialBudget =
    trials <= 8000 ? Math.min(trials, 1536) : Math.min(trials, 3072);
  // Express may stop one convergence batch earlier on decisive states.
  // Expert retains the previous 768-sample floor.
  const analysisMinimumSamples = trials <= 8000 ? 512 : 768;
  const transitionTrialBudget =
    trials <= 8000 ? Math.min(trials, 384) : Math.min(trials, 768);
  const crossSectionTrialBudget =
    laterSongs.length > 0
      ? Math.min(trials, 64)
      : trials <= 8000
        ? Math.min(trials, 128)
        : Math.min(trials, 224);
  const crossSectionCouplingKey =
    `cross-section:${concertIndex}:${nextSongCycle}:terminal`;
  const visibleAffordableChaseTarget = visibleSongs.some(
    (candidate) =>
      isChaseTarget(candidate, plan) && canAfford(tokens, candidate.cost),
  );
  const activeHuntComponents = (
    state: "acquired-now" | "preserved" | "carried" | "abandoned",
    probability = 0,
    huntDecision: HuntDecision | null = null,
  ): HorizonOutcomeComponent[] => {
    if (plan.mode !== "hunt") return [];
    const rank =
      state === "acquired-now"
        ? 3
        : state === "carried" ||
            (state === "preserved" &&
              (huntDecision === null || huntDecision.action === "continue-hunt"))
          ? 2
          : 0;
    return [
      outcomeComponent(
        "hunt-state-rank",
        rank,
        "deterministic-consequence",
      ),
      outcomeComponent(
        "hunt-target-probability",
        state === "acquired-now" || state === "carried" ? 1 : probability,
        "zero-income-projection",
      ),
    ];
  };
  const pacingDecisionComponents = (
    totalAfterAction: number,
    continuing: boolean,
    continuationProbability: number,
  ): HorizonOutcomeComponent[] => {
    if (pacingTarget === null) return [];
    if (totalAfterAction >= pacingTarget) {
      return [
        outcomeComponent("pacing-state-rank", 2, "deterministic-consequence"),
        outcomeComponent("pacing-risk-rank", 2, "deterministic-consequence"),
      ];
    }
    if (continuing) {
      return [
        outcomeComponent(
          "pacing-state-rank",
          continuationProbability > 0 ? 2 : 0,
          "zero-income-projection",
        ),
        outcomeComponent(
          "pacing-risk-rank",
          continuationProbability >= threshold ? 2 : 1,
          "zero-income-projection",
        ),
      ];
    }
    // P3b1 discrete-gate invariant: raw counter progress does not receive a
    // fractional reward. An unmet pacing reference is simply not crossed.
    return [
      outcomeComponent("pacing-state-rank", 1, "deterministic-consequence"),
      outcomeComponent("pacing-risk-rank", 0, "deterministic-consequence"),
    ];
  };
  const nextSectionComponents = (
    readiness: CrossSectionReadinessResult | null,
  ): HorizonOutcomeComponent[] => {
    if (!readiness) return [];
    const uncertainty: OutcomeUncertainty = {
      kind: "monte-carlo",
      couplingKey: crossSectionCouplingKey,
    };
    return [
      outcomeComponent(
        "next-section-completion-state",
        readiness.checkpointState,
        "zero-income-projection",
        uncertainty,
      ),
      outcomeComponent(
        "next-section-friendship10-probability",
        readiness.effectiveFriendship10Probability,
        "zero-income-projection",
        uncertainty,
      ),
      outcomeComponent(
        "next-section-target-probability",
        readiness.targetProbability,
        "zero-income-projection",
        uncertainty,
      ),
      outcomeComponent(
        "next-section-structural-purchases",
        readiness.expectedStructuralPurchases,
        "zero-income-projection",
        uncertainty,
      ),
      outcomeComponent(
        "next-section-purchases",
        readiness.expectedPurchases,
        "zero-income-projection",
        uncertainty,
      ),
    ];
  };
  const gateUtilityComponents = (
    songsNow: number,
    readiness: CrossSectionReadinessResult | null = null,
  ): HorizonOutcomeComponent[] => {
    const uncertainty: OutcomeUncertainty = readiness
      ? { kind: "monte-carlo", couplingKey: crossSectionCouplingKey }
      : { kind: "none" };
    const components: HorizonOutcomeComponent[] = [
      outcomeComponent(
        "gate16-crossed",
        songsNow >= 16 ? 1 : 0,
        "deterministic-consequence",
      ),
      outcomeComponent(
        "gate18-crossed",
        songsNow >= 18 ? 1 : 0,
        "deterministic-consequence",
      ),
    ];
    if (songsNow < 16 && readiness && readiness.valueConcertIndex >= 3) {
      components.push(
        outcomeComponent(
          "gate16-zero-income-reach",
          readiness.gate16Probability,
          "zero-income-projection",
          uncertainty,
        ),
      );
    }
    if (songsNow < 18 && readiness && readiness.valueConcertIndex >= 4) {
      components.push(
        outcomeComponent(
          "gate18-zero-income-reach",
          readiness.gate18Probability,
          "zero-income-projection",
          uncertainty,
        ),
      );
    }
    return components;
  };

  const resourceStateComponents = ({
    retainedTokens,
    visibleSongCost = 0,
    futureTechniqueCost = 0,
    fundingFeasibility,
    retainedProvenance,
    futureTechniqueUncertainty = { kind: "none" },
  }: {
    retainedTokens: number;
    visibleSongCost?: number;
    futureTechniqueCost?: number;
    fundingFeasibility?: PhysicalFundingFeasibility;
    retainedProvenance: "observed" | "deterministic-consequence" | "zero-income-projection";
    futureTechniqueUncertainty?: OutcomeUncertainty;
  }): HorizonOutcomeComponent[] => [
    outcomeComponent("retained-tokens", retainedTokens, retainedProvenance),
    outcomeComponent("visible-song-cost", visibleSongCost, "observed"),
    outcomeComponent(
      "future-technique-cost-expected",
      futureTechniqueCost,
      "zero-income-projection",
      futureTechniqueUncertainty,
    ),
    ...(fundingFeasibility
      ? TOKEN_KEYS.map((token) =>
          outcomeComponent(
            `immediate-funding-gap:${token}`,
            fundingFeasibility.immediateFundingGap[token],
            "observed",
          ),
        )
      : []),
  ];

  const physicalPageActions = enumeratePageActions({
    tokens,
    visibleSongs,
    timingMode,
    concertIndex,
  });
  const physicalActionKeys = new Set(physicalPageActions.map(pageActionKey));
  const carriedPageAction = physicalPageActions.find(
    (action) => action.kind === "carry-current-page",
  );
  const carriedPageSongIds = canonicalPageSongIds(visibleSongs);

  for (const song of visibleSongs) {
    const affordable = canAfford(tokens, song.cost);
    const immediateSongFundingGap = fundingGap(tokens, song.cost);
    const fundingFeasibility: PhysicalFundingFeasibility = {
      physicalAffordable: affordable,
      immediateFundingGap: immediateSongFundingGap,
      weightedFundingGap: weightedFundingGap(
        immediateSongFundingGap,
        resourceEconomy.shadowPrices,
      ),
    };
    const afterPurchase = affordable ? subtractCost(tokens, song.cost) : tokens;
    const nextPool = remainingSongs.filter(
      (candidate) => candidate.id !== song.id,
    );
    const countAfterPurchase = songsThisSection + 1;
    const totalAfterPurchase = totalSongs + 1;
    const postPurchaseSongs = [...nextPool, ...futureSongs, ...laterSongs];
    const planAfterPurchase = deriveStrategicPlan({
      concertIndex,
      timingMode,
      remainingSongs: postPurchaseSongs,
      songsThisSection: countAfterPurchase,
      abandonedChaseTargetIds,
    });
    const abandonedAfterPurchaseIds = Array.from(
      new Set([...abandonedChaseTargetIds, ...plan.chaseTargets.ids]),
    );
    const holdPlanAfterPurchase = deriveStrategicPlan({
      concertIndex,
      timingMode,
      remainingSongs: postPurchaseSongs,
      songsThisSection: countAfterPurchase,
      abandonedChaseTargetIds: abandonedAfterPurchaseIds,
    });
    const currentIsChaseTarget = isChaseTarget(song, plan);
    const currentIsVisibleOptional = isVisibleOptionalTarget(song, plan);
    const currentIsOpportunity =
      currentIsChaseTarget || currentIsVisibleOptional;
    const currentEffects = acquiredEffectsForSong({
      song,
      concertIndex,
      remainingTrainingsByFacility: remainingTrainings,
      friendshipSongMultiplier,
    });
    const currentPracticeTrainingExposure = effectExposure(
      currentEffects,
      "practice",
    );
    const currentSpTrainingExposure = effectExposure(
      currentEffects,
      "sp-training",
    );
    const currentFriendshipTrainingExposure = effectExposure(
      currentEffects,
      "friendship",
    );
    const immediateActivationPriority =
      currentIsChaseTarget ||
      (song.roles?.includes("friendship-10") === true &&
        currentFriendshipTrainingExposure > 0);
    const pacingMissing = Math.max(0, (pacingTarget ?? 0) - totalAfterPurchase);
    const finalGaugeMissing =
      timingMode === "deadline-now"
        ? Math.max(0, plan.manualGaugeTarget - countAfterPurchase)
        : 0;
    const requiredFuturePurchases = Math.max(pacingMissing, finalGaugeMissing);
    const objective =
      continuationObjective ??
      resolveStrategicObjective({
        plan: planAfterPurchase,
        songsThisSection: countAfterPurchase,
        totalSongs: totalAfterPurchase,
        songs: nextPool,
      });
    const postPurchaseDemands = deriveReachableDemands({
      currentSongs: nextPool,
      futureSongs,
      laterSongs,
      plan: planAfterPurchase,
      concertIndex,
      timingMode,
      requiredPurchases: requiredFuturePurchases,
    });
    const nextAnalysisSeedKey = `technique:${concertIndex}:${nextSongCycle}:0`;
    const nextStartedAt = nowMs();
    const next = runAnalysis({
      period,
      firstOfferPeriod,
      tokens: afterPurchase,
      techniquesRemaining: techniquesToNextSong,
      nextSongCycle,
      songs: nextPool,
      reserveSongs: postPurchaseSongs.filter((candidate) =>
        isReserveTarget(candidate, planAfterPurchase),
      ),
      resourceDemands: postPurchaseDemands,
      objective,
      strategicPlan: planAfterPurchase,
      riskProfile,
      generationProfile,
      seedKey: nextAnalysisSeedKey,
      trials: analysisTrialBudget,
      minimumSamples: analysisMinimumSamples,
      techniqueMemo: runAnalysisTechniqueMemo,
    });
    diagnostics.runAnalysisMs += nowMs() - nextStartedAt;
    diagnostics.runAnalysisSamples += next.trials;
    const transitionPages = Math.max(1, pageHorizon - 1);
    const needsHuntLookahead =
      planAfterPurchase.mode === "hunt" &&
      !currentIsChaseTarget &&
      !visibleAffordableChaseTarget;
    const needsTransitionRollout =
      requiredFuturePurchases > 0 ||
      needsHuntLookahead ||
      terminalConversionActive;
    const transitionRequiredPurchases = terminalConversionActive
      ? Math.max(1, requiredFuturePurchases)
      : requiredFuturePurchases;
    const expectedNextTechniqueCost =
      techniquesToNextSong <= 0
        ? 0
        : next.reachProbability * next.averageSuccessSpend + next.expectedWaste;
    const expectedNextTechniquePurchases =
      techniquesToNextSong <= 0
        ? 0
        : next.reachProbability * techniquesToNextSong +
          next.failureDepth.reduce(
            (sum, probability, depth) => sum + probability * depth,
            0,
          );
    const transitionSeedKey = `song-transition:${concertIndex}:${nextSongCycle}`;
    const transitionStartedAt = nowMs();
    const transitionAware = needsTransitionRollout
      ? evaluateTransitionAwareSongPages({
          period,
          firstOfferPeriod,
          balance: afterPurchase,
          pool: nextPool,
          reserveSongs: nextPool.filter((candidate) =>
            isReserveTarget(candidate, planAfterPurchase),
          ),
          futureReserveSongs: [...futureSongs, ...laterSongs].filter(
            (candidate) => isReserveTarget(candidate, planAfterPurchase),
          ),
          plan: planAfterPurchase,
          concertIndex,
          songsThisSection: countAfterPurchase,
          nextSongCycle,
          techniquesToNextSong,
          pages: transitionPages,
          requiredPurchases: transitionRequiredPurchases,
          acquiredPlanTarget: currentIsChaseTarget,
          riskProfile,
          generationProfile,
          trials: transitionTrialBudget,
          // Common random numbers across visible purchases reduce ranking noise.
          seedKey: transitionSeedKey,
        })
      : {
          checkpointProbability: 1,
          targetProbability:
            currentIsChaseTarget || planAfterPurchase.mode !== "hunt" ? 1 : 0,
          firstPageReachProbability: next.reachProbability,
          firstPageAnyAffordableProbability:
            next.reachAnySongAffordableProbability,
          firstPageTargetAffordableProbability:
            next.reachPrioritySongAffordableProbability,
          expectedPurchases: 0,
          expectedTechniquePurchases: expectedNextTechniquePurchases,
          expectedLessonSkillPoints: 0,
          expectedCommittedCost: expectedNextTechniqueCost,
          expectedRetainedTokens: Math.max(
            0,
            totalCost(afterPurchase) - expectedNextTechniqueCost,
          ),
          expectedRetainedBalance: afterPurchase,
          bestStructuralTierProbability: 0,
          expectedStructuralPurchases: 0,
          expectedFriendshipPurchases: 0,
          expectedFriendshipBonus: 0,
          friendship10AcquisitionProbability: 0,
          pages: 0,
          trials: 0,
          maxTrials: 0,
          converged: true,
          uncertainAtBudgetLimit: false,
          exactEnumeration: false as const,
          lawConfidence: "heuristic" as const,
          pageLaw: "uniform" as const,
          conditionalOn: "transition-costed-pages" as const,
        };
    diagnostics.transitionMs += nowMs() - transitionStartedAt;
    diagnostics.transitionSamples += transitionAware.trials;
    const pageDpStartedAt = nowMs();
    const continuationCoverage = needsTransitionRollout
      ? planAfterPurchase.mode === "hunt"
        ? transitionAware.targetProbability
        : transitionAware.checkpointProbability
      : evaluatePageCoverage(afterPurchase, nextPool, planAfterPurchase)
          .anyAffordableProbability;
    diagnostics.pageDpMs += nowMs() - pageDpStartedAt;
    const afterPurchaseCapacity = capacityFor(
      afterPurchase,
      nextPool,
      Math.max(0, 18 - totalAfterPurchase),
    );
    const status16 = statusFor({
      totalSongs: totalAfterPurchase,
      requiredSongs: 16,
      balance: afterPurchase,
      pool: nextPool,
      timingMode: timingForCheckpoint(16, concertIndex, timingMode),
      capacity: afterPurchaseCapacity,
    });
    const status18 = statusFor({
      totalSongs: totalAfterPurchase,
      requiredSongs: 18,
      balance: afterPurchase,
      pool: nextPool,
      timingMode: timingForCheckpoint(18, concertIndex, timingMode),
      capacity: afterPurchaseCapacity,
    });
    const greatSuccessStop = isGreatSuccess(concertIndex, countAfterPurchase)
      ? 1
      : 0;
    const gaugeMissing = Math.max(
      0,
      plan.manualGaugeTarget - countAfterPurchase,
    );
    const greatSuccessContinue =
      greatSuccessStop === 1
        ? 1
        : timingMode === "deadline-now" && gaugeMissing > 0
          ? transitionAware.checkpointProbability
          : null;
    const gateStop = finalGateSecured(totalAfterPurchase, countAfterPurchase);
    const stopHard = finalGaugeHardActive ? greatSuccessStop : 1;
    const continuationClosureProbability =
      requiredFuturePurchases <= 0
        ? 1
        : requiredFuturePurchases === 1
          ? next.reachAnySongAffordableProbability
          : transitionAware.checkpointProbability;
    const pacingContinuationProbability =
      pacingTarget !== null && totalAfterPurchase < pacingTarget
        ? next.reachAnySongAffordableProbability
        : continuationClosureProbability;
    const continueHard = finalGaugeHardActive
      ? continuationClosureProbability
      : 1;
    const tier = structuralTier(song, plan);
    const retainedAfterLive =
      timingMode === "deadline-now" && concertIndex < 4
        ? applyPromotionalLiveTransition(afterPurchase, concertIndex)
        : afterPurchase;
    const coverageAfter = evaluatePageCoverage(
      retainedAfterLive,
      nextPool,
      planAfterPurchase,
    );
    const baseReasons: Message[] = [
      planReasonMessage(plan),
      ...(currentIsOpportunity
        ? ([
            { code: "reason.structuralTargetVisible" },
            currentIsChaseTarget
              ? { code: "reason.chaseTargetVisible" }
              : { code: "reason.opportunityVisible" },
          ] satisfies Message[])
        : []),
      ...statusReasons(status16.status, status18.status),
    ];
    if (
      coverageAfter.affordablePlanTargetCount === 0 &&
      planAfterPurchase.mode === "hunt"
    ) {
      baseReasons.push({ code: "reason.noAffordablePlanTarget" });
    }

    const makeBuyPolicy = (
      action: "buy-stop" | "buy-continue",
    ): SongPolicyEvaluation => {
      const continuing = action === "buy-continue";
      const immediateTarget =
        planAfterPurchase.mode === "hunt"
          ? next.reachPrioritySongAffordableProbability
          : next.reachAnySongAffordableProbability;
      const conditionalTarget =
        planAfterPurchase.mode === "hunt"
          ? transitionAware.targetProbability
          : next.reachAnySongAffordableProbability;
      const hardProbability = continuing ? continueHard : stopHard;
      const huntDecision =
        plan.mode === "hunt" && !currentIsChaseTarget && huntState
          ? evaluateHuntDecision({
              state: huntState,
              findAndFundProbability: conditionalTarget,
              targetUtilityStatPoints: huntTargetTrainingExposure,
            })
          : null;
      const huntAbandonReason: Message | null =
        huntDecision?.action === "abandon-to-hold"
          ? {
              code: "reason.huntAbandonMarginalValue",
              probability: huntDecision.findAndFundProbability,
              netValue: huntDecision.netValue,
              pages: huntDecision.pagesSeenWithoutTarget,
            }
          : null;
      const abandonsHunt = !continuing && huntAbandonReason !== null;
      const effectivePlanAfterPurchase = abandonsHunt
        ? holdPlanAfterPurchase
        : planAfterPurchase;
      const effectivePostPurchaseObjective = abandonsHunt
        ? resolveStrategicObjective({
            plan: effectivePlanAfterPurchase,
            songsThisSection: countAfterPurchase,
            totalSongs: totalAfterPurchase,
            songs: nextPool,
          })
        : objective;
      const overrideForbidden =
        plan.mode === "hunt" && currentIsChaseTarget && !finalGaugeHardActive;
      const postPurchaseContinuationSaysStop =
        next.recommendation === "stop" || next.recommendation === "invalid";
      const normalContinuationForbidden =
        planAfterPurchase.mode === "hold" ||
        overrideForbidden ||
        huntAbandonReason !== null ||
        postPurchaseContinuationSaysStop;
      const normalPurchaseForbidden =
        plan.mode === "hold" && !currentIsOpportunity;
      const terminalClosureValid = continuing || stopHard === 1;
      const postPurchaseWantsContinuation =
        next.recommendation === "safe" ||
        next.recommendation === "push" ||
        next.recommendation === "risky";
      // `risky` is a diagnostic class, not permission to continue. Admission
      // must use the same profile threshold that ranks the action. Otherwise a
      // risky rollout below Standard's threshold can invalidate BUY_STOP while
      // BUY_CONTINUE is itself inadmissible: the F-01 dead zone.
      const continuationRiskAdmissible =
        concertIndex === 4
          ? !finalGaugeHardActive || hardProbability > 0
          : next.reachProbability >= threshold &&
            (!finalGaugeHardActive || hardProbability >= threshold);
      // The generic technique rollout may still say PUSH after a song that has
      // already satisfied the strategic plan (HOLD, final gate closed, etc.).
      // The invariant must compare against the effective post-purchase policy,
      // not that lower-level raw recommendation.
      const effectivePostPurchaseWantsContinuation =
        postPurchaseWantsContinuation &&
        continuationRiskAdmissible &&
        !normalContinuationForbidden;
      const actionMatchesPostPurchase = continuing
        ? effectivePostPurchaseWantsContinuation
        : abandonsHunt || !effectivePostPurchaseWantsContinuation;
      const physicalAction = pageActionKey({ kind: action, songId: song.id });
      const normalValid =
        physicalActionKeys.has(physicalAction) &&
        affordable &&
        terminalClosureValid &&
        !normalPurchaseForbidden &&
        actionMatchesPostPurchase;
      const continuationNotHardBlocked =
        !finalGaugeHardActive || hardProbability > 0;
      const overrideEligible =
        affordable &&
        continuing &&
        !overrideForbidden &&
        huntAbandonReason === null &&
        continuationNotHardBlocked;
      const crossSectionStartedAt = nowMs();
      const nextSectionReadiness =
        timingMode === "deadline-now" &&
        concertIndex < 4 &&
        (!continuing || normalValid || overrideEligible)
          ? evaluateCrossSectionReadiness({
              completedConcertIndex: concertIndex,
              currentPeriod: period,
              currentFirstOfferPeriod: firstOfferPeriod,
              balanceBeforeLive: afterPurchase,
              currentPool: nextPool,
              futureSongs,
              laterSongs,
              totalSongsBeforeNextSection: totalAfterPurchase,
              activatedFriendshipBonus:
                song.roles?.includes("friendship-10") === true ||
                song.roles?.includes("friendship-5") === true
                  ? Math.max(0, song.liveValue ?? 0)
                  : 0,
              activatedFriendship10:
                song.roles?.includes("friendship-10") === true,
              currentContinuation: continuing
                ? {
                    plan: planAfterPurchase,
                    nextSongCycle,
                    techniquesToNextSong,
                    pages: transitionPages,
                    requiredPurchases: Math.max(1, requiredFuturePurchases),
                    acquiredPlanTarget: currentIsChaseTarget,
                  }
                : undefined,
              riskProfile,
              generationProfile,
              commonShadowPrices: resourceEconomy.shadowPrices,
              remainingTrainingsByFacility: remainingTrainings ?? undefined,
              friendshipSongMultiplier,
              trials: crossSectionTrialBudget,
              techniqueMemo: crossSectionTechniqueMemo,
              // Common random numbers make STOP/buy/carry differences reflect
              // the state transition, not a different deterministic draw law.
              seedKey: crossSectionCouplingKey,
            })
          : null;
      diagnostics.crossSectionMs += nowMs() - crossSectionStartedAt;
      const hardState = !finalGaugeHardActive
        ? 1
        : stopHard === 1
          ? 2
          : continuing && hardProbability > 0
            ? 1
            : 0;
      const riskState =
        concertIndex === 4
          ? hardState > 0
            ? 1
            : 0
          : hardState > 0 &&
              (!continuing ||
                (next.reachProbability >= threshold &&
                  (!finalGaugeHardActive || hardProbability >= threshold)))
            ? 1
            : 0;
      const effectiveCoverageAfter = abandonsHunt
        ? evaluatePageCoverage(
            retainedAfterLive,
            nextPool,
            effectivePlanAfterPurchase,
          )
        : coverageAfter;
      const horizonExpectedPracticeStatDelta =
        currentPracticeTrainingExposure +
        (nextSectionReadiness?.expectedPracticeTrainingExposure ?? 0);
      const horizonExpectedSkillPoints =
        25 +
        currentSpTrainingExposure +
        (nextSectionReadiness
          ? nextSectionReadiness.expectedSpTrainingExposure +
            nextSectionReadiness.expectedLessonSkillPoints
          : continuing
            ? transitionAware.expectedLessonSkillPoints
            : 0);
      const horizonFriendshipExposure =
        currentFriendshipTrainingExposure +
        (nextSectionReadiness?.expectedFriendshipTrainingExposure ?? 0);
      const horizonOutcome = createHorizonOutcome({
        tieId: `${song.id}:${action}`,
        components: [
          outcomeComponent(
            "hard-state",
            affordable ? hardState : 0,
            "deterministic-consequence",
          ),
          outcomeComponent(
            "risk-admissible-state",
            affordable ? riskState : 0,
            "zero-income-projection",
          ),
          outcomeComponent("structural-tier", tier, "deterministic-consequence"),
          outcomeComponent(
            "expected-practice-stat-delta",
            horizonExpectedPracticeStatDelta,
            "zero-income-projection",
            nextSectionReadiness
              ? { kind: "monte-carlo", couplingKey: crossSectionCouplingKey }
              : { kind: "none" },
          ),
          outcomeComponent(
            "expected-skill-points",
            horizonExpectedSkillPoints,
            "zero-income-projection",
            nextSectionReadiness
              ? { kind: "monte-carlo", couplingKey: crossSectionCouplingKey }
              : { kind: "none" },
          ),
          outcomeComponent(
            "friendship-exposure",
            horizonFriendshipExposure,
            "zero-income-projection",
            nextSectionReadiness
              ? { kind: "monte-carlo", couplingKey: crossSectionCouplingKey }
              : { kind: "none" },
          ),
          ...activeHuntComponents(
            currentIsChaseTarget
              ? "acquired-now"
              : continuing && huntAbandonReason === null
                ? "preserved"
                : "abandoned",
            conditionalTarget,
            huntDecision,
          ),
          ...pacingDecisionComponents(
            totalAfterPurchase,
            continuing,
            pacingContinuationProbability,
          ),
          outcomeComponent(
            "immediate-activation-priority",
            immediateActivationPriority ? 1 : 0,
            "deterministic-consequence",
          ),
          outcomeComponent(
            "great-success-secured",
            greatSuccessStop,
            "deterministic-consequence",
          ),
          ...(timingMode === "deadline-now" &&
          concertIndex < 4 &&
          continuing &&
          greatSuccessStop === 0 &&
          greatSuccessContinue !== null
            ? [
                outcomeComponent(
                  "great-success-zero-income-reach",
                  greatSuccessContinue,
                  "zero-income-projection",
                  { kind: "monte-carlo", couplingKey: transitionSeedKey },
                ),
              ]
            : []),
          ...nextSectionComponents(nextSectionReadiness),
          ...gateUtilityComponents(totalAfterPurchase, nextSectionReadiness),
          ...(finalGaugeHardActive
            ? [
                outcomeComponent(
                  "final-gauge-zero-income-reach",
                  continuing ? hardProbability : greatSuccessStop,
                  continuing
                    ? "zero-income-projection"
                    : "deterministic-consequence",
                ),
              ]
            : []),
          outcomeComponent(
            "current-target-probability",
            continuing
              ? conditionalTarget
              : currentIsOpportunity
                ? 1
                : effectiveCoverageAfter.planTargetProbability,
            continuing
              ? "zero-income-projection"
              : "deterministic-consequence",
          ),
          outcomeComponent(
            "immediate-target-probability",
            continuing ? immediateTarget : 0,
            continuing
              ? "zero-income-projection"
              : "deterministic-consequence",
          ),
          outcomeComponent(
            "current-any-affordable-probability",
            continuing ? 0 : effectiveCoverageAfter.anyAffordableProbability,
            "zero-income-projection",
          ),
          outcomeComponent(
            "current-best-structural-tier",
            continuing ? 0 : effectiveCoverageAfter.bestStructuralTier,
            "zero-income-projection",
          ),
          outcomeComponent(
            "carried-page-preserved",
            0,
            "deterministic-consequence",
          ),
          outcomeComponent(
            "next-page-zero-income-reach",
            continuing ? next.reachProbability : 0,
            "zero-income-projection",
            { kind: "monte-carlo", couplingKey: nextAnalysisSeedKey },
          ),
          outcomeComponent(
            "continuation-coverage-probability",
            continuing ? continuationCoverage : 0,
            "zero-income-projection",
          ),
          ...resourceStateComponents({
            retainedTokens: continuing
              ? totalCost(retainedAfterLive) -
                transitionAware.expectedCommittedCost
              : totalCost(retainedAfterLive),
            visibleSongCost: totalCost(song.cost),
            futureTechniqueCost: continuing
              ? transitionAware.expectedCommittedCost
              : 0,
            futureTechniqueUncertainty: continuing
              ? { kind: "monte-carlo", couplingKey: transitionSeedKey }
              : { kind: "none" },
            fundingFeasibility,
            retainedProvenance: continuing
              ? "zero-income-projection"
              : "deterministic-consequence",
          }),
        ],
      });
      const reasons: Message[] = [...baseReasons];
      if (abandonsHunt && huntAbandonReason) reasons.push(huntAbandonReason);
      if (continuing && huntDecision?.action === "continue-hunt") {
        reasons.push({
          code: "reason.huntContinueMarginalValue",
          probability: huntDecision.findAndFundProbability,
          netValue: huntDecision.netValue,
          pages: huntDecision.pagesSeenWithoutTarget,
        });
      }
      if (continuing && huntAbandonReason) {
        reasons.push({
          code: "reason.huntContinuationRefused",
          cause: huntAbandonReason,
        });
      }
      if (
        greatSuccessStop === 1 &&
        !isGreatSuccess(concertIndex, songsThisSection)
      ) {
        reasons.push({ code: "reason.securesGreatSuccess" });
      }
      if (nextSectionReadiness) {
        reasons.push({
          code: "reason.nextSectionCheckpoint",
          probability: nextSectionReadiness.checkpointProbability,
          checkpointRequired: nextSectionReadiness.checkpointRequired,
          horizonSections: nextSectionReadiness.horizonSections,
        });
        reasons.push({
          code: "reason.nextSectionValue",
          friendshipBonus: nextSectionReadiness.expectedFriendshipBonus,
          friendshipTrainingExposure:
            nextSectionReadiness.expectedFriendshipTrainingExposure,
          spTrainingExposure: nextSectionReadiness.expectedSpTrainingExposure,
          practiceTrainingExposure:
            nextSectionReadiness.expectedPracticeTrainingExposure,
          lessonSkillPoints: nextSectionReadiness.expectedLessonSkillPoints,
          horizonSections: nextSectionReadiness.horizonSections,
        });
      }
      reasons.push({
        code: "reason.boundedLessonSkillPoints",
        points:
          25 +
          (continuing
            ? Math.round(transitionAware.expectedLessonSkillPoints)
            : 0),
      });
      if (
        !continuing &&
        !abandonsHunt &&
        (next.recommendation === "safe" ||
          next.recommendation === "push" ||
          next.recommendation === "risky")
      ) {
        reasons.push({ code: "reason.stopNotCommitted" });
      }
      if (continuing) {
        reasons.push({
          code: "reason.reachNextPage",
          probability: next.reachProbability,
        });
        if (plan.mode === "hunt") {
          reasons.push({
            code: "reason.findAndFundTarget",
            probability: conditionalTarget,
            pages: transitionAware.pages,
          });
        }
        reasons.push({ code: "reason.boundedMonteCarlo" });
      }
      return {
        id: `${song.id}:${action}`,
        action,
        songId: song.id,
        songName: song.name,
        valid: normalValid,
        affordable,
        fundingFeasibility,
        overrideEligible,
        score: 0,
        nextSongProbability:
          affordable && continuing ? next.reachProbability : 0,
        priorityAffordableProbability: !affordable
          ? 0
          : continuing
            ? immediateTarget
            : currentIsOpportunity
              ? 1
              : 0,
        greatSuccessProbability: continuing
          ? greatSuccessContinue
          : greatSuccessStop,
        checkpoint16Status: status16.status,
        checkpoint18Status: status18.status,
        finalGateStatus: gateStop
          ? "secured"
          : finalGaugeHardActive && !continuing && greatSuccessStop === 0
            ? "failed"
            : "open",
        conditionalPagesProbability: conditionalTarget,
        exactPageEnumeration: transitionAware.exactEnumeration,
        lateFailureProbability: continuing ? next.lateBlockProbability : 0,
        expectedWaste: continuing ? next.expectedWaste : 0,
        criticalCost: totalCost(song.cost),
        continuationRecommendation: abandonsHunt ? "stop" : next.recommendation,
        postPurchasePlanId: effectivePlanAfterPurchase.id,
        postPurchaseObjective: effectivePostPurchaseObjective,
        abandonsHunt,
        huntAbandonReason: huntAbandonReason ?? undefined,
        huntDecision: huntDecision ?? undefined,
        horizonOutcome,
        utilityAssessment: utilityAssessmentFromOutcome(horizonOutcome),
        decisionVector: decisionVectorFromUtilityAssessment(
          utilityAssessmentFromOutcome(horizonOutcome),
        ),
        nextSectionReadiness,
        valueOutcome: {
          lessonSkillPoints:
            25 + (continuing ? transitionAware.expectedLessonSkillPoints : 0),
          greatSuccessStatGain:
            greatSuccessStop === 1 &&
            !isGreatSuccess(concertIndex, songsThisSection)
              ? 35
              : 0,
          practiceBonusValue:
            concertIndex === 4 ? 0 : (song.practiceValue ?? 0),
          liveBonusValue: concertIndex === 4 ? 0 : (song.liveValue ?? 0),
          practiceTrainingExposure: currentPracticeTrainingExposure,
          spTrainingExposure: currentSpTrainingExposure,
          friendshipTrainingExposure: currentFriendshipTrainingExposure,
        },
        sampling: [
          {
            purpose: "page-reach",
            seedKey: nextAnalysisSeedKey,
            trials: next.trials,
            maxTrials: next.maxTrials,
            converged: next.converged,
            uncertainAtBudgetLimit: next.uncertainAtBudgetLimit,
            probabilities: {
              pageReachProbability: next.reachProbability,
              totalFindAndFundProbability: immediateTarget,
            },
          },
          ...(transitionAware.trials > 0
            ? [
                {
                  purpose: "transition-lookahead" as const,
                  seedKey: transitionSeedKey,
                  trials: transitionAware.trials,
                  maxTrials: transitionAware.maxTrials,
                  converged: transitionAware.converged,
                  uncertainAtBudgetLimit:
                    transitionAware.uncertainAtBudgetLimit,
                  probabilities: {
                    firstPageReachProbability:
                      transitionAware.firstPageReachProbability,
                    targetProbabilityAcrossHorizon:
                      transitionAware.targetProbability,
                    checkpointProbability:
                      transitionAware.checkpointProbability,
                  },
                },
              ]
            : []),
        ],
        reasons,
      };
    };

    policies.push(makeBuyPolicy("buy-stop"));
    policies.push(makeBuyPolicy("buy-continue"));
  }

  if (carriedPageAction?.kind === "carry-current-page") {
    const carryBalance = applyPromotionalLiveTransition(tokens, concertIndex);
    const carryCapacity = capacityFor(
      carryBalance,
      remainingSongs,
      Math.max(0, 18 - totalSongs),
    );
    const carryStatus16 = statusFor({
      totalSongs,
      requiredSongs: 16,
      balance: carryBalance,
      pool: remainingSongs,
      timingMode: "section-open",
      capacity: carryCapacity,
    });
    const carryStatus18 = statusFor({
      totalSongs,
      requiredSongs: 18,
      balance: carryBalance,
      pool: remainingSongs,
      timingMode: "section-open",
      capacity: carryCapacity,
    });
    const carryCoverage = evaluatePageCoverage(
      carryBalance,
      remainingSongs,
      plan,
    );
    const visibleChaseTarget = visibleSongs.some((song) =>
      isChaseTarget(song, plan),
    );
    const visibleOpportunity = visibleSongs.some(
      (song) =>
        isChaseTarget(song, plan) || isVisibleOptionalTarget(song, plan),
    );
    const bestVisibleTier = Math.max(
      0,
      ...visibleSongs.map((song) => structuralTier(song, plan)),
    );
    const carryCrossStartedAt = nowMs();
    const carryNextSectionReadiness = evaluateCrossSectionReadiness({
      completedConcertIndex: concertIndex,
      currentPeriod: period,
      currentFirstOfferPeriod: firstOfferPeriod,
      balanceBeforeLive: tokens,
      currentPool: remainingSongs,
      futureSongs,
      laterSongs,
      totalSongsBeforeNextSection: totalSongs,
      carriedPage: visibleSongs,
      riskProfile,
      generationProfile,
      commonShadowPrices: resourceEconomy.shadowPrices,
      remainingTrainingsByFacility: remainingTrainings ?? undefined,
      friendshipSongMultiplier,
      trials: crossSectionTrialBudget,
      techniqueMemo: crossSectionTechniqueMemo,
      seedKey: crossSectionCouplingKey,
    });
    diagnostics.crossSectionMs += nowMs() - carryCrossStartedAt;
    const carryHorizonOutcome = createHorizonOutcome({
      tieId: `carry-page:${carriedPageSongIds.join(",")}`,
      components: [
        outcomeComponent("hard-state", 1, "deterministic-consequence"),
        outcomeComponent(
          "risk-admissible-state",
          1,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "structural-tier",
          bestVisibleTier,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "expected-practice-stat-delta",
          carryNextSectionReadiness?.expectedPracticeTrainingExposure ?? 0,
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        outcomeComponent(
          "expected-skill-points",
          (carryNextSectionReadiness?.expectedSpTrainingExposure ?? 0) +
            (carryNextSectionReadiness?.expectedLessonSkillPoints ?? 0),
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        outcomeComponent(
          "friendship-exposure",
          carryNextSectionReadiness?.expectedFriendshipTrainingExposure ?? 0,
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        ...activeHuntComponents(
          visibleChaseTarget ? "carried" : "abandoned",
        ),
        ...pacingDecisionComponents(totalSongs, false, 0),
        outcomeComponent(
          "immediate-activation-priority",
          0,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "great-success-secured",
          isGreatSuccess(concertIndex, songsThisSection) ? 1 : 0,
          "observed",
        ),
        ...nextSectionComponents(carryNextSectionReadiness),
        outcomeComponent(
          "current-target-probability",
          visibleOpportunity ? 1 : carryCoverage.planTargetProbability,
          "zero-income-projection",
        ),
        outcomeComponent(
          "current-any-affordable-probability",
          carryCoverage.anyAffordableProbability,
          "zero-income-projection",
        ),
        outcomeComponent(
          "current-best-structural-tier",
          carryCoverage.bestStructuralTier,
          "zero-income-projection",
        ),
        outcomeComponent(
          "carried-page-preserved",
          1,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "carry-without-opportunity-delay",
          visibleOpportunity ? 0 : 1,
          "deterministic-consequence",
        ),
        ...gateUtilityComponents(totalSongs, null),
          ...resourceStateComponents({
          retainedTokens: totalCost(carryBalance),
          retainedProvenance: "deterministic-consequence",
        }),
      ],
    });
    policies.push({
      id: `carry-page:${carriedPageSongIds.join(",")}`,
      action: "carry-page",
      songId: null,
      songName: visibleSongs.map((song) => song.name).join(" / "),
      carriedSongIds: carriedPageAction.songIds,
      valid: true,
      overrideEligible: false,
      score: 0,
      nextSongProbability:
        carryNextSectionReadiness?.targetProbability ??
        (visibleOpportunity ? carryCoverage.planTargetProbability : 0),
      priorityAffordableProbability: visibleOpportunity ? 1 : 0,
      greatSuccessProbability: isGreatSuccess(concertIndex, songsThisSection)
        ? 1
        : 0,
      checkpoint16Status: carryStatus16.status,
      checkpoint18Status: carryStatus18.status,
      finalGateStatus: "open",
      conditionalPagesProbability:
        carryNextSectionReadiness?.targetProbability ?? 1,
      exactPageEnumeration: true,
      lateFailureProbability: 0,
      expectedWaste: 0,
      criticalCost: 0,
      continuationRecommendation: null,
      abandonsHunt: plan.mode === "hunt" && !visibleChaseTarget,
      huntAbandonReason:
        plan.mode === "hunt" && !visibleChaseTarget
          ? { code: "reason.huntAbandonAtConcert" }
          : undefined,
      horizonOutcome: carryHorizonOutcome,
      utilityAssessment: utilityAssessmentFromOutcome(carryHorizonOutcome),
      decisionVector: decisionVectorFromUtilityAssessment(
        utilityAssessmentFromOutcome(carryHorizonOutcome),
      ),
      nextSectionReadiness: carryNextSectionReadiness,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
        practiceTrainingExposure: 0,
        spTrainingExposure: 0,
        friendshipTrainingExposure: 0,
      },
      reasons: [
        planReasonMessage(plan),
        { code: "carry.savesOneInheritedTechnique" },
        { code: "carry.creditCommonToBothBranches" },
        ...(carryNextSectionReadiness
          ? ([
              {
                code: "reason.carryNextSectionCheckpoint",
                probability: carryNextSectionReadiness.checkpointProbability,
                horizonSections: carryNextSectionReadiness.horizonSections,
              },
              {
                code: "reason.carryNextSectionValue",
                friendshipBonus:
                  carryNextSectionReadiness.expectedFriendshipBonus,
                friendshipTrainingExposure:
                  carryNextSectionReadiness.expectedFriendshipTrainingExposure,
                spTrainingExposure:
                  carryNextSectionReadiness.expectedSpTrainingExposure,
                practiceTrainingExposure:
                  carryNextSectionReadiness.expectedPracticeTrainingExposure,
                lessonSkillPoints:
                  carryNextSectionReadiness.expectedLessonSkillPoints,
              },
            ] satisfies Message[])
          : []),
      ],
    });
  }

  if (
    physicalActionKeys.has("stop-no-page") &&
    timingMode === "deadline-now" &&
    concertIndex < 4
  ) {
    const stopCapacity = capacityFor(
      tokens,
      remainingSongs,
      Math.max(0, 18 - totalSongs),
    );
    const stopStatus16 = statusFor({
      totalSongs,
      requiredSongs: 16,
      balance: tokens,
      pool: remainingSongs,
      timingMode: timingForCheckpoint(16, concertIndex, timingMode),
      capacity: stopCapacity,
    });
    const stopStatus18 = statusFor({
      totalSongs,
      requiredSongs: 18,
      balance: tokens,
      pool: remainingSongs,
      timingMode: timingForCheckpoint(18, concertIndex, timingMode),
      capacity: stopCapacity,
    });
    const stopHardSatisfied = true;
    const stopHardState = 1;
    const stopCrossStartedAt = nowMs();
    const stopNextSectionReadiness = evaluateCrossSectionReadiness({
      completedConcertIndex: concertIndex,
      currentPeriod: period,
      currentFirstOfferPeriod: firstOfferPeriod,
      balanceBeforeLive: tokens,
      currentPool: remainingSongs,
      futureSongs,
      laterSongs,
      totalSongsBeforeNextSection: totalSongs,
      riskProfile,
      generationProfile,
      commonShadowPrices: resourceEconomy.shadowPrices,
      remainingTrainingsByFacility: remainingTrainings ?? undefined,
      friendshipSongMultiplier,
      trials: crossSectionTrialBudget,
      techniqueMemo: crossSectionTechniqueMemo,
      seedKey: crossSectionCouplingKey,
    });
    if (stopNextSectionReadiness === null) {
      throw new Error(
        `Cross-section projection unavailable after concert ${concertIndex}`,
      );
    }
    diagnostics.crossSectionMs += nowMs() - stopCrossStartedAt;
    const retainedAfterLive = applyPromotionalLiveTransition(
      tokens,
      concertIndex,
    );
    const currentGreatSuccess = isGreatSuccess(concertIndex, songsThisSection);
    const stopHorizonOutcome = createHorizonOutcome({
      tieId: "stop-and-carry-stock",
      components: [
        outcomeComponent(
          "hard-state",
          stopHardState,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "risk-admissible-state",
          stopHardState > 0 ? 1 : 0,
          "deterministic-consequence",
        ),
        outcomeComponent("structural-tier", 1, "deterministic-consequence"),
        outcomeComponent(
          "expected-practice-stat-delta",
          stopNextSectionReadiness.expectedPracticeTrainingExposure,
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        outcomeComponent(
          "expected-skill-points",
          stopNextSectionReadiness.expectedSpTrainingExposure +
            stopNextSectionReadiness.expectedLessonSkillPoints,
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        outcomeComponent(
          "friendship-exposure",
          stopNextSectionReadiness.expectedFriendshipTrainingExposure,
          "zero-income-projection",
          { kind: "monte-carlo", couplingKey: crossSectionCouplingKey },
        ),
        ...activeHuntComponents("abandoned"),
        ...pacingDecisionComponents(totalSongs, false, 0),
        outcomeComponent(
          "immediate-activation-priority",
          0,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "great-success-secured",
          currentGreatSuccess ? 1 : 0,
          "observed",
        ),
        ...nextSectionComponents(stopNextSectionReadiness),
        outcomeComponent(
          "carried-page-preserved",
          0,
          "deterministic-consequence",
        ),
        ...gateUtilityComponents(totalSongs, null),
          ...resourceStateComponents({
          retainedTokens: totalCost(retainedAfterLive),
          retainedProvenance: "deterministic-consequence",
        }),
      ],
    });
    policies.push({
      id: "stop-and-carry-stock",
      action: "stop-and-carry-stock",
      songId: null,
      songName: null,
      valid: stopHardSatisfied,
      overrideEligible: false,
      score: 0,
      nextSongProbability: 0,
      priorityAffordableProbability: 0,
      greatSuccessProbability: currentGreatSuccess ? 1 : 0,
      checkpoint16Status: stopStatus16.status,
      checkpoint18Status: stopStatus18.status,
      finalGateStatus: finalGateSecured(totalSongs, songsThisSection)
        ? "secured"
        : "open",
      conditionalPagesProbability: 0,
      exactPageEnumeration: false,
      lateFailureProbability: 0,
      expectedWaste: 0,
      criticalCost: 0,
      continuationRecommendation: null,
      abandonsHunt: plan.mode === "hunt",
      huntAbandonReason:
        plan.mode === "hunt"
          ? { code: "reason.huntAbandonAtConcert" }
          : undefined,
      horizonOutcome: stopHorizonOutcome,
      utilityAssessment: utilityAssessmentFromOutcome(stopHorizonOutcome),
      decisionVector: decisionVectorFromUtilityAssessment(
        utilityAssessmentFromOutcome(stopHorizonOutcome),
      ),
      nextSectionReadiness: stopNextSectionReadiness,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
        practiceTrainingExposure: 0,
        spTrainingExposure: 0,
        friendshipTrainingExposure: 0,
      },
      reasons: [
        planReasonMessage(plan),
        { code: "reason.stopFullStockCarries" },
        ...(pacingTarget !== null && totalSongs < pacingTarget
          ? ([
              {
                code: "reason.pacingTargetMissed",
                target: pacingTarget,
                totalSongs,
              },
            ] satisfies Message[])
          : []),
        ...(stopNextSectionReadiness
          ? ([
              {
                code: "reason.stopNextSectionCheckpoint",
                probability: stopNextSectionReadiness.checkpointProbability,
                checkpointRequired: stopNextSectionReadiness.checkpointRequired,
                horizonSections: stopNextSectionReadiness.horizonSections,
              },
              {
                code: "reason.stopNextSectionFriendship",
                friendshipBonus:
                  stopNextSectionReadiness.expectedFriendshipBonus,
                friendshipTrainingExposure:
                  stopNextSectionReadiness.expectedFriendshipTrainingExposure,
                horizonSections: stopNextSectionReadiness.horizonSections,
              },
            ] satisfies Message[])
          : []),
        ...(currentGreatSuccess
          ? ([{ code: "reason.greatSuccessSecured" }] satisfies Message[])
          : ([{ code: "reason.greatSuccessNotSecured" }] satisfies Message[])),
      ],
    });
  }

  if (concertIndex === 4) {
    const stopCapacity = capacityFor(
      tokens,
      remainingSongs,
      Math.max(0, 18 - totalSongs),
    );
    const stopStatus16 = statusFor({
      totalSongs,
      requiredSongs: 16,
      balance: tokens,
      pool: remainingSongs,
      timingMode: "section-open",
      capacity: stopCapacity,
    });
    const stopStatus18 = statusFor({
      totalSongs,
      requiredSongs: 18,
      balance: tokens,
      pool: remainingSongs,
      timingMode: "deadline-now",
      capacity: stopCapacity,
    });
    const greatSuccessSecured = isGreatSuccess(4, songsThisSection);
    const gateSecured = finalGateSecured(totalSongs, songsThisSection);
    const finalStopHorizonOutcome = createHorizonOutcome({
      tieId: "stop-and-carry-stock",
      components: [
        outcomeComponent(
          "hard-state",
          greatSuccessSecured ? 1 : 0,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "risk-admissible-state",
          greatSuccessSecured ? 1 : 0,
          "deterministic-consequence",
        ),
        outcomeComponent("structural-tier", 0, "deterministic-consequence"),
        outcomeComponent(
          "great-success-secured",
          greatSuccessSecured ? 1 : 0,
          "observed",
        ),
        ...gateUtilityComponents(totalSongs, null),
          ...resourceStateComponents({
          retainedTokens: totalCost(tokens),
          retainedProvenance: "observed",
        }),
      ],
    });
    policies.push({
      id: "stop-and-carry-stock",
      action: "stop-and-carry-stock",
      songId: null,
      songName: null,
      valid: greatSuccessSecured,
      overrideEligible: false,
      score: 0,
      nextSongProbability: 0,
      priorityAffordableProbability: 0,
      greatSuccessProbability: isGreatSuccess(4, songsThisSection) ? 1 : 0,
      checkpoint16Status: stopStatus16.status,
      checkpoint18Status: stopStatus18.status,
      finalGateStatus: gateSecured ? "secured" : "open",
      conditionalPagesProbability: 0,
      exactPageEnumeration: true,
      lateFailureProbability: 0,
      expectedWaste: 0,
      criticalCost: 0,
      continuationRecommendation: null,
      abandonsHunt: false,
      horizonOutcome: finalStopHorizonOutcome,
      utilityAssessment: utilityAssessmentFromOutcome(finalStopHorizonOutcome),
      decisionVector: decisionVectorFromUtilityAssessment(
        utilityAssessmentFromOutcome(finalStopHorizonOutcome),
      ),
      nextSectionReadiness: null,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
        practiceTrainingExposure: 0,
        spTrainingExposure: 0,
        friendshipTrainingExposure: 0,
      },
      reasons: greatSuccessSecured
        ? ([
            planReasonMessage(plan),
            { code: "reason.finalGateSecuredCounter", totalSongs },
            plan.chaseTargets.ids.length === 0
              ? { code: "reason.noPriorityLeftInPool" }
              : { code: "reason.noVisiblePriorityJustifies" },
          ] satisfies Message[])
        : ([
            planReasonMessage(plan),
            { code: "reason.finalGateStillOpen" },
          ] satisfies Message[]),
    });
  }

  const bestVisible = [...visibleSongs].sort(
    (left, right) =>
      structuralTier(right, plan) - structuralTier(left, plan) ||
      left.name.localeCompare(right.name),
  )[0];
  if (bestVisible) {
    const coverage = evaluatePageCoverage(tokens, remainingSongs, plan);
    const bestVisibleIsOpportunity =
      isChaseTarget(bestVisible, plan) ||
      isVisibleOptionalTarget(bestVisible, plan);
    const currentCapacity = capacityFor(
      tokens,
      remainingSongs,
      Math.max(0, 18 - totalSongs),
    );
    const currentStatus16 = statusFor({
      totalSongs,
      requiredSongs: 16,
      balance: tokens,
      pool: remainingSongs,
      timingMode: timingForCheckpoint(16, concertIndex, timingMode),
      capacity: currentCapacity,
    });
    const currentStatus18 = statusFor({
      totalSongs,
      requiredSongs: 18,
      balance: tokens,
      pool: remainingSongs,
      timingMode: timingForCheckpoint(18, concertIndex, timingMode),
      capacity: currentCapacity,
    });
    const huntContinuationPolicies = policies.filter(
      (policy) => policy.action === "buy-continue",
    );
    const visibleChaseTarget = visibleSongs.some((song) =>
      isChaseTarget(song, plan),
    );
    const waitHuntAbandonReason =
      plan.mode === "hunt" &&
      !visibleChaseTarget &&
      (huntState?.pagesSeenWithoutTarget ?? 0) >= 3 &&
      huntContinuationPolicies.length > 0 &&
      huntContinuationPolicies.every((policy) => policy.huntAbandonReason)
        ? huntContinuationPolicies[0].huntAbandonReason
        : undefined;
    const waitAbandonsHunt = waitHuntAbandonReason !== undefined;
    const waitHuntDecision = waitAbandonsHunt
      ? huntContinuationPolicies.find((policy) => policy.huntDecision)
          ?.huntDecision
      : undefined;
    const missing = missingTokens(tokens, bestVisible);
    const tier = structuralTier(bestVisible, plan);
    const bestVisibleAffordable = canAfford(tokens, bestVisible.cost);
    const bestVisibleFundingGap = fundingGap(tokens, bestVisible.cost);
    const bestVisibleFundingFeasibility: PhysicalFundingFeasibility = {
      physicalAffordable: bestVisibleAffordable,
      immediateFundingGap: bestVisibleFundingGap,
      weightedFundingGap: weightedFundingGap(
        bestVisibleFundingGap,
        resourceEconomy.shadowPrices,
      ),
    };
    const reserveTargetsLostByPurchase = bestVisibleAffordable
      ? protectedReserveSongs.filter(
          (candidate) =>
            candidate.id !== bestVisible.id &&
            canAfford(tokens, candidate.cost) &&
            !canAfford(subtractCost(tokens, bestVisible.cost), candidate.cost),
        )
      : [];
    const waitReason: Message =
      missing.length > 0
        ? {
            code: "reason.waitMissingTokens",
            missing,
            songName: bestVisible.name,
          }
        : reserveTargetsLostByPurchase.length > 0
          ? {
              code: "reason.waitWouldBlockReserve",
              names: reserveTargetsLostByPurchase
                .slice(0, 2)
                .map((candidate) => candidate.name),
            }
          : plan.mode === "accumulate"
            ? { code: "reason.waitSameActivationNextLive" }
            : { code: "reason.waitProtectedReserveDominates" };
    const waitHorizonOutcome = createHorizonOutcome({
      tieId: `${bestVisible.id}:wait-reserve`,
      components: [
        outcomeComponent("hard-state", 1, "deterministic-consequence"),
        outcomeComponent(
          "risk-admissible-state",
          1,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "structural-tier",
          bestVisibleIsOpportunity && bestVisibleAffordable
            ? Math.max(0, tier - 1)
            : tier,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "expected-practice-stat-delta",
          0,
          "zero-income-projection",
        ),
        outcomeComponent(
          "expected-skill-points",
          0,
          "zero-income-projection",
        ),
        outcomeComponent(
          "friendship-exposure",
          0,
          "zero-income-projection",
        ),
        ...activeHuntComponents(
          waitAbandonsHunt ? "abandoned" : "preserved",
          coverage.planTargetProbability,
        ),
        ...(waitAbandonsHunt
          ? [
              outcomeComponent(
                "hunt-abandonment-without-purchase",
                1,
                "deterministic-consequence",
              ),
            ]
          : []),
        outcomeComponent(
          "great-success-secured",
          isGreatSuccess(concertIndex, songsThisSection) ? 1 : 0,
          "observed",
        ),
        outcomeComponent(
          "current-target-probability",
          bestVisibleIsOpportunity ? 1 : coverage.planTargetProbability,
          "zero-income-projection",
        ),
        outcomeComponent(
          "current-any-affordable-probability",
          coverage.anyAffordableProbability,
          "zero-income-projection",
        ),
        outcomeComponent(
          "current-best-structural-tier",
          coverage.bestStructuralTier,
          "zero-income-projection",
        ),
        outcomeComponent(
          "carried-page-preserved",
          0,
          "deterministic-consequence",
        ),
        ...gateUtilityComponents(totalSongs, null),
          ...resourceStateComponents({
          retainedTokens: totalCost(tokens),
          visibleSongCost: totalCost(bestVisible.cost),
          fundingFeasibility: bestVisibleFundingFeasibility,
          retainedProvenance: "observed",
        }),
      ],
    });
    policies.push({
      id: `${bestVisible.id}:wait-reserve`,
      action: "wait-reserve",
      songId: bestVisible.id,
      songName: bestVisible.name,
      valid:
        timingMode === "section-open" &&
        !(concertIndex === 4 && finalGreatSuccessAlreadySecured),
      overrideEligible: false,
      score: 0,
      nextSongProbability: 0,
      priorityAffordableProbability:
        bestVisibleIsOpportunity && canAfford(tokens, bestVisible.cost) ? 1 : 0,
      greatSuccessProbability: isGreatSuccess(concertIndex, songsThisSection)
        ? 1
        : 0,
      checkpoint16Status: currentStatus16.status,
      checkpoint18Status: currentStatus18.status,
      finalGateStatus: finalGateSecured(totalSongs, songsThisSection)
        ? "secured"
        : "open",
      conditionalPagesProbability:
        plan.mode === "hunt"
          ? coverage.planTargetProbability
          : coverage.anyAffordableProbability,
      exactPageEnumeration: true,
      lateFailureProbability: 0,
      expectedWaste: 0,
      criticalCost: 0,
      continuationRecommendation: null,
      abandonsHunt: waitAbandonsHunt,
      huntAbandonReason: waitHuntAbandonReason,
      huntDecision: waitHuntDecision,
      horizonOutcome: waitHorizonOutcome,
      utilityAssessment: utilityAssessmentFromOutcome(waitHorizonOutcome),
      decisionVector: decisionVectorFromUtilityAssessment(
        utilityAssessmentFromOutcome(waitHorizonOutcome),
      ),
      nextSectionReadiness: null,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
        practiceTrainingExposure: 0,
        spTrainingExposure: 0,
        friendshipTrainingExposure: 0,
      },
      reasons: [
        planReasonMessage(plan),
        ...(waitHuntAbandonReason
          ? ([
              waitHuntAbandonReason,
              { code: "reason.huntAbandonNoFiller" },
            ] satisfies Message[])
          : [waitReason]),
        { code: "reason.sectionStaysOpen" },
      ],
    });
  }

  const ranked = policies
    .filter((policy) => policy.valid)
    .sort((left, right) =>
      compareUtilityAssessments(right.utilityAssessment, left.utilityAssessment),
    );
  ranked.forEach((policy, index) => {
    policy.score = (ranked.length - index) * 100;
  });
  policies
    .filter((policy) => !policy.valid)
    .forEach((policy) => {
      policy.score = -1000;
    });
  const recommended = ranked[0] ?? null;
  const safeAlternative =
    ranked.find(
      (policy) =>
        policy.id !== recommended?.id &&
        policy.decisionVector.hard >= (recommended?.decisionVector.hard ?? 0) &&
        policy.decisionVector.riskAdmissible >=
          (recommended?.decisionVector.riskAdmissible ?? 0),
    ) ?? null;

  const runnerUp = ranked.find((policy) => policy.id !== recommended?.id) ?? null;
  const result: SongPolicyResult = {
    recommended,
    safeAlternative,
    utilityRobustness: {
      comparedTo: runnerUp?.id ?? null,
      breakpoints:
        recommended && runnerUp
          ? utilityBreakpointsBetween(
              recommended.utilityAssessment,
              runnerUp.utilityAssessment,
            )
          : [],
    },
    policies,
    tokenPressure,
    tokenReservePlan,
    plan,
    diagnostics: {
      ...diagnostics,
      totalMs: nowMs() - startedAt,
    },
  };
  cacheSongPolicy(cacheKey, result);
  return result;
};
