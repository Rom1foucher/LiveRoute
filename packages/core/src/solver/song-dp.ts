import type { Balance } from "../live-model.ts";
import type { SongRole } from "../domain/song-catalog.ts";
import {
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";

const TOKEN_KEYS = ["dance", "passion", "vocal", "visual", "mental"] as const;

export type SongDpTarget = {
  id: string;
  name: string;
  cost: Balance;
  roles?: readonly SongRole[];
};

export type PageCoverage = {
  poolSize: number;
  affordableCount: number;
  planTargetCount: number;
  affordablePlanTargetCount: number;
  anyAffordableProbability: number;
  planTargetProbability: number;
  bestStructuralTier: number;
  coveredTargetIds: string[];
};

export type SongDpValue = {
  checkpointProbability: number;
  targetProbability: number;
  expectedStructuralTier: number;
  continuationCoverage: number;
  expectedPurchases: number;
  expectedCommittedCost: number;
  expectedRetainedTokens: number;
};

export type SongDpResult = SongDpValue & {
  pages: number;
  exactEnumeration: boolean;
  lawConfidence: "heuristic";
  pageLaw: "uniform" | "weighted";
  conditionalOn: "declared-pages-accessible";
  visitedStates: number;
};

export type SongDpInput = {
  balance: Balance;
  pool: SongDpTarget[];
  plan: StrategicPlan;
  pages: number;
  requiredPurchases?: number;
  acquiredPlanTarget?: boolean;
  maxEnumeratedPages?: number;
  maxStates?: number;
  pageWeight?: (sortedSongIds: string[]) => number;
};

const canAfford = (balance: Balance, cost: Balance): boolean =>
  TOKEN_KEYS.every((key) => balance[key] >= cost[key]);

const subtract = (balance: Balance, cost: Balance): Balance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, balance[key] - cost[key]]),
  ) as Balance;

const total = (balance: Balance): number =>
  TOKEN_KEYS.reduce((sum, key) => sum + balance[key], 0);

const costTotal = (balance: Balance): number =>
  TOKEN_KEYS.reduce((sum, key) => sum + Math.max(0, balance[key]), 0);

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  const reduced = Math.min(k, n - k);
  for (let index = 1; index <= reduced; index += 1) {
    result = (result * (n - reduced + index)) / index;
  }
  return result;
};

const atLeastOne = (pool: number, qualifying: number): number => {
  if (pool <= 0 || qualifying <= 0) return 0;
  const draw = Math.min(3, pool);
  if (qualifying >= pool - draw + 1) return 1;
  return 1 - choose(pool - qualifying, draw) / choose(pool, draw);
};

export const evaluatePageCoverage = (
  balance: Balance,
  songs: SongDpTarget[],
  plan: StrategicPlan,
): PageCoverage => {
  const affordable = songs.filter((song) => canAfford(balance, song.cost));
  const targets = songs.filter((song) => isChaseTarget(song, plan));
  const affordableTargets = targets.filter((song) =>
    canAfford(balance, song.cost),
  );
  return {
    poolSize: songs.length,
    affordableCount: affordable.length,
    planTargetCount: targets.length,
    affordablePlanTargetCount: affordableTargets.length,
    anyAffordableProbability: atLeastOne(songs.length, affordable.length),
    planTargetProbability: atLeastOne(songs.length, affordableTargets.length),
    bestStructuralTier: Math.max(
      0,
      ...affordable.map((song) => structuralTier(song, plan)),
    ),
    coveredTargetIds: affordableTargets.map((song) => song.id).sort(),
  };
};

/** Positive means left has the better full-vector continuation. */
export const comparePageCoverage = (
  left: PageCoverage,
  right: PageCoverage,
): number =>
  left.planTargetProbability - right.planTargetProbability ||
  left.affordablePlanTargetCount - right.affordablePlanTargetCount ||
  left.bestStructuralTier - right.bestStructuralTier ||
  left.anyAffordableProbability - right.anyAffordableProbability ||
  left.affordableCount - right.affordableCount ||
  left.coveredTargetIds
    .join(",")
    .localeCompare(right.coveredTargetIds.join(",")) * -1;

/**
 * Compares only the continuation that can actually change the next song page.
 * Token retention and marginal spending are deliberately left to the caller:
 * observed offers need the reserve-aware spending policy as the final
 * tie-breaker, while standalone DP callers may still prefer raw retention.
 */
