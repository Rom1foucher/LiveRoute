import type { Message } from "../i18n/messages.ts";
import {
  acquiredEffectsForSong,
  canAfford,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  simulateTechniqueTransition,
  subtractCost,
  techniqueSpendMetrics,
  totalCost,
  TOKEN_KEYS,
  type Balance,
  type GenerationProfile,
  type Period,
  type RiskProfile,
  type ResourceDemand,
  type SongTarget,
  type TerminalTechniqueDecisionSummary,
  type TokenPressure,
} from "../live-model.ts";
import {
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import { applyPromotionalLiveTransition } from "../domain/live-rules.ts";
import { enumeratePageActions } from "./page-actions.ts";
import { maximumAffordablePurchases } from "./song-dp.ts";
import {
  simulateCrossSectionReadinessTrial,
  type CrossSectionTrialResult,
} from "./cross-section.ts";
import { drawTransitionSongPage } from "./song-transition.ts";
import { riskCatastropheFloor, riskThreshold } from "./value.ts";
import {
  addPairedDifference,
  canonicalNumberKey,
  createPairedDifferenceStats,
  pairedDifferenceSeparated,
  pairedMeanInterval,
  probabilityEstimateStable,
  wilsonInterval,
  type PairedDifferenceStats,
} from "../monte-carlo.ts";

export type TerminalTechniqueCandidate = {
  id: string;
  cost: Balance;
};

export type TerminalTechniqueOptionAssessment =
  TerminalTechniqueDecisionSummary & {
    candidateId: string;
    decisionVector: readonly number[];
  };

export type TerminalTechniqueOptionsInput = {
  concertIndex: number;
  period: Period;
  firstOfferPeriod?: Period;
  tokens: Balance;
  candidates: TerminalTechniqueCandidate[];
  techniquesRemaining: number;
  nextSongCycle?: number;
  currentSongs: SongTarget[];
  futureSongs?: SongTarget[];
  totalSongs: number;
  plan: StrategicPlan;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  /** Shared soft token pressure from the production solver state. */
  tokenPressure?: TokenPressure[];
  /** PR-5 downstream demand vectors shared with technique/song policy. */
  resourceDemands?: readonly ResourceDemand[];
  /** Adaptive upper bound. */
  trials?: number;
  /** Minimum paired trials before convergence may stop the evaluator. */
  minimumSamples?: number;
  /** Hard wall-clock guard for UI responsiveness; adaptive convergence still wins earlier. */
  maxDurationMs?: number;
  seedKey?: string;
};

const wallClockNow = (): number =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

type Aggregate = {
  completions: number;
  checkpoints: number;
  targets: number;
  friendship10: number;
  effectiveFriendship10: number;
  friendshipBonus: number;
  friendshipTrainingExposure: number;
  spTrainingExposure: number;
  practiceTrainingExposure: number;
  structuralPurchases: number;
  purchases: number;
  retainedTokens: number;
  committedCost: number;
  weightedCommittedCost: number;
  opportunityCost: number;
};

const emptyAggregate = (): Aggregate => ({
  completions: 0,
  checkpoints: 0,
  targets: 0,
  friendship10: 0,
  effectiveFriendship10: 0,
  friendshipBonus: 0,
  friendshipTrainingExposure: 0,
  spTrainingExposure: 0,
  practiceTrainingExposure: 0,
  structuralPurchases: 0,
  purchases: 0,
  retainedTokens: 0,
  committedCost: 0,
  weightedCommittedCost: 0,
  opportunityCost: 0,
});

const addTrial = (
  aggregate: Aggregate,
  result: CrossSectionTrialResult,
): void => {
  aggregate.completions += 1;
  aggregate.checkpoints += result.checkpointMet ? 1 : 0;
  aggregate.targets += result.targetAcquired ? 1 : 0;
  aggregate.friendship10 += result.friendship10Acquired ? 1 : 0;
  aggregate.effectiveFriendship10 += result.acquiredEffects.some(
    (effect) =>
      effect.kind === "friendship" &&
      effect.magnitude >= 10 &&
      effect.effectiveTrainingExposure > 0,
  )
    ? 1
    : 0;
  aggregate.friendshipBonus += result.friendshipBonus;
  aggregate.friendshipTrainingExposure += result.friendshipTrainingExposure;
  aggregate.spTrainingExposure += result.spTrainingExposure;
  aggregate.practiceTrainingExposure += result.practiceTrainingExposure;
  aggregate.structuralPurchases += result.structuralPurchases;
  aggregate.purchases += result.purchases;
  aggregate.retainedTokens += totalCost(result.retainedBalance);
};

const normalized = (aggregate: Aggregate, trials: number) => ({
  completionProbability: aggregate.completions / trials,
  checkpointProbability: aggregate.checkpoints / trials,
  targetProbability: aggregate.targets / trials,
  friendship10Probability: aggregate.friendship10 / trials,
  effectiveFriendship10Probability: aggregate.effectiveFriendship10 / trials,
  expectedFriendshipBonus: aggregate.friendshipBonus / trials,
  expectedFriendshipTrainingExposure:
    aggregate.friendshipTrainingExposure / trials,
  expectedSpTrainingExposure: aggregate.spTrainingExposure / trials,
  expectedPracticeTrainingExposure: aggregate.practiceTrainingExposure / trials,
  expectedStructuralPurchases: aggregate.structuralPurchases / trials,
  expectedPurchases: aggregate.purchases / trials,
  expectedRetainedTokens: aggregate.retainedTokens / trials,
  expectedCommittedCost: aggregate.committedCost / trials,
  expectedWeightedCommittedCost: aggregate.weightedCommittedCost / trials,
  expectedOpportunityCost: aggregate.opportunityCost / trials,
});

const trialVector = (result: CrossSectionTrialResult): readonly number[] => [
  // Promotional-Live terminal choices optimise structural song value/timing.
  // Checkpoint progress is telemetry only until the Grand Live itself.
  result.acquiredEffects.some(
    (effect) =>
      effect.kind === "friendship" &&
      effect.magnitude >= 10 &&
      effect.effectiveTrainingExposure > 0,
  )
    ? 1
    : 0,
  result.friendshipTrainingExposure,
  result.spTrainingExposure,
  result.practiceTrainingExposure,
  result.targetAcquired ? 1 : 0,
  result.structuralPurchases,
  result.purchases,
  totalCost(result.retainedBalance),
  result.checkpointMet ? 1 : 0,
];

const compareVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta;
  }
  return 0;
};

