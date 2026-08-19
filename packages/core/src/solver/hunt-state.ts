import {
  TOKEN_KEYS,
  type Balance,
} from "../live-model.ts";

export type HuntStatus = "active" | "abandoned" | "found";

/**
 * Persistent section-local state for the SP +2 / SP +3 hunt.
 * `lastObservedPageKey` exists only to make observation idempotent: repeated
 * OCR/analysis of the same physical song page must never count as another miss.
 */
export type HuntState = {
  targetIds: readonly string[];
  pagesSeenWithoutTarget: number;
  committedTechniqueCost: Balance;
  fillerPurchasesWhileHunting: number;
  status: HuntStatus;
  lastObservedPageKey?: string;
};

export type HuntDecision = {
  action: "continue-hunt" | "abandon-to-hold";
  findAndFundProbability: number;
  targetTrainingExposure: number;
  expectedTargetValue: number;
  expectedFutureCost: number;
  reserveOpportunityCost: number;
  missPenalty: number;
  fillerPenalty: number;
  cycleDepthPenalty: number;
  netValue: number;
  minimumProbability: number;
  continuationMargin: number;
  pagesSeenWithoutTarget: number;
  fillerPurchasesWhileHunting: number;
  committedTechniqueTokens: number;
};

const zeroBalance = (): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

const canonicalIds = (ids: readonly string[]): string[] =>
  [...new Set(ids)].sort();

const sameIds = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const a = canonicalIds(left);
  const b = canonicalIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
};

export const createHuntState = (
  targetIds: readonly string[],
  status: HuntStatus = "active",
): HuntState => ({
  targetIds: canonicalIds(targetIds),
  pagesSeenWithoutTarget: 0,
  committedTechniqueCost: zeroBalance(),
  fillerPurchasesWhileHunting: 0,
  status,
});

/** Aligns persisted state with the currently active chase target set. */
export const alignHuntState = (
  state: HuntState | null | undefined,
  targetIds: readonly string[],
): HuntState | null => {
  const targets = canonicalIds(targetIds);
  if (targets.length === 0) return null;
  if (!state || !sameIds(state.targetIds, targets)) {
    return createHuntState(targets);
  }
  return {
    ...state,
    targetIds: targets,
    pagesSeenWithoutTarget: Math.max(
      0,
      Math.trunc(state.pagesSeenWithoutTarget),
    ),
    fillerPurchasesWhileHunting: Math.max(
      0,
      Math.trunc(state.fillerPurchasesWhileHunting),
    ),
    committedTechniqueCost: Object.fromEntries(
      TOKEN_KEYS.map((key) => [
        key,
        Math.max(0, Number(state.committedTechniqueCost?.[key]) || 0),
      ]),
    ) as Balance,
  };
};

/**
 * Records one physical page observation. `pageKey` must identify the physical
 * page (the UI uses concert + song cycle), not an analysis request.
 */
export const observeHuntPage = ({
  state,
  targetIds,
  visibleSongIds,
  pageKey,
}: {
  state: HuntState | null | undefined;
  targetIds: readonly string[];
  visibleSongIds: readonly string[];
  pageKey: string;
}): HuntState | null => {
  const aligned = alignHuntState(state, targetIds);
  if (!aligned || aligned.status !== "active") return aligned;
  if (aligned.lastObservedPageKey === pageKey) return aligned;

  const targets = new Set(aligned.targetIds);
  const targetVisible = visibleSongIds.some((id) => targets.has(id));
  return {
    ...aligned,
    pagesSeenWithoutTarget:
      aligned.pagesSeenWithoutTarget + (targetVisible ? 0 : 1),
    lastObservedPageKey: pageKey,
  };
};

export const recordHuntTechniquePurchase = (
  state: HuntState | null | undefined,
  cost: Balance,
): HuntState | null => {
  if (!state || state.status !== "active") return state ?? null;
  return {
    ...state,
    committedTechniqueCost: Object.fromEntries(
      TOKEN_KEYS.map((key) => [
        key,
        state.committedTechniqueCost[key] + Math.max(0, cost[key]),
      ]),
    ) as Balance,
  };
};

export const recordHuntFillerPurchase = (
  state: HuntState | null | undefined,
): HuntState | null => {
  if (!state || state.status !== "active") return state ?? null;
  return {
    ...state,
    fillerPurchasesWhileHunting: state.fillerPurchasesWhileHunting + 1,
  };
};

export const markHuntStatus = (
  state: HuntState | null | undefined,
  status: HuntStatus,
): HuntState | null => (state ? { ...state, status } : null);

export const huntPageKey = (concertIndex: number, songCycle: number): string =>
  `${concertIndex}:${songCycle}`;

/**
 * T1b HUNT admission. Token spend and miss depth remain diagnostics only; they
 * are never converted into pseudo stat-points. The projected target utility is
 * already expressed in the common stat-point numeraire.
 */
export const evaluateHuntDecision = ({
  state,
  findAndFundProbability,
  targetUtilityStatPoints,
}: {
  state: HuntState;
  findAndFundProbability: number;
  targetUtilityStatPoints: number;
}): HuntDecision => {
  const probability = Math.max(
    0,
    Math.min(1, Number.isFinite(findAndFundProbability) ? findAndFundProbability : 0),
  );
  const targetUtility = Number.isFinite(targetUtilityStatPoints)
    ? Math.max(0, targetUtilityStatPoints)
    : 0;
  const expectedTargetValue = probability * targetUtility;
  const beforeThirdMiss = state.pagesSeenWithoutTarget < 3;
  const action =
    state.status === "active" &&
    (beforeThirdMiss || (probability > 0 && expectedTargetValue > 0))
      ? "continue-hunt"
      : "abandon-to-hold";

  return {
    action,
    findAndFundProbability: probability,
    targetTrainingExposure: targetUtility,
    expectedTargetValue,
    expectedFutureCost: 0,
    reserveOpportunityCost: 0,
    missPenalty: 0,
    fillerPenalty: 0,
    cycleDepthPenalty: 0,
    netValue: expectedTargetValue,
    minimumProbability: 0,
    continuationMargin: 0,
    pagesSeenWithoutTarget: state.pagesSeenWithoutTarget,
    fillerPurchasesWhileHunting: state.fillerPurchasesWhileHunting,
    committedTechniqueTokens: TOKEN_KEYS.reduce(
      (sum, key) => sum + state.committedTechniqueCost[key],
      0,
    ),
  };
};
