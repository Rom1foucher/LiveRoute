import type { TokenKey } from "../live-model.ts";
import type { DecisionVector } from "./value.ts";

/**
 * P3b1/T1a canonical representation of horizon consequences.
 *
 * Mechanical quantities are typed by unit and provenance. A MetricId owns one
 * global unit and one global transform. The temporary P3b1 decision bridge is
 * deliberately stored in a separate table so P3b2 can delete lexicographic
 * ordering without changing mechanical outcome production.
 */
export type OutcomeUnit =
  | "stat-point"
  | "skill-point"
  | "friendship-pt-training"
  | "token"
  | "count"
  | "probability";

export type OutcomeProvenance =
  | "observed"
  | "deterministic-consequence"
  | "zero-income-projection";

export type OutcomeInterval = {
  lower: number;
  upper: number;
};

export type OutcomeUnknown = {
  kind: "unknown";
  source: string;
};

export type OutcomeValue = number | OutcomeInterval | OutcomeUnknown;

export type OutcomeUncertainty =
  | { kind: "none" }
  | { kind: "monte-carlo"; couplingKey: string }
  | { kind: "interval" }
  | { kind: "calibration"; parameter: string }
  | { kind: "unknown"; source: string };

/**
 * P3b1 keeps only transforms that are globally meaningful for one semantic
 * metric. Action-specific transforms from the P3a compatibility layer are
 * intentionally absent.
 */
export type TransformId = "identity" | "probability-band-5pct";

export type HorizonMetricId =
  | "hard-state"
  | "risk-admissible-state"
  | "structural-tier"
  | "expected-practice-stat-delta"
  | "expected-skill-points"
  | "friendship-exposure"
  | "great-success-secured"
  | "great-success-zero-income-reach"
  | "hunt-state-rank"
  | "hunt-target-probability"
  | "hunt-abandonment-without-purchase"
  | "pacing-state-rank"
  | "pacing-risk-rank"
  | "immediate-activation-priority"
  | "next-section-completion-state"
  | "next-section-friendship10-probability"
  | "next-section-target-probability"
  | "next-section-structural-purchases"
  | "next-section-purchases"
  | "current-target-probability"
  | "immediate-target-probability"
  | "current-any-affordable-probability"
  | "current-best-structural-tier"
  | "carried-page-preserved"
  | "carry-without-opportunity-delay"
  | "final-gauge-zero-income-reach"
  | "next-page-zero-income-reach"
  | "continuation-coverage-probability"
  | "retained-tokens"
  | "visible-song-cost"
  | "future-technique-cost-expected"
  | `immediate-funding-gap:${TokenKey}`;

type StaticHorizonMetricId = Exclude<
  HorizonMetricId,
  `immediate-funding-gap:${TokenKey}`
>;

type MechanicalMetricContract = {
  unit: OutcomeUnit;
  transform: TransformId;
};

const probabilityMetric = {
  unit: "probability",
  transform: "probability-band-5pct",
} as const;
const countMetric = { unit: "count", transform: "identity" } as const;
const tokenMetric = { unit: "token", transform: "identity" } as const;

const metricContracts = {
  "hard-state": countMetric,
  "risk-admissible-state": countMetric,
  "structural-tier": countMetric,
  "expected-practice-stat-delta": {
    unit: "stat-point",
    transform: "identity",
  },
  "expected-skill-points": { unit: "skill-point", transform: "identity" },
  "friendship-exposure": {
    unit: "friendship-pt-training",
    transform: "identity",
  },
  "great-success-secured": countMetric,
  "great-success-zero-income-reach": probabilityMetric,
  "hunt-state-rank": countMetric,
  "hunt-target-probability": probabilityMetric,
  "hunt-abandonment-without-purchase": countMetric,
  "pacing-state-rank": countMetric,
  "pacing-risk-rank": countMetric,
  "immediate-activation-priority": countMetric,
  "next-section-completion-state": countMetric,
  "next-section-friendship10-probability": probabilityMetric,
  "next-section-target-probability": probabilityMetric,
  "next-section-structural-purchases": countMetric,
  "next-section-purchases": countMetric,
  "current-target-probability": probabilityMetric,
  "immediate-target-probability": probabilityMetric,
  "current-any-affordable-probability": probabilityMetric,
  "current-best-structural-tier": countMetric,
  "carried-page-preserved": countMetric,
  "carry-without-opportunity-delay": countMetric,
  "final-gauge-zero-income-reach": probabilityMetric,
  "next-page-zero-income-reach": probabilityMetric,
  "continuation-coverage-probability": probabilityMetric,
  "retained-tokens": tokenMetric,
  "visible-song-cost": tokenMetric,
  "future-technique-cost-expected": tokenMetric,
} as const satisfies Record<StaticHorizonMetricId, MechanicalMetricContract>;

const fundingGapContract: MechanicalMetricContract = tokenMetric;

