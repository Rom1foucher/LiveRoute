import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "../src/live-model.ts";
import type { CrossSectionTrialResult } from "../src/solver/cross-section.ts";
import {
  TERMINAL_LAYERED_METRIC_ORDER,
  classifyTerminalLayeredMetric,
  decideTerminalLayeredEvidence,
  terminalLayeredTrialValue,
  type TerminalLayeredMetricEvidence,
  type TerminalLayeredMetricId,
} from "../src/solver/terminal-layered-value.ts";

const balance = (): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

const trial = (overrides: Partial<CrossSectionTrialResult> = {}): CrossSectionTrialResult => ({
  nextConcertIndex: 4,
  nextPlanId: "convert-final",
  checkpointRequired: null,
  checkpointMet: false,
  targetAcquired: false,
  friendship10Acquired: false,
  friendshipBonus: 0,
  friendshipPurchases: 0,
  acquiredEffects: [],
  friendshipTrainingExposure: 0,
  spTrainingExposure: 0,
  practiceTrainingExposure: 0,
  structuralPurchases: 0,
  purchases: 0,
  techniquePurchases: 0,
  lessonSkillPoints: 0,
  immediateStatPoints: 0,
  immediateSkillPoints: 0,
  totalSongs: 15,
  retainedBalance: balance(),
  remainingPool: [],
  ...overrides,
});

const evidence = (
  values: Partial<Record<TerminalLayeredMetricId, { mean: number; interval: readonly [number, number] }>>,
): TerminalLayeredMetricEvidence[] =>
  TERMINAL_LAYERED_METRIC_ORDER.map((metric) => {
    const value = values[metric] ?? { mean: 0, interval: [0, 0] as const };
    return classifyTerminalLayeredMetric({ metric, ...value });
  });

test("P-T1 : le compteur 18 et checkpointMet sont absents de la valeur terminale par couches", () => {
  const common = {
    tieId: "same-action",
    concertIndex: 3,
    songsThisSection: 2,
    currentSectionPurchases: 0,
    currentStructuralTier: 0,
    currentImmediateStatPoints: 0,
    currentImmediateSkillPoints: 0,
  } as const;
  const below18 = terminalLayeredTrialValue({
    ...common,
    result: trial({ totalSongs: 15, checkpointMet: false }),
  });
  const at18 = terminalLayeredTrialValue({
    ...common,
    result: trial({ totalSongs: 18, checkpointMet: true }),
  });
  assert.deepEqual(below18, at18);
});

test("P-T2 : Great Success est une porte séparée des stats/SP immédiats", () => {
  const before = terminalLayeredTrialValue({
    tieId: "before",
    concertIndex: 3,
    songsThisSection: 2,
    currentSectionPurchases: 0,
    currentStructuralTier: 0,
    currentImmediateStatPoints: 0,
    currentImmediateSkillPoints: 0,
    result: trial(),
  });
  const closed = terminalLayeredTrialValue({
    tieId: "closed",
    concertIndex: 3,
    songsThisSection: 2,
    currentSectionPurchases: 1,
    currentStructuralTier: 0,
    currentImmediateStatPoints: 0,
    currentImmediateSkillPoints: 0,
    result: trial(),
  });
  assert.equal(before.greatSuccessSecured, 0);
  assert.equal(closed.greatSuccessSecured, 1);
  assert.equal(before.mechanicalStatPoints, 0);
  assert.equal(closed.mechanicalStatPoints, 0);
});

test("P-T3 : une cible structurelle séparée bat une projection T2 opposée", () => {
  const decision = decideTerminalLayeredEvidence(
    evidence({
      "structural-tier-4": { mean: 0.4, interval: [0.31, 0.49] },
      "t2-practice": { mean: -50, interval: [-55, -45] },
    }),
  );
  assert.equal(decision.action, "expose-and-carry");
  assert.equal(decision.layer, "structural");
  assert.equal(decision.metric, "structural-tier-4");
});

test("P-T3 : une structure non séparée bloque tout avantage mécanique ou T2 inférieur", () => {
  const decision = decideTerminalLayeredEvidence(
    evidence({
      "structural-tier-4": { mean: 0.04, interval: [-0.02, 0.1] },
      "mechanical-reward": { mean: 100, interval: [95, 105] },
      "t2-practice": { mean: 200, interval: [190, 210] },
    }),
  );
  assert.equal(decision.action, "stop-now");
  assert.equal(decision.separated, false);
  assert.equal(decision.layer, "structural");
  assert.equal(decision.reason, "monte-carlo-not-separated");
});

test("P-T2 : les rewards plats restent déterministes et les projections de training restent T2", () => {
  const value = terminalLayeredTrialValue({
    tieId: "flat-reward",
    concertIndex: 3,
    songsThisSection: 3,
    currentSectionPurchases: 0,
    currentStructuralTier: 0,
    currentImmediateStatPoints: 26,
    currentImmediateSkillPoints: 22,
    result: trial({ practiceTrainingExposure: 123, spTrainingExposure: 45 }),
  });
  assert.equal(value.immediateStatPoints, 26);
  assert.equal(value.immediateSkillPoints, 22);
  assert.ok(value.mechanicalStatPoints > 26);
  assert.equal(value.expectedPracticeStatDelta, 123);
  assert.equal(value.expectedSkillPoints, 45);
});