export const compareTechniqueContinuationCoverage = (
  leftCost: Balance,
  rightCost: Balance,
  balance: Balance,
  songs: SongDpTarget[],
  plan: StrategicPlan,
): number => {
  const leftAffordable = canAfford(balance, leftCost);
  const rightAffordable = canAfford(balance, rightCost);
  if (leftAffordable !== rightAffordable) return leftAffordable ? -1 : 1;
  if (!leftAffordable) return 0;
  const leftBalance = subtract(balance, leftCost);
  const rightBalance = subtract(balance, rightCost);
  return -comparePageCoverage(
    evaluatePageCoverage(leftBalance, songs, plan),
    evaluatePageCoverage(rightBalance, songs, plan),
  );
};

export const compareTechniqueByContinuation = (
  leftCost: Balance,
  rightCost: Balance,
  balance: Balance,
  songs: SongDpTarget[],
  plan: StrategicPlan,
): number => {
  const coverage = compareTechniqueContinuationCoverage(
    leftCost,
    rightCost,
    balance,
    songs,
    plan,
  );
  if (coverage !== 0) return coverage;

  const leftAffordable = canAfford(balance, leftCost);
  const rightAffordable = canAfford(balance, rightCost);
  if (!leftAffordable || !rightAffordable) {
    return costTotal(leftCost) - costTotal(rightCost);
  }
  const leftBalance = subtract(balance, leftCost);
  const rightBalance = subtract(balance, rightCost);

  // Raw retention is the generic fallback. The observed-technique path inserts
  // compareTechniqueSpending before reaching this fallback.
  return (
    total(rightBalance) - total(leftBalance) ||
    costTotal(leftCost) - costTotal(rightCost) ||
    TOKEN_KEYS.map((key) => leftCost[key])
      .join(",")
      .localeCompare(TOKEN_KEYS.map((key) => rightCost[key]).join(","))
  );
};

export const maximumAffordablePurchases = (
  balance: Balance,
  songs: SongDpTarget[],
  maxStates = 6000,
  stopAfter = Number.POSITIVE_INFINITY,
): { count: number; exact: boolean } => {
  const ordered = [...songs].sort(
    (left, right) =>
      costTotal(left.cost) - costTotal(right.cost) ||
      left.id.localeCompare(right.id),
  );
  if (ordered.length === 0) return { count: 0, exact: true };
  if (ordered.length > 30) {
    // The live catalogue is currently 21 songs. Keep a safe fallback if a
    // future RuleSet grows beyond the 32-bit mask used by the fast path.
    const memo = new Map<string, number>();
    let visited = 0;
    let exact = true;
    const visit = (current: Balance, remaining: SongDpTarget[]): number => {
      const key = `${TOKEN_KEYS.map((token) => current[token]).join(",")}:${remaining
        .map((song) => song.id)
        .sort()
        .join("|")}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      if (visited >= maxStates) {
        exact = false;
        return 0;
      }
      visited += 1;
      let best = 0;
      for (const song of remaining) {
        if (!canAfford(current, song.cost)) continue;
        best = Math.max(
          best,
          1 +
            visit(
              subtract(current, song.cost),
              remaining.filter((candidate) => candidate.id !== song.id),
            ),
        );
        if (best >= stopAfter) {
          exact = false;
          return best;
        }
      }
      memo.set(key, best);
      return best;
    };
    return { count: visit({ ...balance }, ordered), exact };
  }

  const memo = new Map<string, number>();
  let visited = 0;
  let exact = true;
  const fullMask = (1 << ordered.length) - 1;
  const boundedStop = Number.isFinite(stopAfter)
    ? Math.max(0, Math.trunc(stopAfter))
    : Number.POSITIVE_INFINITY;

  const popcount = (mask: number): number => {
    let value = mask >>> 0;
    let count = 0;
    while (value !== 0) {
      value &= value - 1;
      count += 1;
    }
    return count;
  };

  const visit = (
    current: Balance,
    mask: number,
    remainingTarget: number,
  ): number => {
    if (mask === 0 || remainingTarget <= 0) return 0;
    const upperBound = popcount(mask);
    const key = `${mask}:${TOKEN_KEYS.map((token) => current[token]).join(",")}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (visited >= maxStates) {
      exact = false;
      return 0;
    }
    visited += 1;

    let best = 0;
    let fullyExplored = true;
    for (let index = 0; index < ordered.length; index += 1) {
      const bit = 1 << index;
      if ((mask & bit) === 0) continue;
      const song = ordered[index];
      if (!canAfford(current, song.cost)) continue;
      const candidate =
        1 +
        visit(subtract(current, song.cost), mask & ~bit, remainingTarget - 1);
      if (candidate > best) best = candidate;
      if (best >= remainingTarget || best >= upperBound) {
        fullyExplored = false;
        break;
      }
    }

    if (fullyExplored) memo.set(key, best);
    return best;
  };

  const target = Number.isFinite(boundedStop)
    ? Math.min(ordered.length, boundedStop)
    : ordered.length + 1;
  const count = visit({ ...balance }, fullMask, target);
  // Reaching the requested lower bound is enough to prove checkpoint
  // feasibility, but it is not an exact maximum.
  if (Number.isFinite(boundedStop) && count >= boundedStop) {
    return { count, exact: false };
  }
  return { count, exact };
};

const canonicalById = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));

