import {
  TOKEN_KEYS,
  acquiredEffectsForSong,
  acquiredFriendshipEffect,
  canAfford,
  createTechniqueSimulationMemo,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  subtractCost,
  totalCost,
  type AcquiredEffect,
  type Balance,
  type GenerationProfile,
  type Period,
  type RemainingTrainingsByFacility,
  type RiskProfile,
  type SongTarget,
  type TechniqueSimulationMemo,
  type TokenShadowPrice,
} from "../live-model.ts";
import {
  applyPromotionalLiveTransition,
  manualSongsForGreatSuccess,
  techniquesForSongCycle,
} from "../domain/live-rules.ts";
import {
  deriveStrategicPlan,
  isChaseTarget,
  isVisibleOptionalTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  simulateTransitionAwareSongPagesTrial,
  type TransitionAwareSongPagesInput,
} from "./song-transition.ts";
import { riskThreshold } from "./value.ts";
import { selectCarriedPageSong } from "./carried-song-ranking.ts";

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
  /** Complete song page preserved across the Promotional Live. */
  carriedPage?: readonly SongTarget[] | null;
  /** @deprecated v1 compatibility: interpreted as a one-song carried page. */
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
  /** P2 prices computed once from the common parent decision state. */
  commonShadowPrices?: readonly TokenShadowPrice[];
  /** Exact remaining-training horizon at the carry decision point when known. */
  remainingTrainingsByFacility?: RemainingTrainingsByFacility;
  /** Current 1 + Friendship Training Effectiveness used for practice stat value. */
  friendshipSongMultiplier?: number;
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
  acquiredEffects: readonly AcquiredEffect[];
  friendshipTrainingExposure: number;
  spTrainingExposure: number;
  practiceTrainingExposure: number;
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
  gate16Probability: number;
  gate18Probability: number;
  friendship10Probability: number;
  effectiveFriendship10Probability: number;
  expectedFriendshipBonus: number;
  expectedFriendshipTrainingExposure: number;
  expectedSpTrainingExposure: number;
  expectedPracticeTrainingExposure: number;
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
  // A carried page is an exposed physical state, not merely a song that must
  // already be present in a reconstructed pool. Keep the v1 one-song adapter
  // faithful by injecting that known page before any rollout filtering.
  const carriedPage = uniqueSongs(
    input.carriedPage && input.carriedPage.length > 0
      ? [...input.carriedPage]
      : input.carriedSong
        ? [input.carriedSong]
        : [],
  );
  let nextPool = uniqueSongs([
    ...input.currentPool,
    ...(input.futureSongs ?? []),
    ...carriedPage,
  ]);
  let nextTotalSongs = input.totalSongsBeforeNextSection;
  let nextSectionManualSongs = 0;
  let carriedPagePurchases = 0;
  let carriedFriendshipBonus = 0;
  let carriedFriendshipPurchases = 0;
  let carriedFriendship10 = false;
  let carriedEffects: AcquiredEffect[] = [];
  let carriedStructuralPurchases = 0;
  let carriedTargetAcquired = false;
  let nextBalance = applyPromotionalLiveTransition(
    input.balanceBeforeLive,
    input.completedConcertIndex,
  );

  let nextPlan = deriveStrategicPlan({
    concertIndex: nextConcertIndex,
    timingMode: "section-open",
    remainingSongs: nextPool,
  });

  if (carriedPage.length > 0) {
    // The physical action carries the whole known page. Only after the +10
    // transition do we re-evaluate which (if any) of those songs to buy.
    const affordable = carriedPage.filter((song) =>
      canAfford(nextBalance, song.cost),
    );
    const mustBuyForFinalGauge =
      nextConcertIndex === 4 && manualSongsForGreatSuccess(4) > 0;
    const strategic = affordable.filter(
      (song) =>
        isChaseTarget(song, nextPlan) ||
        isVisibleOptionalTarget(song, nextPlan),
    );
    const hiddenChaseStillExists = nextPool.some(
      (song) =>
        !carriedPage.some((visible) => visible.id === song.id) &&
        isChaseTarget(song, nextPlan),
    );
    const admitted = mustBuyForFinalGauge
      ? affordable
      : strategic.length > 0
        ? strategic
        : hiddenChaseStillExists && nextPlan.mode !== "hold"
          ? affordable
          : [];
    const carriedSongRankingTrainings =
      input.remainingTrainingsByFacility ??
      estimateRemainingTrainingsByFacility(
        generationProfile,
        input.completedConcertIndex,
      );
    if (!carriedSongRankingTrainings) {
      throw new Error(
        `Missing carried-song training horizon for ${generationProfile}`,
      );
    }
    const selected = selectCarriedPageSong({
      songs: admitted,
      plan: nextPlan,
      commonShadowPrices: input.commonShadowPrices ?? [],
      purchasePointBalance: nextBalance,
      remainingTrainingsByFacility: carriedSongRankingTrainings,
      friendshipSongMultiplier: input.friendshipSongMultiplier ?? 1,
    })?.song;

    if (selected) {
      nextBalance = subtractCost(nextBalance, selected.cost);
      nextPool = nextPool.filter((song) => song.id !== selected.id);
      nextTotalSongs += 1;
      nextSectionManualSongs = 1;
      carriedPagePurchases = 1;
      carriedTargetAcquired = isChaseTarget(selected, nextPlan);
      const tier = structuralTier(selected, nextPlan);
      carriedStructuralPurchases = tier > 0 ? 1 : 0;
      carriedFriendshipBonus = selected.roles?.includes("friendship-10")
        ? 10
        : selected.roles?.includes("friendship-5")
          ? 5
          : 0;
      carriedFriendshipPurchases = carriedFriendshipBonus > 0 ? 1 : 0;
      carriedFriendship10 = carriedFriendshipBonus >= 10;
      carriedEffects = acquiredEffectsForSong({
        song: selected,
        concertIndex: nextConcertIndex,
        remainingTrainingsByFacility: estimateRemainingTrainingsByFacility(
          generationProfile,
          nextConcertIndex,
        ),
      });
      nextPlan = deriveStrategicPlan({
        concertIndex: nextConcertIndex,
        timingMode: "section-open",
        remainingSongs: nextPool,
        songsThisSection: 1,
      });
    }
  }

  // Raw song-count checkpoints (16 and 18) are diagnostics only. Cross-section
  // rollouts may require purchases solely to complete the final Great Success
  // gauge, never to move a counter closer to 18.
  const checkpoint = null;
  const finalGaugeMissing =
    nextConcertIndex === 4
      ? Math.max(0, manualSongsForGreatSuccess(4) - nextSectionManualSongs)
      : 0;
  const requiredPurchases = finalGaugeMissing;

  // A carried page that cannot be bought remains physically open. With no
  // invented training income, the bounded rollout cannot expose another page.
  if (carriedPage.length > 0 && carriedPagePurchases === 0) {
    return {
      nextConcertIndex,
      nextPlanId: nextPlan.id,
      checkpointRequired: checkpoint,
      checkpointMet: requiredPurchases === 0,
      targetAcquired: nextPlan.mode !== "hunt",
      friendship10Acquired: false,
      friendshipBonus: 0,
      friendshipPurchases: 0,
      acquiredEffects: [],
      friendshipTrainingExposure: 0,
      spTrainingExposure: 0,
      practiceTrainingExposure: 0,
      structuralPurchases: 0,
      purchases: 0,
      techniquePurchases: 0,
      lessonSkillPoints: 0,
      totalSongs: nextTotalSongs,
      retainedBalance: nextBalance,
      remainingPool: nextPool,
    };
  }

  const nextPages = Math.min(maxNextSectionPages, nextPool.length);
  const firstTechniqueCount =
    carriedPagePurchases > 0
      ? 1
      : (techniquesForSongCycle(nextConcertIndex, 1) ?? 0);
  const nextResult = simulateTransitionAwareSongPagesTrial(
    {
      period: nextPeriod,
      firstOfferPeriod:
        carriedPagePurchases > 0
          ? nextPeriod
          : (input.currentFirstOfferPeriod ?? input.currentPeriod),
      balance: nextBalance,
      pool: nextPool,
      reserveSongs: nextPool,
      plan: nextPlan,
      concertIndex: nextConcertIndex,
      songsThisSection: nextSectionManualSongs,
      nextSongCycle: 1,
      techniquesToNextSong: firstTechniqueCount,
      pages: nextPages,
      requiredPurchases,
      acquiredPlanTarget: carriedTargetAcquired,
      timingMode: "section-open",
      continueForStructuralValue: true,
      riskProfile,
      generationProfile,
      seedKey: `${input.seedKey ?? "cross-section"}:next`,
    },
    trialIndex,
    techniqueMemo,
  );

  const acquiredEffects = [...carriedEffects, ...nextResult.acquiredEffects];

  return {
    nextConcertIndex,
    nextPlanId: nextPlan.id,
    checkpointRequired: checkpoint,
    checkpointMet: nextResult.checkpointMet,
    targetAcquired: carriedTargetAcquired || nextResult.targetAcquired,
    friendship10Acquired:
      carriedFriendship10 || nextResult.friendship10Acquired,
    friendshipBonus: carriedFriendshipBonus + nextResult.friendshipBonus,
    friendshipPurchases:
      carriedFriendshipPurchases + nextResult.friendshipPurchases,
    acquiredEffects,
    friendshipTrainingExposure: effectExposure(acquiredEffects, "friendship"),
    spTrainingExposure: effectExposure(acquiredEffects, "sp-training"),
    practiceTrainingExposure: effectExposure(acquiredEffects, "practice"),
    structuralPurchases:
      carriedStructuralPurchases + nextResult.structuralPurchases,
    purchases: nextResult.purchases + carriedPagePurchases,
    techniquePurchases: nextResult.techniquePurchases,
    lessonSkillPoints:
      (nextResult.purchases + carriedPagePurchases) * 25 +
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
  let gate16Successes = 0;
  let gate18Successes = 0;
  let friendship10Successes = 0;
  let effectiveFriendship10Successes = 0;
  let friendshipBonusTotal = 0;
  let friendshipTrainingExposureTotal = 0;
  let spTrainingExposureTotal = 0;
  let practiceTrainingExposureTotal = 0;
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
        carriedPage: input.carriedPage,
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
    const activatedFriendshipEffect = acquiredFriendshipEffect({
      magnitude: Math.max(0, input.activatedFriendshipBonus ?? 0),
      concertIndex: input.completedConcertIndex,
    });
    const chainedEffects: AcquiredEffect[] = [
      ...(currentResult?.acquiredEffects ?? []),
      ...immediateResult.acquiredEffects,
      ...(laterResult?.acquiredEffects ?? []),
      ...(activatedFriendshipEffect ? [activatedFriendshipEffect] : []),
    ];
    const chainedFriendshipTrainingExposure = effectExposure(
      chainedEffects,
      "friendship",
    );
    const chainedSpTrainingExposure = effectExposure(
      chainedEffects,
      "sp-training",
    );
    const chainedPracticeTrainingExposure = effectExposure(
      chainedEffects,
      "practice",
    );
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
      remainingSongs: nextResult.remainingPool,
    });
    representativeCheckpoint ??= nextResult.checkpointRequired;
    if (immediateResult.checkpointMet && nextResult.checkpointMet) {
      checkpointSuccesses += 1;
    }
    if (immediateResult.targetAcquired && nextResult.targetAcquired) {
      targetSuccesses += 1;
    }
    if (nextResult.totalSongs >= 16) gate16Successes += 1;
    if (nextResult.totalSongs >= 18) gate18Successes += 1;
    if (
      input.activatedFriendship10 === true ||
      Boolean(currentResult?.friendship10Acquired) ||
      immediateResult.friendship10Acquired ||
      Boolean(laterResult?.friendship10Acquired)
    ) {
      friendship10Successes += 1;
    }
    if (
      chainedEffects.some(
        (effect) =>
          effect.kind === "friendship" &&
          effect.magnitude >= 10 &&
          effect.effectiveTrainingExposure > 0,
      )
    ) {
      effectiveFriendship10Successes += 1;
    }
    friendshipBonusTotal +=
      chainedFriendshipBonus + Math.max(0, input.activatedFriendshipBonus ?? 0);
    friendshipTrainingExposureTotal += chainedFriendshipTrainingExposure;
    spTrainingExposureTotal += chainedSpTrainingExposure;
    practiceTrainingExposureTotal += chainedPracticeTrainingExposure;
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
  const expectedFriendshipTrainingExposure =
    friendshipTrainingExposureTotal / denominator;
  const expectedSpTrainingExposure = spTrainingExposureTotal / denominator;
  const expectedPracticeTrainingExposure =
    practiceTrainingExposureTotal / denominator;
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
  const gate16Probability = gate16Successes / denominator;
  const gate18Probability = gate18Successes / denominator;
  const friendship10Probability = friendship10Successes / denominator;
  const effectiveFriendship10Probability =
    effectiveFriendship10Successes / denominator;
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
    gate16Probability,
    gate18Probability,
    friendship10Probability,
    effectiveFriendship10Probability,
    expectedFriendshipBonus,
    expectedFriendshipTrainingExposure,
    expectedSpTrainingExposure,
    expectedPracticeTrainingExposure,
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

  };
};
