import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisProbabilityBreakdown,
  appendDecisionLog,
  decisionStateHash,
  loggedBalanceAfterConcert,
  loggedBalanceAfterPurchase,
  loggedTrackedBalanceAfterConcert,
  loggedTrackedBalanceAfterPurchase,
  configureDecisionLog,
  wilson95,
  type DecisionLogState,
} from "../src/diagnostics/decision-log.ts";
import { canonicalAnalysisDecisionDiagnostics } from "../src/diagnostics/decision-diagnostics.ts";
import {
  browserDecisionSession,
  browserDecisionSink,
} from "../src/adapters/browser.ts";
import { runAnalysis } from "../src/live-model.ts";

class StorageMock {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const state = (visibleSongIds: string[]): DecisionLogState => ({
  concertIndex: 2,
  songCycle: 3,
  techniquesDone: 1,
  techniquesTarget: 4,
  songsThisSection: 2,
  totalSongs: 10,
  timingMode: "section-open",
  tokens: { dance: 90, passion: 80, vocal: 70, visual: 60, mental: 50 },
  visibleSongIds,
  carryoverSongIds: null,
  solverMode: "express",
  riskProfile: "standard",
  generationProfile: "speed-wit",
  objective: "priority-song",
  plan: { id: "hunt-sp3", mode: "hunt", label: "HUNT SP +3" },
  stateSignature: "fixture",
});

test("le hash d'état est stable malgré l'ordre des offres", () => {
  assert.equal(
    decisionStateHash(state(["b", "a", "c"])),
    decisionStateHash(state(["c", "b", "a"])),
  );
  assert.notEqual(
    decisionStateHash(state(["a", "b"])),
    decisionStateHash(state(["a", "c"])),
  );
});

test("PR-6 : le hash d’état change avec l’état HUNT mais pas avec l’ordre de ses cibles", () => {
  const base = state(["a", "b", "c"]);
  const first = {
    ...base,
    huntState: {
      targetIds: ["sp3-b", "sp3-a"],
      pagesSeenWithoutTarget: 3,
      committedTechniqueCost: {
        dance: 21,
        passion: 0,
        vocal: 0,
        visual: 12,
        mental: 0,
      },
      fillerPurchasesWhileHunting: 1,
      status: "active" as const,
      lastObservedPageKey: "2:4",
    },
  };
  const reordered = {
    ...first,
    huntState: {
      ...first.huntState,
      targetIds: ["sp3-a", "sp3-b"],
      committedTechniqueCost: {
        mental: 0,
        visual: 12,
        vocal: 0,
        passion: 0,
        dance: 21,
      },
    },
  };
  const extraMiss = {
    ...first,
    huntState: { ...first.huntState, pagesSeenWithoutTarget: 4 },
  };
  assert.equal(decisionStateHash(first), decisionStateHash(reordered));
  assert.notEqual(decisionStateHash(first), decisionStateHash(extraMiss));
});

test("le journal navigateur écrit un événement v5 lié, versionné et hashé", async () => {
  const localStorage = new StorageMock();
  const sessionStorage = new StorageMock();
  Object.assign(globalThis, {
    window: { localStorage, sessionStorage },
  });
  configureDecisionLog({
    appVersion: "0.25.0-test",
    sink: browserDecisionSink(),
    session: browserDecisionSession(),
  });

  const stateAfter = {
    ...state([]),
    tokens: loggedBalanceAfterPurchase(state([]).tokens, {
      dance: 21,
      passion: 0,
      vocal: 0,
      visual: 12,
      mental: 0,
    }),
  };
  const status = await appendDecisionLog({
    id: "choice-1",
    timestamp: "2026-08-03T21:00:00.000Z",
    event: "choice",
    source: "manual",
    state: state(["a", "b", "c"]),
    stateAfter,
    choice: {
      kind: "song",
      id: "a",
      label: "Song A",
      recommended: true,
    },
    previousDecisionId: "decision-1",
  });
  assert.equal(status?.storage, "browser");
  assert.equal(status?.exists, true);
  const stored = JSON.parse(
    localStorage.getItem("grand-live-decision-log-v2") ?? "[]",
  ) as Array<Record<string, unknown>>;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].schemaVersion, 5);
  assert.equal(stored[0].policyVersion, "grand-live-v8");
  assert.equal(stored[0].previousDecisionId, "decision-1");
  assert.match(String(stored[0].stateHash), /^C3-[0-9A-F]{8}$/);
  assert.equal(stored[0].stateAfterHash, decisionStateHash(stateAfter));
  assert.equal(
    (stored[0].choice as Record<string, unknown>).matchedRecommendation,
    true,
  );
});

