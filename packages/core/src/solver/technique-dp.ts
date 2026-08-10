import {
  techniqueSpendMetrics,
  type Balance,
  type TokenPressure,
} from "../live-model.ts";
import {
  isChaseTarget,
  isVisibleOptionalTarget,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import type { SongDpTarget } from "./song-dp.ts";
import {
  compareTechniqueByContinuation,
  evaluatePageCoverage,
} from "./song-dp.ts";
import { riskThreshold } from "./value.ts";

const TOKEN_KEYS = ["dance", "passion", "vocal", "visual", "mental"] as const;

export type TechniqueDecisionCandidate<T = unknown> = {
  id: string;
  cost: Balance;
  reachProbability: number;
  goalProbability: number;
  terminalDecisionVector?: readonly number[];
  payload: T;
};

const canAfford = (tokens: Balance, cost: Balance): boolean =>
  TOKEN_KEYS.every((key) => tokens[key] >= cost[key]);

const subtract = (tokens: Balance, cost: Balance): Balance =>
  TOKEN_KEYS.reduce<Balance>(
    (next, key) => ({ ...next, [key]: tokens[key] - cost[key] }),
    { ...tokens },
  );

/**
 * Monte-Carlo projections are useful for broad direction, not for choosing
 * between 99 % and 100 % as though that one point were exact. Quantisation
 * keeps the comparator transitive while ensuring only material differences
 * outrank deterministic reserve/cost discipline.
 */
const quantized = (value: number, step: number): number =>
  Math.round(value / step);

const compareQuantizedDescending = (
  left: number,
  right: number,
  step: number,
): number => quantized(right, step) - quantized(left, step);

const compareTerminalHardPrefix = (
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): number => {
  for (let index = 0; index < 4; index += 1) {
    const delta = (right?.[index] ?? 0) - (left?.[index] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta;
  }
  return 0;
};

const compareTerminalStochasticBands = (
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): number =>
  // Future F+10 / target probabilities: only a ~10-point band change is
  // material enough to outrank deterministic spending safety.
  compareQuantizedDescending(left?.[4] ?? 0, right?.[4] ?? 0, 0.1) ||
  // Expected Friendship bonus is much less noisy in absolute points.
  compareQuantizedDescending(left?.[5] ?? 0, right?.[5] ?? 0, 2.5) ||
  compareQuantizedDescending(left?.[6] ?? 0, right?.[6] ?? 0, 0.1) ||
  compareQuantizedDescending(left?.[7] ?? 0, right?.[7] ?? 0, 0.25);

const compareTerminalEconomicBands = (
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): number =>
  // Index 8 is -expected committed cost (higher is better), index 9 retained
  // tokens. Five-token buckets avoid ranking on sampling decimals.
  compareQuantizedDescending(left?.[8] ?? 0, right?.[8] ?? 0, 5) ||
  compareQuantizedDescending(left?.[9] ?? 0, right?.[9] ?? 0, 5);

const compareContinuationBands = (
  leftCost: Balance,
  rightCost: Balance,
  tokens: Balance,
  songs: SongDpTarget[],
  plan: StrategicPlan,
): number => {
  if (!canAfford(tokens, leftCost) || !canAfford(tokens, rightCost)) return 0;
  const left = evaluatePageCoverage(subtract(tokens, leftCost), songs, plan);
  const right = evaluatePageCoverage(subtract(tokens, rightCost), songs, plan);
  return (
    compareQuantizedDescending(
      left.planTargetProbability,
      right.planTargetProbability,
      0.1,
    ) ||
    right.affordablePlanTargetCount - left.affordablePlanTargetCount ||
    right.bestStructuralTier - left.bestStructuralTier ||
    compareQuantizedDescending(
      left.anyAffordableProbability,
      right.anyAffordableProbability,
      0.1,
    ) ||
    right.affordableCount - left.affordableCount
  );
};

type ImmediateTarget = SongDpTarget & { priority?: boolean };

/**
 * If two visible lessons consume exactly the same colours, the component-wise
 * cheaper vector strictly dominates the more expensive one for progression.
 * They advance the lesson pattern by the same one step; a higher price must
 * therefore never win because of Monte-Carlo noise or a downstream tie-break.
 */
export const compareSameTokenSupportDominance = (
  left: Balance,
  right: Balance,
): number => {
  const sameSupport = TOKEN_KEYS.every(
    (key) => left[key] > 0 === right[key] > 0,
  );
  if (!sameSupport) return 0;
  const leftNoMoreExpensive = TOKEN_KEYS.every(
    (key) => left[key] <= right[key],
  );
  const rightNoMoreExpensive = TOKEN_KEYS.every(
    (key) => right[key] <= left[key],
  );
  const leftStrictlyCheaper = TOKEN_KEYS.some((key) => left[key] < right[key]);
  const rightStrictlyCheaper = TOKEN_KEYS.some((key) => right[key] < left[key]);
  if (leftNoMoreExpensive && leftStrictlyCheaper) return -1;
  if (rightNoMoreExpensive && rightStrictlyCheaper) return 1;
  return 0;
};

export const immediateBlockingTargets = ({
  tokens,
  cost,
  songs,
  plan,
}: {
  tokens: Balance;
  cost: Balance;
  songs: ImmediateTarget[];
  plan: StrategicPlan;
}): ImmediateTarget[] => {
  // At the Grand Live there is no future reserve to protect. Every affordable
  // Technique itself converts tokens into +5 SP, and remaining songs are
  // compared by terminal reach/coverage rather than a hard reserve veto.
  if (plan.id === "convert-final") return [];
  const after = TOKEN_KEYS.reduce<Balance>(
    (balance, key) => ({ ...balance, [key]: balance[key] - cost[key] }),
    { ...tokens },
  );
  if (TOKEN_KEYS.some((key) => after[key] < 0)) return [];
  const targets = songs.filter(
    (song) =>
      isChaseTarget(song, plan) ||
      isVisibleOptionalTarget(song, plan) ||
      song.priority === true,
  );
  const affordableBefore = targets.filter((song) =>
    canAfford(tokens, song.cost),
  );
  if (affordableBefore.length === 0) return [];
  const affordableAfter = affordableBefore.filter((song) =>
    canAfford(after, song.cost),
  );
  return affordableAfter.length === 0 ? affordableBefore : [];
};

/**
 * Orders an observed offer by hard affordability, declared risk threshold,
 * vector continuation and conditional shop probabilities. Once those are
 * equivalent, the shared reserve-aware spending comparator runs before raw
 * token retention. There is no headroom bonus and no risk penalty multiplier.
 */
export type TechniqueRankReason =
  | "affordability"
  | "immediate-strategic-block"
  | "same-colour-dominance"
  | "risk-class"
  | "terminal-hard-state"
  | "reserve-breach"
  | "reserve-deficit"
  | "terminal-structural-band"
  | "page-coverage"
  | "goal-probability-band"
  | "reach-probability-band"
  | "weighted-demand-cost"
  | "total-cost"
  | "reserve-drain"
  | "post-purchase-margin"
  | "terminal-economy"
  | "continuation-fallback"
  | "stable-id";

const compareObservedTechniquePair = <T>({
  left,
  right,
  tokens,
  songs,
  plan,
  threshold,
  tokenPressure,
}: {
  left: TechniqueDecisionCandidate<T>;
  right: TechniqueDecisionCandidate<T>;
  tokens: Balance;
  songs: SongDpTarget[];
  plan: StrategicPlan;
  threshold: number;
  tokenPressure: TokenPressure[];
}): { order: number; reason: TechniqueRankReason } => {
  const leftAffordable = canAfford(tokens, left.cost);
  const rightAffordable = canAfford(tokens, right.cost);
  if (leftAffordable !== rightAffordable) {
    return { order: leftAffordable ? -1 : 1, reason: "affordability" };
  }

  const leftBlocking =
    immediateBlockingTargets({ tokens, cost: left.cost, songs, plan }).length >
    0;
  const rightBlocking =
    immediateBlockingTargets({ tokens, cost: right.cost, songs, plan }).length >
    0;
  if (leftBlocking !== rightBlocking) {
    return {
      order: leftBlocking ? 1 : -1,
      reason: "immediate-strategic-block",
    };
  }

  const sameSupport = compareSameTokenSupportDominance(left.cost, right.cost);
  if (sameSupport !== 0) {
    return { order: sameSupport, reason: "same-colour-dominance" };
  }

  const leftAdmissible = left.reachProbability >= threshold;
  const rightAdmissible = right.reachProbability >= threshold;
  if (leftAdmissible !== rightAdmissible) {
    return { order: leftAdmissible ? -1 : 1, reason: "risk-class" };
  }

  const terminalHard = compareTerminalHardPrefix(
    left.terminalDecisionVector,
    right.terminalDecisionVector,
  );
  if (terminalHard !== 0) {
    return { order: terminalHard, reason: "terminal-hard-state" };
  }

  const leftSpend = techniqueSpendMetrics(left.cost, tokens, tokenPressure);
  const rightSpend = techniqueSpendMetrics(right.cost, tokens, tokenPressure);
  const reserveBreach =
    leftSpend.reserveBreachCount - rightSpend.reserveBreachCount;
  if (reserveBreach !== 0) {
    return { order: reserveBreach, reason: "reserve-breach" };
  }
  const reserveDeficit = leftSpend.reserveDeficit - rightSpend.reserveDeficit;
  if (reserveDeficit !== 0) {
    return { order: reserveDeficit, reason: "reserve-deficit" };
  }

  const structuralBand = compareTerminalStochasticBands(
    left.terminalDecisionVector,
    right.terminalDecisionVector,
  );
  if (structuralBand !== 0) {
    return { order: structuralBand, reason: "terminal-structural-band" };
  }

  const coverage = compareContinuationBands(
    left.cost,
    right.cost,
    tokens,
    songs,
    plan,
  );
  if (coverage !== 0) return { order: coverage, reason: "page-coverage" };

  // Once mechanical/structural classes are equivalent, token shadow prices
  // outrank sampling-scale goal/reach decimals.
  const weightedDemand =
    leftSpend.weightedDemandCost - rightSpend.weightedDemandCost;
  if (Math.abs(weightedDemand) > 1e-9) {
    return { order: weightedDemand, reason: "weighted-demand-cost" };
  }
  const totalSpend = leftSpend.totalSpend - rightSpend.totalSpend;
  if (totalSpend !== 0) return { order: totalSpend, reason: "total-cost" };
  const reserveDrain =
    leftSpend.normalizedReserveDrain - rightSpend.normalizedReserveDrain;
  if (Math.abs(reserveDrain) > 1e-9) {
    return { order: reserveDrain, reason: "reserve-drain" };
  }

  const goalBand = compareQuantizedDescending(
    left.goalProbability,
    right.goalProbability,
    0.05,
  );
  if (goalBand !== 0) {
    return { order: goalBand, reason: "goal-probability-band" };
  }
  const reachBand = compareQuantizedDescending(
    left.reachProbability,
    right.reachProbability,
    0.05,
  );
  if (reachBand !== 0) {
    return { order: reachBand, reason: "reach-probability-band" };
  }

  const margin =
    rightSpend.minimumPostPurchaseMargin -
      leftSpend.minimumPostPurchaseMargin ||
    rightSpend.retainedPostPurchaseMargin -
      leftSpend.retainedPostPurchaseMargin;
  if (margin !== 0) return { order: margin, reason: "post-purchase-margin" };

  const terminalEconomy = compareTerminalEconomicBands(
    left.terminalDecisionVector,
    right.terminalDecisionVector,
  );
  if (terminalEconomy !== 0) {
    return { order: terminalEconomy, reason: "terminal-economy" };
  }

  const fallback = compareTechniqueByContinuation(
    left.cost,
    right.cost,
    tokens,
    songs,
    plan,
  );
  if (fallback !== 0) {
    return { order: fallback, reason: "continuation-fallback" };
  }
  return { order: left.id.localeCompare(right.id), reason: "stable-id" };
};

export type RankedTechniqueDecisionCandidate<T = unknown> =
  TechniqueDecisionCandidate<T> & { rankReason: TechniqueRankReason };

export const rankObservedTechniques = <T>({
  candidates,
  tokens,
  songs,
  plan,
  riskProfile,
  tokenPressure,
}: {
  candidates: TechniqueDecisionCandidate<T>[];
  tokens: Balance;
  songs: SongDpTarget[];
  plan: StrategicPlan;
  riskProfile: "safe" | "standard" | "greedy";
  tokenPressure: TokenPressure[];
}): RankedTechniqueDecisionCandidate<T>[] => {
  const threshold = riskThreshold(riskProfile);
  const sorted = [...candidates].sort(
    (left, right) =>
      compareObservedTechniquePair({
        left,
        right,
        tokens,
        songs,
        plan,
        threshold,
        tokenPressure,
      }).order,
  );
  return sorted.map((candidate, index) => {
    const reference = index === 0 ? sorted[1] : sorted[0];
    const rankReason = reference
      ? compareObservedTechniquePair({
          left: index === 0 ? candidate : reference,
          right: index === 0 ? reference : candidate,
          tokens,
          songs,
          plan,
          threshold,
          tokenPressure,
        }).reason
      : "stable-id";
    return { ...candidate, rankReason };
  });
};
