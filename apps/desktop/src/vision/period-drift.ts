import type { Balance, Period } from "@glcp/core";
import { isPlausibleTechniqueCost } from "./technique-cost.ts";

const PERIODS: readonly Period[] = ["junior", "classic", "senior"];

export type TechniquePeriodDrift = {
  expected: Period;
  detected: Period;
  direction: "state-ahead" | "state-behind";
};

/**
 * Detects a coherent period mismatch only when every visible technique fits
 * exactly one other period and none fits the expected period. Ambiguous pages
 * deliberately return null.
 */
export const detectTechniquePeriodDrift = (
  costs: readonly Balance[],
  expected: Period,
): TechniquePeriodDrift | null => {
  if (costs.length !== 3) return null;
  if (costs.every((cost) => isPlausibleTechniqueCost(cost, expected)))
    return null;

  const matching = PERIODS.filter((period) =>
    costs.every((cost) => isPlausibleTechniqueCost(cost, period)),
  );
  if (matching.length !== 1) return null;
  const detected = matching[0];
  const expectedIndex = PERIODS.indexOf(expected);
  const detectedIndex = PERIODS.indexOf(detected);
  if (expectedIndex === detectedIndex) return null;
  return {
    expected,
    detected,
    direction: expectedIndex > detectedIndex ? "state-ahead" : "state-behind",
  };
};