const stateFor = (probability: number, threshold: number): 0 | 1 | 2 =>
  probability >= threshold ? 2 : probability > 0 ? 1 : 0;

const friendshipValue = (song: SongTarget): number =>
  song.roles?.includes("friendship-10")
    ? 10
    : song.roles?.includes("friendship-5")
      ? 5
      : 0;

const withImmediateSongPurchase = ({
  result,
  song,
  plan,
  concertIndex,
  generationProfile,
}: {
  result: CrossSectionTrialResult;
  song: SongTarget;
  plan: StrategicPlan;
  concertIndex: number;
  generationProfile: GenerationProfile;
}): CrossSectionTrialResult => {
  const friendship = friendshipValue(song);
  const structural = structuralTier(song, plan) > 0 ? 1 : 0;
  const immediateEffects = acquiredEffectsForSong({
    song,
    concertIndex,
    remainingTrainingsByFacility: estimateRemainingTrainingsByFacility(
      generationProfile,
      concertIndex,
    ),
  });
  const acquiredEffects = [...result.acquiredEffects, ...immediateEffects];
  return {
    ...result,
    targetAcquired: result.targetAcquired || isChaseTarget(song, plan),
    friendship10Acquired: result.friendship10Acquired || friendship >= 10,
    friendshipBonus: result.friendshipBonus + friendship,
    friendshipPurchases: result.friendshipPurchases + (friendship > 0 ? 1 : 0),
    acquiredEffects,
    friendshipTrainingExposure: effectExposure(acquiredEffects, "friendship"),
    spTrainingExposure: effectExposure(acquiredEffects, "sp-training"),
    practiceTrainingExposure: effectExposure(acquiredEffects, "practice"),
    structuralPurchases: result.structuralPurchases + structural,
    purchases: result.purchases + 1,
    lessonSkillPoints: result.lessonSkillPoints + 25,
  };
};

const meaningfulGain = (
  stop: ReturnType<typeof normalized>,
  push: ReturnType<typeof normalized>,
): { gained: boolean; reason: Message } => {
  if (
    push.effectiveFriendship10Probability >
    stop.effectiveFriendship10Probability + 0.015
  ) {
    return {
      gained: true,
      reason: { code: "terminal.gainFriendship10" },
    };
  }
  if (
    push.expectedFriendshipTrainingExposure >
    stop.expectedFriendshipTrainingExposure + 1
  ) {
    return {
      gained: true,
      reason: { code: "terminal.gainExpectedFriendship" },
    };
  }
  if (push.expectedSpTrainingExposure > stop.expectedSpTrainingExposure + 1) {
    return {
      gained: true,
      reason: { code: "terminal.gainStructuralPurchases" },
    };
  }
  if (
    push.expectedPracticeTrainingExposure >
    stop.expectedPracticeTrainingExposure + 1
  ) {
    return {
      gained: true,
      reason: { code: "terminal.gainStructuralPurchases" },
    };
  }
  if (push.targetProbability > stop.targetProbability + 0.015) {
    return {
      gained: true,
      reason: { code: "terminal.gainNextTarget" },
    };
  }
  if (
    push.expectedStructuralPurchases >
    stop.expectedStructuralPurchases + 0.1
  ) {
    return {
      gained: true,
      reason: { code: "terminal.gainStructuralPurchases" },
    };
  }
  return {
    gained: false,
    reason: { code: "terminal.gainNone" },
  };
};

export const TERMINAL_C4_VALUE_CALIBRATION = {
  friendshipTrainingExposure: 0.25,
  spTrainingExposure: 0.3,
  practiceTrainingExposure: 0.18,
  targetProbability: 18,
  structuralPurchase: 4,
  terminalSongConversion: 2,
  // A page reached without converting any song is not free: it consumed the
  // current search cycle. Keep this small and fixed; resource destruction is
  // already priced separately by opportunity cost.
  failedSearchPenalty: 2,
  // Losing one currently fundable purchase on the path to 18 is valued on
  // the same structural scale as a target-probability point. This is a guard
  // against spending away a closure option, not a bonus for raw song count.
  gate18CapacityLoss: 18,
  riskPenaltyMultiplier: {
    safe: 3,
    standard: 2,
    greedy: 1,
  } satisfies Record<RiskProfile, number>,
} as const;

export type TerminalC4ValueBreakdown = {
  riskThreshold: number;
  catastropheFloor: number;
  reachLowerBound: number;
  catastropheAdmissible: boolean;
  grossValue: number;
  /** Raw PR-5 spend telemetry; no longer subtracted directly in C4. */
  weightedCommittedCost: number;
  /** Loss of future C4 Friendship / secured 18-song buying options. */
  opportunityCost: number;
  riskPenalty: number;
  netValue: number;
  shouldPush: boolean;
};

