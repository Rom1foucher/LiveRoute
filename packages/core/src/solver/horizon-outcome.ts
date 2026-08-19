import type { DecisionVector } from "./value.ts";

/**
 * Transitional P3a representation of a decision horizon.
 *
 * `components` contains raw consequences only. `legacyProjection` is a
 * deliberately separate compatibility description that tells the temporary
 * adapter how the current DecisionVector was assembled. P3b1 can therefore
 * delete the projection and adapter without rewriting consequence production.
 */
export type HorizonMetricId =
  | "hard-state"
  | "risk-admissible-state"
  | "structural-tier"
  | "immediate-training-exposure"
  | "friendship-training-exposure"
  | "retained-tokens"
  | "committed-cost"
  | `legacy-prospective:${number}`
  | `legacy-continuation:${number}`
  | `legacy-certain:${number}`;

/**
 * P3a compatibility transforms only. `floor-div-20` intentionally reproduces
 * the asymmetric BUY/WAIT legacy comparator. It must disappear with
 * legacyDecisionVectorFromOutcome in P3b1.
 */
export type LegacyDecisionTransform = "identity" | "floor-div-20";

export type HorizonOutcomeComponent = {
  /** Stable within one outcome and used only to reference a raw component. */
  id: string;
  metric: HorizonMetricId;
  /** Raw consequence before any compatibility transform. */
  value: number;
};

export type LegacyProjectionRef = {
  componentId: string;
  transform: LegacyDecisionTransform;
};

export type LegacyDecisionProjection = {
  hard: LegacyProjectionRef;
  riskAdmissible: LegacyProjectionRef;
  structural: LegacyProjectionRef;
  certain: readonly LegacyProjectionRef[];
  prospective: readonly LegacyProjectionRef[];
  continuation: readonly LegacyProjectionRef[];
  retainedTokens: LegacyProjectionRef;
  committedCost: LegacyProjectionRef;
};

export type HorizonOutcome = {
  tieId: string;
  components: readonly HorizonOutcomeComponent[];
  /** P3a-only compatibility metadata. P3b1 must remove this field. */
  legacyProjection: LegacyDecisionProjection;
};

export type HorizonValue = {
  metric?: HorizonMetricId;
  value: number;
  legacyTransform?: LegacyDecisionTransform;
};

export const horizonValue = (
  metric: HorizonMetricId,
  value: number,
  legacyTransform: LegacyDecisionTransform = "identity",
): HorizonValue => ({ metric, value, legacyTransform });

type LegacyCompatibleOutcomeInput = {
  tieId: string;
  hard: number | HorizonValue;
  riskAdmissible: number | HorizonValue;
  structural: number | HorizonValue;
  certain?: readonly (number | HorizonValue)[];
  prospective?: readonly (number | HorizonValue)[];
  continuation: readonly (number | HorizonValue)[];
  retainedTokens: number | HorizonValue;
  committedCost: number | HorizonValue;
};

const defaultMetric = (
  lane:
    | "hard"
    | "risk-admissible"
    | "structural"
    | "certain"
    | "prospective"
    | "continuation"
    | "retained-tokens"
    | "committed-cost",
  index?: number,
): HorizonMetricId => {
  switch (lane) {
    case "hard":
      return "hard-state";
    case "risk-admissible":
      return "risk-admissible-state";
    case "structural":
      return "structural-tier";
    case "retained-tokens":
      return "retained-tokens";
    case "committed-cost":
      return "committed-cost";
    case "certain":
      return `legacy-certain:${index ?? 0}`;
    case "prospective":
      return `legacy-prospective:${index ?? 0}`;
    case "continuation":
      return `legacy-continuation:${index ?? 0}`;
  }
};

/**
 * Build a raw outcome plus the exact legacy projection needed by P3a.
 *
 * Named raw metrics are deduplicated when the metric and value are identical.
 * This is important for values such as training exposure that legacy projects
 * into two lanes using different transforms: the consequence exists once;
 * only its legacy interpretation is duplicated.
 */
