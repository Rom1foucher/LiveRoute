import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "../src/live-model.ts";
import { subtractCost } from "../src/live-model.ts";
import { applyPromotionalLiveTransition } from "../src/domain/live-rules.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { evaluateExposedCarry } from "../src/solver/carry.ts";
import { frAll } from "./helpers/messages.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const planFor = (concertIndex: number, _totalSongs: number) =>
  deriveStrategicPlan({
    concertIndex,
    timingMode: "deadline-now",
    remainingSongs: [],
  });

test("le crédit +10 vérifié conserve l’invariance achat avant/après", () => {
  const tokens = balance({ dance: 42, visual: 42, mental: 250 });
  const cost = balance({ dance: 21, visual: 21 });
  const buyThenLive = applyPromotionalLiveTransition(
    subtractCost(tokens, cost),
    1,
  );
  const liveThenBuy = subtractCost(
    applyPromotionalLiveTransition(tokens, 1),
    cost,
  );
  assert.deepEqual(liveThenBuy, buyThenLive);
});

test("le carry d'une page exposée économise une seule technique héritée", () => {
  const target = {
    id: "SP2",
    name: "SP2",
    cost: balance({ passion: 21, visual: 21 }),
    roles: ["sp2-target" as const],
  };
  const result = evaluateExposedCarry({
    concertIndex: 1,
    timingMode: "deadline-now",
    tokens: balance({ passion: 12, visual: 12 }),
    song: target,
    totalSongs: 9,
    plan: planFor(1, 9),
  });
  assert.equal(result.valid, true);
  assert.equal(result.affordableNow, false);
  assert.equal(result.affordableAfterLive, true);
  assert.equal(result.savedInheritedTechniques, 1);
  assert.equal(result.delayClass, "structural");
});

test("le repère 16 ne devient jamais une porte de carry", () => {
  const filler = {
    id: "filler",
    name: "filler",
    cost: balance(),
    roles: ["filler" as const],
  };
  const blocked = evaluateExposedCarry({
    concertIndex: 3,
    timingMode: "deadline-now",
    tokens: balance({ dance: 50 }),
    song: filler,
    totalSongs: 15,
    plan: planFor(3, 15),
  });
  assert.equal(blocked.valid, true);
  assert.equal(planFor(3, 15).checkpointRequired, null);
  assert.doesNotMatch(frAll(blocked.reasons), /bloqu|impossible|porte/i);
});