/** Mechanical contract only: decision placement is intentionally separate. */
export const metricContract = (
  metric: HorizonMetricId,
): MechanicalMetricContract => {
  if (metric.startsWith("immediate-funding-gap:")) return fundingGapContract;
  const contract = metricContracts[metric as StaticHorizonMetricId];
  if (!contract) throw new Error(`Unknown HorizonOutcome metric ${metric}`);
  return contract;
};

export type HorizonOutcomeComponent = {
  metric: HorizonMetricId;
  value: OutcomeValue;
  unit: OutcomeUnit;
  provenance: OutcomeProvenance;
  transform: TransformId;
  uncertainty: OutcomeUncertainty;
};

export type HorizonOutcome = {
  tieId: string;
  components: readonly HorizonOutcomeComponent[];
};

export const outcomeComponent = (
  metric: HorizonMetricId,
  value: OutcomeValue,
  provenance: OutcomeProvenance,
  uncertainty: OutcomeUncertainty = { kind: "none" },
): HorizonOutcomeComponent => {
  const contract = metricContract(metric);
  return {
    metric,
    value,
    unit: contract.unit,
    provenance,
    transform: contract.transform,
    uncertainty,
  };
};

export const createHorizonOutcome = ({
  tieId,
  components,
}: {
  tieId: string;
  components: readonly HorizonOutcomeComponent[];
}): HorizonOutcome => {
  const seen = new Set<HorizonMetricId>();
  for (const component of components) {
    if (seen.has(component.metric)) {
      throw new Error(
        `HorizonOutcome ${tieId} contains duplicate metric ${component.metric}`,
      );
    }
    seen.add(component.metric);
    const contract = metricContract(component.metric);
    if (component.unit !== contract.unit) {
      throw new Error(
        `HorizonOutcome metric ${component.metric} must use unit ${contract.unit}, got ${component.unit}`,
      );
    }
    if (component.transform !== contract.transform) {
      throw new Error(
        `HorizonOutcome metric ${component.metric} must use transform ${contract.transform}, got ${component.transform}`,
      );
    }
  }
  return { tieId, components: [...components] };
};

export const horizonMetricComponents = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): readonly HorizonOutcomeComponent[] =>
  outcome.components.filter((component) => component.metric === metric);

export const horizonMetricComponent = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): HorizonOutcomeComponent | undefined =>
  outcome.components.find((component) => component.metric === metric);

export const horizonMetricNumber = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): number | null => {
  const value = horizonMetricComponent(outcome, metric)?.value;
  return typeof value === "number" ? value : null;
};

/**
 * Temporary P3b1 ordering only. This is not part of the mechanical contract and
 * is expected to disappear when P3b2 introduces explicit utility.
 */
type DecisionBridgeLane =
  | "hard"
  | "risk-admissible"
  | "structural"
  | "certain"
  | "prospective"
  | "continuation";

type DecisionBridgePosition = {
  lane: DecisionBridgeLane;
  order: number;
};

const p3b1DecisionBridge = {
  "hard-state": { lane: "hard", order: 0 },
  "risk-admissible-state": { lane: "risk-admissible", order: 0 },
  "structural-tier": { lane: "structural", order: 0 },

  // Discrete policy/gate state stays ahead of continuous projections. This
  // preserves hard strategic ordering without assigning token utility.
  "hunt-state-rank": { lane: "certain", order: 0 },
  "hunt-abandonment-without-purchase": { lane: "certain", order: 1 },
  "pacing-state-rank": { lane: "certain", order: 2 },
  "pacing-risk-rank": { lane: "certain", order: 3 },
  "immediate-activation-priority": { lane: "certain", order: 4 },
  "great-success-secured": { lane: "certain", order: 5 },

  "hunt-target-probability": { lane: "prospective", order: 0 },
  "great-success-zero-income-reach": { lane: "prospective", order: 1 },
  // Reaching the section objective is a discrete gate, not an exchange rate
  // against projected stat or skill-point output.
  "next-section-completion-state": { lane: "prospective", order: 2 },
  "next-section-friendship10-probability": { lane: "prospective", order: 3 },
  "next-section-target-probability": { lane: "prospective", order: 4 },
  "expected-practice-stat-delta": { lane: "prospective", order: 5 },
  // Carrying a non-opportunity page saves the inherited technique without
  // postponing a target. Keep this explicit and below real stat yield.
  "carry-without-opportunity-delay": { lane: "prospective", order: 6 },
  "expected-skill-points": { lane: "prospective", order: 7 },
  "friendship-exposure": { lane: "prospective", order: 8 },
  "next-section-structural-purchases": { lane: "prospective", order: 9 },
  "next-section-purchases": { lane: "prospective", order: 10 },

  "final-gauge-zero-income-reach": { lane: "continuation", order: 0 },
  "current-target-probability": { lane: "continuation", order: 1 },
  "immediate-target-probability": { lane: "continuation", order: 2 },
  "current-any-affordable-probability": { lane: "continuation", order: 3 },
  "current-best-structural-tier": { lane: "continuation", order: 4 },
  "next-page-zero-income-reach": { lane: "continuation", order: 5 },
  "continuation-coverage-probability": { lane: "continuation", order: 6 },
} as const satisfies Partial<Record<StaticHorizonMetricId, DecisionBridgePosition>>;

