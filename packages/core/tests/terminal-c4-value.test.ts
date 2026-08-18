import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTerminalC4OpportunityCost,
  evaluateTerminalC4Value,
  TERMINAL_C4_VALUE_CALIBRATION,
} from "../src/solver/terminal-technique.ts";
import {
  contextualSongValues,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { SONGS } from "../src/domain/song-data.ts";
import { riskCatastropheFloor } from "../src/solver/value.ts";

const balance = (partial: Partial<Balance>): Balance => ({
  dance: partial.dance ?? 0,
  passion: partial.passion ?? 0,
  vocal: partial.vocal ?? 0,
  visual: partial.visual ?? 0,
  mental: partial.mental ?? 0,
});

const songTarget = (id: string): SongTarget => {
  const song = SONGS.find((candidate) => candidate.id === id);
  assert.ok(song, `song ${id} missing`);
  return {
    id: song.id,
    name: song.name,
    cost: song.cost,
    ...contextualSongValues({
      practiceBonus: song.practiceBonus,
      liveBonusType: song.liveBonusType,
      liveBonusValue: song.liveBonusValue,
      declaredPriority: song.priority,
    }),
  };
};

const evaluate = (
  overrides: Partial<Parameters<typeof evaluateTerminalC4Value>[0]> = {},
) =>
  evaluateTerminalC4Value({
    riskProfile: "standard",
    reachLowerBound: 0.9,
    weightedCommittedCost: 80,
    opportunityCost: 30,
    friendshipTrainingExposureDelta: 140,
    spTrainingExposureDelta: 0,
    practiceTrainingExposureDelta: 0,
    targetProbabilityDelta: 0,
    structuralPurchasesDelta: 0,
    purchasesDelta: 0,
    ...overrides,
  });

test("PR-4 : le seuil Standard 92 % n'est plus un cliff binaire en C4", () => {
  const below = evaluate({ reachLowerBound: 0.9199 });
  const above = evaluate({ reachLowerBound: 0.92 });

  assert.equal(below.catastropheAdmissible, true);
  assert.equal(above.catastropheAdmissible, true);
  assert.equal(below.shouldPush, true);
  assert.equal(above.shouldPush, true);
  assert.ok(below.riskPenalty > 0);
  assert.equal(above.riskPenalty, 0);
  assert.ok(above.netValue > below.netValue);
});

test("C4 value : un coût d'opportunité réellement fourni reste pris en compte", () => {
  const cheap = evaluate({ opportunityCost: 25 });
  const expensive = evaluate({ opportunityCost: 80 });

  assert.equal(cheap.shouldPush, true);
  assert.equal(expensive.shouldPush, false);
  assert.ok(cheap.netValue > 0);
  assert.ok(expensive.netValue < 0);
});

test("C4 opportunity economy : le spend brut ne bloque plus un PUSH qui préserve les options futures", () => {
  const result = evaluate({
    reachLowerBound: 0.99,
    weightedCommittedCost: 180,
    opportunityCost: 0,
    friendshipTrainingExposureDelta: 120,
  });

  assert.equal(result.weightedCommittedCost, 180);
  assert.equal(result.opportunityCost, 0);
  assert.equal(result.shouldPush, true);
  assert.ok(result.netValue > 0);
});

test("PR-4 : le plancher catastrophe reste un hard gate malgré une grosse valeur", () => {
  const floor = riskCatastropheFloor("standard");
  const result = evaluate({
    reachLowerBound: floor - 0.001,
    weightedCommittedCost: 5,
    opportunityCost: 0,
    friendshipTrainingExposureDelta: 1000,
    targetProbabilityDelta: 1,
    purchasesDelta: 1,
  });

  assert.equal(floor, 0.72);
  assert.equal(result.catastropheAdmissible, false);
  assert.equal(result.shouldPush, false);
  assert.ok(result.netValue > 0, "the hard floor, not value, must block PUSH");
});

test("C4 opportunity economy : les coefficients restent explicites et auditables", () => {
  assert.deepEqual(TERMINAL_C4_VALUE_CALIBRATION.riskPenaltyMultiplier, {
    safe: 3,
    standard: 2,
    greedy: 1,
  });
  assert.ok(TERMINAL_C4_VALUE_CALIBRATION.friendshipTrainingExposure > 0);
  assert.ok(TERMINAL_C4_VALUE_CALIBRATION.spTrainingExposure > 0);
  assert.ok(TERMINAL_C4_VALUE_CALIBRATION.practiceTrainingExposure > 0);
});

test("C4 opportunity economy : aucun PUSH n'est justifié avec un gain effectif nul", () => {
  const result = evaluate({
    reachLowerBound: 0.99,
    weightedCommittedCost: 85,
    opportunityCost: 0,
    friendshipTrainingExposureDelta: 0,
    spTrainingExposureDelta: 0,
    practiceTrainingExposureDelta: 0,
    targetProbabilityDelta: 0,
    structuralPurchasesDelta: 0,
    purchasesDelta: 0,
  });

  assert.equal(result.grossValue, 0);
  assert.equal(result.shouldPush, false);
  assert.equal(result.netValue, 0);
});

test("C4 hidden options : STOP ne reçoit ni crédit Friendship caché ni crédit de fermeture 18", () => {
  const remaining = [
    "yumezora",
    "present-march",
    "daisuki",
    "sekai",
    "harusora",
  ].map(songTarget);
  const opportunity = evaluateTerminalC4OpportunityCost({
    beforeBalance: balance({
      dance: 129,
      passion: 166,
      vocal: 137,
      visual: 127,
      mental: 141,
    }),
    // Observed stock at the start of the next C4 cycle after buying Fanfare.
    afterBalance: balance({
      dance: 103,
      passion: 166,
      vocal: 122,
      visual: 85,
      mental: 117,
    }),
    remainingSongs: remaining,
    totalSongsAfterAction: 12,
  });

  assert.equal(opportunity.friendshipOptionLoss, 0);
  assert.equal(opportunity.gate18CapacityLoss, 0);
  assert.equal(opportunity.opportunityCost, 0);

  const decision = evaluateTerminalC4Value({
    riskProfile: "standard",
    reachLowerBound: 0.9881378411686903,
    weightedCommittedCost: 153.56947568212522,
    opportunityCost: opportunity.opportunityCost,
    friendshipTrainingExposureDelta: 107.8125,
    spTrainingExposureDelta: 0,
    practiceTrainingExposureDelta: 1.0979166666666669,
    targetProbabilityDelta: 0,
    structuralPurchasesDelta: 0.9375,
    purchasesDelta: 0.9375,
  });

  assert.equal(decision.shouldPush, true);
  assert.equal(decision.opportunityCost, 0);
  assert.ok(decision.grossValue > 30);
  assert.ok(decision.netValue > 30);
});

test("C4 replay 2026-08-17 : le faux knapsack Friendship reste neutralisé même avec un wallet serré", () => {
  const remaining = [
    "yumezora",
    "present-march",
    "sekai",
    "harusora",
  ].map(songTarget);
  const opportunity = evaluateTerminalC4OpportunityCost({
    beforeBalance: balance({
      dance: 41,
      passion: 51,
      vocal: 51,
      visual: 45,
      mental: 72,
    }),
    afterBalance: balance({
      dance: 17,
      passion: 27,
      vocal: 27,
      visual: 21,
      mental: 48,
    }),
    remainingSongs: remaining,
    totalSongsAfterAction: 14,
  });

  assert.deepEqual(opportunity, {
    friendshipOptionLoss: 0,
    gate18CapacityLoss: 0,
    opportunityCost: 0,
  });
});
