import assert from "node:assert/strict";
import test from "node:test";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import {
  createHuntState,
  evaluateHuntDecision,
} from "../src/solver/hunt-state.ts";

test("temporary zero-income unfundability does not abandon hunt", () => {
  const state = {
    ...createHuntState(["yume-wo-kakeru"]),
    pagesSeenWithoutTarget: 6,
  };

  const decision = evaluateHuntDecision({
    state,
    targetAppearanceProbability: 0.4,
    zeroIncomeFundabilityProbability: 0,
    findAndFundProbability: 0,
  });

  assert.equal(decision.fundingAssessment, "future-income-required");
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
