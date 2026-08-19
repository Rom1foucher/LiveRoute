import assert from "node:assert/strict";
import test from "node:test";
import {
  addPairedDifference,
  createPairedDifferenceStats,
} from "../src/monte-carlo.ts";
import {
  coRecommendationReason,
  pairedUtilityRobustness,
  ROBUSTNESS_CONFIDENCE_LEVEL,
  ROBUSTNESS_POLICY,
  stableCoRecommendationPrimary,
} from "../src/solver/robustness.ts";

const paired = (values: readonly number[]) => {
  const stats = createPairedDifferenceStats();
  for (const value of values) addPairedDifference(stats, value);
  return stats;
};

test("P4 freezes the paired robustness policy and confidence level", () => {
  const report = pairedUtilityRobustness({
    stats: paired(Array.from({ length: 80 }, () => 5)),
    minimumSamples: 80,
    maxSamples: 80,
    couplingKey: "p4:crn",
  });
  assert.equal(report.policy, ROBUSTNESS_POLICY);
  assert.equal(report.confidenceLevel, ROBUSTNESS_CONFIDENCE_LEVEL);
  assert.equal(report.separation, "above");
  assert.equal(report.convergenceReason, "paired-separated");
  assert.deepEqual(report.interval, [5, 5]);
});

test("P4 reports not-separated at the draw budget instead of calling actions equivalent", () => {
  const report = pairedUtilityRobustness({
    stats: paired(Array.from({ length: 80 }, (_, index) => (index % 2 ? 1 : -1))),
    minimumSamples: 80,
    maxSamples: 80,
    couplingKey: "p4:boundary",
  });
  assert.equal(report.separation, "not-separated");
  assert.equal(report.convergenceReason, "max-samples");
  assert.ok(report.interval[0] < 0);
  assert.ok(report.interval[1] > 0);
});

test("P4 keeps Monte-Carlo and calibration co-recommendation causes distinct", () => {
  assert.equal(
    coRecommendationReason({
      monteCarloNotSeparated: true,
      calibrationSensitive: false,
    }),
    "monte-carlo-not-separated",
  );
  assert.equal(
    coRecommendationReason({
      monteCarloNotSeparated: false,
      calibrationSensitive: true,
    }),
    "calibration-sensitive",
  );
  assert.equal(
    coRecommendationReason({
      monteCarloNotSeparated: true,
      calibrationSensitive: true,
    }),
    "both",
  );
  assert.equal(
    coRecommendationReason({
      monteCarloNotSeparated: false,
      calibrationSensitive: false,
    }),
    null,
  );
});

test("P4 co-recommendation primary uses an explicit stable order, never a noisy mean", () => {
  assert.equal(
    stableCoRecommendationPrimary(
      ["expose-and-carry", "stop-now"],
      ["stop-now", "expose-and-carry"],
    ),
    "stop-now",
  );
});


test("P4 records a wall-clock stop as time-budget even before minimum samples", () => {
  const stats = createPairedDifferenceStats();
  for (let index = 0; index < 32; index += 1) addPairedDifference(stats, 1);
  const report = pairedUtilityRobustness({
    stats,
    minimumSamples: 192,
    maxSamples: 2400,
    couplingKey: "p4-time-budget",
    timeBudgetExceeded: true,
  });
  assert.equal(report.convergenceReason, "time-budget");
  assert.equal(report.samples, 32);
});
