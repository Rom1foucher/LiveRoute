import {
  TOKEN_KEYS,
  type Balance,
  type RiskProfile,
  type TokenShadowPrice,
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

export const shadowPremiumForCost = (
  cost: Balance,
  shadowPrices: readonly TokenShadowPrice[],
): number => {
  const shadowByKey = Object.fromEntries(
    shadowPrices.map((item) => [item.key, Math.max(0, item.shadowValue)]),
  ) as Partial<Record<(typeof TOKEN_KEYS)[number], number>>;
  return TOKEN_KEYS.reduce(
    (sum, key) => sum + Math.max(0, cost[key]) * (shadowByKey[key] ?? 0),
    0,
  );
};

const HUNT_VALUE_CALIBRATION = {
  tokenCostWeight: {
    safe: 0.22,
    standard: 0.18,
    greedy: 0.14,
  } satisfies Record<RiskProfile, number>,
  missPenalty: {
    safe: 6,
    standard: 4,
    greedy: 3,
  } satisfies Record<RiskProfile, number>,
  fillerPenalty: {
    safe: 3,
    standard: 2,
    greedy: 1.5,
  } satisfies Record<RiskProfile, number>,
  minimumProbability: {
    safe: 0.08,
    standard: 0.06,
    greedy: 0.04,
  } satisfies Record<RiskProfile, number>,
  continuationMargin: {
    safe: 2,
    standard: 0,
    greedy: -2,
  } satisfies Record<RiskProfile, number>,
  cycleDepthPenalty: 2,
} as const;

/**
 * PR-6 marginal comparison. Past technique spend is logged but deliberately
 * not subtracted again: it is a sunk cost. Misses/filler drift do matter as a
 * section-local opportunity penalty, while future cost and reserve pressure
 * are charged directly against the remaining SP-training exposure.
 */
export const evaluateHuntDecision = ({
  state,
  riskProfile,
  findAndFundProbability,
  targetTrainingExposure,
  expectedFutureCommittedCost,
  immediateFillerCost,
  reserveOpportunityCost,
  techniquesToNextSong,
}: {
  state: HuntState;
  riskProfile: RiskProfile;
  findAndFundProbability: number;
  targetTrainingExposure: number;
  expectedFutureCommittedCost: number;
  immediateFillerCost: number;
  reserveOpportunityCost: number;
  techniquesToNextSong: number;
}): HuntDecision => {
  const finiteNonNegative = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  const probability = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(findAndFundProbability) ? findAndFundProbability : 0,
    ),
  );
  const exposure = finiteNonNegative(targetTrainingExposure);
  const expectedTargetValue = probability * exposure;
  const expectedFutureCost =
    (finiteNonNegative(expectedFutureCommittedCost) +
      finiteNonNegative(immediateFillerCost)) *
    HUNT_VALUE_CALIBRATION.tokenCostWeight[riskProfile];
  // First two misses are ordinary HUNT variance. Starting with the third miss,
  // continuation no longer receives an implicit structural free pass.
  const missPenalty =
    Math.max(0, state.pagesSeenWithoutTarget - 2) *
    HUNT_VALUE_CALIBRATION.missPenalty[riskProfile];
  const fillerPenalty =
    Math.max(0, state.fillerPurchasesWhileHunting) *
    HUNT_VALUE_CALIBRATION.fillerPenalty[riskProfile];
  const cycleDepthPenalty =
    Math.max(0, techniquesToNextSong - 3) *
    HUNT_VALUE_CALIBRATION.cycleDepthPenalty;
  const netValue =
    expectedTargetValue -
    expectedFutureCost -
    finiteNonNegative(reserveOpportunityCost) -
    missPenalty -
    fillerPenalty -
    cycleDepthPenalty;
  const minimumProbability =
    HUNT_VALUE_CALIBRATION.minimumProbability[riskProfile];
  const continuationMargin =
    HUNT_VALUE_CALIBRATION.continuationMargin[riskProfile];
  const beforeThirdMiss = state.pagesSeenWithoutTarget < 3;
  // Before the third miss, P(find & fund)=0 may only mean the current wallet
  // cannot pay the target yet. Preserve HUNT so later training income can make
  // the same target fundable; deeper hunts still use the calibrated threshold.
  const action =
    state.status === "active" &&
    (beforeThirdMiss ||
      (probability >= minimumProbability && netValue > continuationMargin))
      ? "continue-hunt"
      : "abandon-to-hold";

  return {
    action,
    findAndFundProbability: probability,
    targetTrainingExposure: exposure,
    expectedTargetValue,
    expectedFutureCost,
    reserveOpportunityCost: finiteNonNegative(reserveOpportunityCost),
    missPenalty,
    fillerPenalty,
    cycleDepthPenalty,
    netValue,
    minimumProbability,
    continuationMargin,
    pagesSeenWithoutTarget: state.pagesSeenWithoutTarget,
    fillerPurchasesWhileHunting: state.fillerPurchasesWhileHunting,
    committedTechniqueTokens: TOKEN_KEYS.reduce(
      (sum, key) => sum + state.committedTechniqueCost[key],
      0,
    ),
  };
};
