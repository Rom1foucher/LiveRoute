import assert from "node:assert/strict";
import test from "node:test";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import {
  createHuntState,
  evaluateHuntDecision,
} from "../src/solver/hunt-state.ts";

test("temporary unfundability before third miss does not abandon hunt", () => {
  const state = {
    ...createHuntState(["yume-wo-kakeru"]),
    pagesSeenWithoutTarget: 1,
  };

  const decision = evaluateHuntDecision({
    state,
    riskProfile: "standard",
    findAndFundProbability: 0,
    targetTrainingExposure: 66,
    expectedFutureCommittedCost: 40,
    immediateFillerCost: 0,
    reserveOpportunityCost: 0,
    techniquesToNextSong: 1,
  });

  assert.equal(decision.expectedTargetValue, 0);
  assert.equal(decision.action, "continue-hunt");
});

test("abandoned C2 SP2 target remains a visible opportunity in HOLD", () => {
  const yume = {
    id: "yume-wo-kakeru",
    roles: ["sp2-target"] as const,
  };

  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: [yume],
    abandonedChaseTargetIds: [yume.id],
  });

  assert.equal(plan.mode, "hold");
  assert.deepEqual(plan.chaseTargets.ids, []);
  assert.ok(plan.visibleOptionalTargets.ids.includes(yume.id));
  assert.ok(plan.visibleOptionalTargets.roles.includes("sp2-target"));
});
