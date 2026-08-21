import {
  pairedDifferenceSeparated,
  pairedMeanInterval,
  type PairedDifferenceStats,
} from "../monte-carlo.ts";

/** Frozen P4 statistical policy. Changing these values changes solver semantics. */
export const ROBUSTNESS_POLICY = "grand-live-robustness-v1" as const;
export const ROBUSTNESS_CONFIDENCE_LEVEL = 0.95 as const;
export const ROBUSTNESS_NORMAL_Z = 1.959963984540054;
export const ROBUSTNESS_DEFAULT_MIN_SAMPLES = 192;
export const ROBUSTNESS_DEFAULT_MAX_SAMPLES = 2400;
export const ROBUSTNESS_BATCH_SIZE = 64;

export type CoRecommendationReason =
  | "monte-carlo-not-separated"
  | "calibration-sensitive"
  | "resource-tradeoff"
  | "both";

export type RobustnessConvergenceReason =
  | "minimum-samples"
  | "risk-and-paired-separated"
  | "paired-separated"
  | "max-samples"
  | "time-budget"
  | "sampling";

export type PairedUtilityRobustness = {
  policy: typeof ROBUSTNESS_POLICY;
  mean: number;
  interval: readonly [number, number];
  confidenceLevel: typeof ROBUSTNESS_CONFIDENCE_LEVEL;
  samples: number;
  maxSamples: number;
  separation: "above" | "below" | "not-separated";
  convergenceReason: RobustnessConvergenceReason;
  couplingKey: string;
};

export const pairedUtilityRobustness = ({
  stats,
  minimumSamples,
  maxSamples,
  couplingKey,
  timeBudgetExceeded = false,
  riskSeparated,
}: {
  stats: PairedDifferenceStats;
  minimumSamples: number;
  maxSamples: number;
  couplingKey: string;
  timeBudgetExceeded?: boolean;
  /** Omit when the caller has no separate stochastic risk boundary. */
  riskSeparated?: boolean;
}): PairedUtilityRobustness => {
  const interval = pairedMeanInterval(stats, ROBUSTNESS_NORMAL_Z);
  const rawSeparation = pairedDifferenceSeparated(
    stats,
    0,
    ROBUSTNESS_NORMAL_Z,
  );
  const separation =
    rawSeparation === "uncertain" ? "not-separated" : rawSeparation;
  const pairedSeparated = rawSeparation !== "uncertain";
  const samples = stats.samples;
  const convergenceReason: RobustnessConvergenceReason =
    timeBudgetExceeded
      ? "time-budget"
      : samples < minimumSamples
        ? "minimum-samples"
        : pairedSeparated && riskSeparated === true
          ? "risk-and-paired-separated"
          : pairedSeparated && riskSeparated === undefined
            ? "paired-separated"
            : samples >= maxSamples
              ? "max-samples"
              : "sampling";

  return {
    policy: ROBUSTNESS_POLICY,
    mean: stats.mean,
    interval,
    confidenceLevel: ROBUSTNESS_CONFIDENCE_LEVEL,
    samples,
    maxSamples,
    separation,
    convergenceReason,
    couplingKey,
  };
};

export const coRecommendationReason = ({
  monteCarloNotSeparated,
  calibrationSensitive,
}: {
  monteCarloNotSeparated: boolean;
  calibrationSensitive: boolean;
}): CoRecommendationReason | null =>
  monteCarloNotSeparated
    ? calibrationSensitive
      ? "both"
      : "monte-carlo-not-separated"
    : calibrationSensitive
      ? "calibration-sensitive"
      : null;

/**
 * A co-recommendation never claims equivalence. The primary is chosen only to
 * make the API/UI stable while the alternatives remain explicitly unresolved.
 */
export const stableCoRecommendationPrimary = <T extends string>(
  values: readonly T[],
  stableOrder: readonly T[],
): T | null => {
  const rank = new Map(stableOrder.map((value, index) => [value, index]));
  return (
    [...values].sort(
      (left, right) =>
        (rank.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right),
    )[0] ?? null
  );
};

export const calibrationSensitive = (
  breakpoints: readonly unknown[],
): boolean => breakpoints.length > 0;
