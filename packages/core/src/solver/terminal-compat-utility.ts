import type { TerminalUtilityBreakpoint } from "../live-model.ts";
import {
  horizonMetricComponent,
  type HorizonMetricId,
  type HorizonOutcome,
} from "./horizon-outcome.ts";
import {
  GATE18_STAT_DELTA,
  GREAT_SUCCESS_STAT_DELTA,
  PROJECTION_POLICY,
} from "./utility-model.ts";

/**
 * Temporary P5/P4 compatibility island.
 *
 * P3b2 removes generic behavioural projections from the canonical T1b model.
 * The terminal evaluator predates that ordering and is already deployed/golden
 * behavior. Until P5 is rebased on the layered comparator, keep its historical
 * scalar local to the terminal path so P3b2 cannot silently rewrite terminal
 * decisions as a side effect.
 *
 * Do not use this module from song-policy or any new decision path.
 */
export type TerminalCompatParameterId =
  | "FRIENDSHIP_EXPOSURE_STAT_RATE"
  | "SKILL_POINT_UTILITY"
  | "SCENARIO_SKILL_UTILITY"
  | "SCENARIO_EVENT_UTILITY";

type TerminalCompatCalibration = Record<
  TerminalCompatParameterId,
  {
    value: number;
    minimum: number;
    calibrationInterval?: readonly [number, number];
  }
>;

const TERMINAL_COMPAT_CALIBRATION: TerminalCompatCalibration = {
  FRIENDSHIP_EXPOSURE_STAT_RATE: {
    value: 0.52,
    minimum: 0,
    calibrationInterval: [0.3, 0.8],
  },
  SKILL_POINT_UTILITY: { value: 1, minimum: 0 },
  SCENARIO_SKILL_UTILITY: { value: 0, minimum: 0 },
  SCENARIO_EVENT_UTILITY: { value: 0, minimum: 0 },
};

export type TerminalCompatLinearTerms = {
  fixedStatPoints: number;
  coefficients: Record<TerminalCompatParameterId, number>;
};

export type TerminalCompatUtilityAssessment = {
  tieId: string;
  hardState: number;
  riskAdmissibleState: number;
  nominalStatPoints: number;
  linearTerms: TerminalCompatLinearTerms;
};

const number = (outcome: HorizonOutcome, metric: HorizonMetricId): number => {
  const component = horizonMetricComponent(outcome, metric);
  if (!component) return 0;
  if (typeof component.value === "number") return component.value;
  throw new Error(
    `Terminal compatibility utility cannot scalarize unresolved metric ${metric} for ${outcome.tieId}`,
  );
};

const hasMetric = (outcome: HorizonOutcome, metric: HorizonMetricId): boolean =>
  outcome.components.some((component) => component.metric === metric);

const gateExpected = (
  outcome: HorizonOutcome,
  crossedMetric: "gate16-crossed" | "gate18-crossed",
  reachMetric: "gate16-zero-income-reach" | "gate18-zero-income-reach",
): { projected: boolean; probability: number } => {
  if (number(outcome, crossedMetric) > 0) return { projected: true, probability: 1 };
  if (hasMetric(outcome, reachMetric)) {
    return {
      projected: true,
      probability: Math.max(0, Math.min(1, number(outcome, reachMetric))),
    };
  }
  return { projected: false, probability: 0 };
};

const zeroCoefficients = (): Record<TerminalCompatParameterId, number> => ({
  FRIENDSHIP_EXPOSURE_STAT_RATE: 0,
  SKILL_POINT_UTILITY: 0,
  SCENARIO_SKILL_UTILITY: 0,
  SCENARIO_EVENT_UTILITY: 0,
});

