import {
  TOKEN_KEYS,
  acquiredEffectsForSong,
  canAfford,
  createTechniqueSimulationMemo,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  simulateTechniqueTransition,
  subtractCost,
  totalCost,
  type AcquiredEffect,
  type AnalysisObjective,
  type Balance,
  type GenerationProfile,
  type Period,
  type RiskProfile,
  type SongTarget,
  type TechniqueSimulationMemo,
} from "../live-model.ts";
import {
  techniquesForSongCycle,
  type TimingMode,
} from "../domain/live-rules.ts";
import {
  deriveStrategicPlan,
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import { evaluatePageCoverage } from "./song-dp.ts";
import { riskThreshold } from "./value.ts";
import { intervalCrosses, wilsonInterval } from "../monte-carlo.ts";
import { deriveReachableDemands } from "./resource-economy.ts";

export type TransitionAwareSongPagesInput = {
  period: Period;
  firstOfferPeriod?: Period;
  balance: Balance;
  pool: SongTarget[];
  reserveSongs?: SongTarget[];
  /** Reserves unlocked only outside the current pool; never removed locally. */
  futureReserveSongs?: SongTarget[];
  plan: StrategicPlan;
  concertIndex: number;
  /** Manual songs already owned before the simulated pages. */
  songsThisSection?: number;
  nextSongCycle: number;
  techniquesToNextSong: number;
  pages: number;
  requiredPurchases?: number;
  acquiredPlanTarget?: boolean;
  /** Timing semantics of the section being simulated. */
  timingMode?: TimingMode;
  /**
   * Continue after hard work only while the active plan explicitly allows
   * hidden structural work. HOLD never does: visible-only opportunities cannot
   * justify paying a hidden technique chain.
   */
  continueForStructuralValue?: boolean;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  trials?: number;
  seedKey?: string;
};

export type TransitionAwareTrialResult = {
  checkpointMet: boolean;
  targetAcquired: boolean;
  firstPageReached: boolean;
  firstPageAnyAffordable: boolean;
  firstPageTargetAffordable: boolean;
  purchases: number;
  techniquePurchases: number;
  committedCost: number;
  retainedBalance: Balance;
  remainingPool: SongTarget[];
  bestStructuralTier: number;
  structuralPurchases: number;
  friendshipPurchases: number;
  friendshipBonus: number;
  friendship10Acquired: boolean;
  acquiredEffects: readonly AcquiredEffect[];
  friendshipTrainingExposure: number;
  spTrainingExposure: number;
  practiceTrainingExposure: number;
};

export type TransitionAwareSongPagesResult = {
  checkpointProbability: number;
  targetProbability: number;
  firstPageReachProbability: number;
  firstPageAnyAffordableProbability: number;
  firstPageTargetAffordableProbability: number;
  expectedPurchases: number;
  expectedTechniquePurchases: number;
  expectedLessonSkillPoints: number;
  expectedCommittedCost: number;
  expectedRetainedTokens: number;
  expectedRetainedBalance: Balance;
  bestStructuralTierProbability: number;
  expectedStructuralPurchases: number;
  expectedFriendshipPurchases: number;
  expectedFriendshipBonus: number;
  expectedFriendshipTrainingExposure: number;
  expectedSpTrainingExposure: number;
  expectedPracticeTrainingExposure: number;
  friendship10AcquisitionProbability: number;
  pages: number;
  /** Actual deterministic samples consumed after convergence. */
  trials: number;
  maxTrials: number;
  converged: boolean;
  uncertainAtBudgetLimit: boolean;
  exactEnumeration: false;
  lawConfidence: "heuristic";
  pageLaw: "uniform";
  conditionalOn: "transition-costed-pages";
};

const zeroBalance = (): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

const canonicalSongs = <T extends { id: string }>(songs: T[]): T[] =>
  [...songs].sort((left, right) => left.id.localeCompare(right.id));

const uniqueSongs = (songs: SongTarget[]): SongTarget[] => {
  const byId = new Map<string, SongTarget>();
  for (const song of songs) byId.set(song.id, song);
  return canonicalSongs([...byId.values()]);
};

export const resolveTransitionReserveSongs = (
  currentPool: SongTarget[],
  currentReserveIds: ReadonlySet<string>,
  futureReserveSongs: SongTarget[],
): SongTarget[] =>
  uniqueSongs([
    ...currentPool.filter((song) => currentReserveIds.has(song.id)),
    ...futureReserveSongs,
  ]);

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => () => {
  let next = (seed += 0x6d2b79f5);
  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
};

export const drawTransitionSongPage = (
  pool: SongTarget[],
  seed: string,
): SongTarget[] => {
  const canonicalPool = canonicalSongs(pool);
  const drawSize = Math.min(3, canonicalPool.length);
  if (drawSize === canonicalPool.length) return [...canonicalPool];
  const rng = mulberry32(hashSeed(seed));
  const indices = canonicalPool.map((_, index) => index);
  for (let index = 0; index < drawSize; index += 1) {
    const swapIndex = index + Math.floor(rng() * (indices.length - index));
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }
  return indices.slice(0, drawSize).map((index) => canonicalPool[index]);
};

const objectiveFor = (
  hardWork: boolean,
  targetWork: boolean,
): AnalysisObjective =>
  hardWork ? "any-song" : targetWork ? "priority-song" : "carryover";

const friendshipValue = (song: SongTarget): number => {
  if (song.roles?.includes("friendship-10")) return 10;
  if (song.roles?.includes("friendship-5")) return 5;
  return 0;
};

const chooseSong = ({
  page,
  balance,
  pool,
  plan,
  hardWork,
  targetWork,
  optionalStructuralWork,
  pagesLeft,
  riskProfile,
}: {
  page: SongTarget[];
  balance: Balance;
  pool: SongTarget[];
  plan: StrategicPlan;
  hardWork: boolean;
  targetWork: boolean;
  optionalStructuralWork: boolean;
  pagesLeft: number;
  riskProfile: RiskProfile;
}): SongTarget | null => {
  const affordable = page.filter((song) => canAfford(balance, song.cost));
  if (affordable.length === 0) return null;

  const visibleTargets = affordable.filter((song) => isChaseTarget(song, plan));
  if (
    !hardWork &&
    targetWork &&
    visibleTargets.length === 0 &&
    pagesLeft <= 1
  ) {
    return null;
  }
  if (!hardWork && !targetWork && !optionalStructuralWork) return null;

  const candidates =
    targetWork && visibleTargets.length > 0
      ? visibleTargets
      : optionalStructuralWork
        ? affordable.filter((song) => structuralTier(song, plan) > 0)
        : affordable;
  if (candidates.length === 0) return null;

  const threshold = riskThreshold(riskProfile);
  return (
    candidates
      .map((song) => {
        const after = subtractCost(balance, song.cost);
        const remaining = pool.filter((candidate) => candidate.id !== song.id);
        const coverage = evaluatePageCoverage(after, remaining, plan);
        const continuationState = !hardWork
          ? 1
          : coverage.anyAffordableProbability >= threshold
            ? 2
            : coverage.anyAffordableProbability > 0
              ? 1
              : 0;
        return {
          song,
          continuationState,
          target: isChaseTarget(song, plan) ? 1 : 0,
          structural: structuralTier(song, plan),
          targetCoverage: coverage.planTargetProbability,
          anyCoverage: coverage.anyAffordableProbability,
          retainedTokens: totalCost(after),
          committedCost: totalCost(song.cost),
        };
      })
      .sort(
        (left, right) =>
          // Hard work is compared as an admissibility state, not by a tiny raw
          // probability delta. Once both branches preserve the checkpoint at the
          // same risk class, current structural value comes first.
          right.continuationState - left.continuationState ||
          right.target - left.target ||
          right.structural - left.structural ||
          right.targetCoverage - left.targetCoverage ||
          right.anyCoverage - left.anyCoverage ||
          right.retainedTokens - left.retainedTokens ||
          left.committedCost - right.committedCost ||
          left.song.id.localeCompare(right.song.id),
      )[0]?.song ?? null
  );
};

/**
 * One deterministic Monte-Carlo trial of the shared transition-aware page
 * kernel. Exposing the terminal state lets the cross-section evaluator chain
 * the verified post-live transition without replacing distributions by a
 * hand-written readiness score.
 */
export const simulateTransitionAwareSongPagesTrial = (
  {
    period,
    firstOfferPeriod = period,
    balance,
    pool,
    reserveSongs = pool,
    futureReserveSongs = [],
    plan,
    concertIndex,
    songsThisSection = 0,
    nextSongCycle,
    techniquesToNextSong,
    pages,
    requiredPurchases = 0,
    acquiredPlanTarget = false,
    timingMode = "deadline-now",
    continueForStructuralValue = false,
    riskProfile = "standard",
    generationProfile = "speed-wit",
    seedKey = "song-transition",
  }: TransitionAwareSongPagesInput,
  trialIndex: number,
  techniqueMemo?: TechniqueSimulationMemo,
): TransitionAwareTrialResult => {
  const boundedPages = Math.max(0, Math.trunc(pages));
  let currentBalance = { ...balance };
  let currentPool = canonicalSongs(pool);
  const reserveIds = new Set(reserveSongs.map((song) => song.id));
  const externalReserveSongs = canonicalSongs(futureReserveSongs);
  let currentPlan = plan;
  let purchases = 0;
  let techniquePurchases = 0;
  let committed = 0;
  let targetAcquired = acquiredPlanTarget;
  let bestTier = 0;
  let structuralPurchases = 0;
  let friendshipPurchases = 0;
  let friendshipBonus = 0;
  let friendship10Acquired = false;
  const acquiredEffects: AcquiredEffect[] = [];
  const remainingTrainingsByFacility = estimateRemainingTrainingsByFacility(
    generationProfile,
    concertIndex,
  );
  let firstPageReached = false;
  let firstPageAnyAffordable = false;
  let firstPageTargetAffordable = false;

  for (let pageIndex = 0; pageIndex < boundedPages; pageIndex += 1) {
    const cycle = nextSongCycle + pageIndex;
    const techniqueCount =
      pageIndex === 0
        ? techniquesToNextSong
        : techniquesForSongCycle(concertIndex, cycle);
    if (techniqueCount === null) break;

    const hardWork = purchases < requiredPurchases;
    const targetWork = currentPlan.mode === "hunt" && !targetAcquired;
    const optionalStructuralWork =
      continueForStructuralValue &&
      currentPlan.mode !== "hold" &&
      !hardWork &&
      !targetWork;
    if (!hardWork && !targetWork && !optionalStructuralWork) break;

    const transitionResourceDemands = deriveReachableDemands({
      currentSongs: currentPool,
      futureSongs: externalReserveSongs,
      plan: currentPlan,
      concertIndex,
      timingMode,
      requiredPurchases: hardWork
        ? Math.max(1, requiredPurchases - purchases)
        : 0,
    });
    const transition = simulateTechniqueTransition({
      period,
      firstOfferPeriod: pageIndex === 0 ? firstOfferPeriod : period,
      tokens: currentBalance,
      techniquesRemaining: techniqueCount,
      nextSongCycle: cycle,
      songs: currentPool,
      reserveSongs: resolveTransitionReserveSongs(
        currentPool,
        reserveIds,
        externalReserveSongs,
      ),
      resourceDemands: transitionResourceDemands,
      objective: objectiveFor(hardWork, targetWork),
      strategicPlan: currentPlan,
      riskProfile,
      generationProfile,
      seedKey: `${seedKey}:tech:${pageIndex}`,
      trialIndex,
      memo: techniqueMemo,
    });
    if (!transition.reached) break;

    currentBalance = transition.balance;
    committed += transition.spent;
    techniquePurchases += transition.purchases;
    if (pageIndex === 0) firstPageReached = true;

    const page = drawTransitionSongPage(
      currentPool,
      `${seedKey}:page:${trialIndex}:${pageIndex}`,
    );
    const affordablePage = page.filter((song) =>
      canAfford(currentBalance, song.cost),
    );
    if (pageIndex === 0 && affordablePage.length > 0) {
      firstPageAnyAffordable = true;
    }
    if (
      pageIndex === 0 &&
      affordablePage.some((song) => isChaseTarget(song, currentPlan))
    ) {
      firstPageTargetAffordable = true;
    }

    const selected = chooseSong({
      page,
      balance: currentBalance,
      pool: currentPool,
      plan: currentPlan,
      hardWork,
      targetWork,
      optionalStructuralWork,
      pagesLeft: boundedPages - pageIndex,
      riskProfile,
    });
    if (!selected) break;

    currentBalance = subtractCost(currentBalance, selected.cost);
    committed += totalCost(selected.cost);
    purchases += 1;
    const acquiredCurrentTarget = isChaseTarget(selected, currentPlan);
    targetAcquired = targetAcquired || acquiredCurrentTarget;
    const tier = structuralTier(selected, currentPlan);
    bestTier = Math.max(bestTier, tier);
    if (tier > 0) structuralPurchases += 1;
    const friendship = friendshipValue(selected);
    if (friendship > 0) {
      friendshipPurchases += 1;
      friendshipBonus += friendship;
      friendship10Acquired ||= friendship >= 10;
    }
    acquiredEffects.push(
      ...acquiredEffectsForSong({
        song: selected,
        concertIndex,
        remainingTrainingsByFacility,
      }),
    );
    currentPool = currentPool.filter((song) => song.id !== selected.id);
    if (acquiredCurrentTarget || currentPlan.mode === "hunt") {
      currentPlan = deriveStrategicPlan({
        concertIndex,
        timingMode,
        remainingSongs: currentPool,
        songsThisSection: songsThisSection + purchases,
      });
    }
  }

  return {
    checkpointMet: purchases >= requiredPurchases,
    targetAcquired: targetAcquired || plan.mode !== "hunt",
    firstPageReached,
    firstPageAnyAffordable,
    firstPageTargetAffordable,
    purchases,
    techniquePurchases,
    committedCost: committed,
    retainedBalance: currentBalance,
    remainingPool: currentPool,
    bestStructuralTier: bestTier,
    structuralPurchases,
    friendshipPurchases,
    friendshipBonus,
    friendship10Acquired,
    acquiredEffects,
    friendshipTrainingExposure: effectExposure(acquiredEffects, "friendship"),
    spTrainingExposure: effectExposure(acquiredEffects, "sp-training"),
    practiceTrainingExposure: effectExposure(acquiredEffects, "practice"),
  };
};

/**
 * Bounded forward simulation alternating real technique transitions and song
 * pages. Unlike `evaluateUnknownSongPages`, every page is paid for before its
 * draw. No future training income is introduced.
 */
const stableTransitionEstimate = ({
  samples,
  minimumSamples,
  checkpointSuccesses,
  targetSuccesses,
  firstPageReached,
  firstPageTargetAffordable,
  threshold,
}: {
  samples: number;
  minimumSamples: number;
  checkpointSuccesses: number;
  targetSuccesses: number;
  firstPageReached: number;
  firstPageTargetAffordable: number;
  threshold: number;
}): boolean => {
  if (samples < minimumSamples) return false;
  const intervals = [
    wilsonInterval(checkpointSuccesses, samples),
    wilsonInterval(targetSuccesses, samples),
    wilsonInterval(firstPageReached, samples),
    wilsonInterval(firstPageTargetAffordable, samples),
  ];
  const importantThresholds = [0.5, 0.8, threshold];
  return intervals.every((interval) => {
    const width = interval[1] - interval[0];
    return width <= 0.04 && !intervalCrosses(interval, importantThresholds);
  });
};

export const evaluateTransitionAwareSongPages = (
  input: TransitionAwareSongPagesInput,
): TransitionAwareSongPagesResult => {
  const boundedPages = Math.max(0, Math.trunc(input.pages));
  const maxTrials = Math.max(1, Math.trunc(input.trials ?? 4000));
  const minimumSamples = Math.min(
    maxTrials,
    maxTrials <= 600 ? maxTrials : maxTrials <= 6000 ? 640 : 896,
  );
  const convergenceBatch = 128;
  let checkpointSuccesses = 0;
  let targetSuccesses = 0;
  let firstPageReached = 0;
  let firstPageAnyAffordable = 0;
  let firstPageTargetAffordable = 0;
  let purchaseTotal = 0;
  let techniquePurchaseTotal = 0;
  let committedTotal = 0;
  let retainedTotal = 0;
  const retainedBalanceTotal = zeroBalance();
  let structuralSuccesses = 0;
  let structuralPurchaseTotal = 0;
  let friendshipPurchaseTotal = 0;
  let friendshipBonusTotal = 0;
  let friendshipTrainingExposureTotal = 0;
  let spTrainingExposureTotal = 0;
  let practiceTrainingExposureTotal = 0;
  let friendship10Successes = 0;
  const techniqueMemo = createTechniqueSimulationMemo();
  const threshold = riskThreshold(input.riskProfile ?? "standard");
  let actualTrials = 0;

  for (let trial = 0; trial < maxTrials; trial += 1) {
    const result = simulateTransitionAwareSongPagesTrial(
      { ...input, pages: boundedPages },
      trial,
      techniqueMemo,
    );
    actualTrials = trial + 1;
    if (result.checkpointMet) checkpointSuccesses += 1;
    if (result.targetAcquired) targetSuccesses += 1;
    if (result.firstPageReached) firstPageReached += 1;
    if (result.firstPageAnyAffordable) firstPageAnyAffordable += 1;
    if (result.firstPageTargetAffordable) firstPageTargetAffordable += 1;
    if (result.bestStructuralTier > 0) structuralSuccesses += 1;
    if (result.friendship10Acquired) friendship10Successes += 1;
    purchaseTotal += result.purchases;
    techniquePurchaseTotal += result.techniquePurchases;
    committedTotal += result.committedCost;
    retainedTotal += totalCost(result.retainedBalance);
    structuralPurchaseTotal += result.structuralPurchases;
    friendshipPurchaseTotal += result.friendshipPurchases;
    friendshipBonusTotal += result.friendshipBonus;
    friendshipTrainingExposureTotal += result.friendshipTrainingExposure;
    spTrainingExposureTotal += result.spTrainingExposure;
    practiceTrainingExposureTotal += result.practiceTrainingExposure;
    for (const key of TOKEN_KEYS) {
      retainedBalanceTotal[key] += result.retainedBalance[key];
    }
    if (
      actualTrials % convergenceBatch === 0 &&
      stableTransitionEstimate({
        samples: actualTrials,
        minimumSamples,
        checkpointSuccesses,
        targetSuccesses,
        firstPageReached,
        firstPageTargetAffordable,
        threshold,
      })
    ) {
      break;
    }
  }

  const denominator = Math.max(1, actualTrials);
  const finalEstimateStable = stableTransitionEstimate({
    samples: denominator,
    minimumSamples,
    checkpointSuccesses,
    targetSuccesses,
    firstPageReached,
    firstPageTargetAffordable,
    threshold,
  });
  const uncertainAtBudgetLimit =
    denominator >= maxTrials && !finalEstimateStable;
  return {
    checkpointProbability: checkpointSuccesses / denominator,
    targetProbability: targetSuccesses / denominator,
    firstPageReachProbability: firstPageReached / denominator,
    firstPageAnyAffordableProbability: firstPageAnyAffordable / denominator,
    firstPageTargetAffordableProbability:
      firstPageTargetAffordable / denominator,
    expectedPurchases: purchaseTotal / denominator,
    expectedTechniquePurchases: techniquePurchaseTotal / denominator,
    expectedLessonSkillPoints:
      (purchaseTotal * 25 + techniquePurchaseTotal * 5) / denominator,
    expectedCommittedCost: committedTotal / denominator,
    expectedRetainedTokens: retainedTotal / denominator,
    expectedRetainedBalance: Object.fromEntries(
      TOKEN_KEYS.map((key) => [key, retainedBalanceTotal[key] / denominator]),
    ) as Balance,
    bestStructuralTierProbability: structuralSuccesses / denominator,
    expectedStructuralPurchases: structuralPurchaseTotal / denominator,
    expectedFriendshipPurchases: friendshipPurchaseTotal / denominator,
    expectedFriendshipBonus: friendshipBonusTotal / denominator,
    expectedFriendshipTrainingExposure:
      friendshipTrainingExposureTotal / denominator,
    expectedSpTrainingExposure: spTrainingExposureTotal / denominator,
    expectedPracticeTrainingExposure:
      practiceTrainingExposureTotal / denominator,
    friendship10AcquisitionProbability: friendship10Successes / denominator,
    pages: boundedPages,
    trials: denominator,
    maxTrials,
    converged: finalEstimateStable,
    uncertainAtBudgetLimit,
    exactEnumeration: false,
    lawConfidence: "heuristic",
    pageLaw: "uniform",
    conditionalOn: "transition-costed-pages",
  };
};
