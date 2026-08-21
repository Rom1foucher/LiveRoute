import {
  techniqueSpendMetrics,
  type Balance,
  type TerminalTechniqueDecisionVector,
  type TokenPressure,
} from "../live-model.ts";
import {
  isChaseTarget,
  isVisibleOptionalTarget,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  applyPromotionalLiveTransition,
  type TimingMode,
} from "../domain/live-rules.ts";
import type { SongDpTarget } from "./song-dp.ts";
import { evaluatePageCoverage } from "./song-dp.ts";
import { riskThreshold } from "./value.ts";

const TOKEN_KEYS = ["dance", "passion", "vocal", "visual", "mental"] as const;

export type TechniqueDecisionCandidate<T = unknown> = {
  id: string;
  cost: Balance;
  reachProbability: number;
  goalProbability: number;
  terminalDecisionVector?: TerminalTechniqueDecisionVector;
  payload: T;
};

type ImmediateTarget = SongDpTarget & { priority?: boolean };

export type TechniqueFundingHorizon = {
  timingMode: TimingMode;
  /** Number of techniques still required before the next song page, including
   * the candidate currently being assessed. */
  techniquesRemaining: number;
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

type TechniqueRankSnapshot = {
  affordable: number;
  nonBlocking: number;
  riskClass: number;
  terminalHard: readonly number[];
  reserveBreach: number;
  reserveDeficit: number;
  terminalStructuralBands: readonly number[];
  pageCoverage: readonly number[];
  totalCostBand: number;
  reserveDrainBand: number;
  weightedDemandCostBand: number;
  totalCost: number;
  goalProbabilityBand: number;
  reachProbabilityBand: number;
  postPurchaseMargins: readonly number[];
  terminalMechanicalBand: number;
  terminalGenericProjectionBands: readonly number[];
  retainedTokensAfterPurchase: number;
  costKey: string;
};

const totalBalance = (balance: Balance): number =>
  TOKEN_KEYS.reduce((sum, key) => sum + balance[key], 0);

const costKey = (cost: Balance): string =>
  TOKEN_KEYS.map((key) => String(cost[key]).padStart(6, "0")).join(",");

const buildTechniqueRankSnapshot = <T>({
  candidate,
  tokens,
  songs,
  plan,
  threshold,
  tokenPressure,
  fundingHorizon,
}: {
  candidate: TechniqueDecisionCandidate<T>;
  tokens: Balance;
  songs: SongDpTarget[];
  plan: StrategicPlan;
  threshold: number;
  tokenPressure: TokenPressure[];
  fundingHorizon?: TechniqueFundingHorizon;
}): TechniqueRankSnapshot => {
  const affordable = canAfford(tokens, candidate.cost);
  const blocking =
    immediateBlockingTargets({
      tokens,
      cost: candidate.cost,
      songs,
      plan,
      fundingHorizon,
    }).length > 0;
  const spend = techniqueSpendMetrics(candidate.cost, tokens, tokenPressure);
  const after = affordable ? subtract(tokens, candidate.cost) : tokens;
  const coverage = affordable
    ? evaluatePageCoverage(after, songs, plan)
    : evaluatePageCoverage(tokens, songs, plan);
  const terminal = candidate.terminalDecisionVector;

  return {
    affordable: affordable ? 1 : 0,
    nonBlocking: blocking ? 0 : 1,
    // PR-4 terminal candidates already carry their own catastrophe-floor and
    // net-value admission state. They must never be put back behind the generic
    // Standard 92 % cliff merely because a sibling has no terminal vector.
    riskClass:
      terminal !== undefined || candidate.reachProbability >= threshold ? 1 : 0,
    terminalHard: [
      terminal?.[0] ?? 0,
      terminal?.[1] ?? 0,
      terminal?.[2] ?? 0,
      terminal?.[3] ?? 0,
    ],
    reserveBreach: -spend.reserveBreachCount,
    reserveDeficit: -spend.reserveDeficit,
    // P-T4 terminal vector: cumulative structural-tier deltas, all expressed
    // as paired probabilities. Five-point bands match the structural MC
    // materiality threshold and avoid ranking on sampling noise.
    terminalStructuralBands: [
      quantized(terminal?.[4] ?? 0, 0.05),
      quantized(terminal?.[5] ?? 0, 0.05),
      quantized(terminal?.[6] ?? 0, 0.05),
      quantized(terminal?.[7] ?? 0, 0.05),
    ],
    pageCoverage: [
      quantized(coverage.planTargetProbability, 0.1),
      coverage.affordablePlanTargetCount,
      coverage.bestStructuralTier,
      quantized(coverage.anyAffordableProbability, 0.1),
      coverage.affordableCount,
    ],
    // A 1-token raw difference is not enough to spend a visibly tense colour,
    // while 15 vs 24 remains a material cost difference.
    totalCostBand: -quantized(spend.totalSpend, 5),
    // Surplus is deterministic but also banded: only a material reserve-drain
    // difference outranks the generation-profile shadow signal.
    reserveDrainBand: -quantized(spend.normalizedReserveDrain, 0.1),
    weightedDemandCostBand: -quantized(spend.weightedDemandCost, 1),
    totalCost: -spend.totalSpend,
    goalProbabilityBand: quantized(candidate.goalProbability, 0.05),
    reachProbabilityBand: quantized(candidate.reachProbability, 0.05),
    postPurchaseMargins: [
      spend.minimumPostPurchaseMargin,
      spend.retainedPostPurchaseMargin,
    ],
    // Deterministic reward remains distinct from the generic T2 projections so
    // diagnostics cannot relabel a behavioural tie-break as terminal economy.
    terminalMechanicalBand: quantized(terminal?.[8] ?? 0, 0.5),
    terminalGenericProjectionBands: [
      quantized(terminal?.[9] ?? 0, 0.5),
      quantized(terminal?.[10] ?? 0, 0.5),
    ],
    retainedTokensAfterPurchase: affordable ? totalBalance(after) : -Infinity,
    costKey: costKey(candidate.cost),
  };
};

const compareDescending = (left: number, right: number): number => {
  if (Object.is(left, right)) return 0;
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return left > right ? -1 : 1;
  }
  const delta = right - left;
  return Math.abs(delta) <= 1e-9 ? 0 : delta;
};

const compareDescendingVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareDescending(left[index] ?? 0, right[index] ?? 0);
    if (compared !== 0) return compared;
  }
  return 0;
};

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
  fundingHorizon,
}: {
  tokens: Balance;
  cost: Balance;
  songs: ImmediateTarget[];
  plan: StrategicPlan;
  fundingHorizon?: TechniqueFundingHorizon;
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

  // When the assessed technique deterministically opens the final song page
  // at a concert boundary, that page can be carried across the promotional
  // live. Funding safety must therefore include the verified +10 transition,
  // not mislabel the short intermediate wallet as a permanent hard block.
  // No stochastic training income is assumed here.
  const fundingBalance =
    fundingHorizon?.timingMode === "deadline-now" &&
    fundingHorizon.techniquesRemaining === 1
      ? applyPromotionalLiveTransition(after, plan.concertIndex)
      : after;
  const affordableAfter = affordableBefore.filter((song) =>
    canAfford(fundingBalance, song.cost),
  );
  return affordableAfter.length === 0 ? affordableBefore : [];
};

/**
 * PR-7 turns the observed-technique ranking into a real total order. Same-
 * support dominance is handled as a Pareto prefilter; survivors are then
 * compared by an immutable lexicographic key. No pairwise criterion can
 * short-circuit a later global criterion and create A>B>C>A cycles.
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
  | "terminal-mechanical"
  | "terminal-generic-projection"
  | "continuation-fallback"
  | "stable-id";

const compareTechniqueRankSnapshots = (
  left: TechniqueRankSnapshot,
  right: TechniqueRankSnapshot,
): { order: number; reason: TechniqueRankReason } => {
  const criteria: Array<[TechniqueRankReason, number]> = [
    ["affordability", compareDescending(left.affordable, right.affordable)],
    [
      "immediate-strategic-block",
      compareDescending(left.nonBlocking, right.nonBlocking),
    ],
    ["risk-class", compareDescending(left.riskClass, right.riskClass)],
    [
      "terminal-hard-state",
      compareDescendingVector(left.terminalHard, right.terminalHard),
    ],
    [
      "reserve-breach",
      compareDescending(left.reserveBreach, right.reserveBreach),
    ],
    [
      "reserve-deficit",
      compareDescending(left.reserveDeficit, right.reserveDeficit),
    ],
    [
      "terminal-structural-band",
      compareDescendingVector(
        left.terminalStructuralBands,
        right.terminalStructuralBands,
      ),
    ],
    [
      "page-coverage",
      compareDescendingVector(left.pageCoverage, right.pageCoverage),
    ],
    ["total-cost", compareDescending(left.totalCostBand, right.totalCostBand)],
    // Once hard reserves are safe and raw costs are materially equivalent,
    // prefer the genuinely overflowing colour before micro shadow differences.
    [
      "reserve-drain",
      compareDescending(left.reserveDrainBand, right.reserveDrainBand),
    ],
    [
      "weighted-demand-cost",
      compareDescending(
        left.weightedDemandCostBand,
        right.weightedDemandCostBand,
      ),
    ],
    [
      "post-purchase-margin",
      compareDescendingVector(
        left.postPurchaseMargins,
        right.postPurchaseMargins,
      ),
    ],
    // Exact cost is a final deterministic tie-break inside the same 5-token band.
    ["total-cost", compareDescending(left.totalCost, right.totalCost)],
    [
      "goal-probability-band",
      compareDescending(left.goalProbabilityBand, right.goalProbabilityBand),
    ],
    [
      "reach-probability-band",
      compareDescending(left.reachProbabilityBand, right.reachProbabilityBand),
    ],
    [
      "terminal-mechanical",
      compareDescending(left.terminalMechanicalBand, right.terminalMechanicalBand),
    ],
    [
      "terminal-generic-projection",
      compareDescendingVector(
        left.terminalGenericProjectionBands,
        right.terminalGenericProjectionBands,
      ),
    ],
    [
      "continuation-fallback",
      compareDescending(
        left.retainedTokensAfterPurchase,
        right.retainedTokensAfterPurchase,
      ),
    ],
  ];
  for (const [reason, order] of criteria) {
    if (order !== 0) return { order, reason };
  }
  const costOrder = left.costKey.localeCompare(right.costKey);
  if (costOrder !== 0) {
    return { order: costOrder, reason: "continuation-fallback" };
  }
  return { order: 0, reason: "stable-id" };
};

const paretoDominator = <T>(
  candidate: TechniqueDecisionCandidate<T>,
  candidates: readonly TechniqueDecisionCandidate<T>[],
): TechniqueDecisionCandidate<T> | null => {
  const dominators = candidates.filter(
    (other) =>
      other !== candidate &&
      compareSameTokenSupportDominance(other.cost, candidate.cost) < 0,
  );
  if (dominators.length === 0) return null;
  return (
    [...dominators].sort(
      (left, right) =>
        totalBalance(left.cost) - totalBalance(right.cost) ||
        costKey(left.cost).localeCompare(costKey(right.cost)) ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
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
  fundingHorizon,
}: {
  candidates: TechniqueDecisionCandidate<T>[];
  tokens: Balance;
  songs: SongDpTarget[];
  plan: StrategicPlan;
  riskProfile: "safe" | "standard" | "greedy";
  tokenPressure: TokenPressure[];
  fundingHorizon?: TechniqueFundingHorizon;
}): RankedTechniqueDecisionCandidate<T>[] => {
  const threshold = riskThreshold(riskProfile);
  const snapshots = new Map(
    candidates.map((candidate) => [
      candidate,
      buildTechniqueRankSnapshot({
        candidate,
        tokens,
        songs,
        plan,
        threshold,
        tokenPressure,
        fundingHorizon,
      }),
    ]),
  );
  const dominatedBy = new Map<
    TechniqueDecisionCandidate<T>,
    TechniqueDecisionCandidate<T>
  >();
  for (const candidate of candidates) {
    const dominator = paretoDominator(candidate, candidates);
    if (dominator) dominatedBy.set(candidate, dominator);
  }

  const sorted = [...candidates].sort((left, right) => {
    const leftDominated = dominatedBy.has(left);
    const rightDominated = dominatedBy.has(right);
    if (leftDominated !== rightDominated) return leftDominated ? 1 : -1;
    const compared = compareTechniqueRankSnapshots(
      snapshots.get(left)!,
      snapshots.get(right)!,
    ).order;
    return compared || left.id.localeCompare(right.id);
  });

  return sorted.map((candidate, index) => {
    if (dominatedBy.has(candidate)) {
      return { ...candidate, rankReason: "same-colour-dominance" };
    }
    const reference = index === 0 ? sorted[1] : sorted[0];
    if (!reference) {
      return { ...candidate, rankReason: "stable-id" };
    }
    if (index === 0 && dominatedBy.has(reference)) {
      return { ...candidate, rankReason: "same-colour-dominance" };
    }
    const compared = compareTechniqueRankSnapshots(
      snapshots.get(index === 0 ? candidate : reference)!,
      snapshots.get(index === 0 ? reference : candidate)!,
    );
    return { ...candidate, rankReason: compared.reason };
  });
};
