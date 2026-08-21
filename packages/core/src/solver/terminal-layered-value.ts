import type { TerminalTechniqueDecisionVector } from "../live-model.ts";
import type { CrossSectionTrialResult } from "./cross-section.ts";
import { isGreatSuccess } from "../domain/live-rules.ts";
import { SKILL_POINT_UTILITY } from "./utility-model.ts";

/**
 * Terminal P-T4 trial value.
 *
 * The terminal decision intentionally has no universal scalar. Structural
 * quality is represented by cumulative ordinal-tier indicators; deterministic
 * rewards share the explicit stat/SP numeraire; behavioural projections remain
 * a lower T2 tie-break. Raw token stock, Friendship exposure and song-count
 * checkpoints are telemetry only.
 */
export type TerminalLayeredTrialValue = {
  tieId: string;
  /** Best structural tier acquired before the outgoing Live in this trial. */
  currentStructuralTier: number;
  /** Cumulative ordinal indicators. Never averaged back into a tier score. */
  structuralAtLeast5: number;
  structuralAtLeast4: number;
  structuralAtLeast3: number;
  structuralAtLeast2: number;
  /** Deterministic current-section stat/SP reward, excluding discrete gates. */
  mechanicalStatPoints: number;
  immediateStatPoints: number;
  immediateSkillPoints: number;
  greatSuccessSecured: number;
  /** Generic behavioural projections; eligible only after upper layers tie. */
  expectedPracticeStatDelta: number;
  expectedSkillPoints: number;
};

export type TerminalLayeredTrialValueInput = {
  tieId: string;
  concertIndex: number;
  songsThisSection: number;
  currentSectionPurchases: number;
  currentStructuralTier: number;
  currentImmediateStatPoints: number;
  currentImmediateSkillPoints: number;
  result: CrossSectionTrialResult;
};

const binary = (value: boolean): number => (value ? 1 : 0);

export const terminalLayeredTrialValue = ({
  tieId,
  concertIndex,
  songsThisSection,
  currentSectionPurchases,
  currentStructuralTier,
  currentImmediateStatPoints,
  currentImmediateSkillPoints,
  result,
}: TerminalLayeredTrialValueInput): TerminalLayeredTrialValue => {
  const tier = Math.max(0, currentStructuralTier);
  const greatSuccess = binary(
    isGreatSuccess(concertIndex, songsThisSection + currentSectionPurchases),
  );
  const mechanicalStatPoints =
    Math.max(0, currentImmediateStatPoints) +
    Math.max(0, currentImmediateSkillPoints) * SKILL_POINT_UTILITY;

  return {
    tieId,
    currentStructuralTier: tier,
    structuralAtLeast5: binary(tier >= 5),
    structuralAtLeast4: binary(tier >= 4),
    structuralAtLeast3: binary(tier >= 3),
    structuralAtLeast2: binary(tier >= 2),
    mechanicalStatPoints,
    immediateStatPoints: Math.max(0, currentImmediateStatPoints),
    immediateSkillPoints: Math.max(0, currentImmediateSkillPoints),
    greatSuccessSecured: greatSuccess,
    expectedPracticeStatDelta: Math.max(0, result.practiceTrainingExposure),
    expectedSkillPoints: Math.max(0, result.spTrainingExposure),
  };
};

const compareNumber = (left: number, right: number, epsilon = 1e-10): number =>
  Math.abs(left - right) <= epsilon ? 0 : left > right ? 1 : -1;

/**
 * Deterministic comparator used only to choose the best action on one already
 * exposed page inside one CRN trial. This is not the PUSH-vs-STOP comparator.
 * It mirrors P3b2: structure, deterministic reward, then generic T2.
 */
