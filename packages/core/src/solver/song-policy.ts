import type { Message, MissingToken } from "../i18n/messages.ts";
import {
  TOKEN_KEYS,
  calculateTokenPressure,
  calculateTokenReservePlan,
  canAfford,
  createTechniqueSimulationMemo,
  estimateRemainingTrainingsByFacility,
  resolveStrategicObjective,
  withStructuralTrainingValue,
  runAnalysis,
  subtractCost,
  totalCost,
  type AnalysisObjective,
  type AnalysisResult,
  type Balance,
  type GenerationProfile,
  type Period,
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
import { evaluateExposedCarry } from "./carry.ts";
import { evaluatePageCoverage, maximumAffordablePurchases } from "./song-dp.ts";
import { assessCheckpointSupply } from "./supply-model.ts";
import {
  compareDecisionVectors,
  riskThreshold,
  type DecisionVector,
} from "./value.ts";
import { evaluateTransitionAwareSongPages } from "./song-transition.ts";
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
  practiceBonusValue: number;
  liveBonusValue: number;
};

export type SongPolicyEvaluation = {
  id: string;
  action: SongPolicyAction;
  songId: string | null;
  /** `null` on the no-purchase policies; the UI renders `policy.noPurchase`. */
  songName: string | null;
  valid: boolean;
  /** Exact affordability of a buy policy. Undefined for non-buy actions. */
  affordable?: boolean;
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
  decisionVector: DecisionVector;
  nextSectionReadiness: CrossSectionReadinessResult | null;
  valueOutcome: SongValueOutcome;
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

const huntProbabilityFloor = (riskProfile: RiskProfile): number =>
  riskProfile === "safe" ? 0.35 : riskProfile === "greedy" ? 0.15 : 0.25;

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
  const tokenPressure = calculateTokenPressure(
    tokens,
    allReserveSongs,
    generationProfile,
    plan,
    reserveFeasibility,
  );
  const tokenReservePlan = calculateTokenReservePlan(allReserveSongs, plan, {
    tokens,
    feasibility: reserveFeasibility,
    shadowByKey: Object.fromEntries(
      tokenPressure.map((pressure) => [pressure.key, pressure.shadowValue]),
    ),
  });
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
  const visibleAffordableChaseTarget = visibleSongs.some(
    (candidate) =>
      isChaseTarget(candidate, plan) && canAfford(tokens, candidate.cost),
  );
  const intermediateGreatSuccessStatValue = (
    probability: number | null,
  ): number =>
    timingMode === "deadline-now" && concertIndex < 4
      ? 35 * (probability ?? 0)
      : 0;
  const activeHuntPrefix = (
    state: "acquired-now" | "preserved" | "carried" | "abandoned",
    probability = 0,
  ): number[] => {
    if (plan.mode !== "hunt") return [];
    if (state === "acquired-now") return [3, 1];
    if (state === "carried") return [2, 1];
    if (
      state === "preserved" &&
      probability >= huntProbabilityFloor(riskProfile)
    ) {
      return [2, probability];
    }
    return [0, probability];
  };
  const pacingDecisionPrefix = (
    totalAfterAction: number,
    continuing: boolean,
    continuationProbability: number,
  ): number[] => {
    if (pacingTarget === null) return [];
    if (totalAfterAction >= pacingTarget) return [2, 1];
    if (continuing) {
      // A pacing target is not a mechanical gate. Compare continuation by risk
      // class rather than by sampling decimals: 99.96 % must not beat 99.61 %
      // before the intrinsic value of a visible Friendship +10 is considered.
      return [
        continuationProbability > 0 ? 2 : 0,
        continuationProbability >= threshold ? 2 : 1,
      ];
    }
    return [1, totalAfterAction / pacingTarget];
  };

  for (const song of visibleSongs) {
    const affordable = canAfford(tokens, song.cost);
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
    const immediateActivationPriority =
      currentIsChaseTarget || song.roles?.includes("friendship-10") === true;
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
      objective,
      strategicPlan: planAfterPurchase,
      riskProfile,
      generationProfile,
      seedKey: `technique:${concertIndex}:${nextSongCycle}:0`,
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
          seedKey: `song-transition:${concertIndex}:${nextSongCycle}`,
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
          expectedTechniquePurchases: 0,
          expectedLessonSkillPoints: 0,
          expectedCommittedCost: 0,
          expectedRetainedTokens: totalCost(afterPurchase),
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
      const huntAbandonReason: Message | null =
        plan.mode === "hunt" &&
        !currentIsChaseTarget &&
        (techniquesToNextSong >= 5 ||
          (techniquesToNextSong >= 4 &&
            conditionalTarget < huntProbabilityFloor(riskProfile)))
          ? techniquesToNextSong >= 5
            ? {
                code: "reason.huntAbandonTechniqueCount",
                techniques: techniquesToNextSong,
              }
            : {
                code: "reason.huntAbandonBelowFloor",
                probability: conditionalTarget,
                floor: huntProbabilityFloor(riskProfile),
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
      // The generic technique rollout may still say PUSH after a song that has
      // already satisfied the strategic plan (HOLD, final gate closed, etc.).
      // The invariant must compare against the effective post-purchase policy,
      // not that lower-level raw recommendation.
      const effectivePostPurchaseWantsContinuation =
        postPurchaseWantsContinuation && !normalContinuationForbidden;
      const actionMatchesPostPurchase = continuing
        ? effectivePostPurchaseWantsContinuation
        : abandonsHunt || !effectivePostPurchaseWantsContinuation;
      const normalValid =
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
              trials: crossSectionTrialBudget,
              techniqueMemo: crossSectionTechniqueMemo,
              // Common random numbers make STOP/buy/carry differences reflect
              // the state transition, not a different deterministic draw law.
              seedKey: `cross-section:${concertIndex}:${nextSongCycle}:terminal`,
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
      const policyGreatSuccess = continuing
        ? greatSuccessContinue
        : greatSuccessStop;
      const effectiveCoverageAfter = abandonsHunt
        ? evaluatePageCoverage(
            retainedAfterLive,
            nextPool,
            effectivePlanAfterPurchase,
          )
        : coverageAfter;
      const decisionVector: DecisionVector = {
        hard: hardState,
        riskAdmissible: riskState,
        prospective: [
          ...activeHuntPrefix(
            currentIsChaseTarget
              ? "acquired-now"
              : continuing && huntAbandonReason === null
                ? "preserved"
                : "abandoned",
            conditionalTarget,
          ),
          ...pacingDecisionPrefix(
            totalAfterPurchase,
            continuing,
            pacingContinuationProbability,
          ),
          immediateActivationPriority ? 1 : 0,
          // A purchase that closes the current manual gauge realizes 35 stats
          // now. Keep it ahead of noisy future projections, but behind a
          // persistent structural activation such as Friendship +10.
          intermediateGreatSuccessStatValue(greatSuccessStop),
          ...(nextSectionReadiness?.decisionVector ?? []),
        ],
        structural: tier,
        continuation: continuing
          ? [
              ...(finalGaugeHardActive ? [hardProbability] : []),
              concertIndex === 4 ? 0 : (song.practiceValue ?? 0),
              concertIndex === 4 ? 0 : (song.liveValue ?? 0),
              25 + transitionAware.expectedLessonSkillPoints,
              intermediateGreatSuccessStatValue(policyGreatSuccess),
              conditionalTarget,
              immediateTarget,
              next.reachProbability,
              continuationCoverage,
            ]
          : [
              concertIndex === 4 ? 0 : (song.practiceValue ?? 0),
              concertIndex === 4 ? 0 : (song.liveValue ?? 0),
              25,
              intermediateGreatSuccessStatValue(policyGreatSuccess),
              currentIsOpportunity
                ? 1
                : effectiveCoverageAfter.planTargetProbability,
              effectiveCoverageAfter.anyAffordableProbability,
              effectiveCoverageAfter.bestStructuralTier,
              0,
            ],
        retainedTokens: continuing
          ? totalCost(retainedAfterLive) - transitionAware.expectedCommittedCost
          : totalCost(retainedAfterLive),
        committedCost:
          totalCost(song.cost) +
          (continuing ? transitionAware.expectedCommittedCost : 0),
        tieId: `${song.id}:${action}`,
      };
      const reasons: Message[] = [...baseReasons];
      if (abandonsHunt && huntAbandonReason) reasons.push(huntAbandonReason);
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
        decisionVector: affordable
          ? decisionVector
          : { ...decisionVector, hard: 0, riskAdmissible: 0 },
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
        },
        reasons,
      };
    };

    policies.push(makeBuyPolicy("buy-stop"));
    policies.push(makeBuyPolicy("buy-continue"));

    const carry = evaluateExposedCarry({
      concertIndex,
      timingMode,
      tokens,
      song,
      totalSongs,
      plan,
    });
    const delayPenalty =
      carry.delayClass === "structural"
        ? 1
        : carry.delayClass === "friendship"
          ? 1
          : carry.delayClass === "minor"
            ? 1
            : 0;
    const carryTotal = totalSongs + 1;
    const carryBalance = carry.delayedBalance ?? tokens;
    const carryCapacity = capacityFor(
      carryBalance,
      nextPool,
      Math.max(0, 18 - carryTotal),
    );
    const carryStatus16 = statusFor({
      totalSongs: carryTotal,
      requiredSongs: 16,
      balance: carryBalance,
      pool: nextPool,
      timingMode: "section-open",
      capacity: carryCapacity,
    });
    const carryStatus18 = statusFor({
      totalSongs: carryTotal,
      requiredSongs: 18,
      balance: carryBalance,
      pool: nextPool,
      timingMode: "section-open",
      capacity: carryCapacity,
    });
    const carryCoverage = evaluatePageCoverage(
      carry.delayedBalance ?? tokens,
      nextPool,
      plan,
    );
    const carryCrossStartedAt = nowMs();
    const carryNextSectionReadiness =
      carry.valid && timingMode === "deadline-now" && concertIndex < 4
        ? evaluateCrossSectionReadiness({
            completedConcertIndex: concertIndex,
            currentPeriod: period,
            balanceBeforeLive: tokens,
            currentPool: nextPool,
            futureSongs,
            laterSongs,
            totalSongsBeforeNextSection: totalSongs,
            carriedSong: song,
            riskProfile,
            generationProfile,
            trials: crossSectionTrialBudget,
            techniqueMemo: crossSectionTechniqueMemo,
            seedKey: `cross-section:${concertIndex}:${nextSongCycle}:terminal`,
          })
        : null;
    diagnostics.crossSectionMs += nowMs() - carryCrossStartedAt;
    policies.push({
      id: `${song.id}:carry-page`,
      action: "carry-page",
      songId: song.id,
      songName: song.name,
      valid: carry.valid,
      overrideEligible: false,
      score: 0,
      nextSongProbability: carry.valid ? 1 : 0,
      priorityAffordableProbability:
        carry.valid && currentIsOpportunity ? 1 : 0,
      greatSuccessProbability: isGreatSuccess(concertIndex, songsThisSection)
        ? 1
        : 0,
      checkpoint16Status: carryStatus16.status,
      checkpoint18Status: carryStatus18.status,
      finalGateStatus: concertIndex === 4 ? "failed" : "open",
      conditionalPagesProbability: 1,
      exactPageEnumeration: true,
      lateFailureProbability: 0,
      expectedWaste: 0,
      criticalCost: totalCost(song.cost),
      continuationRecommendation: null,
      abandonsHunt: plan.mode === "hunt" && !currentIsChaseTarget,
      huntAbandonReason:
        plan.mode === "hunt" && !currentIsChaseTarget
          ? { code: "reason.huntAbandonAtConcert" }
          : undefined,
      decisionVector: {
        hard: carry.valid ? 1 : 0,
        riskAdmissible: carry.affordableAfterLive ? 1 : 0,
        prospective: [
          ...activeHuntPrefix(currentIsChaseTarget ? "carried" : "abandoned"),
          ...pacingDecisionPrefix(totalSongs, false, 0),
          0,
          intermediateGreatSuccessStatValue(
            isGreatSuccess(concertIndex, songsThisSection) ? 1 : 0,
          ),
          ...(carryNextSectionReadiness?.decisionVector ?? []),
        ],
        // Carrying a filler saves one Technique but does not create structural
        // song value. The old floor of 1 could beat the concrete 35-stat Great
        // Success counterfactual before those outcomes were compared.
        structural: Math.max(0, tier - delayPenalty),
        continuation: [
          currentIsOpportunity ? 1 : carryCoverage.planTargetProbability,
          carryCoverage.anyAffordableProbability,
          carryCoverage.bestStructuralTier,
          carry.savedInheritedTechniques,
          intermediateGreatSuccessStatValue(
            isGreatSuccess(concertIndex, songsThisSection) ? 1 : 0,
          ),
        ],
        retainedTokens: carry.delayedBalance
          ? totalCost(carry.delayedBalance)
          : -1,
        committedCost: totalCost(song.cost),
        tieId: `${song.id}:carry-page`,
      },
      nextSectionReadiness: carryNextSectionReadiness,
      valueOutcome: {
        lessonSkillPoints: 25,
        greatSuccessStatGain: 0,
        practiceBonusValue: song.practiceValue ?? 0,
        liveBonusValue: song.liveValue ?? 0,
      },
      reasons: [
        planReasonMessage(plan),
        ...carry.reasons,
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
                lessonSkillPoints:
                  carryNextSectionReadiness.expectedLessonSkillPoints,
              },
            ] satisfies Message[])
          : []),
        { code: "reason.carriedSongLessonSkillPoints", points: 25 },
      ],
    });
  }

  if (timingMode === "deadline-now" && concertIndex < 4) {
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
      trials: crossSectionTrialBudget,
      techniqueMemo: crossSectionTechniqueMemo,
      seedKey: `cross-section:${concertIndex}:${nextSongCycle}:terminal`,
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
      decisionVector: {
        hard: stopHardState,
        riskAdmissible: stopHardState > 0 ? 1 : 0,
        prospective: [
          ...activeHuntPrefix("abandoned"),
          ...pacingDecisionPrefix(totalSongs, false, 0),
          0,
          intermediateGreatSuccessStatValue(currentGreatSuccess ? 1 : 0),
          ...stopNextSectionReadiness.decisionVector,
        ],
        structural: 1,
        continuation: [
          0,
          0,
          0,
          intermediateGreatSuccessStatValue(currentGreatSuccess ? 1 : 0),
        ],
        retainedTokens: totalCost(retainedAfterLive),
        committedCost: 0,
        tieId: "stop-and-carry-stock",
      },
      nextSectionReadiness: stopNextSectionReadiness,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
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
      decisionVector: {
        // Once final Great Success is secured, STOP is no longer a privileged
        // hard state: it competes normally with a remaining structural target.
        // The raw 18-song count is intentionally absent from this decision.
        hard: greatSuccessSecured ? 1 : 0,
        riskAdmissible: greatSuccessSecured ? 1 : 0,
        prospective: [0, 0],
        structural: 0,
        continuation: [0, 0, 0, 0],
        retainedTokens: totalCost(tokens),
        committedCost: 0,
        tieId: "stop-and-carry-stock",
      },
      nextSectionReadiness: null,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
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
      huntContinuationPolicies.length > 0 &&
      huntContinuationPolicies.every((policy) => policy.huntAbandonReason)
        ? huntContinuationPolicies[0].huntAbandonReason
        : undefined;
    const waitAbandonsHunt = waitHuntAbandonReason !== undefined;
    const missing = missingTokens(tokens, bestVisible);
    const tier = structuralTier(bestVisible, plan);
    const bestVisibleAffordable = canAfford(tokens, bestVisible.cost);
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
      decisionVector: {
        hard: 1,
        riskAdmissible: 1,
        prospective: [
          ...activeHuntPrefix(
            waitAbandonsHunt ? "abandoned" : "preserved",
            coverage.planTargetProbability,
          ),
          waitAbandonsHunt ? 2 : 0,
        ],
        structural:
          bestVisibleIsOpportunity && canAfford(tokens, bestVisible.cost)
            ? Math.max(0, tier - 1)
            : tier,
        continuation: [
          bestVisibleIsOpportunity ? 1 : coverage.planTargetProbability,
          coverage.anyAffordableProbability,
          coverage.bestStructuralTier,
          0,
        ],
        retainedTokens: totalCost(tokens),
        committedCost: 0,
        tieId: `${bestVisible.id}:wait-reserve`,
      },
      nextSectionReadiness: null,
      valueOutcome: {
        lessonSkillPoints: 0,
        greatSuccessStatGain: 0,
        practiceBonusValue: 0,
        liveBonusValue: 0,
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
      compareDecisionVectors(right.decisionVector, left.decisionVector),
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

  const result: SongPolicyResult = {
    recommended,
    safeAlternative,
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
