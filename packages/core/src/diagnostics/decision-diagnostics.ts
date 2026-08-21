import {
  TOKEN_KEYS,
  type AnalysisResult,
  type Balance,
  type FundingGapDistribution,
  type PhysicalFundingFeasibility,
  type TerminalTechniqueDecisionSummary,
} from "../live-model.ts";
import { wilsonIntervalFromProbability } from "../monte-carlo.ts";
import {
  horizonMetricComponent,
  type HorizonMetricId,
  type HorizonOutcome,
  type HorizonOutcomeComponent,
  type OutcomeInterval,
} from "../solver/horizon-outcome.ts";
import {
  DEFAULT_UTILITY_CALIBRATION,
  PROJECTION_POLICY,
  UTILITY_MODEL,
  type UtilityAssessment,
  type UtilityBreakpoint,
  type UtilityParameter,
  type UtilityParameterId,
} from "../solver/utility-model.ts";
import {
  ROBUSTNESS_POLICY,
  type CoRecommendationReason,
  type PairedUtilityRobustness,
} from "../solver/robustness.ts";
import type {
  SongPolicyEvaluation,
  SongPolicyResult,
} from "../solver/song-policy.ts";
import type { TechniqueRankReason } from "../solver/technique-dp.ts";

/** Canonical P6 payload embedded in decision-log schema v5 candidates. */
export const DECISION_DIAGNOSTIC_SCHEMA =
  "grand-live-decision-diagnostic-v1" as const;

export type DiagnosticUnavailableReason =
  | "not-applicable"
  | "not-materialized-on-analysis-path"
  | "not-materialized-on-song-policy-path"
  | "not-materialized-on-terminal-aggregate"
  | "terminal-compatibility-path"
  | "conditioning-event-unavailable";

export type DiagnosticAvailability<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: DiagnosticUnavailableReason };

export type CanonicalPhysicalFeasibility = {
  physicalAffordable: boolean | null;
  immediateFundingGap: Balance | null;
  weightedFundingGap: number | null;
};

export type CanonicalFundingDiagnostics = {
  /** The current concrete action is already visible when this is 1. */
  currentActionAppearanceProbability: DiagnosticAvailability<number>;
  /** Projection for the next relevant target/page; not conflated with current visibility. */
  projectedAppearanceProbability: DiagnosticAvailability<number>;
  zeroIncomeFundabilityProbability: DiagnosticAvailability<number>;
  zeroIncomeFundingGap: DiagnosticAvailability<FundingGapDistribution>;
  /** Per-song distributions preserve colour structure when no single aggregate gap exists. */
  zeroIncomeFundingGapBySong: readonly {
    songId: string;
    distribution: FundingGapDistribution;
  }[];
};

export type GateId = "great-success" | "gate16" | "gate18";

export type CanonicalGateReward = {
  statDelta: number;
  skillPointDelta: number;
  residualUtilityParameter: string | null;
};

export type CanonicalZeroIncomeReach = {
  label: "zero-income-conservative-estimate";
  mean: number;
  interval: OutcomeInterval | null;
  samples: number | null;
  couplingKey: string | null;
};

export type CanonicalGateDiagnostics = {
  id: GateId;
  deadline:
    | "current-promotional-live"
    | "grand-live-event-gate"
    | "senior-early-december";
  crossedByAction: boolean;
  /** A projected probability is not promoted to a physical proof. */
  provenReachable: boolean | "unknown";
  zeroIncomeReach: DiagnosticAvailability<CanonicalZeroIncomeReach>;
  reward: CanonicalGateReward;
};

export type CanonicalT1aDiagnostics = {
  tieId: string;
  components: readonly HorizonOutcomeComponent[];
};

export type CanonicalCalibrationParameter = Pick<
  UtilityParameter,
  "value" | "kind" | "minimum"
> & {
  id: UtilityParameterId;
  calibrationInterval?: OutcomeInterval;
};

