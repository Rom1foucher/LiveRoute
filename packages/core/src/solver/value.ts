export type DecisionVector = {
  hard: number;
  riskAdmissible: number;
  /** Certain value of the currently visible action, before any future Monte-Carlo projection. */
  certain?: readonly number[];
  /** Costed future state and pacing debt, compared after certain visible-song value. */
  prospective?: readonly number[];
  structural: number;
  /** Lexicographic continuation state; entries are never added together. */
  continuation: readonly number[];
  retainedTokens: number;
  committedCost: number;
  tieId: string;
};

const compareNumber = (left: number, right: number, epsilon = 1e-10) =>
  Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1;

export const DECISION_PROBABILITY_BAND = 0.05;

const probabilityBand = (value: number): number =>
  Math.round(value / DECISION_PROBABILITY_BAND);

const compareVectorNumber = (left: number, right: number): number => {
  // PR-7: Monte-Carlo probabilities are only meaningful at a material band
  // unless a dedicated paired-CI admission step has already separated them.
  // Decision vectors intentionally mix discrete structural values and
  // probabilities; [0,1] is the stable probability domain shared by song and
  // cross-section vectors. Exact 0/1 values remain unchanged by quantisation.
  if (left >= 0 && left <= 1 && right >= 0 && right <= 1) {
    return compareNumber(probabilityBand(left), probabilityBand(right), 0);
  }
  return compareNumber(left, right);
};

const compareProspectiveNumber = (left: number, right: number): number => {
  if (left >= 0 && left <= 1 && right >= 0 && right <= 1) {
    return compareNumber(probabilityBand(left), probabilityBand(right), 0);
  }
  return compareNumber(left, right);
};

const compareProspectiveVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareProspectiveNumber(
      left[index] ?? 0,
      right[index] ?? 0,
    );
    if (compared !== 0) return compared;
  }
  return 0;
};
const compareVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareVectorNumber(left[index] ?? 0, right[index] ?? 0);
    if (compared !== 0) return compared;
  }
  return 0;
};

/** Positive means left is preferred. */
export const compareDecisionVectors = (
  left: DecisionVector,
  right: DecisionVector,
): number =>
  compareNumber(left.hard, right.hard) ||
  compareNumber(left.riskAdmissible, right.riskAdmissible) ||
  // Guaranteed visible-song role is known exactly and must not lose to a
  // marginal future MC delta. This is a total lexicographic key, not a
  // pairwise exception, so PR-7 permutation/transitivity guarantees remain.
  compareNumber(left.structural, right.structural) ||
  compareVector(left.certain ?? [], right.certain ?? []) ||
  compareProspectiveVector(left.prospective ?? [], right.prospective ?? []) ||
  compareVector(left.continuation, right.continuation) ||
  compareNumber(left.retainedTokens, right.retainedTokens) ||
  compareNumber(right.committedCost, left.committedCost) ||
  // Stable final order. A lower identifier wins so identical states never
  // depend on object insertion order or Monte-Carlo noise.
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

export const riskThreshold = (
  profile: "safe" | "standard" | "greedy",
): number => (profile === "safe" ? 0.985 : profile === "greedy" ? 0.78 : 0.92);

/**
 * Hard lower safety bound used when a terminal C4 decision trades some reach
 * probability for material value. The normal risk threshold remains the
 * preferred operating point; this floor only prevents catastrophically weak
 * branches from being rescued by a large value score.
 *
 * This exact lower band already governed adaptive MC separation before PR-4,
 * so promoting it to a named policy primitive avoids introducing a second
 * calibration for the same notion of "too risky to consider".
 */
export const riskCatastropheFloor = (
  profile: "safe" | "standard" | "greedy",
): number => Math.max(0.65, riskThreshold(profile) - 0.2);