const combinationsOf = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [[]];
  const result: T[][] = [];
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === size) {
      result.push(chosen);
      return;
    }
    for (
      let index = start;
      index <= items.length - (size - chosen.length);
      index += 1
    ) {
      visit(index + 1, [...chosen, items[index]]);
    }
  };
  visit(0, []);
  return result;
};

const deterministicPageSample = <T>(pages: T[][], maximum: number): T[][] => {
  if (pages.length <= maximum) return pages;
  const selected: T[][] = [];
  for (let index = 0; index < maximum; index += 1) {
    const position = Math.floor((index * pages.length) / maximum);
    selected.push(pages[position]);
  }
  return selected;
};

const zeroValue = (): SongDpValue => ({
  checkpointProbability: 0,
  targetProbability: 0,
  expectedStructuralTier: 0,
  continuationCoverage: 0,
  expectedPurchases: 0,
  expectedCommittedCost: 0,
  expectedRetainedTokens: 0,
});

const addScaled = (target: SongDpValue, source: SongDpValue, scale: number) => {
  target.checkpointProbability += source.checkpointProbability * scale;
  target.targetProbability += source.targetProbability * scale;
  target.expectedStructuralTier += source.expectedStructuralTier * scale;
  target.continuationCoverage += source.continuationCoverage * scale;
  target.expectedPurchases += source.expectedPurchases * scale;
  target.expectedCommittedCost += source.expectedCommittedCost * scale;
  target.expectedRetainedTokens += source.expectedRetainedTokens * scale;
};

const compareValue = (
  left: SongDpValue,
  right: SongDpValue,
  plan: StrategicPlan,
  hardWork: boolean,
): number => {
  if (hardWork) {
    const hard = left.checkpointProbability - right.checkpointProbability;
    if (Math.abs(hard) > 1e-10) return hard;
  }
  if (plan.mode === "hunt") {
    const target = left.targetProbability - right.targetProbability;
    if (Math.abs(target) > 1e-10) return target;
  }
  return (
    left.expectedStructuralTier - right.expectedStructuralTier ||
    left.continuationCoverage - right.continuationCoverage ||
    // Filler purchases only break ties while work remains. Once the plan and
    // hard constraints are closed, retention wins and the solver stops.
    (hardWork || plan.mode === "hunt"
      ? left.expectedPurchases - right.expectedPurchases
      : 0) ||
    left.expectedRetainedTokens - right.expectedRetainedTokens ||
    right.expectedCommittedCost - left.expectedCommittedCost
  );
};