export type CanonicalT1bDiagnostics = {
  projectionPolicy: typeof PROJECTION_POLICY;
  utilityModel: typeof UTILITY_MODEL;
  nominalStatPoints: number;
  boundedCalibrationInterval: OutcomeInterval;
  contributions: UtilityAssessment["contributions"];
  linearTerms: UtilityAssessment["linearTerms"];
  freeParameters: UtilityAssessment["freeParameters"];
  unprojectedRewards: UtilityAssessment["unprojectedRewards"];
  calibration: readonly CanonicalCalibrationParameter[];
  breakpoints: readonly UtilityBreakpoint[];
};

export type CanonicalT2Diagnostics = {
  expectedPracticeStatDelta: number;
  expectedSkillPoints: number;
  friendshipExposure: number;
  /** Friendship is retained as telemetry; structuralTier owns its priority. */
  friendshipExposureAffectsRanking: false;
};

export type DecisionSeparationLayer =
  | "action-validity"
  | "physical-feasibility"
  | "hard-state"
  | "risk-admissibility"
  | "structural-tier"
  | "utility"
  | "visible-song-cost"
  | "generic-projection"
  | "robustness"
  | "stable-tie-break"
  | "legacy-technique-ranking"
  | "not-separated"
  | "self";

export type CanonicalRiskAdmissionDiagnostics = {
  threshold: number;
  reachProbability: number;
  interval: OutcomeInterval;
  confidenceLevel: 0.95;
  separation: "above" | "below" | "not-separated";
};

export type CanonicalRobustnessDiagnostics = {
  policy: typeof ROBUSTNESS_POLICY;
  paired: PairedUtilityRobustness | null;
  riskAdmission: DiagnosticAvailability<CanonicalRiskAdmissionDiagnostics>;
  calibration: readonly CanonicalCalibrationParameter[];
  breakpoints: readonly UtilityBreakpoint[];
  coRecommendationReason: CoRecommendationReason | null;
  calibrationSensitiveParameters: readonly string[];
};

export type CanonicalDecisionDiagnostics = {
  schema: typeof DECISION_DIAGNOSTIC_SCHEMA;
  modelCoverage:
    | "full-t1a-t1b"
    | "full-t1a-t1b-t2"
    | "physical-projection-only"
    | "terminal-aggregate";
  action: {
    id: string;
    kind: string;
    physicalFeasibility: CanonicalPhysicalFeasibility;
  };
  versions: {
    projectionPolicy: typeof PROJECTION_POLICY;
    utilityModel: typeof UTILITY_MODEL;
    robustnessPolicy: typeof ROBUSTNESS_POLICY;
  };
  funding: CanonicalFundingDiagnostics;
  t1a: DiagnosticAvailability<CanonicalT1aDiagnostics>;
  t1b: DiagnosticAvailability<CanonicalT1bDiagnostics>;
  t2: DiagnosticAvailability<CanonicalT2Diagnostics>;
  gates: DiagnosticAvailability<readonly CanonicalGateDiagnostics[]>;
  robustness: CanonicalRobustnessDiagnostics;
  separation: {
    comparedTo: string | null;
    /** First layer that separated this candidate in its caller-level ranking. */
    firstSeparatingLayer: DecisionSeparationLayer;
    /** Terminal STOP/PUSH separation when a terminal aggregate exists. */
    terminalFirstSeparatingLayer: DecisionSeparationLayer | null;
    sourceRankReasonCode: TechniqueRankReason | null;
  };
};

const unavailable = <T>(
  reason: DiagnosticUnavailableReason,
): DiagnosticAvailability<T> => ({ status: "unavailable", reason });

const available = <T>(value: T): DiagnosticAvailability<T> => ({
  status: "available",
  value,
});

const cloneBalance = (balance: Balance): Balance =>
  Object.fromEntries(TOKEN_KEYS.map((key) => [key, balance[key]])) as Balance;

const calibrationSnapshot = (): CanonicalCalibrationParameter[] =>
  (
    Object.entries(DEFAULT_UTILITY_CALIBRATION) as [
      UtilityParameterId,
      UtilityParameter,
    ][]
  ).map(([id, parameter]) => ({
    id,
    value: parameter.value,
    kind: parameter.kind,
    calibrationInterval: parameter.calibrationInterval
      ? {
          lower: parameter.calibrationInterval[0],
          upper: parameter.calibrationInterval[1],
        }
      : undefined,
    minimum: parameter.minimum,
  }));

