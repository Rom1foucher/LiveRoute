import {
  TOKEN_KEYS,
  canAfford,
  immediatePracticeRewards,
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
import { SKILL_POINT_UTILITY } from "./utility-model.ts";

export type CarriedSongRankMetrics = {
  /** Deterministic T1b reward of buying this carried song. */
  immediateUtilityStatPoints: number;
  target: 0 | 1;
  structuralTier: number;
  weightedCost: number;
  scarcityNormalisedCost: number;
  totalCost: number;
  /** T2 generic behavioural projections. */
  expectedPracticeStatDelta: number;
  expectedSkillPoints: number;
};

export type RankedCarriedSong = {
  song: SongTarget;
  metrics: CarriedSongRankMetrics;
};

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
  if (!song.practiceBonus) return 0;
  if (!/^(speed|stamina|power|guts|wisdom) training \+\d+$/i.test(song.practiceBonus)) {
    return 0;
  }
  return structuralTrainingValue(
    song.practiceBonus,
    remainingTrainingsByFacility,
    friendshipSongMultiplier,
  );
};

const expectedSkillPoints = ({
  song,
  remainingTrainingsByFacility,
  friendshipSongMultiplier,
}: {
  song: SongTarget;
  remainingTrainingsByFacility: RemainingTrainingsByFacility;
  friendshipSongMultiplier: number;
}): number => {
  if (!song.practiceBonus || !/^skill pts? training \+\d+$/i.test(song.practiceBonus)) {
    return 0;
  }
  return structuralTrainingValue(
    song.practiceBonus,
    remainingTrainingsByFacility,
    friendshipSongMultiplier,
  );
};

const immediateUtilityStatPoints = (song: SongTarget): number => {
  const immediate = immediatePracticeRewards(song.practiceBonus);
  return (
    immediate.statPoints +
    (25 + immediate.skillPoints) * SKILL_POINT_UTILITY
  );
};

/**
 * P2 carried-page metrics after P3b2.
 *
 * Structural identity and real token expenditure are compared before T2. The
 * generic training model exists only to avoid meaningless ties such as Guts +1
 * beating Speed +1 when the factual layers are otherwise indistinguishable.
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
    immediateUtilityStatPoints: immediateUtilityStatPoints(song),
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
    expectedSkillPoints: expectedSkillPoints({
      song,
      remainingTrainingsByFacility,
      friendshipSongMultiplier,
    }),
  };
};

/** Positive means `left` is preferred. */
export const compareCarriedSongMetrics = (
  left: CarriedSongRankMetrics,
  right: CarriedSongRankMetrics,
): number =>
  left.target - right.target ||
  left.structuralTier - right.structuralTier ||
  left.immediateUtilityStatPoints - right.immediateUtilityStatPoints ||
  right.weightedCost - left.weightedCost ||
  right.scarcityNormalisedCost - left.scarcityNormalisedCost ||
  right.totalCost - left.totalCost ||
  left.expectedPracticeStatDelta - right.expectedPracticeStatDelta ||
  left.expectedSkillPoints - right.expectedSkillPoints;

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