test("le journal navigateur reste borné en octets et garde les plus récents", async () => {
  const localStorage = new StorageMock();
  const sessionStorage = new StorageMock();
  Object.assign(globalThis, { window: { localStorage, sessionStorage } });
  configureDecisionLog({
    appVersion: "0.25.0-test",
    sink: browserDecisionSink(),
    session: browserDecisionSession(),
  });

  // Real entries carry their canonical diagnostics; padding stands in for that
  // bulk so the byte budget, not the entry count, is what binds here.
  const padding = "x".repeat(20_000);
  let last: string | undefined;
  for (let index = 0; index < 120; index += 1) {
    last = `choice-${index}`;
    await appendDecisionLog({
      id: last,
      timestamp: "2026-08-03T21:00:00.000Z",
      event: "choice",
      source: "manual",
      state: state([padding]),
      choice: { kind: "song", id: "a", label: "Song A", recommended: true },
    });
  }

  const raw = localStorage.getItem("grand-live-decision-log-v2") ?? "[]";
  const stored = JSON.parse(raw) as Array<Record<string, unknown>>;
  assert.ok(
    raw.length <= 1_000_000,
    `journal de ${raw.length} octets au-dessus du budget`,
  );
  assert.ok(stored.length > 0);
  assert.ok(stored.length < 120, "aucune entrée ancienne n'a été rognée");
  assert.equal(stored.at(-1)?.id, last);
});

test("un quota saturé n'interrompt jamais la run", async () => {
  // Reproduces GitHub issue #2: the origin budget is already full, so setItem
  // throws. The append must absorb it and the run must continue.
  class FullStorage extends StorageMock {
    override setItem(): void {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    }
  }
  const localStorage = new FullStorage();
  Object.assign(globalThis, {
    window: { localStorage, sessionStorage: new StorageMock() },
  });
  configureDecisionLog({
    appVersion: "0.25.0-test",
    sink: browserDecisionSink(),
    session: browserDecisionSession(),
  });

  await assert.doesNotReject(() =>
    appendDecisionLog({
      id: "choice-quota",
      timestamp: "2026-08-03T21:00:00.000Z",
      event: "choice",
      source: "manual",
      state: state(["a"]),
      choice: { kind: "song", id: "a", label: "Song A", recommended: true },
    }),
  );
});

test("la comptabilité du journal débite toujours les achats et crédite toujours +10", () => {
  const tokens = state([]).tokens;
  assert.deepEqual(
    loggedBalanceAfterPurchase(tokens, {
      dance: 21,
      passion: 0,
      vocal: 0,
      visual: 12,
      mental: 0,
    }),
    { dance: 69, passion: 80, vocal: 70, visual: 48, mental: 50 },
  );
  assert.deepEqual(loggedBalanceAfterConcert(tokens, 2), {
    dance: 100,
    passion: 90,
    vocal: 80,
    visual: 70,
    mental: 60,
  });
});

test("le journal ne fabrique plus un débit ou un +10 que le tracker n’a pas appliqué", () => {
  const tokens = state([]).tokens;
  const cost = { dance: 21, passion: 0, vocal: 0, visual: 12, mental: 0 };
  assert.deepEqual(
    loggedTrackedBalanceAfterPurchase(tokens, cost, false),
    tokens,
  );
  assert.deepEqual(loggedTrackedBalanceAfterConcert(tokens, 2, false), tokens);
  assert.deepEqual(
    loggedTrackedBalanceAfterPurchase(tokens, cost, true),
    loggedBalanceAfterPurchase(tokens, cost),
  );
  assert.deepEqual(
    loggedTrackedBalanceAfterConcert(tokens, 2, true),
    loggedBalanceAfterConcert(tokens, 2),
  );
});

