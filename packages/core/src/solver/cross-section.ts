import {
  TOKEN_KEYS,
  canAfford,
  createTechniqueSimulationMemo,
  subtractCost,
  totalCost,
  type Balance,
  type GenerationProfile,
  type Period,
  type RiskProfile,
  type SongTarget,
  type TechniqueSimulationMemo,
} from "../live-model.ts";
import {
  applyPromotionalLiveTransition,
  manualSongsForGreatSuccess,
  techniquesForSongCycle,
} from "../domain/live-rules.ts";
import {
  deriveStrategicPlan,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  simulateTransitionAwareSongPagesTrial,
  type TransitionAwareSongPagesInput,
} from "./song-transition.ts";
import { riskThreshold } from "./value.ts";

export type CurrentSectionContinuation = {
  plan: StrategicPlan;
  nextSongCycle: number;
  techniquesToNextSong: number;
  pages: number;
  requiredPurchases: number;
  acquiredPlanTarget: boolean;
};

export type CrossSectionReadinessInput = {
  completedConcertIndex: number;
  currentPeriod: Period;
  currentFirstOfferPeriod?: Period;
  balanceBeforeLive: Balance;
  currentPool: SongTarget[];
  futureSongs?: SongTarget[];
  /** Songs unlocked one section after `futureSongs` (C4 pool when closing C2). */
  laterSongs?: SongTarget[];
  totalSongsBeforeNextSection: number;
  currentContinuation?: CurrentSectionContinuation;
  carriedSong?: SongTarget | null;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  trials?: number;
  maxNextSectionPages?: number;
  seedKey?: string;
  /** Friendship already activated by a song bought before the outgoing Live.
   * It must remain part of the future state instead of disappearing merely
   * because the song was removed from the remaining pool. */
  activatedFriendshipBonus?: number;
  /** Same accounting rule for an already-secured Friendship +10. */
  activatedFriendship10?: boolean;
  /** Shared within one song-page ranking to reuse identical transition states. */
  techniqueMemo?: TechniqueSimulationMemo;
};

export type CrossSectionTrialInput = Omit<
  CrossSectionReadinessInput,
  "currentContinuation" | "trials"
> & {
  /** Exact balance immediately before the Promotional Live transition. */
  balanceBeforeLive: Balance;
  /** Exact current pool after any terminal work in the outgoing section. */
  currentPool: SongTarget[];
  /** Exact total before the following section starts. */
  totalSongsBeforeNextSection: number;
};

export type CrossSectionTrialResult = {
  nextConcertIndex: number;
  nextPlanId: StrategicPlan["id"];
  checkpointRequired: number | null;
  checkpointMet: boolean;
  targetAcquired: boolean;
  friendship10Acquired: boolean;
  friendshipBonus: number;
  friendshipPurchases: number;
  structuralPurchases: number;
  purchases: number;
  techniquePurchases: number;
  lessonSkillPoints: number;
  totalSongs: number;
  retainedBalance: Balance;
  remainingPool: SongTarget[];
};

export type CrossSectionReadinessResult = {
  horizonSections: 1 | 2;
  nextConcertIndex: number;
  valueConcertIndex: number;
  nextPlanId: StrategicPlan["id"];
  checkpointRequired: number | null;
  checkpointProbability: number;
  checkpointState: 0 | 1 | 2;
  targetProbability: number;
  friendship10Probability: number;
  expectedFriendshipBonus: number;
  expectedFriendshipPurchases: number;
  expectedStructuralPurchases: number;
  expectedPurchases: number;
  expectedTechniquePurchases: number;
  expectedLessonSkillPoints: number;
  expectedRetainedTokens: number;
  expectedRetainedBalance: Balance;
  currentSectionCompletionProbability: number;
  transitionTokenGain: 10;
  supplyScope: "verified-live-transition-no-training-income";
  trials: number;
  /** Lexicographic continuation value, derived from the chained simulation. */
  decisionVector: readonly number[];
};

const zeroBalance = (): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

const nextPeriodAfter = (completedConcertIndex: number): Period =>
  completedConcertIndex <= 1 ? "classic" : "senior";

