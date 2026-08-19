import {
  horizonMetricComponent,
  horizonMetricNumber,
  type HorizonMetricId,
  type HorizonOutcome,
} from "./horizon-outcome.ts";
import type { DecisionVector } from "./value.ts";

export const PROJECTION_POLICY = "grand-live-zero-income-v1" as const;
export const UTILITY_MODEL = "grand-live-stat-numeraire-v1" as const;
export const GREAT_SUCCESS_STAT_DELTA = 35;
export const GATE18_STAT_DELTA = 50;
export const STAT_POINT_UTILITY = 1;

export type UtilityParameterId =
  | "FRIENDSHIP_EXPOSURE_STAT_RATE"
  | "SKILL_POINT_UTILITY"
  | "SCENARIO_SKILL_UTILITY"
  | "SCENARIO_EVENT_UTILITY";

export type UtilityParameter = {
  value: number;
  kind: "bounded" | "free";
  minimum: number;
  calibrationInterval?: readonly [number, number];
};

export type UtilityCalibration = Record<UtilityParameterId, UtilityParameter>;

export const DEFAULT_UTILITY_CALIBRATION: UtilityCalibration = {
  FRIENDSHIP_EXPOSURE_STAT_RATE: {
    value: 0.52,
    kind: "bounded",
    minimum: 0,
    calibrationInterval: [0.3, 0.8],
  },
  SKILL_POINT_UTILITY: { value: 1, kind: "free", minimum: 0 },
  SCENARIO_SKILL_UTILITY: { value: 0, kind: "free", minimum: 0 },
  SCENARIO_EVENT_UTILITY: { value: 0, kind: "free", minimum: 0 },
};

export const FRIENDSHIP_EXPOSURE_STAT_RATE =
  DEFAULT_UTILITY_CALIBRATION.FRIENDSHIP_EXPOSURE_STAT_RATE.value;
export const SKILL_POINT_UTILITY =
  DEFAULT_UTILITY_CALIBRATION.SKILL_POINT_UTILITY.value;
export const SCENARIO_SKILL_UTILITY =
  DEFAULT_UTILITY_CALIBRATION.SCENARIO_SKILL_UTILITY.value;
export const SCENARIO_EVENT_UTILITY =
  DEFAULT_UTILITY_CALIBRATION.SCENARIO_EVENT_UTILITY.value;

export type UtilityContribution = {
  id: string;
  sourceMetric: HorizonMetricId | "great-success" | "gate16" | "gate18";
  value: number;
  statPoints: number;
  parameter?: UtilityParameterId;
};

export type UtilityLinearTerms = {
  fixedStatPoints: number;
  coefficients: Record<UtilityParameterId, number>;
};

export type UtilityUnprojectedReward = {
  id: "gate16" | "gate18";
  reason: "not-projected";
};

export type UtilityAssessment = {
  tieId: string;
  projectionPolicy: typeof PROJECTION_POLICY;
  utilityModel: typeof UTILITY_MODEL;
  hardState: number;
  riskAdmissibleState: number;
  nominalStatPoints: number;
  boundedCalibrationInterval: readonly [number, number] | null;
  contributions: readonly UtilityContribution[];
  linearTerms: UtilityLinearTerms;
  freeParameters: readonly UtilityParameterId[];
  unprojectedRewards: readonly UtilityUnprojectedReward[];
};

const number = (outcome: HorizonOutcome, metric: HorizonMetricId): number => {
  const component = horizonMetricComponent(outcome, metric);
  if (!component) return 0;
  if (typeof component.value === "number") return component.value;
  throw new Error(
    `Utility model cannot scalarize unresolved metric ${metric} for ${outcome.tieId}`,
  );
};

const hasMetric = (outcome: HorizonOutcome, metric: HorizonMetricId): boolean =>
  outcome.components.some((component) => component.metric === metric);

const zeroCoefficients = (): Record<UtilityParameterId, number> => ({
  FRIENDSHIP_EXPOSURE_STAT_RATE: 0,
  SKILL_POINT_UTILITY: 0,
  SCENARIO_SKILL_UTILITY: 0,
  SCENARIO_EVENT_UTILITY: 0,
});

const gateExpected = (
  outcome: HorizonOutcome,
  crossedMetric: "gate16-crossed" | "gate18-crossed",
  reachMetric: "gate16-zero-income-reach" | "gate18-zero-income-reach",
): { projected: boolean; probability: number } => {
  if (number(outcome, crossedMetric) > 0) return { projected: true, probability: 1 };
  if (hasMetric(outcome, reachMetric)) {
    return { projected: true, probability: Math.max(0, Math.min(1, number(outcome, reachMetric))) };
  }
  return { projected: false, probability: 0 };
};