export const createLegacyCompatibleHorizonOutcome = (
  input: LegacyCompatibleOutcomeInput,
): HorizonOutcome => {
  const components: HorizonOutcomeComponent[] = [];
  const componentBySemanticValue = new Map<string, HorizonOutcomeComponent>();
  const usedIds = new Set<string>();

  const uniqueId = (base: string): string => {
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let suffix = 2;
    while (usedIds.has(`${base}#${suffix}`)) suffix += 1;
    const id = `${base}#${suffix}`;
    usedIds.add(id);
    return id;
  };

  const project = (
    lane:
      | "hard"
      | "risk-admissible"
      | "structural"
      | "certain"
      | "prospective"
      | "continuation"
      | "retained-tokens"
      | "committed-cost",
    entry: number | HorizonValue,
    index?: number,
  ): LegacyProjectionRef => {
    const value = typeof entry === "number" ? entry : entry.value;
    const metric =
      typeof entry === "number" || entry.metric === undefined
        ? defaultMetric(lane, index)
        : entry.metric;
    const transform =
      typeof entry === "number"
        ? "identity"
        : (entry.legacyTransform ?? "identity");

    const semanticKey = `${metric}\u0000${Object.is(value, -0) ? "-0" : String(value)}`;
    let component = componentBySemanticValue.get(semanticKey);
    if (component === undefined) {
      component = { id: uniqueId(metric), metric, value };
      componentBySemanticValue.set(semanticKey, component);
      components.push(component);
    }
    return { componentId: component.id, transform };
  };

  const vector = (
    lane: "certain" | "prospective" | "continuation",
    entries: readonly (number | HorizonValue)[],
  ): readonly LegacyProjectionRef[] =>
    entries.map((entry, index) => project(lane, entry, index));

  return {
    tieId: input.tieId,
    components,
    legacyProjection: {
      hard: project("hard", input.hard),
      riskAdmissible: project("risk-admissible", input.riskAdmissible),
      structural: project("structural", input.structural),
      certain: vector("certain", input.certain ?? []),
      prospective: vector("prospective", input.prospective ?? []),
      continuation: vector("continuation", input.continuation),
      retainedTokens: project("retained-tokens", input.retainedTokens),
      committedCost: project("committed-cost", input.committedCost),
    },
  };
};

const applyLegacyTransform = (
  value: number,
  transform: LegacyDecisionTransform,
): number => {
  switch (transform) {
    case "identity":
      return value;
    case "floor-div-20":
      return Math.floor(value / 20);
  }
};

const componentIndex = (
  outcome: HorizonOutcome,
): ReadonlyMap<string, HorizonOutcomeComponent> => {
  const byId = new Map<string, HorizonOutcomeComponent>();
  for (const component of outcome.components) {
    if (byId.has(component.id)) {
      throw new Error(
        `HorizonOutcome ${outcome.tieId} contains duplicate component id ${component.id}`,
      );
    }
    byId.set(component.id, component);
  }
  return byId;
};

const projectLegacyValue = (
  outcome: HorizonOutcome,
  byId: ReadonlyMap<string, HorizonOutcomeComponent>,
  reference: LegacyProjectionRef,
): number => {
  const component = byId.get(reference.componentId);
  if (component === undefined) {
    throw new Error(
      `HorizonOutcome ${outcome.tieId} references missing component ${reference.componentId}`,
    );
  }
  return applyLegacyTransform(component.value, reference.transform);
};

/**
 * P3a-only compatibility seam. It is intentionally allowed to reproduce every
 * legacy asymmetry, including floor(exposure / 20) on the `certain` BUY/WAIT
 * lane. P3b1 must delete this adapter in the same commit that installs the
 * canonical metric transforms.
 */
export const legacyDecisionVectorFromOutcome = (
  outcome: HorizonOutcome,
): DecisionVector => {
  const byId = componentIndex(outcome);
  const project = (reference: LegacyProjectionRef): number =>
    projectLegacyValue(outcome, byId, reference);
  const projectVector = (
    references: readonly LegacyProjectionRef[],
  ): number[] => references.map(project);
  const certain = projectVector(outcome.legacyProjection.certain);
  const prospective = projectVector(outcome.legacyProjection.prospective);

  return {
    hard: project(outcome.legacyProjection.hard),
    riskAdmissible: project(outcome.legacyProjection.riskAdmissible),
    structural: project(outcome.legacyProjection.structural),
    certain: certain.length > 0 ? certain : undefined,
    prospective: prospective.length > 0 ? prospective : undefined,
    continuation: projectVector(outcome.legacyProjection.continuation),
    retainedTokens: project(outcome.legacyProjection.retainedTokens),
    committedCost: project(outcome.legacyProjection.committedCost),
    tieId: outcome.tieId,
  };
};

export const horizonMetricComponents = (
  outcome: HorizonOutcome,
  metric: HorizonMetricId,
): readonly HorizonOutcomeComponent[] =>
  outcome.components.filter((component) => component.metric === metric);
