import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDecisionLog,
  decisionStateHash,
  loggedBalanceAfterConcert,
  loggedBalanceAfterPurchase,
  loggedTrackedBalanceAfterConcert,
  loggedTrackedBalanceAfterPurchase,
  configureDecisionLog,
  type DecisionLogState,
} from "../src/diagnostics/decision-log.ts";
import {
  browserDecisionSession,
  browserDecisionSink,
} from "../src/adapters/browser.ts";

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

test("le journal navigateur écrit un événement v3 lié et hashé", async () => {
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
  assert.equal(stored[0].schemaVersion, 3);
  assert.equal(stored[0].previousDecisionId, "decision-1");
  assert.match(String(stored[0].stateHash), /^C3-[0-9A-F]{8}$/);
  assert.equal(stored[0].stateAfterHash, decisionStateHash(stateAfter));
  assert.equal(
    (stored[0].choice as Record<string, unknown>).matchedRecommendation,
    true,
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
