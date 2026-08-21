import assert from "node:assert/strict";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import {
  DECISION_DIAGNOSTIC_SCHEMA,
  canonicalAnalysisDecisionDiagnostics,
  canonicalSongDecisionDiagnostics,
} from "../src/diagnostics/decision-diagnostics.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import { runAnalysis } from "../src/live-model.ts";

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
  roles: SongTarget["roles"] = ["filler"],
): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  roles,
  priority: (roles ?? []).some((role) =>
    ["sp2-target", "sp3-target", "friendship-10", "friendship-5"].includes(
      role,
    ),
  ),
  utility:
    (roles ?? []).includes("sp2-target") || (roles ?? []).includes("sp3-target")
      ? 5
      : 1,
  policyValue:
    (roles ?? []).includes("sp2-target") || (roles ?? []).includes("sp3-target")
      ? 500
      : 0,
});

const rich = balance({
  dance: 100,
  passion: 100,
  vocal: 100,
  visual: 100,
  mental: 100,
});

test("P6 song log materializes one canonical T1a/T1b/robustness view", () => {
  const sp3 = song("SP3", { dance: 21 }, ["sp3-target"]);
  const friendship = song("friend", { vocal: 21 }, ["friendship-5"]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [friendship, sp3],
    remainingSongs: [friendship, sp3],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 9,
    concertIndex: 2,
    timingMode: "section-open",
    trials: 300,
  });
  const recommended = result.recommended;
  assert.ok(recommended);

  const diagnostics = canonicalSongDecisionDiagnostics(result, recommended);
  assert.equal(diagnostics.schema, DECISION_DIAGNOSTIC_SCHEMA);
  assert.equal(diagnostics.modelCoverage, "full-t1a-t1b-t2");
  assert.equal(diagnostics.versions.projectionPolicy, "grand-live-zero-income-v1");
  assert.equal(diagnostics.versions.utilityModel, "grand-live-stat-numeraire-v1");
  assert.equal(diagnostics.versions.robustnessPolicy, "grand-live-robustness-v1");
  assert.equal(diagnostics.robustness.coRecommendationReason, "calibration-sensitive");
  assert.equal(diagnostics.robustness.paired, null);
  assert.ok(diagnostics.robustness.breakpoints.length > 0);
  assert.equal(diagnostics.separation.firstSeparatingLayer, "structural-tier");

  assert.equal(diagnostics.t1a.status, "available");
  if (diagnostics.t1a.status === "available") {
    const sp = diagnostics.t1a.value.components.find(
      (component) => component.metric === "expected-skill-points",
    );
    assert.equal(sp?.unit, "skill-point");
    assert.equal(sp?.transform, "identity");
  }

  assert.equal(diagnostics.t1b.status, "available");
  if (diagnostics.t1b.status === "available") {
    assert.equal(
      diagnostics.t1b.value.calibration.some(
        (parameter) => String(parameter.id) === "FRIENDSHIP_EXPOSURE_STAT_RATE",
      ),
      false,
    );
    assert.deepEqual(diagnostics.t1b.value.boundedCalibrationInterval, {
      lower: diagnostics.t1b.value.nominalStatPoints,
      upper: diagnostics.t1b.value.nominalStatPoints,
    });
    assert.equal(
      diagnostics.t1b.value.breakpoints.length,
      diagnostics.robustness.breakpoints.length,
    );
  }

  assert.equal(diagnostics.gates.status, "available");
  if (diagnostics.gates.status === "available") {
    const gate18 = diagnostics.gates.value.find((gate) => gate.id === "gate18");
    assert.ok(gate18);
    assert.deepEqual(gate18.reward, {
      statDelta: 0,
      skillPointDelta: 0,
      residualUtilityParameter: null,
    });
  }

  assert.equal(diagnostics.t2.status, "available");
  if (diagnostics.t2.status === "available") {
    assert.equal(diagnostics.t2.value.friendshipExposureAffectsRanking, false);
    assert.ok(diagnostics.t2.value.expectedSkillPoints > 0);
  }
});

test("P6 keeps current physical impossibility separate from future appearance", () => {
  const expensive = song("expensive", { visual: 42 }, ["sp3-target"]);
  const result = analyzeSongSelection({
    period: "junior",
    tokens: balance({ visual: 33 }),
    visibleSongs: [expensive],
    remainingSongs: [expensive],
    techniquesToNextSong: 1,
    songsThisSection: 0,
    totalSongs: 1,
    concertIndex: 0,
    timingMode: "section-open",
    trials: 80,
  });
  const buy = result.policies.find((policy) => policy.action === "buy-stop");
  assert.ok(buy);
  const diagnostics = canonicalSongDecisionDiagnostics(result, buy);
  assert.equal(
    diagnostics.action.physicalFeasibility.physicalAffordable,
    false,
  );
  assert.equal(
    diagnostics.action.physicalFeasibility.immediateFundingGap?.visual,
    9,
  );
  assert.deepEqual(diagnostics.funding.currentActionAppearanceProbability, {
    status: "available",
    value: 1,
  });
  assert.equal(
    diagnostics.funding.zeroIncomeFundingGap.status,
    "unavailable",
  );
  assert.equal(
    diagnostics.funding.zeroIncomeFundabilityProbability.status,
    "unavailable",
  );
});

test("P6 analysis path logs per-song zero-income gap distributions without fabricating T1a", () => {
  const target = song("target", { visual: 42 }, ["sp3-target"]);
  const result = runAnalysis({
    period: "junior",
    tokens: balance({ visual: 33 }),
    techniquesRemaining: 1,
    songs: [target],
    objective: "priority-song",
    seedKey: "p6-analysis-diagnostics",
    trials: 80,
    minimumSamples: 80,
  });
  const diagnostics = canonicalAnalysisDecisionDiagnostics({
    id: "option-1",
    action: "technique-option-1",
    result,
    rankReasonCode: "affordability",
  });
  assert.equal(diagnostics.modelCoverage, "physical-projection-only");
  assert.equal(diagnostics.t1a.status, "unavailable");
  assert.equal(diagnostics.t1b.status, "unavailable");
  assert.equal(
    diagnostics.funding.zeroIncomeFundingGap.status,
    "unavailable",
  );
  assert.equal(diagnostics.funding.zeroIncomeFundingGapBySong.length, 1);
  assert.equal(
    diagnostics.funding.zeroIncomeFundingGapBySong[0]?.distribution.provenance,
    "zero-income-projection",
  );
  assert.equal(
    diagnostics.separation.firstSeparatingLayer,
    "physical-feasibility",
  );
});

test("P6 gate diagnostics never relabel zero-income projections as lower bounds", () => {
  const filler = song("filler", { dance: 21 });
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: [filler],
    remainingSongs: [filler],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 15,
    concertIndex: 3,
    timingMode: "section-open",
    trials: 80,
  });
  const candidate = result.recommended;
  assert.ok(candidate);
  const diagnostics = canonicalSongDecisionDiagnostics(result, candidate);
  assert.equal(diagnostics.gates.status, "available");
  if (diagnostics.gates.status === "available") {
    for (const gate of diagnostics.gates.value) {
      if (gate.zeroIncomeReach.status !== "available") continue;
      assert.equal(
        gate.zeroIncomeReach.value.label,
        "zero-income-conservative-estimate",
      );
    }
  }
});