const boundedCalibrationOutcomeInterval = (
  interval: readonly [number, number] | null,
  nominalStatPoints: number,
): OutcomeInterval =>
  interval
    ? { lower: interval[0], upper: interval[1] }
    : { lower: nominalStatPoints, upper: nominalStatPoints };

const physicalFromFunding = (
  funding: PhysicalFundingFeasibility | undefined,
): CanonicalPhysicalFeasibility =>
  funding
    ? {
        physicalAffordable: funding.physicalAffordable,
        immediateFundingGap: cloneBalance(funding.immediateFundingGap),
        weightedFundingGap: funding.weightedFundingGap,
      }
    : {
        physicalAffordable: null,
        immediateFundingGap: null,
        weightedFundingGap: null,
      };

const metricBoolean = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): boolean => {
  const value = horizonMetricComponent(outcome, metric)?.value;
  return typeof value === "number" && value > 0;
};

const metricProbability = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): { mean: number; couplingKey: string | null } | null => {
  const component = horizonMetricComponent(outcome, metric);
  if (!component || typeof component.value !== "number") return null;
  return {
    mean: Math.max(0, Math.min(1, component.value)),
    couplingKey:
      component.uncertainty.kind === "monte-carlo"
        ? component.uncertainty.couplingKey
        : null,
  };
};

const zeroIncomeReach = ({
  outcome,
  metric,
  samples,
}: {
  outcome: HorizonOutcome;
  metric: HorizonMetricId;
  samples: number | null;
}): DiagnosticAvailability<CanonicalZeroIncomeReach> => {
  const projected = metricProbability(outcome, metric);
  if (!projected) return unavailable("conditioning-event-unavailable");
  const interval =
    samples && samples > 0
      ? wilsonIntervalFromProbability(projected.mean, samples)
      : null;
  return available({
    label: "zero-income-conservative-estimate",
    mean: projected.mean,
    interval: interval ? { lower: interval[0], upper: interval[1] } : null,
    samples,
    couplingKey: projected.couplingKey,
  });
};

const gateDiagnosticsFromSong = (
  candidate: SongPolicyEvaluation,
): CanonicalGateDiagnostics[] => {
  const outcome = candidate.horizonOutcome;
  const samples = candidate.nextSectionReadiness?.trials ?? null;
  const greatSuccessCrossed = metricBoolean(outcome, "great-success-secured");
  const gate16Crossed = metricBoolean(outcome, "gate16-crossed");
  const gate18Crossed = metricBoolean(outcome, "gate18-crossed");
  const greatSuccessReach = metricProbability(
    outcome,
    "great-success-zero-income-reach",
  )
    ? zeroIncomeReach({
        outcome,
        metric: "great-success-zero-income-reach",
        samples,
      })
    : metricProbability(outcome, "final-gauge-zero-income-reach")
      ? zeroIncomeReach({
          outcome,
          metric: "final-gauge-zero-income-reach",
          samples,
        })
      : unavailable<CanonicalZeroIncomeReach>("conditioning-event-unavailable");
  return [
    {
      id: "great-success",
      deadline: "current-promotional-live",
      crossedByAction: greatSuccessCrossed,
      provenReachable: greatSuccessCrossed ? true : "unknown",
      zeroIncomeReach: greatSuccessReach,
      reward: { statDelta: 35, skillPointDelta: 0, residualUtilityParameter: null },
    },
    {
      id: "gate16",
      deadline: "grand-live-event-gate",
      crossedByAction: gate16Crossed,
      provenReachable: gate16Crossed ? true : "unknown",
      zeroIncomeReach: zeroIncomeReach({
        outcome,
        metric: "gate16-zero-income-reach",
        samples,
      }),
      reward: {
        statDelta: 0,
        skillPointDelta: 0,
        residualUtilityParameter: "SCENARIO_EVENT_UTILITY",
      },
    },
    {
      id: "gate18",
      deadline: "senior-early-december",
      crossedByAction: gate18Crossed,
      provenReachable: gate18Crossed ? true : "unknown",
      zeroIncomeReach: zeroIncomeReach({
        outcome,
        metric: "gate18-zero-income-reach",
        samples,
      }),
      reward: {
        statDelta: 0,
        skillPointDelta: 0,
        residualUtilityParameter: null,
      },
    },
  ];
};