const terminalC4GrossValue = ({
  friendshipTrainingExposureDelta,
  spTrainingExposureDelta,
  practiceTrainingExposureDelta,
  targetProbabilityDelta,
  structuralPurchasesDelta,
  purchasesDelta,
}: {
  friendshipTrainingExposureDelta: number;
  spTrainingExposureDelta: number;
  practiceTrainingExposureDelta: number;
  targetProbabilityDelta: number;
  structuralPurchasesDelta: number;
  purchasesDelta: number;
}): number => {
  const trainingValue =
    Math.max(0, friendshipTrainingExposureDelta) *
      TERMINAL_C4_VALUE_CALIBRATION.friendshipTrainingExposure +
    Math.max(0, spTrainingExposureDelta) *
      TERMINAL_C4_VALUE_CALIBRATION.spTrainingExposure +
    Math.max(0, practiceTrainingExposureDelta) *
      TERMINAL_C4_VALUE_CALIBRATION.practiceTrainingExposure;
  // Target probability and generic structural-purchase count often describe
  // the same Song. Use the stronger option value instead of double-counting.
  const optionValue = Math.max(
    Math.max(0, targetProbabilityDelta) *
      TERMINAL_C4_VALUE_CALIBRATION.targetProbability,
    Math.max(0, structuralPurchasesDelta) *
      TERMINAL_C4_VALUE_CALIBRATION.structuralPurchase,
  );
  const terminalConversionValue =
    Math.max(0, purchasesDelta) *
    TERMINAL_C4_VALUE_CALIBRATION.terminalSongConversion;
  return trainingValue + optionValue + terminalConversionValue;
};

const c4FriendshipOptionValue = (
  song: SongTarget,
  generationProfile: GenerationProfile,
): number => {
  if (friendshipValue(song) <= 0) return 0;
  const effects = acquiredEffectsForSong({
    song,
    concertIndex: 3,
    remainingTrainingsByFacility: estimateRemainingTrainingsByFacility(
      generationProfile,
      3,
    ),
  });
  return (
    effectExposure(effects, "friendship") *
      TERMINAL_C4_VALUE_CALIBRATION.friendshipTrainingExposure +
    effectExposure(effects, "sp-training") *
      TERMINAL_C4_VALUE_CALIBRATION.spTrainingExposure +
    effectExposure(effects, "practice") *
      TERMINAL_C4_VALUE_CALIBRATION.practiceTrainingExposure +
    TERMINAL_C4_VALUE_CALIBRATION.terminalSongConversion
  );
};

