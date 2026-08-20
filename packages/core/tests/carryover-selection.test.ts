import assert from "node:assert/strict";
import test from "node:test";
import { selectCarryoverPolicy } from "../src/domain/carryover-selection.ts";
import {
  createHorizonOutcome,
  outcomeComponent,
} from "../src/solver/horizon-outcome.ts";
import {
  decisionVectorFromUtilityAssessment,
  genericProjectionAssessmentFromOutcome,
  utilityAssessmentFromOutcome,
} from "../src/solver/utility-model.ts";
import type { SongPolicyEvaluation } from "../src/solver/song-policy.ts";

const policy = (
  id: string,
  action: SongPolicyEvaluation["action"],
  songId: string | null,
  hard: number,
  valid = true,
  carriedSongIds?: readonly string[],
): SongPolicyEvaluation => {
  const horizonOutcome = createHorizonOutcome({
    tieId: id,
    components: [
      outcomeComponent("hard-state", hard, "deterministic-consequence"),
      outcomeComponent(
        "risk-admissible-state",
        1,
        "deterministic-consequence",
      ),
      outcomeComponent("structural-tier", 1, "deterministic-consequence"),
    ],
  });
  const utilityAssessment = utilityAssessmentFromOutcome(horizonOutcome);
  return {
    id,
    action,
    songId,
    songName: songId ?? "none",
    carriedSongIds,
    valid,
    overrideEligible: false,
    score: 0,
    nextSongProbability: 0,
    priorityAffordableProbability: 0,
    greatSuccessProbability: null,
    checkpoint16Status: "secured-now",
    checkpoint18Status: "secured-now",
    finalGateStatus: "open",
    conditionalPagesProbability: 0,
    exactPageEnumeration: true,
    lateFailureProbability: 0,
    expectedWaste: 0,
    criticalCost: 0,
    continuationRecommendation: null,
    abandonsHunt: false,
    horizonOutcome,
    utilityAssessment,
    projectionAssessment: genericProjectionAssessmentFromOutcome(horizonOutcome),
    decisionVector: decisionVectorFromUtilityAssessment(utilityAssessment),
    nextSectionReadiness: null,
    valueOutcome: {
      lessonSkillPoints: 0,
      greatSuccessStatGain: 0,
      practiceBonusValue: 0,
      liveBonusValue: 0,
      practiceTrainingExposure: 0,
      spTrainingExposure: 0,
      friendshipTrainingExposure: 0,
    },
    reasons: [],
  };
};

test("le carryover résout l'action page même si une autre politique est affichée", () => {
  const stop = policy("stop", "stop-and-carry-stock", null, 2);
  const carry = policy("carry-page:a,b,c", "carry-page", null, 1, true, [
    "a",
    "b",
    "c",
  ]);
  const result = selectCarryoverPolicy({
    policies: [stop, carry],
    displayed: stop,
    visibleSongIds: new Set(["a", "b", "c"]),
  });
  assert.equal(result?.id, "carry-page:a,b,c");
});

test("une action carry qui ne décrit pas la page visible est rejetée", () => {
  const partial = policy("carry-page:a,b", "carry-page", null, 2, true, [
    "a",
    "b",
  ]);
  const result = selectCarryoverPolicy({
    policies: [partial],
    displayed: partial,
    visibleSongIds: new Set(["a", "b", "c"]),
  });
  assert.equal(result, null);
});
