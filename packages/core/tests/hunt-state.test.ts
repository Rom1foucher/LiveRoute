import assert from "node:assert/strict";
import test from "node:test";

import {
  alignHuntState,
  createHuntState,
  evaluateHuntDecision,
  huntPageKey,
  observeHuntPage,
  recordHuntFillerPurchase,
  recordHuntTechniquePurchase,
} from "../src/solver/hunt-state.ts";
import type { Balance } from "../src/live-model.ts";

const cost = (dance = 0, visual = 0): Balance => ({
  dance,
  passion: 0,
  vocal: 0,
  visual,
  mental: 0,
});

test("PR-6 : une réanalyse du même écran ne compte jamais comme un nouveau miss", () => {
  const base = createHuntState(["SP3"]);
  const first = observeHuntPage({
    state: base,
    targetIds: ["SP3"],
    visibleSongIds: ["filler-a", "filler-b", "filler-c"],
    pageKey: huntPageKey(2, 3),
  });
  assert.equal(first?.pagesSeenWithoutTarget, 1);

  const repeated = observeHuntPage({
    state: first,
    targetIds: ["SP3"],
    visibleSongIds: ["filler-a", "filler-b", "filler-c"],
    pageKey: huntPageKey(2, 3),
  });
  assert.equal(repeated?.pagesSeenWithoutTarget, 1);

  const next = observeHuntPage({
    state: repeated,
    targetIds: ["SP3"],
    visibleSongIds: ["filler-d", "filler-e", "filler-f"],
    pageKey: huntPageKey(2, 4),
  });
  assert.equal(next?.pagesSeenWithoutTarget, 2);
});

test("PR-6 : une page contenant la cible ne compte pas comme miss", () => {
  const observed = observeHuntPage({
    state: createHuntState(["SP2"]),
    targetIds: ["SP2"],
    visibleSongIds: ["filler", "SP2"],
    pageKey: huntPageKey(1, 2),
  });
  assert.equal(observed?.pagesSeenWithoutTarget, 0);
});

test("PR-6 : coût technique et fillers sont persistés sans devenir un bonus de sunk cost", () => {
  const base = createHuntState(["SP3"]);
  const afterTechnique = recordHuntTechniquePurchase(base, cost(21, 12));
  const afterFiller = recordHuntFillerPurchase(afterTechnique);
  assert.equal(afterFiller?.committedTechniqueCost.dance, 21);
  assert.equal(afterFiller?.committedTechniqueCost.visual, 12);
  assert.equal(afterFiller?.fillerPurchasesWhileHunting, 1);
});

test("PR-6 : après le troisième miss, une cible rentable et peu coûteuse peut encore justifier HUNT", () => {
  const state = {
    ...createHuntState(["SP3"]),
    pagesSeenWithoutTarget: 3,
  };
  const decision = evaluateHuntDecision({
    state,
    riskProfile: "standard",
    findAndFundProbability: 0.6,
    targetTrainingExposure: 90,
    expectedFutureCommittedCost: 20,
    immediateFillerCost: 0,
    reserveOpportunityCost: 0,
    techniquesToNextSong: 2,
  });
  assert.equal(decision.action, "continue-hunt");
  assert.ok(decision.netValue > 0);
});

test("PR-6 : après le troisième miss, un cycle profond à faible valeur bascule vers HOLD", () => {
  const state = {
    ...createHuntState(["SP3"]),
    pagesSeenWithoutTarget: 3,
    fillerPurchasesWhileHunting: 1,
  };
  const decision = evaluateHuntDecision({
    state,
    riskProfile: "standard",
    findAndFundProbability: 0.12,
    targetTrainingExposure: 45,
    expectedFutureCommittedCost: 140,
    immediateFillerCost: 21,
    reserveOpportunityCost: 6,
    techniquesToNextSong: 5,
  });
  assert.equal(decision.action, "abandon-to-hold");
  assert.ok(decision.netValue < 0);
});

test("PR-6 : changer de cible réinitialise l'état de chasse", () => {
  const previous = {
    ...createHuntState(["SP2"]),
    pagesSeenWithoutTarget: 4,
    fillerPurchasesWhileHunting: 2,
  };
  const next = alignHuntState(previous, ["SP3"]);
  assert.deepEqual(next?.targetIds, ["SP3"]);
  assert.equal(next?.pagesSeenWithoutTarget, 0);
  assert.equal(next?.fillerPurchasesWhileHunting, 0);
});