const uniqueSongs = (songs: SongTarget[]): SongTarget[] => {
  const byId = new Map<string, SongTarget>();
  for (const song of songs) byId.set(song.id, song);
  return [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
};

const currentTrialInput = ({
  input,
  continuation,
}: {
  input: CrossSectionReadinessInput;
  continuation: CurrentSectionContinuation;
}): TransitionAwareSongPagesInput => ({
  period: input.currentPeriod,
  firstOfferPeriod: input.currentFirstOfferPeriod ?? input.currentPeriod,
  balance: input.balanceBeforeLive,
  pool: input.currentPool,
  reserveSongs: input.currentPool,
  futureReserveSongs: input.futureSongs ?? [],
  plan: continuation.plan,
  concertIndex: input.completedConcertIndex,
  nextSongCycle: continuation.nextSongCycle,
  techniquesToNextSong: continuation.techniquesToNextSong,
  pages: continuation.pages,
  requiredPurchases: continuation.requiredPurchases,
  acquiredPlanTarget: continuation.acquiredPlanTarget,
  riskProfile: input.riskProfile,
  generationProfile: input.generationProfile,
  seedKey: `${input.seedKey ?? "cross-section"}:current`,
});

/**
 * Simulates exactly one post-live continuation from a known pre-live state.
 * This is deliberately exported so terminal technique decisions can compare
 * STOP_NOW with EXPOSE_AND_CARRY using the same transition kernel as song
 * policies. No training income is invented.
 */
export const simulateCrossSectionReadinessTrial = (
  input: CrossSectionTrialInput,
  trialIndex: number,
  techniqueMemo?: TechniqueSimulationMemo,
): CrossSectionTrialResult | null => {
  if (input.completedConcertIndex < 0 || input.completedConcertIndex >= 4) {
    return null;
  }

  const riskProfile = input.riskProfile ?? "standard";
  const generationProfile = input.generationProfile ?? "speed-wit";
  const nextConcertIndex = input.completedConcertIndex + 1;
  const nextPeriod = nextPeriodAfter(input.completedConcertIndex);
  const maxNextSectionPages = Math.max(
    1,
    Math.trunc(input.maxNextSectionPages ?? 7),
  );
  let nextPool = uniqueSongs([
    ...input.currentPool,
    ...(input.futureSongs ?? []),
  ]);
  let nextTotalSongs = input.totalSongsBeforeNextSection;
  let nextSectionManualSongs = 0;
  let carried = false;
  let carriedSongPurchases = 0;
  let nextBalance = applyPromotionalLiveTransition(
    input.balanceBeforeLive,
    input.completedConcertIndex,
  );

  if (input.carriedSong) {
    if (!canAfford(nextBalance, input.carriedSong.cost)) return null;
    nextBalance = subtractCost(nextBalance, input.carriedSong.cost);
    nextPool = nextPool.filter((song) => song.id !== input.carriedSong?.id);
    nextTotalSongs += 1;
    nextSectionManualSongs = 1;
    carried = true;
    carriedSongPurchases = 1;
  }

  const nextPlan = deriveStrategicPlan({
    concertIndex: nextConcertIndex,
    timingMode: "section-open",
    remainingSongs: nextPool,
  });
  // Raw song-count checkpoints (16 and 18) are diagnostics only. Cross-section
  // rollouts may require purchases solely to complete the final Great Success
  // gauge, never to move a counter closer to 18.
  const checkpoint = null;
  const finalGaugeMissing =
    nextConcertIndex === 4
      ? Math.max(0, manualSongsForGreatSuccess(4) - nextSectionManualSongs)
      : 0;
  const requiredPurchases = finalGaugeMissing;
  const nextPages = Math.min(maxNextSectionPages, nextPool.length);
  const firstTechniqueCount = carried
    ? 1
    : (techniquesForSongCycle(nextConcertIndex, 1) ?? 0);
  const nextResult = simulateTransitionAwareSongPagesTrial(
    {
      period: nextPeriod,
      firstOfferPeriod: carried
        ? nextPeriod
        : (input.currentFirstOfferPeriod ?? input.currentPeriod),
      balance: nextBalance,
      pool: nextPool,
      reserveSongs: nextPool,
      plan: nextPlan,
      concertIndex: nextConcertIndex,
      nextSongCycle: 1,
      techniquesToNextSong: firstTechniqueCount,
      pages: nextPages,
      requiredPurchases,
      acquiredPlanTarget: false,
      timingMode: "section-open",
      continueForStructuralValue: true,
      riskProfile,
      generationProfile,
      seedKey: `${input.seedKey ?? "cross-section"}:next`,
    },
    trialIndex,
    techniqueMemo,
  );

  return {
    nextConcertIndex,
    nextPlanId: nextPlan.id,
    checkpointRequired: checkpoint,
    checkpointMet: nextResult.checkpointMet,
    targetAcquired: nextResult.targetAcquired,
    friendship10Acquired: nextResult.friendship10Acquired,
    friendshipBonus: nextResult.friendshipBonus,
    friendshipPurchases: nextResult.friendshipPurchases,
    structuralPurchases: nextResult.structuralPurchases,
    purchases: nextResult.purchases + carriedSongPurchases,
    techniquePurchases: nextResult.techniquePurchases,
    lessonSkillPoints:
      (nextResult.purchases + carriedSongPurchases) * 25 +
      nextResult.techniquePurchases * 5,
    totalSongs: nextTotalSongs + nextResult.purchases,
    retainedBalance: nextResult.retainedBalance,
    remainingPool: nextResult.remainingPool,
  };
};

/**
 * Chains the current terminal decision, the verified +10/+50 live transition,
 * and a bounded value rollout of the following section. No future training
 * income is invented: the result is the guaranteed-stock branch of V(T_live).
 */
export const evaluateCrossSectionReadiness = (
  input: CrossSectionReadinessInput,
): CrossSectionReadinessResult | null => {
  if (input.completedConcertIndex < 0 || input.completedConcertIndex >= 4) {
    return null;
  }

  const trials = Math.max(1, Math.trunc(input.trials ?? 800));
  const riskProfile = input.riskProfile ?? "standard";
  const generationProfile = input.generationProfile ?? "speed-wit";
  let currentSectionCompletions = 0;
  let checkpointSuccesses = 0;
  let targetSuccesses = 0;
  let friendship10Successes = 0;
  let friendshipBonusTotal = 0;
  let friendshipPurchaseTotal = 0;
  let structuralPurchaseTotal = 0;
  let purchaseTotal = 0;
  let techniquePurchaseTotal = 0;
  let lessonSkillPointTotal = 0;
  let retainedTokenTotal = 0;
  const retainedBalanceTotal = zeroBalance();
  let representativePlan: StrategicPlan | null = null;
  let representativeCheckpoint: number | null = null;
  const techniqueMemo = input.techniqueMemo ?? createTechniqueSimulationMemo();

  for (let trial = 0; trial < trials; trial += 1) {
    const currentResult = input.currentContinuation
      ? simulateTransitionAwareSongPagesTrial(
          currentTrialInput({
            input: {
              ...input,
              riskProfile,
              generationProfile,
            },
            continuation: input.currentContinuation,
          }),
          trial,
          techniqueMemo,
        )
      : null;

    if (currentResult && !currentResult.checkpointMet) continue;
    currentSectionCompletions += 1;

    const immediateResult = simulateCrossSectionReadinessTrial(
      {
        completedConcertIndex: input.completedConcertIndex,
        currentPeriod: input.currentPeriod,
        currentFirstOfferPeriod: input.currentFirstOfferPeriod,
        balanceBeforeLive:
          currentResult?.retainedBalance ?? input.balanceBeforeLive,
        currentPool: currentResult?.remainingPool ?? input.currentPool,
        futureSongs: input.futureSongs,
        totalSongsBeforeNextSection:
          input.totalSongsBeforeNextSection + (currentResult?.purchases ?? 0),
        carriedSong: input.carriedSong,
        riskProfile,
        generationProfile,
        maxNextSectionPages: input.maxNextSectionPages,
        seedKey: input.seedKey,
      },
      trial,
      techniqueMemo,
    );
    if (!immediateResult) continue;

    const laterResult =
      input.laterSongs && input.laterSongs.length > 0
        ? simulateCrossSectionReadinessTrial(
            {
              completedConcertIndex: immediateResult.nextConcertIndex,
              currentPeriod: nextPeriodAfter(input.completedConcertIndex),
              balanceBeforeLive: immediateResult.retainedBalance,
              currentPool: immediateResult.remainingPool,
              futureSongs: input.laterSongs,
              totalSongsBeforeNextSection: immediateResult.totalSongs,
              riskProfile,
              generationProfile,
              maxNextSectionPages: input.maxNextSectionPages,
              seedKey: `${input.seedKey ?? "cross-section"}:later`,
            },
            trial,
            techniqueMemo,
          )
        : null;
    const nextResult = laterResult ?? immediateResult;
    // The horizon starts with the optional continuation in the section being
    // closed. Its purchases already affect the balance and thin the pool fed
    // to the following sections; their value must therefore be accumulated as
    // well. Omitting these terms made STOP able to buy the same songs later and
    // count their value, while BUY_CONTINUE paid for and removed them without
    // receiving their Friendship, SP or acquisition credit.
    const chainedFriendshipBonus =
      (currentResult?.friendshipBonus ?? 0) +
      immediateResult.friendshipBonus +
      (laterResult?.friendshipBonus ?? 0);
    const chainedFriendshipPurchases =
      (currentResult?.friendshipPurchases ?? 0) +
      immediateResult.friendshipPurchases +
      (laterResult?.friendshipPurchases ?? 0);
    const chainedStructuralPurchases =
      (currentResult?.structuralPurchases ?? 0) +
      immediateResult.structuralPurchases +
      (laterResult?.structuralPurchases ?? 0);
    const chainedPurchases =
      (currentResult?.purchases ?? 0) +
      immediateResult.purchases +
      (laterResult?.purchases ?? 0);
    const chainedTechniquePurchases =
      (currentResult?.techniquePurchases ?? 0) +
      immediateResult.techniquePurchases +
      (laterResult?.techniquePurchases ?? 0);
    const chainedLessonSkillPoints =
      (currentResult
        ? currentResult.purchases * 25 + currentResult.techniquePurchases * 5
        : 0) +
      immediateResult.lessonSkillPoints +
      (laterResult?.lessonSkillPoints ?? 0);

    representativePlan ??= deriveStrategicPlan({
      concertIndex: nextResult.nextConcertIndex,
      timingMode: "section-open",
      remainingSongs: uniqueSongs([
        ...(currentResult?.remainingPool ?? input.currentPool),
        ...(input.futureSongs ?? []),
      ]).filter((song) => song.id !== input.carriedSong?.id),
    });
    representativeCheckpoint ??= nextResult.checkpointRequired;
    if (immediateResult.checkpointMet && nextResult.checkpointMet) {
      checkpointSuccesses += 1;
    }
    if (immediateResult.targetAcquired && nextResult.targetAcquired) {
      targetSuccesses += 1;
    }
    if (
      input.activatedFriendship10 === true ||
      Boolean(currentResult?.friendship10Acquired) ||
      immediateResult.friendship10Acquired ||
      Boolean(laterResult?.friendship10Acquired)
    ) {
      friendship10Successes += 1;
    }
    friendshipBonusTotal +=
      chainedFriendshipBonus + Math.max(0, input.activatedFriendshipBonus ?? 0);
    friendshipPurchaseTotal += chainedFriendshipPurchases;
    structuralPurchaseTotal += chainedStructuralPurchases;
    purchaseTotal += chainedPurchases;
    techniquePurchaseTotal += chainedTechniquePurchases;
    lessonSkillPointTotal += chainedLessonSkillPoints;
    retainedTokenTotal += totalCost(nextResult.retainedBalance);
    for (const key of TOKEN_KEYS) {
      retainedBalanceTotal[key] += nextResult.retainedBalance[key];
    }
  }

  const denominator = trials;
  const checkpointProbability = checkpointSuccesses / denominator;
  const threshold = riskThreshold(riskProfile);
  const checkpointState: 0 | 1 | 2 =
    checkpointProbability >= threshold ? 2 : checkpointProbability > 0 ? 1 : 0;
  const expectedFriendshipBonus = friendshipBonusTotal / denominator;
  const expectedFriendshipPurchases = friendshipPurchaseTotal / denominator;
  const expectedStructuralPurchases = structuralPurchaseTotal / denominator;
  const expectedPurchases = purchaseTotal / denominator;
  const expectedTechniquePurchases = techniquePurchaseTotal / denominator;
  const expectedLessonSkillPoints = lessonSkillPointTotal / denominator;
  const expectedRetainedTokens = retainedTokenTotal / denominator;
  const expectedRetainedBalance = Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, retainedBalanceTotal[key] / denominator]),
  ) as Balance;
  const currentSectionCompletionProbability =
    currentSectionCompletions / denominator;
  const targetProbability = targetSuccesses / denominator;
  const friendship10Probability = friendship10Successes / denominator;
  const nextConcertIndex = input.completedConcertIndex + 1;

  return {
    horizonSections: input.laterSongs && input.laterSongs.length > 0 ? 2 : 1,
    nextConcertIndex,
    valueConcertIndex:
      input.completedConcertIndex +
      (input.laterSongs && input.laterSongs.length > 0 ? 2 : 1),
    nextPlanId: representativePlan?.id ?? "hold",
    checkpointRequired: representativeCheckpoint,
    checkpointProbability,
    checkpointState,
    targetProbability,
    friendship10Probability,
    expectedFriendshipBonus,
    expectedFriendshipPurchases,
    expectedStructuralPurchases,
    expectedPurchases,
    expectedTechniquePurchases,
    expectedLessonSkillPoints,
    expectedRetainedTokens,
    expectedRetainedBalance,
    currentSectionCompletionProbability,
    transitionTokenGain: 10,
    supplyScope: "verified-live-transition-no-training-income",
    trials,
    decisionVector: [
      currentSectionCompletionProbability >= threshold
        ? 2
        : currentSectionCompletionProbability > 0
          ? 1
          : 0,
      // 16/18 remain diagnostic while evaluating a Promotional-Live choice.
      // Structural song quality and activation timing must not be pre-empted by
      // a future raw song-count checkpoint.
      friendship10Probability,
      expectedFriendshipBonus,
      targetProbability,
      expectedStructuralPurchases,
      expectedLessonSkillPoints,
      expectedPurchases,
      expectedRetainedTokens,
    ],
  };
};
