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

test("P3b2 : coût technique et fillers restent de la télémétrie de HUNT", () => {
  const base = createHuntState(["SP3"]);
  const afterTechnique = recordHuntTechniquePurchase(base, cost(21, 12));
  const afterFiller = recordHuntFillerPurchase(afterTechnique);
  assert.equal(afterFiller?.committedTechniqueCost.dance, 21);
  assert.equal(afterFiller?.committedTechniqueCost.visual, 12);
  assert.equal(afterFiller?.fillerPurchasesWhileHunting, 1);

  const decision = evaluateHuntDecision({
    state: afterFiller!,
    targetAppearanceProbability: 0.4,
    zeroIncomeFundabilityProbability: 0.25,
    findAndFundProbability: 0.1,
  });
  assert.equal(decision.action, "continue-hunt");
  assert.equal(decision.committedTechniqueTokens, 33);
  assert.equal(decision.fillerPurchasesWhileHunting, 1);
});

test("P3b2 invariant 4 : le compteur brut de misses ne change pas l'admission HUNT", () => {
  const decisions = [0, 2, 3, 8].map((pagesSeenWithoutTarget) =>
    evaluateHuntDecision({
      state: {
        ...createHuntState(["SP3"]),
        pagesSeenWithoutTarget,
      },
      targetAppearanceProbability: 0.45,
      zeroIncomeFundabilityProbability: 0.2,
      findAndFundProbability: 0.12,
    }),
  );

  assert.ok(decisions.every((decision) => decision.action === "continue-hunt"));
  assert.ok(
    decisions.every(
      (decision) => decision.fundingAssessment === "zero-income-fundable",
    ),
  );
});

test("P3b2 : find-and-fund zero-income nul n'est pas une preuve d'impossibilité", () => {
  const decision = evaluateHuntDecision({
    state: {
      ...createHuntState(["SP3"]),
      pagesSeenWithoutTarget: 7,
    },
    targetAppearanceProbability: 0.35,
    zeroIncomeFundabilityProbability: 0,
    findAndFundProbability: 0,
  });

  assert.equal(decision.action, "continue-hunt");
  assert.equal(decision.fundingAssessment, "future-income-required");
  assert.equal(decision.findAndFundProbability, 0);
});

test("P3b2 : une cible sans aucune apparence possible peut être abandonnée", () => {
  const decision = evaluateHuntDecision({
    state: createHuntState(["SP3"]),
    targetAppearanceProbability: 0,
    zeroIncomeFundabilityProbability: null,
    findAndFundProbability: 0,
  });

  assert.equal(decision.action, "abandon-to-hold");
  assert.equal(decision.fundingAssessment, "unreachable");
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
