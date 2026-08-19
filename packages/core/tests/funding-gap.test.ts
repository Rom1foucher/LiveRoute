import assert from "node:assert/strict";
import test from "node:test";

import {
  TOKEN_KEYS,
  fundingGap,
  runAnalysis,
  summarizeFundingGapSamples,
  weightedFundingGap,
  type Balance,
  type TokenShadowPrice,
} from "../src/live-model.ts";
import { analysisProbabilityBreakdown } from "../src/diagnostics/decision-log.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = (
  id: string,
  cost: Partial<Balance>,
  priority = false,
) => ({
  id,
  name: id,
  cost: balance(cost),
  priority,
  utility: priority ? 10 : 1,
});

test("P1′ immediate funding gap is exact and monotone in every token colour", () => {
  const cost = balance({ dance: 21, visual: 42, mental: 12 });
  const base = balance({ dance: 20, visual: 33, mental: 20 });
  const baseGap = fundingGap(base, cost);

  assert.deepEqual(baseGap, balance({ dance: 1, visual: 9 }));

  for (const key of TOKEN_KEYS) {
    const richer = { ...base, [key]: base[key] + 7 };
    const richerGap = fundingGap(richer, cost);
    for (const compared of TOKEN_KEYS) {
      assert.ok(
        richerGap[compared] <= baseGap[compared],
        `${key} +7 must not increase ${compared} funding gap`,
      );
    }
  }
});

test("P1′ weighted funding gap uses only named common shadow prices", () => {
  const gap = balance({ dance: 4, visual: 9 });
  const shadows: TokenShadowPrice[] = [
    { key: "dance", shadowValue: 0.5, weightedDemand: 10 },
    { key: "passion", shadowValue: 0, weightedDemand: 0 },
    { key: "vocal", shadowValue: 0, weightedDemand: 0 },
    { key: "visual", shadowValue: 2, weightedDemand: 40 },
    { key: "mental", shadowValue: 0, weightedDemand: 0 },
  ];

  assert.equal(weightedFundingGap(gap, shadows), 20);
});

test("P1′ zero-income funding gap remains a per-colour distribution", () => {
  const distribution = summarizeFundingGapSamples([
    balance({ visual: 0 }),
    balance({ visual: 9 }),
    balance({ visual: 9 }),
    balance({ visual: 22 }),
  ]);

  assert.equal(distribution.samples, 4);
  assert.deepEqual(distribution.byToken.visual, [
    { gap: 0, probability: 0.25 },
    { gap: 9, probability: 0.5 },
    { gap: 22, probability: 0.25 },
  ]);
  assert.deepEqual(distribution.byToken.dance, [
    { gap: 0, probability: 1 },
  ]);
});

test("P1′ separates target appearance from a nine-Visual funding deficit", () => {
  const target = song("target", { visual: 42 }, true);
  const result = runAnalysis({
    period: "senior",
    tokens: balance({ visual: 33 }),
    techniquesRemaining: 0,
    songs: [
      target,
      song("filler-a", { dance: 1 }),
      song("filler-b", { passion: 1 }),
      song("filler-c", { vocal: 1 }),
    ],
    objective: "priority-song",
    seedKey: "p1-prime-nine-visual-gap",
    trials: 64,
  });
  const outcome = result.songOutcomes.find((item) => item.id === target.id);

  assert.ok(outcome);
  assert.equal(result.goalProbability, 0); // legacy joint field until P3a
  assert.equal(outcome.appearanceProbability, 0.75);
  assert.equal(outcome.physicalAffordable, false);
  assert.deepEqual(outcome.immediateFundingGap, balance({ visual: 9 }));
  assert.equal(outcome.zeroIncomeFundabilityProbability, 0);
  assert.deepEqual(outcome.zeroIncomeFundingGap.byToken.visual, [
    { gap: 9, probability: 1 },
  ]);
  assert.equal(result.zeroIncomeFundabilityProbability, 0);
});

test("P1′ future offer uncertainty is retained instead of averaged into one gap", () => {
  const target = song("target", { visual: 100 }, true);
  const result = runAnalysis({
    period: "senior",
    tokens: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    techniquesRemaining: 1,
    songs: [
      target,
      song("filler-a", { dance: 10 }),
      song("filler-b", { dance: 11 }),
      song("filler-c", { dance: 12 }),
    ],
    objective: "priority-song",
    seedKey: "p1-prime-gap-distribution",
    trials: 512,
  });
  const outcome = result.songOutcomes.find((item) => item.id === target.id);

  assert.ok(outcome);
  assert.equal(outcome.zeroIncomeFundingGap.samples, result.trials);
  assert.ok(outcome.zeroIncomeFundingGap.byToken.visual.length > 1);
  assert.equal(
    outcome.zeroIncomeFundingGap.byToken.visual.reduce(
      (sum, item) => sum + item.probability,
      0,
    ),
    1,
  );
  assert.ok(
    (outcome.zeroIncomeFundabilityProbability ?? 0) > 0 &&
      (outcome.zeroIncomeFundabilityProbability ?? 0) < 1,
  );
});

test("P1′ unavailable conditioning remains unknown instead of becoming zero", () => {
  const result = runAnalysis({
    period: "senior",
    tokens: balance(),
    candidateCost: balance({ dance: 1 }),
    techniquesRemaining: 1,
    songs: [song("target", { visual: 42 }, true)],
    objective: "priority-song",
    seedKey: "p1-prime-unknown-conditioning",
    trials: 64,
  });
  const outcome = result.songOutcomes[0];

  assert.equal(result.valid, false);
  assert.equal(result.physicalAffordable, false);
  assert.deepEqual(result.immediateFundingGap, balance({ dance: 1 }));
  assert.equal(result.zeroIncomeFundabilityProbability, null);
  assert.equal(outcome.zeroIncomeFundabilityProbability, null);
  assert.equal(outcome.zeroIncomeFundingGap.samples, 0);
  assert.deepEqual(outcome.zeroIncomeFundingGap.byToken.visual, []);
});


test("P1′ buy policies expose the same hard affordability and observed gap", () => {
  const target = song("visible-target", { visual: 42 }, true);
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({ visual: 33 }),
    visibleSongs: [target],
    remainingSongs: [target],
    techniquesToNextSong: 0,
    songsThisSection: 3,
    totalSongs: 15,
    concertIndex: 3,
    timingMode: "section-open",
    trials: 64,
  });
  const buy = result.policies.find((policy) => policy.action === "buy-stop");

  assert.ok(buy);
  assert.equal(buy.affordable, false);
  assert.equal(buy.fundingFeasibility?.physicalAffordable, false);
  assert.deepEqual(
    buy.fundingFeasibility?.immediateFundingGap,
    balance({ visual: 9 }),
  );
  assert.ok((buy.fundingFeasibility?.weightedFundingGap ?? -1) >= 0);
});

test("P1′ decision diagnostics preserve unavailable fundability as null", () => {
  const result = runAnalysis({
    period: "senior",
    tokens: balance(),
    candidateCost: balance({ dance: 1 }),
    techniquesRemaining: 1,
    songs: [song("target", { visual: 42 }, true)],
    objective: "priority-song",
    seedKey: "p1-prime-breakdown-null",
    trials: 64,
  });
  const breakdown = analysisProbabilityBreakdown(result);

  assert.equal(breakdown.zeroIncomeFundabilityProbability, null);
  assert.equal(breakdown.targetAffordableProbabilityGivenAppearance, 0);
});
