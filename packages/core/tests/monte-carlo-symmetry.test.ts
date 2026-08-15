import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualSongValues,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { SONGS } from "../src/domain/song-data.ts";
import { samplingTraceFromRuns } from "../src/diagnostics/decision-log.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { evaluateTerminalTechniqueOptions } from "../src/solver/terminal-technique.ts";

const balance = (value: number): Balance => ({
  dance: value,
  passion: value,
  vocal: value,
  visual: value,
  mental: value,
});

const cost = (partial: Partial<Balance>): Balance => ({
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

const currentSongs = [
  "kiseki",
  "tachiichi",
  "nigekiri",
  "go-this-way",
  "ring-ring",
  "seishun",
].map(songTarget);

const plan = deriveStrategicPlan({
  concertIndex: 0,
  timingMode: "deadline-now",
  remainingSongs: currentSongs,
});

const evaluate = (
  candidates: Array<{ id: string; cost: Balance }>,
  trials = 320,
  minimumSamples = trials,
) =>
  evaluateTerminalTechniqueOptions({
    concertIndex: 0,
    period: "junior",
    tokens: balance(22),
    candidates,
    techniquesRemaining: 4,
    currentSongs,
    totalSongs: 3,
    plan,
    trials,
    minimumSamples,
    seedKey: "pr3-crn",
  });

test("PR-3 : deux actions 24 Mental identiques ont exactement la même distribution", () => {
  const assessments = evaluate([
    { id: "left-ui-slot", cost: cost({ mental: 24 }) },
    { id: "renamed-right-ui-slot", cost: cost({ mental: 24 }) },
  ]);
  assert.ok(assessments);
  assert.equal(assessments.length, 2);
  const [left, right] = assessments;
  assert.equal(left.canonicalActionKey, right.canonicalActionKey);
  assert.equal(left.seedKey, right.seedKey);
  assert.deepEqual(left.decisionVector, right.decisionVector);
  assert.equal(left.reachProbability, right.reachProbability);
  assert.equal(left.expectedCommittedCost, right.expectedCommittedCost);
  assert.equal(left.action, right.action);
});

test("PR-3 : renommer et permuter les options ne change pas leur résultat physique", () => {
  const first = evaluate([
    { id: "A", cost: cost({ dance: 10 }) },
    { id: "B", cost: cost({ mental: 10 }) },
  ]);
  const second = evaluate([
    { id: "renamed-B", cost: cost({ mental: 10 }) },
    { id: "renamed-A", cost: cost({ dance: 10 }) },
  ]);
  assert.ok(first && second);
  const canonical = (values: typeof first) =>
    new Map(values.map((value) => [value.canonicalActionKey, value] as const));
  const left = canonical(first);
  const right = canonical(second);
  assert.deepEqual([...left.keys()].sort(), [...right.keys()].sort());
  for (const key of left.keys()) {
    const a = left.get(key)!;
    const b = right.get(key)!;
    assert.equal(a.reachProbability, b.reachProbability);
    assert.equal(a.action, b.action);
    assert.deepEqual(a.decisionVector, b.decisionVector);
  }
});

test("PR-3 : Express et Expert convergent sur le même scénario près de la frontière", () => {
  const candidate = [{ id: "boundary", cost: cost({ dance: 10 }) }];
  const express = evaluate(candidate, 3600, 192)?.[0];
  const expert = evaluate(candidate, 7200, 320)?.[0];
  assert.ok(express && expert);
  assert.equal(express.converged, true);
  assert.equal(expert.converged, true);
  assert.equal(express.uncertainAtBudgetLimit, false);
  assert.equal(expert.uncertainAtBudgetLimit, false);
  assert.equal(express.trials, expert.trials);
  assert.equal(express.reachProbability, expert.reachProbability);
  assert.equal(express.action, expert.action);
});

test("PR-3 : un petit budget ambigu est explicitement marqué uncertain-at-budget-limit", () => {
  const assessment = evaluate(
    [{ id: "boundary", cost: cost({ dance: 10 }) }],
    80,
    80,
  )?.[0];
  assert.ok(assessment);
  assert.equal(assessment.converged, false);
  assert.equal(assessment.uncertainAtBudgetLimit, true);

  const trace = samplingTraceFromRuns([
    {
      purpose: "terminal",
      seedKey: assessment.seedKey,
      trials: assessment.trials,
      maxTrials: assessment.maxTrials,
      converged: assessment.converged,
      uncertainAtBudgetLimit: assessment.uncertainAtBudgetLimit,
      probabilities: {
        terminalUsableOutcomeProbability: assessment.reachProbability,
      },
    },
  ]);
  assert.equal(trace.runs[0].stopReason, "uncertain-at-budget-limit");
});