const maxFundableFriendshipOptionValue = (
  balance: Balance,
  songs: readonly SongTarget[],
  generationProfile: GenerationProfile,
): number => {
  const targets = songs
    .filter((song) => friendshipValue(song) > 0)
    .map((song) => ({
      song,
      value: c4FriendshipOptionValue(song, generationProfile),
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.song.id.localeCompare(right.song.id),
    );

  // C4 currently contains six Friendship songs, so exact subset enumeration is
  // tiny (<= 64 states) and gives the economic question we actually care
  // about: which valuable future songs remain jointly fundable after PUSH?
  const visit = (index: number, current: Balance): number => {
    if (index >= targets.length) return 0;
    const item = targets[index];
    const skipped = visit(index + 1, current);
    if (!canAfford(current, item.song.cost)) return skipped;
    return Math.max(
      skipped,
      item.value + visit(index + 1, subtractCost(current, item.song.cost)),
    );
  };
  return visit(0, balance);
};

export type TerminalC4OpportunityCostBreakdown = {
  friendshipOptionLoss: number;
  gate18CapacityLoss: number;
  opportunityCost: number;
};

/**
 * C4 spend is not intrinsically bad: those tokens exist primarily to convert
 * the final effective concert into Friendship. Charge PUSH only when its
 * post-action stock destroys future C4 Friendship options or a currently
 * fundable slice of the 18-song closure.
 */
export const evaluateTerminalC4OpportunityCost = ({
  beforeBalance,
  afterBalance,
  remainingSongs,
  totalSongsAfterAction,
  generationProfile = "speed-wit",
}: {
  beforeBalance: Balance;
  afterBalance: Balance;
  remainingSongs: readonly SongTarget[];
  totalSongsAfterAction: number;
  generationProfile?: GenerationProfile;
}): TerminalC4OpportunityCostBreakdown => {
  const friendshipBefore = maxFundableFriendshipOptionValue(
    beforeBalance,
    remainingSongs,
    generationProfile,
  );
  const friendshipAfter = maxFundableFriendshipOptionValue(
    afterBalance,
    remainingSongs,
    generationProfile,
  );
  const friendshipOptionLoss = Math.max(0, friendshipBefore - friendshipAfter);

  const neededFor18 = Math.max(0, 18 - totalSongsAfterAction);
  let lostCapacity = 0;
  if (neededFor18 > 0 && remainingSongs.length > 0) {
    const beforeAfterLive = applyPromotionalLiveTransition(beforeBalance, 3);
    const afterAfterLive = applyPromotionalLiveTransition(afterBalance, 3);
    const beforeCapacity = maximumAffordablePurchases(
      beforeAfterLive,
      [...remainingSongs],
      1200,
      neededFor18,
    );
    const afterCapacity = maximumAffordablePurchases(
      afterAfterLive,
      [...remainingSongs],
      1200,
      neededFor18,
    );
    const proven = (capacity: {
      count: number;
      exact: boolean;
    }): number | null =>
      capacity.count >= neededFor18
        ? neededFor18
        : capacity.exact
          ? capacity.count
          : null;
    const beforeProven = proven(beforeCapacity);
    const afterProven = proven(afterCapacity);
    if (beforeProven !== null && afterProven !== null) {
      lostCapacity = Math.max(0, beforeProven - afterProven);
    }
  }

  const gate18CapacityLoss =
    lostCapacity * TERMINAL_C4_VALUE_CALIBRATION.gate18CapacityLoss;
  return {
    friendshipOptionLoss,
    gate18CapacityLoss,
    opportunityCost: friendshipOptionLoss + gate18CapacityLoss,
  };
};

/**
 * PR-4 terminal C4 policy. The historical profile threshold remains the
 * preferred operating point, but is no longer a binary veto. A Wilson lower
 * bound below the catastrophe floor is still a hard stop. Above that floor,
 * effective training value and terminal conversion are compared explicitly
 * against the marginal loss of future C4 options and a profile-sensitive risk
 * penalty. Raw PR-5 spend remains telemetry/tie-break information only.
 */
export const evaluateTerminalC4Value = ({
  riskProfile,
  reachLowerBound,
  weightedCommittedCost,
  opportunityCost = weightedCommittedCost,
  friendshipTrainingExposureDelta,
  spTrainingExposureDelta,
  practiceTrainingExposureDelta,
  targetProbabilityDelta,
  structuralPurchasesDelta,
  purchasesDelta,
}: {
  riskProfile: RiskProfile;
  reachLowerBound: number;
  weightedCommittedCost: number;
  opportunityCost?: number;
  friendshipTrainingExposureDelta: number;
  spTrainingExposureDelta: number;
  practiceTrainingExposureDelta: number;
  targetProbabilityDelta: number;
  structuralPurchasesDelta: number;
  purchasesDelta: number;
}): TerminalC4ValueBreakdown => {
  const threshold = riskThreshold(riskProfile);
  const catastropheFloor = riskCatastropheFloor(riskProfile);
  const grossValue = terminalC4GrossValue({
    friendshipTrainingExposureDelta,
    spTrainingExposureDelta,
    practiceTrainingExposureDelta,
    targetProbabilityDelta,
    structuralPurchasesDelta,
    purchasesDelta,
  });
  const rawWeightedSpend = Math.max(0, weightedCommittedCost);
  const cost = Math.max(0, opportunityCost);
  const shortfall = Math.max(0, threshold - reachLowerBound);
  // Risk still matters when abundant stock makes opportunity cost zero. Scale
  // it against the larger of value-at-risk and destroyed future options.
  const riskBase = Math.max(grossValue, cost);
  const riskPenalty =
    shortfall *
    riskBase *
    TERMINAL_C4_VALUE_CALIBRATION.riskPenaltyMultiplier[riskProfile];
  const netValue = grossValue - cost - riskPenalty;
  const catastropheAdmissible = reachLowerBound >= catastropheFloor;

  return {
    riskThreshold: threshold,
    catastropheFloor,
    reachLowerBound,
    catastropheAdmissible,
    grossValue,
    weightedCommittedCost: rawWeightedSpend,
    opportunityCost: cost,
    riskPenalty,
    netValue,
    shouldPush: catastropheAdmissible && netValue > 0,
  };
};

/**
 * Compares STOP_NOW with EXPOSE_AND_CARRY at a terminal technique screen.
 * The outgoing chain is never valued because it was already started: only the
 * future state produced by the remaining techniques and the carried page is
 * compared with passing to the concert immediately.
 */
type TrialMetrics = {
  effectiveFriendship10: number;
  friendshipTrainingExposure: number;
  spTrainingExposure: number;
  practiceTrainingExposure: number;
  target: number;
  structuralPurchases: number;
  purchases: number;
};

type PairedGainStats = {
  effectiveFriendship10: PairedDifferenceStats;
  friendshipTrainingExposure: PairedDifferenceStats;
  spTrainingExposure: PairedDifferenceStats;
  practiceTrainingExposure: PairedDifferenceStats;
  target: PairedDifferenceStats;
  structuralPurchases: PairedDifferenceStats;
};

const emptyPairedGainStats = (): PairedGainStats => ({
  effectiveFriendship10: createPairedDifferenceStats(),
  friendshipTrainingExposure: createPairedDifferenceStats(),
  spTrainingExposure: createPairedDifferenceStats(),
  practiceTrainingExposure: createPairedDifferenceStats(),
  target: createPairedDifferenceStats(),
  structuralPurchases: createPairedDifferenceStats(),
});

const trialMetrics = (
  result: CrossSectionTrialResult | null,
): TrialMetrics => ({
  effectiveFriendship10:
    result?.acquiredEffects.some(
      (effect) =>
        effect.kind === "friendship" &&
        effect.magnitude >= 10 &&
        effect.effectiveTrainingExposure > 0,
    ) === true
      ? 1
      : 0,
  friendshipTrainingExposure: result?.friendshipTrainingExposure ?? 0,
  spTrainingExposure: result?.spTrainingExposure ?? 0,
  practiceTrainingExposure: result?.practiceTrainingExposure ?? 0,
  target: result?.targetAcquired ? 1 : 0,
  structuralPurchases: result?.structuralPurchases ?? 0,
  purchases: result?.purchases ?? 0,
});

const addPairedGainTrial = (
  stats: PairedGainStats,
  stop: TrialMetrics,
  push: TrialMetrics,
): void => {
  addPairedDifference(
    stats.effectiveFriendship10,
    push.effectiveFriendship10 - stop.effectiveFriendship10,
  );
  addPairedDifference(
    stats.friendshipTrainingExposure,
    push.friendshipTrainingExposure - stop.friendshipTrainingExposure,
  );
  addPairedDifference(
    stats.spTrainingExposure,
    push.spTrainingExposure - stop.spTrainingExposure,
  );
  addPairedDifference(
    stats.practiceTrainingExposure,
    push.practiceTrainingExposure - stop.practiceTrainingExposure,
  );
  addPairedDifference(stats.target, push.target - stop.target);
  addPairedDifference(
    stats.structuralPurchases,
    push.structuralPurchases - stop.structuralPurchases,
  );
};

const pairedGainStable = (stats: PairedGainStats): boolean => {
  const ordered: Array<[PairedDifferenceStats, number]> = [
    [stats.effectiveFriendship10, 0.015],
    [stats.friendshipTrainingExposure, 1],
    [stats.spTrainingExposure, 1],
    [stats.practiceTrainingExposure, 1],
    [stats.target, 0.015],
    [stats.structuralPurchases, 0.1],
  ];
  for (const [metric, threshold] of ordered) {
    const separated = pairedDifferenceSeparated(metric, threshold);
    if (separated === "above") return true;
    if (separated === "uncertain") return false;
  }
  return true;
};

const canonicalTechniqueActionKey = (cost: Balance): string =>
  `tech:${canonicalNumberKey([
    cost.dance,
    cost.passion,
    cost.vocal,
    cost.visual,
    cost.mental,
  ])}`;

/**
 * Compares STOP_NOW with EXPOSE_AND_CARRY at a terminal technique screen.
 * Sibling technique choices are evaluated with common random numbers. Physical
 * actions producing the same successor state are simulated once and fanned
 * back out to their UI labels afterwards.
 */
export const evaluateTerminalTechniqueOptions = (
  input: TerminalTechniqueOptionsInput,
): TerminalTechniqueOptionAssessment[] | null => {
  if (
    input.plan.mode !== "close" ||
    input.concertIndex < 0 ||
    input.concertIndex >= 4
  ) {
    return null;
  }

  const maxTrials = Math.max(80, Math.trunc(input.trials ?? 2400));
  const minimumSamples = Math.min(
    maxTrials,
    Math.max(
      1,
      Math.trunc(input.minimumSamples ?? (maxTrials <= 128 ? maxTrials : 192)),
    ),
  );
  const convergenceBatch = 64;
  const startedAt = wallClockNow();
  const maxDurationMs =
    input.maxDurationMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, input.maxDurationMs);
  let timeBudgetExceeded = false;
  const riskProfile = input.riskProfile ?? "standard";
  const generationProfile = input.generationProfile ?? "speed-wit";
  const tokenPressure = input.tokenPressure ?? [];
  const resourceDemands = input.resourceDemands ?? [];
  const threshold = riskThreshold(riskProfile);
  const baseSeed = `${input.seedKey ?? "terminal-technique"}:crn`;
  const allC4Songs = [
    ...new Map(
      [...input.currentSongs, ...(input.futureSongs ?? [])].map((song) => [
        song.id,
        song,
      ]),
    ).values(),
  ];
  const useC4OpportunityEconomy =
    input.concertIndex === 3 &&
    allC4Songs.some((song) => friendshipValue(song) > 0);
  const opportunityCache = new Map<string, number>();
  const c4OpportunityCostFor = ({
    afterBalance,
    purchasedSongId,
    totalSongsAfterAction,
  }: {
    afterBalance: Balance;
    purchasedSongId?: string;
    totalSongsAfterAction: number;
  }): number | null => {
    if (!useC4OpportunityEconomy) return null;
    const remainingSongs = purchasedSongId
      ? allC4Songs.filter((song) => song.id !== purchasedSongId)
      : allC4Songs;
    const key = `${purchasedSongId ?? "none"}:${totalSongsAfterAction}:${TOKEN_KEYS.map(
      (token) => afterBalance[token],
    ).join(",")}`;
    const cached = opportunityCache.get(key);
    if (cached !== undefined) return cached;
    const value = evaluateTerminalC4OpportunityCost({
      beforeBalance: input.tokens,
      afterBalance,
      remainingSongs,
      totalSongsAfterAction,
      generationProfile,
    }).opportunityCost;
    opportunityCache.set(key, value);
    return value;
  };
  const stopAggregate = emptyAggregate();

  const candidateKeyById = new Map<string, string>();
  const uniqueCandidates = new Map<string, TerminalTechniqueCandidate>();
  for (const candidate of input.candidates) {
    const key = canonicalTechniqueActionKey(candidate.cost);
    candidateKeyById.set(candidate.id, key);
    if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, candidate);
  }
  const pushAggregates = new Map(
    [...uniqueCandidates.keys()].map((key) => [key, emptyAggregate()]),
  );
  const pairedGainStats = new Map(
    [...uniqueCandidates.keys()].map((key) => [key, emptyPairedGainStats()]),
  );
  const pairedNetBeforeRiskStats = new Map(
    [...uniqueCandidates.keys()].map((key) => [
      key,
      createPairedDifferenceStats(),
    ]),
  );

  const candidateStable = (key: string, samples: number): boolean => {
    if (samples < minimumSamples) return false;
    const aggregate = pushAggregates.get(key) ?? emptyAggregate();
    const reachStable = probabilityEstimateStable({
      successes: aggregate.completions,
      samples,
      thresholds:
        input.concertIndex === 3
          ? [riskCatastropheFloor(riskProfile), threshold, 0.985]
          : [threshold, 0.985],
      maxWidth: 0.05,
    });
    const gainStable =
      input.concertIndex === 3
        ? (() => {
            const stop = normalized(stopAggregate, samples);
            const push = normalized(aggregate, samples);
            const reachLowerBound = wilsonInterval(
              aggregate.completions,
              samples,
            )[0];
            const value = evaluateTerminalC4Value({
              riskProfile,
              reachLowerBound,
              weightedCommittedCost: push.expectedWeightedCommittedCost,
              opportunityCost: push.expectedOpportunityCost,
              friendshipTrainingExposureDelta:
                push.expectedFriendshipTrainingExposure -
                stop.expectedFriendshipTrainingExposure,
              spTrainingExposureDelta:
                push.expectedSpTrainingExposure -
                stop.expectedSpTrainingExposure,
              practiceTrainingExposureDelta:
                push.expectedPracticeTrainingExposure -
                stop.expectedPracticeTrainingExposure,
              targetProbabilityDelta:
                push.targetProbability - stop.targetProbability,
              structuralPurchasesDelta:
                push.expectedStructuralPurchases -
                stop.expectedStructuralPurchases,
              purchasesDelta: push.expectedPurchases - stop.expectedPurchases,
            });
            const interval = pairedMeanInterval(
              pairedNetBeforeRiskStats.get(key) ??
                createPairedDifferenceStats(),
            );
            const lower = interval[0] - value.riskPenalty;
            const upper = interval[1] - value.riskPenalty;
            return lower > 0 || upper <= 0;
          })()
        : pairedGainStable(pairedGainStats.get(key) ?? emptyPairedGainStats());
    return reachStable && gainStable;
  };

  let actualTrials = 0;
  for (let trial = 0; trial < maxTrials; trial += 1) {
    const stopResult = simulateCrossSectionReadinessTrial(
      {
        completedConcertIndex: input.concertIndex,
        currentPeriod: input.period,
        currentFirstOfferPeriod: input.firstOfferPeriod,
        balanceBeforeLive: input.tokens,
        currentPool: input.currentSongs,
        futureSongs: input.futureSongs,
        totalSongsBeforeNextSection: input.totalSongs,
        riskProfile,
        generationProfile,
        seedKey: `${baseSeed}:future`,
      },
      trial,
    );
    if (stopResult) addTrial(stopAggregate, stopResult);
    const stopMetrics = trialMetrics(stopResult);

    for (const [actionKey, candidate] of uniqueCandidates) {
      const aggregate = pushAggregates.get(actionKey);
      const paired = pairedGainStats.get(actionKey);
      const pairedNet = pairedNetBeforeRiskStats.get(actionKey);
      if (!aggregate || !paired || !pairedNet) continue;

      let bestResult: CrossSectionTrialResult | null = null;
      let bestVector: readonly number[] | null = null;
      let committedCost = 0;
      let weightedCommittedCost = 0;
      let opportunityCost = 0;
      let bestCommittedCost = 0;
      let bestWeightedCommittedCost = 0;
      let bestOpportunityCost = 0;

      if (canAfford(input.tokens, candidate.cost)) {
        const candidateSpend = techniqueSpendMetrics(
          candidate.cost,
          input.tokens,
          tokenPressure,
        );
        const afterCandidate = subtractCost(input.tokens, candidate.cost);
        const remainingAfterCandidate = Math.max(
          0,
          input.techniquesRemaining - 1,
        );
        const transition = simulateTechniqueTransition({
          period: input.period,
          firstOfferPeriod: input.period,
          tokens: afterCandidate,
          techniquesRemaining: remainingAfterCandidate,
          nextSongCycle: input.nextSongCycle ?? 1,
          songs: input.currentSongs,
          reserveSongs: [...input.currentSongs, ...(input.futureSongs ?? [])],
          resourceDemands,
          objective: "carryover",
          strategicPlan: input.plan,
          riskProfile,
          generationProfile,
          // Common random numbers: the candidate label/cost does not alter the
          // future offer law, only the starting balance does.
          seedKey: `${baseSeed}:tech`,
          trialIndex: trial,
        });

        committedCost = candidateSpend.totalSpend + transition.spent;
        weightedCommittedCost =
          candidateSpend.weightedDemandCost + transition.spent;
        // Hotfix v6: every C4 outcome is priced by destroyed future options,
        // including misses/carry. A failed search is already represented by
        // the absence of positive Friendship/structural value in that trial;
        // charging 100% of raw token spend again made 83-88% searches look
        // irrational even with abundant stock. Outside C4 the PR-5 weighted
        // spend remains the economic cost.
        opportunityCost =
          c4OpportunityCostFor({
            afterBalance: transition.balance,
            totalSongsAfterAction: input.totalSongs,
          }) ?? weightedCommittedCost;
        if (input.concertIndex === 3 && useC4OpportunityEconomy) {
          opportunityCost += TERMINAL_C4_VALUE_CALIBRATION.failedSearchPenalty;
        }
        bestCommittedCost = committedCost;
        bestWeightedCommittedCost = weightedCommittedCost;
        bestOpportunityCost = opportunityCost;

        if (transition.reached) {
          const page = drawTransitionSongPage(
            input.currentSongs,
            `${baseSeed}:page:${trial}`,
          );
          const pageActions = enumeratePageActions({
            tokens: transition.balance,
            visibleSongs: page,
            timingMode: "deadline-now",
            concertIndex: input.concertIndex,
          });

          for (const action of pageActions) {
            if (action.kind === "buy-stop") {
              const song = page.find(
                (candidateSong) => candidateSong.id === action.songId,
              );
              if (!song) continue;
              const afterSong = subtractCost(transition.balance, song.cost);
              const futureAfterBuy = simulateCrossSectionReadinessTrial(
                {
                  completedConcertIndex: input.concertIndex,
                  currentPeriod: input.period,
                  currentFirstOfferPeriod: input.firstOfferPeriod,
                  balanceBeforeLive: afterSong,
                  currentPool: input.currentSongs.filter(
                    (candidateSong) => candidateSong.id !== song.id,
                  ),
                  futureSongs: input.futureSongs,
                  totalSongsBeforeNextSection: input.totalSongs + 1,
                  riskProfile,
                  generationProfile,
                  seedKey: `${baseSeed}:future`,
                },
                trial,
              );
              if (!futureAfterBuy) continue;
              const purchased = withImmediateSongPurchase({
                result: futureAfterBuy,
                song,
                plan: input.plan,
                concertIndex: input.concertIndex,
                generationProfile,
              });
              const songSpend = techniqueSpendMetrics(
                song.cost,
                transition.balance,
                tokenPressure,
              );
              const nextWeightedCommittedCost =
                weightedCommittedCost + songSpend.weightedDemandCost;
              const nextOpportunityCost =
                c4OpportunityCostFor({
                  afterBalance: afterSong,
                  purchasedSongId: song.id,
                  totalSongsAfterAction: input.totalSongs + 1,
                }) ?? nextWeightedCommittedCost;
              const baseVector = trialVector(purchased);
              const vector =
                input.concertIndex === 3
                  ? [
                      ...baseVector.slice(0, 7),
                      -nextOpportunityCost,
                      ...baseVector.slice(7),
                    ]
                  : baseVector;
              if (!bestVector || compareVector(vector, bestVector) > 0) {
                bestResult = purchased;
                bestVector = vector;
                bestCommittedCost = committedCost + songSpend.totalSpend;
                bestWeightedCommittedCost = nextWeightedCommittedCost;
                bestOpportunityCost = nextOpportunityCost;
              }
              continue;
            }

            if (action.kind !== "carry-current-page") continue;
            const future = simulateCrossSectionReadinessTrial(
              {
                completedConcertIndex: input.concertIndex,
                currentPeriod: input.period,
                currentFirstOfferPeriod: input.firstOfferPeriod,
                balanceBeforeLive: transition.balance,
                currentPool: input.currentSongs,
                futureSongs: input.futureSongs,
                totalSongsBeforeNextSection: input.totalSongs,
                carriedPage: page,
                riskProfile,
                generationProfile,
                seedKey: `${baseSeed}:future`,
              },
              trial,
            );
            if (!future) continue;
            const nextOpportunityCost =
              (c4OpportunityCostFor({
                afterBalance: transition.balance,
                totalSongsAfterAction: input.totalSongs,
              }) ?? weightedCommittedCost) +
              (input.concertIndex === 3 && useC4OpportunityEconomy
                ? TERMINAL_C4_VALUE_CALIBRATION.failedSearchPenalty
                : 0);
            const baseVector = trialVector(future);
            const vector =
              input.concertIndex === 3
                ? [
                    ...baseVector.slice(0, 7),
                    -nextOpportunityCost,
                    ...baseVector.slice(7),
                  ]
                : baseVector;
            if (!bestVector || compareVector(vector, bestVector) > 0) {
              bestResult = future;
              bestVector = vector;
              bestCommittedCost = committedCost;
              bestWeightedCommittedCost = weightedCommittedCost;
              bestOpportunityCost = nextOpportunityCost;
            }
          }
        }
      }

      aggregate.committedCost += bestResult ? bestCommittedCost : committedCost;
      aggregate.weightedCommittedCost += bestResult
        ? bestWeightedCommittedCost
        : weightedCommittedCost;
      aggregate.opportunityCost += bestResult
        ? bestOpportunityCost
        : opportunityCost;
      if (bestResult) addTrial(aggregate, bestResult);
      const pushMetrics = trialMetrics(bestResult);
      addPairedGainTrial(paired, stopMetrics, pushMetrics);
      const trialOpportunityCost = bestResult
        ? bestOpportunityCost
        : opportunityCost;
      addPairedDifference(
        pairedNet,
        terminalC4GrossValue({
          friendshipTrainingExposureDelta:
            pushMetrics.friendshipTrainingExposure -
            stopMetrics.friendshipTrainingExposure,
          spTrainingExposureDelta:
            pushMetrics.spTrainingExposure - stopMetrics.spTrainingExposure,
          practiceTrainingExposureDelta:
            pushMetrics.practiceTrainingExposure -
            stopMetrics.practiceTrainingExposure,
          targetProbabilityDelta: pushMetrics.target - stopMetrics.target,
          structuralPurchasesDelta:
            pushMetrics.structuralPurchases - stopMetrics.structuralPurchases,
          purchasesDelta: pushMetrics.purchases - stopMetrics.purchases,
        }) - trialOpportunityCost,
      );
    }

    actualTrials = trial + 1;
    if (actualTrials % convergenceBatch === 0) {
      if (wallClockNow() - startedAt >= maxDurationMs) {
        timeBudgetExceeded = true;
        break;
      }
      if (
        [...uniqueCandidates.keys()].every((key) =>
          candidateStable(key, actualTrials),
        )
      ) {
        break;
      }
    }
  }

  const trials = Math.max(1, actualTrials);
  const stop = normalized(stopAggregate, trials);

  return input.candidates.map((candidate) => {
    const actionKey =
      candidateKeyById.get(candidate.id) ??
      canonicalTechniqueActionKey(candidate.cost);
    const push = normalized(
      pushAggregates.get(actionKey) ?? emptyAggregate(),
      trials,
    );
    const reachState = stateFor(push.completionProbability, threshold);
    const gain = meaningfulGain(stop, push);
    const reachLowerBound = wilsonInterval(
      pushAggregates.get(actionKey)?.completions ?? 0,
      trials,
    )[0];
    const c4Value =
      input.concertIndex === 3
        ? evaluateTerminalC4Value({
            riskProfile,
            reachLowerBound,
            weightedCommittedCost: push.expectedWeightedCommittedCost,
            opportunityCost: push.expectedOpportunityCost,
            friendshipTrainingExposureDelta:
              push.expectedFriendshipTrainingExposure -
              stop.expectedFriendshipTrainingExposure,
            spTrainingExposureDelta:
              push.expectedSpTrainingExposure - stop.expectedSpTrainingExposure,
            practiceTrainingExposureDelta:
              push.expectedPracticeTrainingExposure -
              stop.expectedPracticeTrainingExposure,
            targetProbabilityDelta:
              push.targetProbability - stop.targetProbability,
            structuralPurchasesDelta:
              push.expectedStructuralPurchases -
              stop.expectedStructuralPurchases,
            purchasesDelta: push.expectedPurchases - stop.expectedPurchases,
          })
        : null;
    const shouldPush = c4Value
      ? c4Value.shouldPush
      : reachState === 2 && gain.gained;
    const reason: Message = c4Value
      ? !c4Value.catastropheAdmissible
        ? {
            code: "terminal.stopNowCatastropheFloor",
            grossValue: c4Value.grossValue,
            opportunityCost: c4Value.opportunityCost,
            riskPenalty: c4Value.riskPenalty,
            netValue: c4Value.netValue,
            reachLowerBound: c4Value.reachLowerBound,
            catastropheFloor: c4Value.catastropheFloor,
          }
        : shouldPush
          ? {
              code: "terminal.exposeAndCarryValue",
              grossValue: c4Value.grossValue,
              opportunityCost: c4Value.opportunityCost,
              riskPenalty: c4Value.riskPenalty,
              netValue: c4Value.netValue,
              reachLowerBound: c4Value.reachLowerBound,
              catastropheFloor: c4Value.catastropheFloor,
            }
          : {
              code: "terminal.stopNowValue",
              grossValue: c4Value.grossValue,
              opportunityCost: c4Value.opportunityCost,
              riskPenalty: c4Value.riskPenalty,
              netValue: c4Value.netValue,
              reachLowerBound: c4Value.reachLowerBound,
              catastropheFloor: c4Value.catastropheFloor,
            }
      : shouldPush
        ? { code: "terminal.exposeAndCarry", gain: gain.reason }
        : push.completionProbability < threshold
          ? { code: "terminal.stopNowPageNotReached" }
          : { code: "terminal.stopNow", gain: gain.reason };
    const converged = candidateStable(actionKey, trials);
    const uncertainAtBudgetLimit =
      !converged && (trials >= maxTrials || timeBudgetExceeded);

    return {
      candidateId: candidate.id,
      applicable: true,
      action: shouldPush ? "expose-and-carry" : "stop-now",
      reason,
      trials,
      maxTrials,
      converged,
      uncertainAtBudgetLimit,
      timeBudgetExceeded,
      seedKey: baseSeed,
      canonicalActionKey: actionKey,
      reachProbability: push.completionProbability,
      expectedCommittedCost: push.expectedCommittedCost,
      expectedWeightedCommittedCost: push.expectedWeightedCommittedCost,
      expectedOpportunityCost: push.expectedOpportunityCost,
      riskThreshold: c4Value?.riskThreshold ?? threshold,
      catastropheFloor:
        c4Value?.catastropheFloor ?? riskCatastropheFloor(riskProfile),
      reachConfidenceLowerBound: reachLowerBound,
      grossValue: c4Value?.grossValue ?? 0,
      riskPenalty: c4Value?.riskPenalty ?? 0,
      netValue: c4Value?.netValue ?? 0,
      stopCheckpointProbability: stop.checkpointProbability,
      pushCheckpointProbability: push.checkpointProbability,
      stopTargetProbability: stop.targetProbability,
      pushTargetProbability: push.targetProbability,
      stopFriendship10Probability: stop.friendship10Probability,
      pushFriendship10Probability: push.friendship10Probability,
      stopEffectiveFriendship10Probability:
        stop.effectiveFriendship10Probability,
      pushEffectiveFriendship10Probability:
        push.effectiveFriendship10Probability,
      stopExpectedFriendshipBonus: stop.expectedFriendshipBonus,
      pushExpectedFriendshipBonus: push.expectedFriendshipBonus,
      stopExpectedFriendshipTrainingExposure:
        stop.expectedFriendshipTrainingExposure,
      pushExpectedFriendshipTrainingExposure:
        push.expectedFriendshipTrainingExposure,
      stopExpectedSpTrainingExposure: stop.expectedSpTrainingExposure,
      pushExpectedSpTrainingExposure: push.expectedSpTrainingExposure,
      stopExpectedPracticeTrainingExposure:
        stop.expectedPracticeTrainingExposure,
      pushExpectedPracticeTrainingExposure:
        push.expectedPracticeTrainingExposure,
      stopExpectedStructuralPurchases: stop.expectedStructuralPurchases,
      pushExpectedStructuralPurchases: push.expectedStructuralPurchases,
      decisionVector: [
        shouldPush ? 1 : 0,
        c4Value
          ? c4Value.catastropheAdmissible
            ? push.completionProbability >= threshold
              ? 2
              : 1
            : 0
          : reachState,
        c4Value ? (c4Value.netValue > 0 ? 1 : 0) : gain.gained ? 1 : 0,
        1,
        push.effectiveFriendship10Probability,
        push.expectedFriendshipTrainingExposure,
        push.expectedSpTrainingExposure,
        push.expectedPracticeTrainingExposure,
        -push.expectedOpportunityCost,
        -push.expectedWeightedCommittedCost,
        push.expectedRetainedTokens,
        push.targetProbability,
        push.expectedStructuralPurchases,
        c4Value?.netValue ?? 0,
      ],
    };
  });
};
