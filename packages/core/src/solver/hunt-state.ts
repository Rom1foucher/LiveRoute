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

export type HuntFundingAssessment =
  | "zero-income-fundable"
  | "future-income-required"
  | "unreachable";

export type HuntDecision = {
  action: "continue-hunt" | "abandon-to-hold";
  /** P(target appears | next page reached), before affordability. */
  targetAppearanceProbability: number;
  /** P(target is fundable | target appears and page reached), under zero income. */
  zeroIncomeFundabilityProbability: number | null;
  /** Multi-page zero-income P(find and fund), retained as reachability telemetry. */
  findAndFundProbability: number;
  fundingAssessment: HuntFundingAssessment;
  /** Historical HUNT counters are diagnostics only; none is an admission threshold. */
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
 * P3b2 HUNT admission. The persistent chase is abandoned only when the target
 * is no longer physically reachable in the modeled page law (appearance = 0)
 * or when the state was already closed. A zero-income funding probability of
 * zero is *not* proof of impossibility: future trainings generate unknown,
 * non-negative token income, so the correct action is to stop the current
 * chain if necessary while keeping HUNT active.
 *
 * Miss count, filler count, committed spend and cycle depth remain telemetry.
 * They never create a hidden threshold or pseudo utility.
 */
export const evaluateHuntDecision = ({
  state,
  targetAppearanceProbability,
  zeroIncomeFundabilityProbability,
  findAndFundProbability,
}: {
  state: HuntState;
  targetAppearanceProbability: number;
  zeroIncomeFundabilityProbability: number | null;
  findAndFundProbability: number;
}): HuntDecision => {
  const clampProbability = (value: number): number =>
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const appearanceProbability = clampProbability(targetAppearanceProbability);
  const fundabilityProbability =
    zeroIncomeFundabilityProbability === null
      ? null
      : clampProbability(zeroIncomeFundabilityProbability);
  const findAndFund = clampProbability(findAndFundProbability);

  const fundingAssessment: HuntFundingAssessment =
    appearanceProbability <= 0
      ? "unreachable"
      : findAndFund > 0 || (fundabilityProbability ?? 0) > 0
        ? "zero-income-fundable"
        : "future-income-required";
  const action =
    state.status === "active" && fundingAssessment !== "unreachable"
      ? "continue-hunt"
      : "abandon-to-hold";

  return {
    action,
    targetAppearanceProbability: appearanceProbability,
    zeroIncomeFundabilityProbability: fundabilityProbability,
    findAndFundProbability: findAndFund,
    fundingAssessment,
    pagesSeenWithoutTarget: state.pagesSeenWithoutTarget,
    fillerPurchasesWhileHunting: state.fillerPurchasesWhileHunting,
    committedTechniqueTokens: TOKEN_KEYS.reduce(
      (sum, key) => sum + state.committedTechniqueCost[key],
      0,
    ),
  };
};