export const compareTerminalLayeredTrialValues = (
  left: TerminalLayeredTrialValue,
  right: TerminalLayeredTrialValue,
): number =>
  compareNumber(left.structuralAtLeast5, right.structuralAtLeast5) ||
  compareNumber(left.structuralAtLeast4, right.structuralAtLeast4) ||
  compareNumber(left.structuralAtLeast3, right.structuralAtLeast3) ||
  compareNumber(left.structuralAtLeast2, right.structuralAtLeast2) ||
  compareNumber(left.mechanicalStatPoints, right.mechanicalStatPoints) ||
  compareNumber(
    left.expectedPracticeStatDelta,
    right.expectedPracticeStatDelta,
  ) ||
  compareNumber(left.expectedSkillPoints, right.expectedSkillPoints) ||
  (left.tieId === right.tieId ? 0 : left.tieId < right.tieId ? 1 : -1);

export type TerminalLayeredMetricId =
  | "great-success-secured"
  | "structural-tier-5"
  | "structural-tier-4"
  | "structural-tier-3"
  | "structural-tier-2"
  | "mechanical-reward"
  | "t2-practice"
  | "t2-skill-points";

export const TERMINAL_LAYERED_METRIC_ORDER: readonly TerminalLayeredMetricId[] = [
  "great-success-secured",
  "structural-tier-5",
  "structural-tier-4",
  "structural-tier-3",
  "structural-tier-2",
  "mechanical-reward",
  "t2-practice",
  "t2-skill-points",
];

export const terminalLayeredMetricValue = (
  value: TerminalLayeredTrialValue,
  metric: TerminalLayeredMetricId,
): number => {
  switch (metric) {
    case "great-success-secured":
      return value.greatSuccessSecured;
    case "structural-tier-5":
      return value.structuralAtLeast5;
    case "structural-tier-4":
      return value.structuralAtLeast4;
    case "structural-tier-3":
      return value.structuralAtLeast3;
    case "structural-tier-2":
      return value.structuralAtLeast2;
    case "mechanical-reward":
      return value.mechanicalStatPoints;
    case "t2-practice":
      return value.expectedPracticeStatDelta;
    case "t2-skill-points":
      return value.expectedSkillPoints;
  }
};

export type TerminalLayeredMetricState =
  | "push-above"
  | "stop-above"
  | "materially-equal"
  | "not-separated";

export type TerminalLayeredMetricEvidence = {
  metric: TerminalLayeredMetricId;
  mean: number;
  interval: readonly [number, number];
  materialDelta: number;
  state: TerminalLayeredMetricState;
};

export type TerminalLayeredDecision = {
  action: "expose-and-carry" | "stop-now";
  separated: boolean;
  layer: "gate" | "structural" | "mechanical" | "t2" | "none";
  metric: TerminalLayeredMetricId | null;
  reason:
    | "structural-dominance"
    | "mechanical-reward"
    | "generic-t2-tiebreak"
    | "monte-carlo-not-separated"
    | "no-material-difference";
  evidence: readonly TerminalLayeredMetricEvidence[];
};

/** Existing probability metrics already use 5-point bands elsewhere. */
export const TERMINAL_STRUCTURAL_MATERIAL_DELTA = 0.05;
/** Half a stat point is beneath the resolution needed to drive terminal policy. */
export const TERMINAL_MECHANICAL_MATERIAL_DELTA = 0.5;
export const TERMINAL_T2_MATERIAL_DELTA = 0.5;

export const classifyTerminalLayeredMetric = ({
  metric,
  mean,
  interval,
}: {
  metric: TerminalLayeredMetricId;
  mean: number;
  interval: readonly [number, number];
}): TerminalLayeredMetricEvidence => {
  const materialDelta =
    metric === "great-success-secured" || metric.startsWith("structural-")
      ? TERMINAL_STRUCTURAL_MATERIAL_DELTA
    : metric === "mechanical-reward"
      ? TERMINAL_MECHANICAL_MATERIAL_DELTA
      : TERMINAL_T2_MATERIAL_DELTA;
  const [lower, upper] = interval;
  const state: TerminalLayeredMetricState =
    lower > materialDelta
      ? "push-above"
      : upper < -materialDelta
        ? "stop-above"
        : lower >= -materialDelta && upper <= materialDelta
          ? "materially-equal"
          : "not-separated";
  return { metric, mean, interval, materialDelta, state };
};

