/** Shared deterministic Monte-Carlo convergence helpers. */

export type ProbabilityInterval = readonly [number, number];

export const clampProbability = (value: number): number =>
  Math.max(0, Math.min(1, value));

export const wilsonInterval = (
  successes: number,
  samples: number,
  z = 1.959963984540054,
): ProbabilityInterval => {
  if (samples <= 0) return [0, 1];
  const probability = clampProbability(successes / samples);
  const z2 = z * z;
  const denominator = 1 + z2 / samples;
  const centre = probability + z2 / (2 * samples);
  const margin =
    z *
    Math.sqrt((probability * (1 - probability) + z2 / (4 * samples)) / samples);
  return [
    clampProbability((centre - margin) / denominator),
    clampProbability((centre + margin) / denominator),
  ];
};

export const wilsonIntervalFromProbability = (
  probability: number,
  samples: number,
): ProbabilityInterval =>
  wilsonInterval(clampProbability(probability) * Math.max(0, samples), samples);

export const intervalCrosses = (
  interval: ProbabilityInterval,
  thresholds: readonly number[],
): boolean =>
  thresholds.some(
    (threshold) => interval[0] < threshold && interval[1] >= threshold,
  );

export const probabilityEstimateStable = ({
  successes,
  samples,
  thresholds = [],
  maxWidth,
}: {
  successes: number;
  samples: number;
  thresholds?: readonly number[];
  maxWidth?: number;
}): boolean => {
  const interval = wilsonInterval(successes, samples);
  if (intervalCrosses(interval, thresholds)) return false;
  return maxWidth === undefined || interval[1] - interval[0] <= maxWidth;
};

export type PairedDifferenceStats = {
  samples: number;
  mean: number;
  m2: number;
};

export const createPairedDifferenceStats = (): PairedDifferenceStats => ({
  samples: 0,
  mean: 0,
  m2: 0,
});

/** Welford update for a per-trial paired difference (candidate - baseline). */
export const addPairedDifference = (
  stats: PairedDifferenceStats,
  difference: number,
): void => {
  stats.samples += 1;
  const delta = difference - stats.mean;
  stats.mean += delta / stats.samples;
  const delta2 = difference - stats.mean;
  stats.m2 += delta * delta2;
};

export const pairedMeanInterval = (
  stats: PairedDifferenceStats,
  z = 1.959963984540054,
): readonly [number, number] => {
  if (stats.samples <= 1) return [-Infinity, Infinity];
  const variance = Math.max(0, stats.m2 / (stats.samples - 1));
  const standardError = Math.sqrt(variance / stats.samples);
  const margin = z * standardError;
  return [stats.mean - margin, stats.mean + margin];
};

export const pairedDifferenceSeparated = (
  stats: PairedDifferenceStats,
  threshold = 0,
): "above" | "below" | "uncertain" => {
  const interval = pairedMeanInterval(stats);
  if (interval[0] > threshold) return "above";
  if (interval[1] <= threshold) return "below";
  return "uncertain";
};

export const canonicalNumberKey = (values: readonly number[]): string =>
  values
    .map((value) => (Number.isFinite(value) ? String(value) : "nan"))
    .join(",");
