import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import {
  createLegacyCompatibleHorizonOutcome,
  horizonMetricComponents,
  horizonValue,
  legacyDecisionVectorFromOutcome,
} from "../src/solver/horizon-outcome.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = (id: string): SongTarget => ({
  id,
  name: id,
  cost: balance({ dance: 21 }),
  priority: false,
  utility: 1,
  policyValue: 0,
  roles: ["filler"],
});

test("P3a adapter reconstructs the legacy vector without losing raw metrics", () => {
  const outcome = createLegacyCompatibleHorizonOutcome({
    tieId: "speed:buy-stop",
    hard: 1,
    riskAdmissible: 1,
    structural: 2,
    certain: [
      horizonValue("immediate-training-exposure", 41.8, "floor-div-20"),
      horizonValue("friendship-training-exposure", 19.9, "floor-div-20"),
    ],
    prospective: [0.996, 35],
    continuation: [
      horizonValue("immediate-training-exposure", 41.8),
      horizonValue("friendship-training-exposure", 19.9),
      0.99,
    ],
    retainedTokens: 100,
    committedCost: 42,
  });

  assert.deepEqual(legacyDecisionVectorFromOutcome(outcome), {
    hard: 1,
    riskAdmissible: 1,
    structural: 2,
    certain: [2, 0],
    prospective: [0.996, 35],
    continuation: [41.8, 19.9, 0.99],
    retainedTokens: 100,
    committedCost: 42,
    tieId: "speed:buy-stop",
  });

  const immediate = horizonMetricComponents(
    outcome,
    "immediate-training-exposure",
  );
  assert.deepEqual(immediate, [
    {
      id: "immediate-training-exposure",
      metric: "immediate-training-exposure",
      value: 41.8,
    },
  ]);
  assert.deepEqual(outcome.legacyProjection.certain[0], {
    componentId: immediate[0].id,
    transform: "floor-div-20",
  });
  assert.deepEqual(outcome.legacyProjection.continuation[0], {
    componentId: immediate[0].id,
    transform: "identity",
  });
});

test("P3a all song actions expose HorizonOutcome and derive the legacy vector from it", () => {
  const visible = song("visible");
  const deadline = analyzeSongSelection({
    period: "junior",
    tokens: balance({ dance: 100, visual: 100, mental: 100 }),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 2,
    concertIndex: 0,
    timingMode: "deadline-now",
    trials: 40,
  });
  const open = analyzeSongSelection({
    period: "junior",
    tokens: balance({ dance: 100, visual: 100, mental: 100 }),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 2,
    concertIndex: 0,
    timingMode: "section-open",
    trials: 40,
  });

  const grandLive = analyzeSongSelection({
    period: "senior",
    tokens: balance({ dance: 100, visual: 100, mental: 100 }),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 18,
    concertIndex: 4,
    timingMode: "section-open",
    trials: 40,
  });

  const policies = [...deadline.policies, ...open.policies, ...grandLive.policies];
  for (const action of [
    "buy-stop",
    "buy-continue",
    "carry-page",
    "stop-and-carry-stock",
    "wait-reserve",
  ] as const) {
    const policy = policies.find((candidate) => candidate.action === action);
    assert.ok(policy, `missing ${action}`);
    assert.ok(policy.horizonOutcome, `${action} has no HorizonOutcome`);
    assert.deepEqual(
      policy.decisionVector,
      legacyDecisionVectorFromOutcome(policy.horizonOutcome),
      `${action} bypasses the P3a adapter`,
    );
  }
});

test("P3a keeps legacy transforms out of song-policy business code", () => {
  const source = readFileSync(
    new URL("../src/solver/song-policy.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /decisionVector\s*:\s*\{/);
  assert.doesNotMatch(source, /Math\.floor\([^\n]*\/\s*20\)/);
  assert.match(source, /createLegacyCompatibleHorizonOutcome/);
});
