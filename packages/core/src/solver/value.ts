export type DecisionVector = {
  hard: number;
  riskAdmissible: number;
  /** Costed future state and pacing debt, compared before intrinsic song tier. */
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

const compareVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareNumber(left[index] ?? 0, right[index] ?? 0);
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
  compareVector(left.prospective ?? [], right.prospective ?? []) ||
  compareNumber(left.structural, right.structural) ||
  compareVector(left.continuation, right.continuation) ||
  compareNumber(left.retainedTokens, right.retainedTokens) ||
  compareNumber(right.committedCost, left.committedCost) ||
  // Stable final order. A lower identifier wins so identical states never
  // depend on object insertion order or Monte-Carlo noise.
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

export const riskThreshold = (
  profile: "safe" | "standard" | "greedy",
): number => (profile === "safe" ? 0.985 : profile === "greedy" ? 0.78 : 0.92);