export const evaluateUnknownSongPages = ({
  balance,
  pool,
  plan,
  pages,
  requiredPurchases = 0,
  acquiredPlanTarget = false,
  maxEnumeratedPages = 160,
  maxStates = 3000,
  pageWeight,
}: SongDpInput): SongDpResult => {
  const memo = new Map<string, SongDpValue>();
  let exactEnumeration = true;
  let visitedStates = 0;

  const terminal = (
    currentBalance: Balance,
    currentPool: SongDpTarget[],
    purchases: number,
    targetAcquired: boolean,
    committed: number,
  ): SongDpValue => {
    const coverage = evaluatePageCoverage(currentBalance, currentPool, plan);
    return {
      checkpointProbability: purchases >= requiredPurchases ? 1 : 0,
      targetProbability: targetAcquired || plan.mode !== "hunt" ? 1 : 0,
      expectedStructuralTier: 0,
      continuationCoverage:
        plan.mode === "hunt"
          ? coverage.planTargetProbability
          : coverage.anyAffordableProbability,
      expectedPurchases: purchases,
      expectedCommittedCost: committed,
      expectedRetainedTokens: total(currentBalance),
    };
  };

  const visit = (
    currentBalance: Balance,
    currentPool: SongDpTarget[],
    pagesLeft: number,
    purchases: number,
    targetAcquired: boolean,
    committed: number,
  ): SongDpValue => {
    const hardWork = purchases < requiredPurchases;
    const targetWork = plan.mode === "hunt" && !targetAcquired;
    if (
      pagesLeft <= 0 ||
      (!hardWork &&
        ((plan.mode === "hunt" && !targetWork) || plan.mode === "hold"))
    ) {
      return terminal(
        currentBalance,
        currentPool,
        purchases,
        targetAcquired,
        committed,
      );
    }
    if (visitedStates >= maxStates) {
      exactEnumeration = false;
      return terminal(
        currentBalance,
        currentPool,
        purchases,
        targetAcquired,
        committed,
      );
    }

    const key = [
      pagesLeft,
      purchases,
      targetAcquired ? 1 : 0,
      currentPool
        .map((song) => song.id)
        .sort()
        .join("|"),
      TOKEN_KEYS.map((token) => currentBalance[token]).join(","),
    ].join(":");
    const cached = memo.get(key);
    if (cached) return cached;
    visitedStates += 1;

    const drawSize = Math.min(3, currentPool.length);
    if (drawSize === 0) {
      return terminal(
        currentBalance,
        currentPool,
        purchases,
        targetAcquired,
        committed,
      );
    }
    const allPages = combinationsOf(currentPool, drawSize);
    const sampledPages = deterministicPageSample(
      allPages,
      Math.max(1, maxEnumeratedPages),
    );
    if (sampledPages.length !== allPages.length) exactEnumeration = false;
    const aggregate = zeroValue();
    const rawWeights = sampledPages.map((page) =>
      Math.max(0, pageWeight?.(page.map((song) => song.id).sort()) ?? 1),
    );
    const rawWeightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights =
      rawWeightTotal > 0
        ? rawWeights.map((weight) => weight / rawWeightTotal)
        : rawWeights.map(() => 1 / sampledPages.length);

    for (let pageIndex = 0; pageIndex < sampledPages.length; pageIndex += 1) {
      const page = sampledPages[pageIndex];
      let best = terminal(
        currentBalance,
        currentPool,
        purchases,
        targetAcquired,
        committed,
      );
      let bestId = "stop";
      for (const song of page) {
        if (!canAfford(currentBalance, song.cost)) continue;
        const nextBalance = subtract(currentBalance, song.cost);
        const nextPool = canonicalById(
          currentPool.filter((candidate) => candidate.id !== song.id),
        );
        const nextTarget = targetAcquired || isChaseTarget(song, plan);
        const tier = structuralTier(song, plan);
        const value = visit(
          nextBalance,
          nextPool,
          pagesLeft - 1,
          purchases + 1,
          nextTarget,
          committed + costTotal(song.cost),
        );
        const withImmediate = {
          ...value,
          // Structural tiers are ordinal. Several low-tier purchases cannot
          // add up into a higher role such as Friendship or an SP target.
          expectedStructuralTier: Math.max(value.expectedStructuralTier, tier),
        };
        const comparison = compareValue(withImmediate, best, plan, hardWork);
        if (comparison > 0 || (comparison === 0 && song.id < bestId)) {
          best = withImmediate;
          bestId = song.id;
        }
      }
      addScaled(aggregate, best, normalizedWeights[pageIndex]);
    }

    memo.set(key, aggregate);
    return aggregate;
  };

  const value = visit(
    { ...balance },
    canonicalById(pool),
    Math.max(0, Math.trunc(pages)),
    0,
    acquiredPlanTarget,
    0,
  );
  return {
    ...value,
    pages: Math.max(0, Math.trunc(pages)),
    exactEnumeration,
    lawConfidence: "heuristic",
    pageLaw: pageWeight ? "weighted" : "uniform",
    conditionalOn: "declared-pages-accessible",
    visitedStates,
  };
};