export const terminalCompatUtilityAssessmentFromOutcome = (
  outcome: HorizonOutcome,
): TerminalCompatUtilityAssessment => {
  const coefficients = zeroCoefficients();
  let fixedStatPoints = 0;

  fixedStatPoints += number(outcome, "expected-practice-stat-delta");
  coefficients.SKILL_POINT_UTILITY += number(outcome, "expected-skill-points");
  coefficients.FRIENDSHIP_EXPOSURE_STAT_RATE += number(
    outcome,
    "friendship-exposure",
  );

  const greatSuccessProbability = Math.max(
    number(outcome, "great-success-secured"),
    number(outcome, "great-success-zero-income-reach"),
  );
  fixedStatPoints += greatSuccessProbability * GREAT_SUCCESS_STAT_DELTA;

  const gate16 = gateExpected(outcome, "gate16-crossed", "gate16-zero-income-reach");
  const gate18 = gateExpected(outcome, "gate18-crossed", "gate18-zero-income-reach");
  if (gate16.projected) {
    coefficients.SCENARIO_EVENT_UTILITY += gate16.probability;
  }
  if (gate18.projected) {
    fixedStatPoints += gate18.probability * GATE18_STAT_DELTA;
    coefficients.SCENARIO_SKILL_UTILITY += gate18.probability;
  }

  const linearTerms: TerminalCompatLinearTerms = { fixedStatPoints, coefficients };
  const nominalStatPoints =
    fixedStatPoints +
    (Object.keys(coefficients) as TerminalCompatParameterId[]).reduce(
      (sum, id) => sum + coefficients[id] * TERMINAL_COMPAT_CALIBRATION[id].value,
      0,
    );

  return {
    tieId: outcome.tieId,
    hardState: number(outcome, "hard-state"),
    riskAdmissibleState: number(outcome, "risk-admissible-state"),
    nominalStatPoints,
    linearTerms,
  };
};

const compareNumber = (left: number, right: number, epsilon = 1e-10): number =>
  Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1;

export const compareTerminalCompatUtilityAssessments = (
  left: TerminalCompatUtilityAssessment,
  right: TerminalCompatUtilityAssessment,
): number =>
  compareNumber(left.hardState, right.hardState) ||
  compareNumber(left.riskAdmissibleState, right.riskAdmissibleState) ||
  compareNumber(left.nominalStatPoints, right.nominalStatPoints) ||
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

const utilityFromTerms = (
  terms: TerminalCompatLinearTerms,
  override: Partial<Record<TerminalCompatParameterId, number>>,
): number => {
  let total = terms.fixedStatPoints;
  for (const id of Object.keys(terms.coefficients) as TerminalCompatParameterId[]) {
    total += terms.coefficients[id] * (override[id] ?? TERMINAL_COMPAT_CALIBRATION[id].value);
  }
  return total;
};

export const terminalCompatBreakpointsFromLinearTerms = ({
  leftId,
  rightId,
  left,
  right,
}: {
  leftId: string;
  rightId: string;
  left: TerminalCompatLinearTerms;
  right: TerminalCompatLinearTerms;
}): TerminalUtilityBreakpoint[] =>
  (Object.keys(TERMINAL_COMPAT_CALIBRATION) as TerminalCompatParameterId[])
    .flatMap((parameter) => {
      const deltaCoefficient =
        left.coefficients[parameter] - right.coefficients[parameter];
      if (Math.abs(deltaCoefficient) <= 1e-12) return [];
      const deltaOther =
        utilityFromTerms(left, { [parameter]: 0 }) -
        utilityFromTerms(right, { [parameter]: 0 });
      const value = -deltaOther / deltaCoefficient;
      if (!Number.isFinite(value)) return [];
      const definition = TERMINAL_COMPAT_CALIBRATION[parameter];
      const withinCalibrationInterval = definition.calibrationInterval
        ? value >= definition.calibrationInterval[0] &&
          value <= definition.calibrationInterval[1]
        : null;
      const withinAdmissibleDomain = value >= definition.minimum;
      if (!withinAdmissibleDomain || withinCalibrationInterval === false) return [];
      const epsilon = Math.max(1e-6, Math.abs(value) * 1e-4);
      const below = value - epsilon;
      const above = value + epsilon;
      return [
        {
          parameter,
          value,
          scope: "fixed-projection-policy" as const,
          projectionPolicy: PROJECTION_POLICY,
          leftId,
          rightId,
          withinCalibrationInterval,
          withinAdmissibleDomain,
          epsilon,
          belowDelta:
            utilityFromTerms(left, { [parameter]: below }) -
            utilityFromTerms(right, { [parameter]: below }),
          aboveDelta:
            utilityFromTerms(left, { [parameter]: above }) -
            utilityFromTerms(right, { [parameter]: above }),
        },
      ];
    })
    .sort((a, b) => a.parameter.localeCompare(b.parameter));
