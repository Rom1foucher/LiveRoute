import {
  horizonMetricComponent,
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
  SKILL_POINT_UTILITY: { value: 1, kind: "free", minimum: 0 },
  SCENARIO_SKILL_UTILITY: { value: 0, kind: "free", minimum: 0 },
  SCENARIO_EVENT_UTILITY: { value: 0, kind: "free", minimum: 0 },
};

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
  reason: "not-crossed";
};

/**
 * T1b contains only deterministic consequences of the current action.
 * Generic training/click projections are intentionally absent and live in T2.
 */
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

/**
 * T2 is deliberately not a scalar utility. These values are generic behavioural
 * projections used only after factual/structural layers cannot separate two
 * actions. Friendship exposure is retained for diagnostics, but does not vote:
 * Friendship priority comes from structuralTier, not a fake stat conversion.
 */
export type GenericProjectionAssessment = {
  tieId: string;
  expectedPracticeStatDelta: number;
  expectedSkillPoints: number;
  friendshipExposure: number;
};

/** Full decision seam used by song policy after P3b2. */
export type LayeredDecisionAssessment = {
  tieId: string;
  utility: UtilityAssessment;
  structuralTier: number;
  visibleSongCost: number;
  futureTechniqueCostExpected: number;
  t2: GenericProjectionAssessment;
};

const number = (outcome: HorizonOutcome, metric: HorizonMetricId): number => {
  const component = horizonMetricComponent(outcome, metric);
  if (!component) return 0;
  if (typeof component.value === "number") return component.value;
  throw new Error(
    `Utility model cannot scalarize unresolved metric ${metric} for ${outcome.tieId}`,
  );
};

const zeroCoefficients = (): Record<UtilityParameterId, number> => ({
  SKILL_POINT_UTILITY: 0,
  SCENARIO_SKILL_UTILITY: 0,
  SCENARIO_EVENT_UTILITY: 0,
});

