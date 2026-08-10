import type { Balance, Period, TokenKey } from "@glcp/core";

const TOKEN_KEYS = [
  "dance",
  "passion",
  "vocal",
  "visual",
  "mental",
] as const satisfies readonly TokenKey[];

const PERIOD_COSTS: Record<
  Period,
  {
    singles: readonly number[];
    balancedDuo: number | null;
    splitDuo: readonly [number, number] | null;
  }
> = {
  junior: {
    singles: [10, 15, 25, 30, 35],
    balancedDuo: null,
    splitDuo: null,
  },
  classic: {
    singles: [15, 16, 25, 30, 35],
    balancedDuo: 8,
    splitDuo: [10, 6],
  },
  senior: {
    singles: [15, 24, 25, 30, 35],
    balancedDuo: 12,
    splitDuo: [14, 10],
  },
};

/**
 * Rejects partial OCR vectors such as a lone `8` from an `8 + 8` Duo.
 * This is intentionally structural: the text/effect classifier is not needed.
 */
export const isPlausibleTechniqueCost = (
  cost: Balance,
  period: Period,
): boolean => {
  const values = TOKEN_KEYS.map((key) => cost[key]).filter(
    (value) => value > 0,
  );
  const expected = PERIOD_COSTS[period];
  if (values.length === 1) {
    return expected.singles.includes(values[0]);
  }
  if (values.length !== 2) return false;
  if (
    expected.balancedDuo !== null &&
    values.every((value) => value === expected.balancedDuo)
  ) {
    return true;
  }
  if (!expected.splitDuo) return false;
  return (
    values.includes(expected.splitDuo[0]) &&
    values.includes(expected.splitDuo[1])
  );
};