const firstUtilitySeparation = (
  candidate: SongPolicyEvaluation,
  peer: SongPolicyEvaluation | null,
  coReason: CoRecommendationReason | null,
): DecisionSeparationLayer => {
  if (!peer) return "self";
  if (candidate.valid !== peer.valid) return "action-validity";
  const left = candidate.utilityAssessment;
  const right = peer.utilityAssessment;
  if (left.hardState !== right.hardState) return "hard-state";
  if (left.riskAdmissibleState !== right.riskAdmissibleState) {
    return "risk-admissibility";
  }
  const leftStructural = horizonMetricComponent(
    candidate.horizonOutcome,
    "structural-tier",
  )?.value;
  const rightStructural = horizonMetricComponent(
    peer.horizonOutcome,
    "structural-tier",
  )?.value;
  if (
    typeof leftStructural === "number" &&
    typeof rightStructural === "number" &&
    leftStructural !== rightStructural
  ) {
    return "structural-tier";
  }
  if (left.nominalStatPoints !== right.nominalStatPoints) return "utility";
  const leftCost = horizonMetricComponent(
    candidate.horizonOutcome,
    "visible-song-cost",
  )?.value;
  const rightCost = horizonMetricComponent(
    peer.horizonOutcome,
    "visible-song-cost",
  )?.value;
  if (
    typeof leftCost === "number" &&
    typeof rightCost === "number" &&
    leftCost !== rightCost
  ) {
    return "visible-song-cost";
  }
  if (
    candidate.projectionAssessment.expectedPracticeStatDelta !==
      peer.projectionAssessment.expectedPracticeStatDelta ||
    candidate.projectionAssessment.expectedSkillPoints !==
      peer.projectionAssessment.expectedSkillPoints
  ) {
    return "generic-projection";
  }
  if (coReason) return "robustness";
  if (left.tieId !== right.tieId) return "stable-tie-break";
  return "not-separated";
};

