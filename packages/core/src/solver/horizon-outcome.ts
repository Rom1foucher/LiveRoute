import type { TokenKey } from "../live-model.ts";

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
  | "zero-income-projection"
  | "generic-behavioral-projection";

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
  | "immediate-stat-delta"
  | "immediate-skill-points"
  | "expected-practice-stat-delta"
  | "expected-skill-points"
  | "friendship-exposure"
  | "great-success-secured"
  | "great-success-zero-income-reach"
  | "gate16-crossed"
  | "gate16-zero-income-reach"
  | "gate18-crossed"
  | "gate18-zero-income-reach"
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
  "immediate-stat-delta": { unit: "stat-point", transform: "identity" },
  "immediate-skill-points": { unit: "skill-point", transform: "identity" },
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
  "gate16-crossed": countMetric,
  "gate16-zero-income-reach": probabilityMetric,
  "gate18-crossed": countMetric,
  "gate18-zero-income-reach": probabilityMetric,
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

/** Build/test guards for T1a unit/transform invariants. */
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
  }
};
