import { TOKEN_KEYS } from "@glcp/core";
import type { Balance, TokenKey } from "@glcp/core";

export type StockContinuityIssueKind =
  | "probable-truncation"
  | "probable-extra-prefix"
  | "abrupt-drop"
  | "abrupt-rise"
  | "huge-mismatch";

export type StockContinuityIssue = {
  key: TokenKey;
  expected: number;
  observed: number;
  delta: number;
  gap: number;
  kind: StockContinuityIssueKind;
  strongOcrSignal: boolean;
};

export type StockContinuityAssessment = {
  issues: StockContinuityIssue[];
  fingerprint: string;
  strongOcrSignal: boolean;
  broadStateDrift: boolean;
};

const decimalSuffix = (larger: number, smaller: number): boolean => {
  const largerText = String(Math.max(0, Math.trunc(larger)));
  const smallerText = String(Math.max(0, Math.trunc(smaller)));
  return (
    largerText.length > smallerText.length && largerText.endsWith(smallerText)
  );
};

const classifyIssue = (
  expected: number,
  observed: number,
): Pick<StockContinuityIssue, "kind" | "strongOcrSignal"> | null => {
  if (expected === observed) return null;

  const gap = Math.abs(observed - expected);
  const high = Math.max(expected, observed);
  const low = Math.min(expected, observed);
  const ratio = high / Math.max(1, low);

  // A dropped leading digit is the most characteristic OCR failure here:
  // 128 -> 8, 103 -> 3, 71 -> 1, etc. Keep the threshold permissive
  // enough to catch it, but not 28 -> 8 after a perfectly plausible spend.
  if (
    expected > observed &&
    expected >= 60 &&
    gap >= 45 &&
    decimalSuffix(expected, observed)
  ) {
    return { kind: "probable-truncation", strongOcrSignal: true };
  }

  // Symmetric case: a spurious leading digit appeared in the new OCR value.
  if (
    observed > expected &&
    observed >= 80 &&
    gap >= 55 &&
    decimalSuffix(observed, expected)
  ) {
    return { kind: "probable-extra-prefix", strongOcrSignal: true };
  }

  // Very sharp one-colour collapses remain suspicious even when the decimal
  // suffix is not preserved (for example 103 -> 13).
  if (
    expected >= 75 &&
    observed <= Math.max(15, Math.floor(expected * 0.25)) &&
    gap >= 55
  ) {
    return { kind: "abrupt-drop", strongOcrSignal: false };
  }

  // Token income can legitimately be large, so upward jumps use a more
  // conservative threshold than downward jumps.
  if (
    observed >= 110 &&
    expected <= Math.max(12, Math.floor(observed * 0.14)) &&
    gap >= 85
  ) {
    return { kind: "abrupt-rise", strongOcrSignal: false };
  }

  // Last-resort detector for a genuinely different order of magnitude.
  if (gap >= 120 && ratio >= 3.5) {
    return { kind: "huge-mismatch", strongOcrSignal: false };
  }

  return null;
};

export const assessStockContinuity = (
  expected: Balance | null,
  observed: Balance,
): StockContinuityAssessment | null => {
  if (!expected) return null;

  // A fresh run often starts with an empty local state while the user is
  // already several turns into the game. The first OCR snapshot establishes
  // the baseline and should not produce noise.
  if (TOKEN_KEYS.every((key) => expected[key] === 0)) return null;

  const issues = TOKEN_KEYS.flatMap((key) => {
    const expectedValue = Math.max(0, Math.trunc(expected[key]));
    const observedValue = Math.max(0, Math.trunc(observed[key]));
    const classification = classifyIssue(expectedValue, observedValue);
    if (!classification) return [];
    return [
      {
        key,
        expected: expectedValue,
        observed: observedValue,
        delta: observedValue - expectedValue,
        gap: Math.abs(observedValue - expectedValue),
        ...classification,
      } satisfies StockContinuityIssue,
    ];
  });

  if (issues.length === 0) return null;

  return {
    issues,
    fingerprint: JSON.stringify(
      issues.map((issue) => [
        issue.key,
        issue.expected,
        issue.observed,
        issue.kind,
      ]),
    ),
    strongOcrSignal: issues.some((issue) => issue.strongOcrSignal),
    // Several simultaneous shifts are more likely to mean that the player
    // advanced the run or edited the state outside OCR than a single bad glyph.
    broadStateDrift: issues.length >= 3,
  };
};

/**
 * A single sharp OCR-shaped discontinuity must not silently mutate solver
 * state. Broad multi-colour drift is left reviewable because it commonly
 * means the player advanced the run outside OCR.
 */
export const stockContinuityRequiresConfirmation = (
  assessment: StockContinuityAssessment | null,
): boolean =>
  Boolean(
    assessment &&
    !assessment.broadStateDrift &&
    assessment.issues.some(
      (issue) =>
        issue.strongOcrSignal ||
        issue.kind === "abrupt-drop" ||
        issue.kind === "huge-mismatch",
    ),
  );