export const canonicalSongDecisionDiagnostics = (
  result: SongPolicyResult,
  candidate: SongPolicyEvaluation,
): CanonicalDecisionDiagnostics => {
  const recommended = result.recommended;
  const robustnessPeer = result.utilityRobustness.comparedTo
    ? result.policies.find(
        (policy) => policy.id === result.utilityRobustness.comparedTo,
      ) ?? null
    : null;
  const peer =
    candidate.id === recommended?.id
      ? robustnessPeer
      : recommended && candidate.id !== recommended.id
        ? recommended
        : null;
  const participatesInRobustnessPair =
    candidate.id === recommended?.id || candidate.id === robustnessPeer?.id;
  const breakpoints = participatesInRobustnessPair
    ? result.utilityRobustness.breakpoints
    : [];
  const coRecommended = result.coRecommended.some(
    (policy) => policy.id === candidate.id,
  );
  const coReason =
    candidate.id === recommended?.id || coRecommended
      ? result.utilityRobustness.coRecommendationReason
      : null;
  const currentActionAppearanceProbability = candidate.songId ? 1 : null;

  return {
    schema: DECISION_DIAGNOSTIC_SCHEMA,
    modelCoverage: "full-t1a-t1b-t2",
    action: {
      id: candidate.id,
      kind: candidate.action,
      physicalFeasibility: physicalFromFunding(candidate.fundingFeasibility),
    },
    versions: {
      projectionPolicy: PROJECTION_POLICY,
      utilityModel: UTILITY_MODEL,
      robustnessPolicy: ROBUSTNESS_POLICY,
    },
    funding: {
      currentActionAppearanceProbability:
        currentActionAppearanceProbability === null
          ? unavailable("not-applicable")
          : available(currentActionAppearanceProbability),
      projectedAppearanceProbability: available(candidate.nextSongProbability),
      zeroIncomeFundabilityProbability: unavailable(
        "not-materialized-on-song-policy-path",
      ),
      zeroIncomeFundingGap: unavailable("not-materialized-on-song-policy-path"),
      zeroIncomeFundingGapBySong: [],
    },
    t1a: available({
      tieId: candidate.horizonOutcome.tieId,
      components: candidate.horizonOutcome.components.map((component) => ({
        ...component,
        value:
          typeof component.value === "object" && component.value !== null
            ? { ...component.value }
            : component.value,
        uncertainty: { ...component.uncertainty },
      })),
    }),
    t1b: available({
      projectionPolicy: candidate.utilityAssessment.projectionPolicy,
      utilityModel: candidate.utilityAssessment.utilityModel,
      nominalStatPoints: candidate.utilityAssessment.nominalStatPoints,
      boundedCalibrationInterval: boundedCalibrationOutcomeInterval(
        candidate.utilityAssessment.boundedCalibrationInterval,
        candidate.utilityAssessment.nominalStatPoints,
      ),
      contributions: candidate.utilityAssessment.contributions.map(
        (contribution) => ({ ...contribution }),
      ),
      linearTerms: {
        fixedStatPoints: candidate.utilityAssessment.linearTerms.fixedStatPoints,
        coefficients: { ...candidate.utilityAssessment.linearTerms.coefficients },
      },
      freeParameters: [...candidate.utilityAssessment.freeParameters],
      unprojectedRewards: [...candidate.utilityAssessment.unprojectedRewards],
      calibration: calibrationSnapshot(),
      breakpoints: breakpoints.map((breakpoint) => ({ ...breakpoint })),
    }),
    t2: available({
      expectedPracticeStatDelta:
        candidate.projectionAssessment.expectedPracticeStatDelta,
      expectedSkillPoints: candidate.projectionAssessment.expectedSkillPoints,
      friendshipExposure: candidate.projectionAssessment.friendshipExposure,
      friendshipExposureAffectsRanking: false,
    }),
    gates: available(gateDiagnosticsFromSong(candidate)),
    robustness: {
      policy: ROBUSTNESS_POLICY,
      paired: null,
      riskAdmission: unavailable("not-applicable"),
      calibration: calibrationSnapshot(),
      breakpoints: breakpoints.map((breakpoint) => ({ ...breakpoint })),
      coRecommendationReason: coReason,
      calibrationSensitiveParameters: breakpoints.map(
        (breakpoint) => breakpoint.parameter,
      ),
    },
    separation: {
      comparedTo: peer?.id ?? null,
      firstSeparatingLayer: firstUtilitySeparation(candidate, peer, coReason),
      terminalFirstSeparatingLayer: null,
      sourceRankReasonCode: null,
    },
  };
};

const appearanceProbabilityFromAnalysis = (result: AnalysisResult): number =>
  result.objective === "priority-song"
    ? result.prioritySongShownProbability
    : result.objective === "any-song"
      ? result.anySongShownProbability
      : 1;

const isUtilityParameterId = (
  parameter: string,
): parameter is UtilityParameterId =>
  Object.prototype.hasOwnProperty.call(DEFAULT_UTILITY_CALIBRATION, parameter);

const terminalRobustness = (
  terminal: TerminalTechniqueDecisionSummary | undefined,
): CanonicalRobustnessDiagnostics => {
  const riskAdmission = terminal
    ? available<CanonicalRiskAdmissionDiagnostics>({
        threshold: terminal.admissionThreshold,
        reachProbability: terminal.reachProbability,
        interval: {
          lower: terminal.reachConfidenceInterval[0],
          upper: terminal.reachConfidenceInterval[1],
        },
        confidenceLevel: 0.95,
        separation:
          terminal.reachConfidenceInterval[0] >= terminal.admissionThreshold
            ? "above"
            : terminal.reachConfidenceInterval[1] < terminal.admissionThreshold
              ? "below"
              : "not-separated",
      })
    : unavailable<CanonicalRiskAdmissionDiagnostics>("not-applicable");
  return {
    policy: ROBUSTNESS_POLICY,
    paired: terminal?.pairedUtility ?? null,
    riskAdmission,
    calibration: calibrationSnapshot(),
    breakpoints: (terminal?.calibrationBreakpoints ?? [])
      .filter((breakpoint) => isUtilityParameterId(breakpoint.parameter))
      .map((breakpoint) => ({ ...breakpoint, parameter: breakpoint.parameter as UtilityParameterId })),
    coRecommendationReason: terminal?.coRecommendationReason ?? null,
    calibrationSensitiveParameters: (
      terminal?.calibrationSensitiveParameters ?? []
    ).filter(isUtilityParameterId),
  };
};