export const utilityAssessmentFromOutcome = (
  outcome: HorizonOutcome,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): UtilityAssessment => {
  const coefficients = zeroCoefficients();
  const contributions: UtilityContribution[] = [];
  let fixedStatPoints = 0;

  const immediateStats = number(outcome, "immediate-stat-delta");
  if (immediateStats !== 0) {
    fixedStatPoints += immediateStats;
    contributions.push({
      id: "immediate-stat-delta",
      sourceMetric: "immediate-stat-delta",
      value: immediateStats,
      statPoints: immediateStats,
    });
  }

  const immediateSkillPoints = number(outcome, "immediate-skill-points");
  if (immediateSkillPoints !== 0) {
    coefficients.SKILL_POINT_UTILITY += immediateSkillPoints;
    contributions.push({
      id: "immediate-skill-points",
      sourceMetric: "immediate-skill-points",
      value: immediateSkillPoints,
      statPoints: immediateSkillPoints * calibration.SKILL_POINT_UTILITY.value,
      parameter: "SKILL_POINT_UTILITY",
    });
  }

  const greatSuccessSecured = number(outcome, "great-success-secured") > 0 ? 1 : 0;
  if (greatSuccessSecured > 0) {
    const statPoints = GREAT_SUCCESS_STAT_DELTA;
    fixedStatPoints += statPoints;
    contributions.push({
      id: "great-success",
      sourceMetric: "great-success",
      value: 1,
      statPoints,
    });
  }

  const gate16Crossed = number(outcome, "gate16-crossed") > 0 ? 1 : 0;
  const gate18Crossed = number(outcome, "gate18-crossed") > 0 ? 1 : 0;
  const unprojectedRewards: UtilityUnprojectedReward[] = [];

  if (gate16Crossed) {
    coefficients.SCENARIO_EVENT_UTILITY += 1;
    contributions.push({
      id: "gate16",
      sourceMetric: "gate16",
      value: 1,
      statPoints: calibration.SCENARIO_EVENT_UTILITY.value,
      parameter: "SCENARIO_EVENT_UTILITY",
    });
  } else {
    unprojectedRewards.push({ id: "gate16", reason: "not-crossed" });
  }

  if (gate18Crossed) {
    fixedStatPoints += GATE18_STAT_DELTA;
    coefficients.SCENARIO_SKILL_UTILITY += 1;
    contributions.push({
      id: "gate18-stat-delta",
      sourceMetric: "gate18",
      value: 1,
      statPoints: GATE18_STAT_DELTA,
    });
    contributions.push({
      id: "gate18-skill",
      sourceMetric: "gate18",
      value: 1,
      statPoints: calibration.SCENARIO_SKILL_UTILITY.value,
      parameter: "SCENARIO_SKILL_UTILITY",
    });
  } else {
    unprojectedRewards.push({ id: "gate18", reason: "not-crossed" });
  }

  const linearTerms: UtilityLinearTerms = { fixedStatPoints, coefficients };
  const nominalStatPoints =
    fixedStatPoints +
    (Object.keys(coefficients) as UtilityParameterId[]).reduce(
      (sum, id) => sum + coefficients[id] * calibration[id].value,
      0,
    );

  return {
    tieId: outcome.tieId,
    projectionPolicy: PROJECTION_POLICY,
    utilityModel: UTILITY_MODEL,
    hardState: number(outcome, "hard-state"),
    riskAdmissibleState: number(outcome, "risk-admissible-state"),
    nominalStatPoints,
    boundedCalibrationInterval: null,
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

export const genericProjectionAssessmentFromOutcome = (
  outcome: HorizonOutcome,
): GenericProjectionAssessment => ({
  tieId: outcome.tieId,
  expectedPracticeStatDelta: number(outcome, "expected-practice-stat-delta"),
  expectedSkillPoints: number(outcome, "expected-skill-points"),
  friendshipExposure: number(outcome, "friendship-exposure"),
});

export const layeredDecisionAssessmentFromOutcome = (
  outcome: HorizonOutcome,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): LayeredDecisionAssessment => ({
  tieId: outcome.tieId,
  utility: utilityAssessmentFromOutcome(outcome, calibration),
  structuralTier: number(outcome, "structural-tier"),
  visibleSongCost: number(outcome, "visible-song-cost"),
  futureTechniqueCostExpected: number(outcome, "future-technique-cost-expected"),
  t2: genericProjectionAssessmentFromOutcome(outcome),
});

const compareNumber = (left: number, right: number, epsilon = 1e-10): number =>
  Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1;

/** Positive means left is preferred. Friendship exposure is diagnostic-only. */
export const compareGenericProjectionAssessments = (
  left: GenericProjectionAssessment,
  right: GenericProjectionAssessment,
): number =>
  compareNumber(left.expectedPracticeStatDelta, right.expectedPracticeStatDelta) ||
  compareNumber(left.expectedSkillPoints, right.expectedSkillPoints);

/**
 * P3b2 decision order. T2 cannot outrank a factual structural difference,
 * deterministic T1b reward, or the visible purchase expenditure. Future
 * technique spend remains zero-income telemetry until a named exchange rule is
 * justified; it must not become another hidden utility model.
 */
export const compareLayeredDecisionAssessments = (
  left: LayeredDecisionAssessment,
  right: LayeredDecisionAssessment,
): number =>
  compareNumber(left.utility.hardState, right.utility.hardState) ||
  compareNumber(left.utility.riskAdmissibleState, right.utility.riskAdmissibleState) ||
  compareNumber(left.structuralTier, right.structuralTier) ||
  compareNumber(left.utility.nominalStatPoints, right.utility.nominalStatPoints) ||
  compareNumber(right.visibleSongCost, left.visibleSongCost) ||
  compareGenericProjectionAssessments(left.t2, right.t2) ||
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

/** T1b-only comparison retained for calibration/diagnostic callers. */
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

export const utilityBreakpointFromLinearTerms = ({
  leftId,
  rightId,
  left,
  right,
  parameter,
  calibration = DEFAULT_UTILITY_CALIBRATION,
}: {
  leftId: string;
  rightId: string;
  left: UtilityLinearTerms;
  right: UtilityLinearTerms;
  parameter: UtilityParameterId;
  calibration?: UtilityCalibration;
}): UtilityBreakpoint | null => {
  const deltaCoefficient = left.coefficients[parameter] - right.coefficients[parameter];
  if (Math.abs(deltaCoefficient) <= 1e-12) return null;

  const utilityFromTerms = (
    terms: UtilityLinearTerms,
    override: Partial<Record<UtilityParameterId, number>>,
  ): number => {
    let total = terms.fixedStatPoints;
    for (const id of Object.keys(terms.coefficients) as UtilityParameterId[]) {
      total += terms.coefficients[id] * (override[id] ?? calibration[id].value);
    }
    return total;
  };

  const deltaOther =
    utilityFromTerms(left, { [parameter]: 0 }) -
    utilityFromTerms(right, { [parameter]: 0 });
  const value = -deltaOther / deltaCoefficient;
  if (!Number.isFinite(value)) return null;
  const definition = calibration[parameter];
  const withinCalibrationInterval = definition.calibrationInterval
    ? value >= definition.calibrationInterval[0] && value <= definition.calibrationInterval[1]
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
  };
};

export const utilityBreakpointsFromLinearTerms = ({
  leftId,
  rightId,
  left,
  right,
  calibration = DEFAULT_UTILITY_CALIBRATION,
}: {
  leftId: string;
  rightId: string;
  left: UtilityLinearTerms;
  right: UtilityLinearTerms;
  calibration?: UtilityCalibration;
}): UtilityBreakpoint[] =>
  (Object.keys(calibration) as UtilityParameterId[])
    .map((parameter) =>
      utilityBreakpointFromLinearTerms({
        leftId,
        rightId,
        left,
        right,
        parameter,
        calibration,
      }),
    )
    .filter((value): value is UtilityBreakpoint =>
      Boolean(value && value.withinAdmissibleDomain && value.withinCalibrationInterval !== false),
    )
    .sort((a, b) => a.parameter.localeCompare(b.parameter));

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
  return utilityBreakpointFromLinearTerms({
    leftId: left.tieId,
    rightId: right.tieId,
    left: left.linearTerms,
    right: right.linearTerms,
    parameter,
    calibration,
  });
};

export const utilityBreakpointsBetween = (
  left: UtilityAssessment,
  right: UtilityAssessment,
  calibration: UtilityCalibration = DEFAULT_UTILITY_CALIBRATION,
): UtilityBreakpoint[] => {
  if (
    left.hardState !== right.hardState ||
    left.riskAdmissibleState !== right.riskAdmissibleState
  ) return [];
  return utilityBreakpointsFromLinearTerms({
    leftId: left.tieId,
    rightId: right.tieId,
    left: left.linearTerms,
    right: right.linearTerms,
    calibration,
  });
};