export const utilityAssessmentFromOutcome = (
  outcome: HorizonOutcome,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): UtilityAssessment => {
  const coefficients = zeroCoefficients();
  const contributions: UtilityContribution[] = [];
  let fixedStatPoints = 0;

  const practice = number(outcome, "expected-practice-stat-delta");
  if (practice !== 0) {
    fixedStatPoints += practice;
    contributions.push({
      id: "practice-stat-delta",
      sourceMetric: "expected-practice-stat-delta",
      value: practice,
      statPoints: practice,
    });
  }

  const skillPoints = number(outcome, "expected-skill-points");
  if (skillPoints !== 0) {
    coefficients.SKILL_POINT_UTILITY += skillPoints;
    contributions.push({
      id: "skill-points",
      sourceMetric: "expected-skill-points",
      value: skillPoints,
      statPoints: skillPoints * calibration.SKILL_POINT_UTILITY.value,
      parameter: "SKILL_POINT_UTILITY",
    });
  }

  const friendship = number(outcome, "friendship-exposure");
  if (friendship !== 0) {
    coefficients.FRIENDSHIP_EXPOSURE_STAT_RATE += friendship;
    contributions.push({
      id: "friendship-exposure",
      sourceMetric: "friendship-exposure",
      value: friendship,
      statPoints:
        friendship * calibration.FRIENDSHIP_EXPOSURE_STAT_RATE.value,
      parameter: "FRIENDSHIP_EXPOSURE_STAT_RATE",
    });
  }

  const greatSuccessProbability = Math.max(
    number(outcome, "great-success-secured"),
    number(outcome, "great-success-zero-income-reach"),
  );
  if (greatSuccessProbability > 0) {
    const statPoints = greatSuccessProbability * GREAT_SUCCESS_STAT_DELTA;
    fixedStatPoints += statPoints;
    contributions.push({
      id: "great-success",
      sourceMetric: "great-success",
      value: greatSuccessProbability,
      statPoints,
    });
  }

  const gate16 = gateExpected(outcome, "gate16-crossed", "gate16-zero-income-reach");
  const gate18 = gateExpected(outcome, "gate18-crossed", "gate18-zero-income-reach");
  const unprojectedRewards: UtilityUnprojectedReward[] = [];

  if (gate16.projected) {
    coefficients.SCENARIO_EVENT_UTILITY += gate16.probability;
    contributions.push({
      id: "gate16",
      sourceMetric: "gate16",
      value: gate16.probability,
      statPoints:
        gate16.probability * calibration.SCENARIO_EVENT_UTILITY.value,
      parameter: "SCENARIO_EVENT_UTILITY",
    });
  } else {
    unprojectedRewards.push({ id: "gate16", reason: "not-projected" });
  }

  if (gate18.projected) {
    const fixed = gate18.probability * GATE18_STAT_DELTA;
    fixedStatPoints += fixed;
    coefficients.SCENARIO_SKILL_UTILITY += gate18.probability;
    contributions.push({
      id: "gate18-stat-delta",
      sourceMetric: "gate18",
      value: gate18.probability,
      statPoints: fixed,
    });
    contributions.push({
      id: "gate18-skill",
      sourceMetric: "gate18",
      value: gate18.probability,
      statPoints:
        gate18.probability * calibration.SCENARIO_SKILL_UTILITY.value,
      parameter: "SCENARIO_SKILL_UTILITY",
    });
  } else {
    unprojectedRewards.push({ id: "gate18", reason: "not-projected" });
  }

  const linearTerms: UtilityLinearTerms = { fixedStatPoints, coefficients };
  const nominalStatPoints =
    fixedStatPoints +
    (Object.keys(coefficients) as UtilityParameterId[]).reduce(
      (sum, id) => sum + coefficients[id] * calibration[id].value,
      0,
    );

  const friendshipInterval = calibration.FRIENDSHIP_EXPOSURE_STAT_RATE.calibrationInterval;
  const boundedCalibrationInterval = friendshipInterval
    ? ([
        nominalStatPoints +
          coefficients.FRIENDSHIP_EXPOSURE_STAT_RATE *
            (friendshipInterval[0] - calibration.FRIENDSHIP_EXPOSURE_STAT_RATE.value),
        nominalStatPoints +
          coefficients.FRIENDSHIP_EXPOSURE_STAT_RATE *
            (friendshipInterval[1] - calibration.FRIENDSHIP_EXPOSURE_STAT_RATE.value),
      ] as const)
    : null;

  return {
    tieId: outcome.tieId,
    projectionPolicy: PROJECTION_POLICY,
    utilityModel: UTILITY_MODEL,
    hardState: number(outcome, "hard-state"),
    riskAdmissibleState: number(outcome, "risk-admissible-state"),
    nominalStatPoints,
    boundedCalibrationInterval,
    contributions,
    linearTerms,
    freeParameters: [
      "SKILL_POINT_UTILITY",
      "SCENARIO_SKILL_UTILITY",
      "SCENARIO_EVENT_UTILITY",
    ],
    unprojectedRewards,
  };
};