test("Wilson 95 % reste borné et se resserre avec davantage d’échantillons", () => {
  const small = wilson95(0.92, 180);
  const large = wilson95(0.92, 12000);
  assert.ok(small.lower >= 0 && small.upper <= 1);
  assert.ok(large.lower >= 0 && large.upper <= 1);
  assert.ok(large.upper - large.lower < small.upper - small.lower);
});

test("v5 distingue P(page) de P(outcome terminal utilisable)", () => {
  const base = runAnalysis({
    period: "senior",
    tokens: state([]).tokens,
    techniquesRemaining: 0,
    objective: "carryover",
    seedKey: "decision-log-probability-breakdown",
    trials: 80,
  });
  const result = {
    ...base,
    terminalDecision: {
      applicable: true as const,
      action: "stop-now" as const,
      reason: {
        code: "terminal.stopNow" as const,
        gain: { code: "terminal.gainNone" as const },
      },
      trials: 80,
      maxTrials: 80,
      converged: false,
      uncertainAtBudgetLimit: true,
      coRecommended: ["expose-and-carry"] as const,
      coRecommendationReason: "monte-carlo-not-separated" as const,
      calibrationSensitiveParameters: [],
      calibrationBreakpoints: [],
      pairedUtility: {
        policy: "grand-live-robustness-v1" as const,
        mean: 0,
        interval: [-1, 1] as const,
        confidenceLevel: 0.95 as const,
        samples: 80,
        maxSamples: 80,
        separation: "not-separated" as const,
        convergenceReason: "max-samples" as const,
        couplingKey: "terminal:fixture:future",
      },
      seedKey: "terminal:fixture",
      canonicalActionKey: "tech:fixture",
      reachProbability: 0.75,
      expectedCommittedCost: 0,
      expectedWeightedCommittedCost: 0,
      expectedOpportunityCost: 0,
      riskThreshold: 0.92,
      catastropheFloor: 0.72,
      admissionThreshold: 0.72,
      reachConfidenceInterval: [0.65, 0.83] as const,
      reachConfidenceLowerBound: 0.65,
      grossValue: 0,
      riskPenalty: 0,
      netValue: 0,
      stopCheckpointProbability: 0,
      pushCheckpointProbability: 0,
      stopTargetProbability: 0,
      pushTargetProbability: 0,
      stopFriendship10Probability: 0,
      pushFriendship10Probability: 0,
      stopEffectiveFriendship10Probability: 0,
      pushEffectiveFriendship10Probability: 0,
      stopExpectedFriendshipBonus: 0,
      pushExpectedFriendshipBonus: 0,
      stopExpectedFriendshipTrainingExposure: 0,
      pushExpectedFriendshipTrainingExposure: 0,
      stopExpectedSpTrainingExposure: 0,
      pushExpectedSpTrainingExposure: 0,
      stopExpectedPracticeTrainingExposure: 0,
      pushExpectedPracticeTrainingExposure: 0,
      stopExpectedStructuralPurchases: 0,
      pushExpectedStructuralPurchases: 0,
      decisionVector: [],
    },
  };
  const breakdown = analysisProbabilityBreakdown(result);
  assert.equal(breakdown.pageReachProbability, 1);
  assert.equal(breakdown.terminalUsableOutcomeProbability, 0.75);

  const canonical = canonicalAnalysisDecisionDiagnostics({
    id: "fixture",
    action: "technique",
    result,
    rankReasonCode: "terminal-hard-state",
  });
  assert.equal(canonical.robustness.paired?.interval[0], -1);
  assert.equal(canonical.robustness.paired?.interval[1], 1);
  assert.equal(canonical.robustness.riskAdmission.status, "available");
  if (canonical.robustness.riskAdmission.status === "available") {
    assert.equal(canonical.robustness.riskAdmission.value.threshold, 0.72);
    assert.deepEqual(canonical.robustness.riskAdmission.value.interval, {
      lower: 0.65,
      upper: 0.83,
    });
    assert.equal(
      canonical.robustness.riskAdmission.value.separation,
      "not-separated",
    );
  }
  assert.equal(canonical.separation.terminalFirstSeparatingLayer, "robustness");
});