const decisionBridgePosition = (
  metric: HorizonMetricId,
): DecisionBridgePosition | null =>
  p3b1DecisionBridge[metric as keyof typeof p3b1DecisionBridge] ?? null;

const probabilityBand = (value: number): number => Math.round(value / 0.05);

const transformedNumber = (component: HorizonOutcomeComponent): number => {
  if (typeof component.value !== "number") {
    throw new Error(
      `Decision metric ${component.metric} is not numerically separated in ${component.provenance}`,
    );
  }
  switch (component.transform) {
    case "identity":
      return component.value;
    case "probability-band-5pct":
      return probabilityBand(component.value);
  }
};

const metricsForLane = (
  lane: "certain" | "prospective" | "continuation",
): StaticHorizonMetricId[] =>
  (Object.keys(p3b1DecisionBridge) as Array<
    keyof typeof p3b1DecisionBridge
  >)
    .filter((metric) => p3b1DecisionBridge[metric].lane === lane)
    .sort(
      (left, right) =>
        p3b1DecisionBridge[left].order - p3b1DecisionBridge[right].order,
    );

const decisionLaneValues = (
  outcome: HorizonOutcome,
  lane: "certain" | "prospective" | "continuation",
): number[] => {
  const byMetric = new Map(
    outcome.components.map((component) => [component.metric, component]),
  );
  return metricsForLane(lane).map((metric) => {
    const component = byMetric.get(metric);
    return component ? transformedNumber(component) : 0;
  });
};

const scalarDecisionMetric = (
  outcome: HorizonOutcome,
  lane: "hard" | "risk-admissible" | "structural",
): number => {
  const component = outcome.components.find(
    (candidate) => decisionBridgePosition(candidate.metric)?.lane === lane,
  );
  return component ? transformedNumber(component) : 0;
};

/**
 * Temporary T1a -> DecisionVector bridge.
 *
 * This is not the P3a compatibility adapter: actions no longer provide their
 * own lanes or transforms. Mechanical MetricIds are canonical and this one
 * removable table supplies only the interim lexicographic ordering. Token
 * state is deliberately absent from the bridge, so retained balance and raw
 * cost cannot become generic utility.
 */
export const decisionVectorFromOutcome = (
  outcome: HorizonOutcome,
): DecisionVector => {
  const certain = decisionLaneValues(outcome, "certain");
  const prospective = decisionLaneValues(outcome, "prospective");
  const continuation = decisionLaneValues(outcome, "continuation");
  return {
    hard: scalarDecisionMetric(outcome, "hard"),
    riskAdmissible: scalarDecisionMetric(outcome, "risk-admissible"),
    structural: scalarDecisionMetric(outcome, "structural"),
    certain: certain.length > 0 ? certain : undefined,
    prospective: prospective.length > 0 ? prospective : undefined,
    continuation,
    retainedTokens: 0,
    committedCost: 0,
    tieId: outcome.tieId,
  };
};

/** Build/test guards for P3b1 invariants 3, 5 and 6. */
export const assertHorizonMetricContracts = (): void => {
  for (const metric of Object.keys(metricContracts) as StaticHorizonMetricId[]) {
    const contract = metricContract(metric);
    if (contract.unit !== metricContracts[metric].unit) {
      throw new Error(`Metric ${metric} has an unstable unit`);
    }
    if (contract.transform !== metricContracts[metric].transform) {
      throw new Error(`Metric ${metric} has an unstable transform`);
    }
  }
  for (const token of [
    "dance",
    "passion",
    "vocal",
    "visual",
    "mental",
  ] as const) {
    const metric: HorizonMetricId = `immediate-funding-gap:${token}`;
    const contract = metricContract(metric);
    if (contract.unit !== "token" || contract.transform !== "identity") {
      throw new Error(`Funding gap metric ${token} violates the token contract`);
    }
    if (decisionBridgePosition(metric) !== null) {
      throw new Error(`Funding gap metric ${token} leaked into decision utility`);
    }
  }

  for (const metric of [
    "retained-tokens",
    "visible-song-cost",
    "future-technique-cost-expected",
  ] as const) {
    if (decisionBridgePosition(metric) !== null) {
      throw new Error(`Token metric ${metric} leaked into decision utility`);
    }
  }

  const positions = new Set<string>();
  for (const [metric, position] of Object.entries(p3b1DecisionBridge)) {
    const key = `${position.lane}:${position.order}`;
    if (positions.has(key)) {
      throw new Error(`Decision bridge position ${key} is duplicated at ${metric}`);
    }
    positions.add(key);
  }
};