const terminalFirstSeparatingLayer = (
  terminal: TerminalTechniqueDecisionSummary | undefined,
): DecisionSeparationLayer | null => {
  if (!terminal) return null;
  if (
    terminal.coRecommendationReason === "monte-carlo-not-separated" ||
    terminal.coRecommendationReason === "resource-tradeoff" ||
    terminal.coRecommendationReason === "both"
  ) {
    return "robustness";
  }
  if (terminal.reachConfidenceInterval[1] < terminal.admissionThreshold) {
    return "risk-admissibility";
  }
  if (terminal.coRecommendationReason === "calibration-sensitive") {
    return "robustness";
  }
  switch (terminal.decisionLayer) {
    case "risk":
      return "risk-admissibility";
    case "gate":
      return "hard-state";
    case "structural":
      return "structural-tier";
    case "mechanical":
      return "utility";
    case "t2":
      return "generic-projection";
    case "none":
      return "stable-tie-break";
  }
};

const rankReasonLayer = (
  reason: TechniqueRankReason,
): DecisionSeparationLayer => {
  switch (reason) {
    case "affordability":
    case "immediate-strategic-block":
    case "reserve-breach":
    case "reserve-deficit":
      return "physical-feasibility";
    case "risk-class":
      return "risk-admissibility";
    case "terminal-hard-state":
      return "hard-state";
    case "terminal-mechanical":
      return "utility";
    case "terminal-generic-projection":
      return "generic-projection";
    case "stable-id":
      return "stable-tie-break";
    default:
      return "legacy-technique-ranking";
  }
};

export const canonicalAnalysisDecisionDiagnostics = ({
  id,
  action,
  result,
  rankReasonCode,
}: {
  id: string;
  action: string;
  result: AnalysisResult;
  rankReasonCode: TechniqueRankReason;
}): CanonicalDecisionDiagnostics => ({
  schema: DECISION_DIAGNOSTIC_SCHEMA,
  modelCoverage: result.terminalDecision
    ? "terminal-aggregate"
    : "physical-projection-only",
  action: {
    id,
    kind: action,
    physicalFeasibility: {
      physicalAffordable: result.physicalAffordable,
      immediateFundingGap: cloneBalance(result.immediateFundingGap),
      weightedFundingGap: result.weightedFundingGap,
    },
  },
  versions: {
    projectionPolicy: PROJECTION_POLICY,
    utilityModel: UTILITY_MODEL,
    robustnessPolicy: ROBUSTNESS_POLICY,
  },
  funding: {
    currentActionAppearanceProbability: unavailable("not-applicable"),
    projectedAppearanceProbability: available(
      appearanceProbabilityFromAnalysis(result),
    ),
    zeroIncomeFundabilityProbability:
      result.zeroIncomeFundabilityProbability === null
        ? unavailable("conditioning-event-unavailable")
        : available(result.zeroIncomeFundabilityProbability),
    zeroIncomeFundingGap: unavailable("not-materialized-on-analysis-path"),
    zeroIncomeFundingGapBySong: result.songOutcomes.map((outcome) => ({
      songId: outcome.id,
      distribution: outcome.zeroIncomeFundingGap,
    })),
  },
  t1a: unavailable("not-materialized-on-analysis-path"),
  t1b: unavailable(
    result.terminalDecision
      ? "not-materialized-on-terminal-aggregate"
      : "not-materialized-on-analysis-path",
  ),
  t2: unavailable(
    result.terminalDecision
      ? "terminal-compatibility-path"
      : "not-materialized-on-analysis-path",
  ),
  gates: unavailable("not-materialized-on-analysis-path"),
  robustness: terminalRobustness(result.terminalDecision),
  separation: {
    comparedTo: null,
    firstSeparatingLayer: rankReasonLayer(rankReasonCode),
    terminalFirstSeparatingLayer: terminalFirstSeparatingLayer(
      result.terminalDecision,
    ),
    sourceRankReasonCode: rankReasonCode,
  },
});
