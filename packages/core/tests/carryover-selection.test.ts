import assert from "node:assert/strict";
import test from "node:test";
import { selectCarryoverPolicy } from "../src/domain/carryover-selection.ts";
import type { SongPolicyEvaluation } from "../src/solver/song-policy.ts";

const policy = (
  id: string,
  action: SongPolicyEvaluation["action"],
  songId: string | null,
  hard: number,
  valid = true,
): SongPolicyEvaluation => ({
  id,
  action,
  songId,
  songName: songId ?? "none",
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
  decisionVector: {
    hard,
    riskAdmissible: 1,
    prospective: [],
    structural: 1,
    continuation: [],
    retainedTokens: 0,
    committedCost: 0,
    tieId: id,
  },
  nextSectionReadiness: null,
  valueOutcome: {
    lessonSkillPoints: 0,
    greatSuccessStatGain: 0,
    practiceBonusValue: 0,
    liveBonusValue: 0,
  },
  reasons: [],
});

test("le bouton carryover résout une page valide même si STOP est affiché", () => {
  const stop = policy("stop", "stop-and-carry-stock", null, 2);
  const weak = policy("a:carry", "carry-page", "a", 1);
  const strong = policy("b:carry", "carry-page", "b", 2);
  const result = selectCarryoverPolicy({
    policies: [stop, weak, strong],
    displayed: stop,
    visibleSongIds: new Set(["a", "b", "c"]),
  });
  assert.equal(result?.id, "b:carry");
});

test("le carry affiché reste la cible du bouton", () => {
  const displayed = policy("a:carry", "carry-page", "a", 1);
  const other = policy("b:carry", "carry-page", "b", 2);
  const result = selectCarryoverPolicy({
    policies: [displayed, other],
    displayed,
    visibleSongIds: new Set(["a", "b"]),
  });
  assert.equal(result?.id, "a:carry");
});
