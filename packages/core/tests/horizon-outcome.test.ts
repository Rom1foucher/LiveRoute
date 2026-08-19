import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import {
  assertHorizonMetricContracts,
  createHorizonOutcome,
  decisionVectorFromOutcome,
  horizonMetricNumber,
  metricContract,
  outcomeComponent,
  type HorizonOutcomeComponent,
} from "../src/solver/horizon-outcome.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import { compareDecisionVectors } from "../src/solver/value.ts";

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

test("P3b1 gives every MetricId one global unit and transform", () => {
  assert.doesNotThrow(assertHorizonMetricContracts);
  assert.deepEqual(metricContract("expected-practice-stat-delta"), {
    unit: "stat-point",
    transform: "identity",
  });
  assert.equal(metricContract("expected-skill-points").unit, "skill-point");
  assert.equal(
    metricContract("friendship-exposure").unit,
    "friendship-pt-training",
  );
  assert.equal(
    metricContract("next-section-target-probability").transform,
    "probability-band-5pct",
  );
});

test("P3b1 rejects per-action unit or transform overrides", () => {
  const canonical = outcomeComponent(
    "expected-practice-stat-delta",
    41.8,
    "zero-income-projection",
  );
  const wrongUnit = {
    ...canonical,
    unit: "skill-point",
  } as HorizonOutcomeComponent;
  const wrongTransform = {
    ...canonical,
    transform: "probability-band-5pct",
  } as HorizonOutcomeComponent;

  assert.throws(
    () => createHorizonOutcome({ tieId: "wrong-unit", components: [wrongUnit] }),
    /must use unit stat-point/,
  );
  assert.throws(
    () =>
      createHorizonOutcome({
        tieId: "wrong-transform",
        components: [wrongTransform],
      }),
    /must use transform identity/,
  );
});

test("P3b1 removes the BUY-only floor: raw stat deltas remain ordered", () => {
  const outcome = (tieId: string, value: number) =>
    createHorizonOutcome({
      tieId,
      components: [
        outcomeComponent("hard-state", 1, "deterministic-consequence"),
        outcomeComponent(
          "risk-admissible-state",
          1,
          "deterministic-consequence",
        ),
        outcomeComponent(
          "expected-practice-stat-delta",
          value,
          "zero-income-projection",
        ),
      ],
    });
  const high = outcome("high", 41.8);
  const low = outcome("low", 39.9);

  assert.equal(horizonMetricNumber(high, "expected-practice-stat-delta"), 41.8);
  assert.ok(
    compareDecisionVectors(
      decisionVectorFromOutcome(high),
      decisionVectorFromOutcome(low),
    ) > 0,
  );
});

test("P3b1 records retained tokens as state without generic token utility", () => {
  const outcome = (tokens: number) =>
    createHorizonOutcome({
      tieId: "same-action",
      components: [
        outcomeComponent("hard-state", 1, "deterministic-consequence"),
        outcomeComponent("retained-tokens", tokens, "observed"),
      ],
    });

  const poor = outcome(5);
  const rich = outcome(500);
  assert.notEqual(
    horizonMetricNumber(poor, "retained-tokens"),
    horizonMetricNumber(rich, "retained-tokens"),
  );
  assert.deepEqual(
    decisionVectorFromOutcome(poor),
    decisionVectorFromOutcome(rich),
  );
});

test("P3b1 all song actions expose the same HorizonOutcome decision seam", () => {
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
    assert.deepEqual(
      policy.decisionVector,
      decisionVectorFromOutcome(policy.horizonOutcome),
      `${action} bypasses the P3b1 HorizonOutcome seam`,
    );
  }
});

test("P3b1 deletes the P3a legacy adapter and mixed-unit exposure path", () => {
  const horizonSource = readFileSync(
    new URL("../src/solver/horizon-outcome.ts", import.meta.url),
    "utf8",
  );
  const policySource = readFileSync(
    new URL("../src/solver/song-policy.ts", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "legacyDecisionVectorFromOutcome",
    "createLegacyCompatibleHorizonOutcome",
    "LegacyDecisionTransform",
    "legacyProjection",
    "floor-div-20",
  ]) {
    assert.doesNotMatch(horizonSource, new RegExp(forbidden));
    assert.doesNotMatch(policySource, new RegExp(forbidden));
  }
  assert.doesNotMatch(policySource, /currentImmediateTrainingExposure/);
  assert.doesNotMatch(policySource, /totalAfterAction\s*\/\s*pacingTarget/);
  assert.doesNotMatch(policySource, /decisionVector\s*:\s*\{/);
});
