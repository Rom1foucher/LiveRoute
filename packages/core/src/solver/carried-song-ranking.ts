import {
  TOKEN_KEYS,
  canAfford,
  structuralTrainingValue,
  totalCost,
  type Balance,
  type RemainingTrainingsByFacility,
  type SongTarget,
  type TokenShadowPrice,
} from "../live-model.ts";
import {
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  FRIENDSHIP_EXPOSURE_STAT_RATE,
  SKILL_POINT_UTILITY,
} from "./utility-model.ts";

export type CarriedSongRankMetrics = {
  /** P3b2 nominal T1b utility. P2 cost metrics are fallback only. */
  utilityStatPoints: number;
  target: 0 | 1;
  structuralTier: number;
  weightedCost: number;
  scarcityNormalisedCost: number;
  totalCost: number;
  expectedPracticeStatDelta: number;
};

export type RankedCarriedSong = {
  song: SongTarget;
  metrics: CarriedSongRankMetrics;
};

const STAT_TRAINING_BONUS =
  /^(speed|stamina|power|guts|wisdom) training \+\d+/i;

const weightedCost = (
  cost: Balance,
  commonShadowPrices: readonly TokenShadowPrice[],
): number => {
  const shadowByKey = new Map(
    commonShadowPrices.map((price) => [
      price.key,
      Math.max(0, price.shadowValue),
    ]),
  );
  return TOKEN_KEYS.reduce(
    (sum, key) => sum + Math.max(0, cost[key]) * (shadowByKey.get(key) ?? 0),
    0,
  );
};

const scarcityNormalisedCost = (
  cost: Balance,
  purchasePointBalance: Balance,
): number =>
  TOKEN_KEYS.reduce(
    (sum, key) =>
      sum +
      (purchasePointBalance[key] > 0
        ? Math.max(0, cost[key]) / purchasePointBalance[key]
        : 0),
    0,
  );

const expectedPracticeStatDelta = ({
  song,
  remainingTrainingsByFacility,
  friendshipSongMultiplier,
}: {
  song: SongTarget;
  remainingTrainingsByFacility: RemainingTrainingsByFacility;
  friendshipSongMultiplier: number;
}): number => {
  if (!song.practiceBonus || !STAT_TRAINING_BONUS.test(song.practiceBonus)) {
    return 0;
  }
  return structuralTrainingValue(
    song.practiceBonus,
    remainingTrainingsByFacility,
    friendshipSongMultiplier,
  );
};


const carriedSongUtilityStatPoints = ({
  song,
  remainingTrainingsByFacility,
  friendshipSongMultiplier,
}: {
  song: SongTarget;
  remainingTrainingsByFacility: RemainingTrainingsByFacility;
  friendshipSongMultiplier: number;
}): number => {
  const practiceStats = expectedPracticeStatDelta({
    song,
    remainingTrainingsByFacility,
    friendshipSongMultiplier,
  });
  const skillPointTraining =
    song.practiceBonus && /^skill pts? training \+\d+/i.test(song.practiceBonus)
      ? structuralTrainingValue(
          song.practiceBonus,
          remainingTrainingsByFacility,
          friendshipSongMultiplier,
        )
      : 0;
  const horizon = Object.values(remainingTrainingsByFacility).reduce(
    (sum, value) => sum + value,
    0,
  );
  const friendshipMagnitude = song.roles?.includes("friendship-10")
    ? 10
    : song.roles?.includes("friendship-5")
      ? 5
      : 0;
  return (
    practiceStats +
    (25 + skillPointTraining) * SKILL_POINT_UTILITY +
    friendshipMagnitude * horizon * FRIENDSHIP_EXPOSURE_STAT_RATE
  );
};

/**
 * P2 carried-page fallback metrics.
 *
 * Shadow prices are cardinal only inside token space and must be computed once
 * from the common parent state. `purchasePointBalance` is intentionally the
 * physical wallet at the later purchase point (post-Live +10 for carryover).
 */
export const carriedSongRankMetrics = ({
  song,
  plan,
  commonShadowPrices,
  purchasePointBalance,
  remainingTrainingsByFacility,
  friendshipSongMultiplier = 1,
}: {
  song: SongTarget;
  plan: StrategicPlan;
  commonShadowPrices: readonly TokenShadowPrice[];
  purchasePointBalance: Balance;
  remainingTrainingsByFacility: RemainingTrainingsByFacility;
  friendshipSongMultiplier?: number;
}): CarriedSongRankMetrics => {
  if (!canAfford(purchasePointBalance, song.cost)) {
    throw new Error(`Cannot rank unaffordable carried song: ${song.id}`);
  }

  return {
    utilityStatPoints: carriedSongUtilityStatPoints({
      song,
      remainingTrainingsByFacility,
      friendshipSongMultiplier,
    }),
    target: isChaseTarget(song, plan) ? 1 : 0,
    structuralTier: structuralTier(song, plan),
    weightedCost: weightedCost(song.cost, commonShadowPrices),
    scarcityNormalisedCost: scarcityNormalisedCost(
      song.cost,
      purchasePointBalance,
    ),
    totalCost: totalCost(song.cost),
    expectedPracticeStatDelta: expectedPracticeStatDelta({
      song,
      remainingTrainingsByFacility,
      friendshipSongMultiplier,
    }),
  };
};

/**
 * Semantic P2 order, deliberately excluding the deterministic ID fallback.
 * Positive means `left` is preferred.
 */
export const compareCarriedSongMetrics = (
  left: CarriedSongRankMetrics,
  right: CarriedSongRankMetrics,
): number =>
  left.utilityStatPoints - right.utilityStatPoints ||
  left.target - right.target ||
  left.structuralTier - right.structuralTier ||
  right.weightedCost - left.weightedCost ||
  right.scarcityNormalisedCost - left.scarcityNormalisedCost ||
  right.totalCost - left.totalCost ||
  left.expectedPracticeStatDelta - right.expectedPracticeStatDelta;

/**
 * Selects one physically affordable song from a carried page by T1b utility,
 * then uses the P2 transitional chain only as an exact-utility fallback:
 * target -> structural tier -> weighted cost -> wallet-fraction cost -> raw
 * cost -> expected practice stat delta -> id.
 */
export const selectCarriedPageSong = ({
  songs,
  plan,
  commonShadowPrices,
  purchasePointBalance,
  remainingTrainingsByFacility,
  friendshipSongMultiplier = 1,
}: {
  songs: readonly SongTarget[];
  plan: StrategicPlan;
  commonShadowPrices: readonly TokenShadowPrice[];
  purchasePointBalance: Balance;
  remainingTrainingsByFacility: RemainingTrainingsByFacility;
  friendshipSongMultiplier?: number;
}): RankedCarriedSong | null => {
  const ranked = songs.map((song) => ({
    song,
    metrics: carriedSongRankMetrics({
      song,
      plan,
      commonShadowPrices,
      purchasePointBalance,
      remainingTrainingsByFacility,
      friendshipSongMultiplier,
    }),
  }));

  ranked.sort((left, right) => {
    const semantic = compareCarriedSongMetrics(left.metrics, right.metrics);
    return semantic === 0
      ? left.song.id.localeCompare(right.song.id)
      : -semantic;
  });

  return ranked[0] ?? null;
};