/**
 * Decision hierarchy for aggregate paired evidence.
 *
 * A statistically unresolved upper layer blocks every lower layer. Lower T2
 * projections are therefore incapable of overruling uncertain structure or
 * deterministic reward. Cumulative structural thresholds encode the existing
 * ordinal tiers without averaging tier numbers or inventing exchange rates.
 */
export const decideTerminalLayeredEvidence = (
  evidence: readonly TerminalLayeredMetricEvidence[],
): TerminalLayeredDecision => {
  const byMetric = new Map(evidence.map((item) => [item.metric, item]));
  const greatSuccess = byMetric.get("great-success-secured")!;
  if (greatSuccess.state === "not-separated") {
    return {
      action: "stop-now",
      separated: false,
      layer: "gate",
      metric: greatSuccess.metric,
      reason: "monte-carlo-not-separated",
      evidence,
    };
  }
  if (greatSuccess.state === "push-above" || greatSuccess.state === "stop-above") {
    return {
      action:
        greatSuccess.state === "push-above" ? "expose-and-carry" : "stop-now",
      separated: true,
      layer: "gate",
      metric: greatSuccess.metric,
      reason: "mechanical-reward",
      evidence,
    };
  }

  const structural = TERMINAL_LAYERED_METRIC_ORDER.slice(1, 5).map(
    (metric) => byMetric.get(metric)!,
  );
  for (const item of structural) {
    if (item.state === "not-separated") {
      return {
        action: "stop-now",
        separated: false,
        layer: "structural",
        metric: item.metric,
        reason: "monte-carlo-not-separated",
        evidence,
      };
    }
    if (item.state === "push-above" || item.state === "stop-above") {
      return {
        action:
          item.state === "push-above" ? "expose-and-carry" : "stop-now",
        separated: true,
        layer: "structural",
        metric: item.metric,
        reason: "structural-dominance",
        evidence,
      };
    }
  }

  const mechanical = byMetric.get("mechanical-reward")!;
  if (mechanical.state === "not-separated") {
    return {
      action: "stop-now",
      separated: false,
      layer: "mechanical",
      metric: mechanical.metric,
      reason: "monte-carlo-not-separated",
      evidence,
    };
  }
  if (
    mechanical.state === "push-above" ||
    mechanical.state === "stop-above"
  ) {
    return {
      action:
        mechanical.state === "push-above" ? "expose-and-carry" : "stop-now",
      separated: true,
      layer: "mechanical",
      metric: mechanical.metric,
      reason: "mechanical-reward",
      evidence,
    };
  }

  for (const metric of ["t2-practice", "t2-skill-points"] as const) {
    const item = byMetric.get(metric)!;
    if (item.state === "not-separated") {
      return {
        action: "stop-now",
        separated: false,
        layer: "t2",
        metric,
        reason: "monte-carlo-not-separated",
        evidence,
      };
    }
    if (item.state === "push-above" || item.state === "stop-above") {
      return {
        action:
          item.state === "push-above" ? "expose-and-carry" : "stop-now",
        separated: true,
        layer: "t2",
        metric,
        reason: "generic-t2-tiebreak",
        evidence,
      };
    }
  }

  return {
    action: "stop-now",
    separated: false,
    layer: "none",
    metric: null,
    reason: "no-material-difference",
    evidence,
  };
};
export const terminalTechniqueDecisionVector = ({
  pushRecommended,
  riskState,
  layeredState,
  metricMeans,
}: {
  pushRecommended: boolean;
  riskState: 0 | 1 | 2;
  layeredState: 0 | 1 | 2;
  metricMeans: Readonly<Record<TerminalLayeredMetricId, number>>;
}): TerminalTechniqueDecisionVector => [
  pushRecommended ? 1 : 0,
  riskState,
  layeredState,
  metricMeans["great-success-secured"],
  metricMeans["structural-tier-5"],
  metricMeans["structural-tier-4"],
  metricMeans["structural-tier-3"],
  metricMeans["structural-tier-2"],
  metricMeans["mechanical-reward"],
  metricMeans["t2-practice"],
  metricMeans["t2-skill-points"],
];