const compareNumber = (left: number, right: number, epsilon = 1e-10): number =>
  Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1;

export const compareUtilityAssessments = (
  left: UtilityAssessment,
  right: UtilityAssessment,
): number =>
  compareNumber(left.hardState, right.hardState) ||
  compareNumber(left.riskAdmissibleState, right.riskAdmissibleState) ||
  compareNumber(left.nominalStatPoints, right.nominalStatPoints) ||
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

export const decisionVectorFromUtilityAssessment = (
  assessment: UtilityAssessment,
): DecisionVector => ({
  hard: assessment.hardState,
  riskAdmissible: assessment.riskAdmissibleState,
  structural: 0,
  continuation: [],
  retainedTokens: 0,
  committedCost: 0,
  utilityStatPoints: assessment.nominalStatPoints,
  tieId: assessment.tieId,
});

const utilityAtCalibration = (
  assessment: UtilityAssessment,
  calibration: UtilityCalibration,
  override: Partial<Record<UtilityParameterId, number>> = {},
): number => {
  let total = assessment.linearTerms.fixedStatPoints;
  for (const id of Object.keys(assessment.linearTerms.coefficients) as UtilityParameterId[]) {
    total +=
      assessment.linearTerms.coefficients[id] *
      (override[id] ?? calibration[id].value);
  }
  return total;
};

export type UtilityBreakpoint = {
  parameter: UtilityParameterId;
  value: number;
  scope: "fixed-projection-policy";
  projectionPolicy: typeof PROJECTION_POLICY;
  leftId: string;
  rightId: string;
  withinCalibrationInterval: boolean | null;
  withinAdmissibleDomain: boolean;
  epsilon: number;
  belowDelta: number;
  aboveDelta: number;
};

export const utilityBreakpointBetween = (
  left: UtilityAssessment,
  right: UtilityAssessment,
  parameter: UtilityParameterId,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): UtilityBreakpoint | null => {
  if (
    left.hardState !== right.hardState ||
    left.riskAdmissibleState !== right.riskAdmissibleState
  ) return null;
  const deltaCoefficient =
    left.linearTerms.coefficients[parameter] - right.linearTerms.coefficients[parameter];
  if (Math.abs(deltaCoefficient) <= 1e-12) return null;
  const deltaOther =
    utilityAtCalibration(left, calibration, { [parameter]: 0 }) -
    utilityAtCalibration(right, calibration, { [parameter]: 0 });
  const value = -deltaOther / deltaCoefficient;
  if (!Number.isFinite(value)) return null;
  const definition = calibration[parameter];
  const withinCalibrationInterval = definition.calibrationInterval
    ? value >= definition.calibrationInterval[0] &&
      value <= definition.calibrationInterval[1]
    : null;
  const withinAdmissibleDomain = value >= definition.minimum;
  const epsilon = Math.max(1e-6, Math.abs(value) * 1e-4);
  const below = value - epsilon;
  const above = value + epsilon;
  return {
    parameter,
    value,
    scope: "fixed-projection-policy",
    projectionPolicy: PROJECTION_POLICY,
    leftId: left.tieId,
    rightId: right.tieId,
    withinCalibrationInterval,
    withinAdmissibleDomain,
    epsilon,
    belowDelta:
      utilityAtCalibration(left, calibration, { [parameter]: below }) -
      utilityAtCalibration(right, calibration, { [parameter]: below }),
    aboveDelta:
      utilityAtCalibration(left, calibration, { [parameter]: above }) -
      utilityAtCalibration(right, calibration, { [parameter]: above }),
  };
};

export const utilityBreakpointsBetween = (
  left: UtilityAssessment,
  right: UtilityAssessment,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): UtilityBreakpoint[] =>
  (Object.keys(calibration) as UtilityParameterId[])
    .map((parameter) => utilityBreakpointBetween(left, right, parameter, calibration))
    .filter((value): value is UtilityBreakpoint =>
      Boolean(value && value.withinAdmissibleDomain && value.withinCalibrationInterval !== false),
    )
    .sort((a, b) => a.parameter.localeCompare(b.parameter));
