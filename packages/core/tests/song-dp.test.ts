import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import {
  compareTechniqueByContinuation,
  evaluatePageCoverage,
  evaluateUnknownSongPages,
  type SongDpTarget,
} from "../src/solver/song-dp.ts";

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
  roles: SongDpTarget["roles"] = ["filler"],
): SongDpTarget => ({ id, name: id, cost: balance(cost), roles });

const crossedPool = () => [
  song("A", { dance: 42, visual: 26 }, ["friendship-10"]),
  song("B", { dance: 26, visual: 42 }, ["friendship-10"]),
  ...Array.from({ length: 4 }, (_, index) =>
    song(`f${index}`, { passion: 99 }),
  ),
];

const c4Plan = (pool: SongDpTarget[]) =>
  deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "section-open",
    remainingSongs: pool,
  });

test("42/42 préfère 16 Dance au duo 8/8 pour conserver une cible croisée", () => {
  const pool = crossedPool();
  const tokens = balance({ dance: 42, visual: 42 });
  const mono = balance({ dance: 16 });
  const duo = balance({ dance: 8, visual: 8 });
  assert.ok(
    compareTechniqueByContinuation(mono, duo, tokens, pool, c4Plan(pool)) < 0,
  );
});

test("50/50 préfère le duo 8/8 car il conserve 80 % contre 50 %", () => {
  const pool = crossedPool();
  const tokens = balance({ dance: 50, visual: 50 });
  const mono = balance({ dance: 16 });
  const duo = balance({ dance: 8, visual: 8 });
  assert.ok(
    compareTechniqueByContinuation(duo, mono, tokens, pool, c4Plan(pool)) < 0,
  );
  const duoCoverage = evaluatePageCoverage(
    balance({ dance: 42, visual: 42 }),
    pool,
    c4Plan(pool),
  );
  const monoCoverage = evaluatePageCoverage(
    balance({ dance: 34, visual: 50 }),
    pool,
    c4Plan(pool),
  );
  assert.equal(duoCoverage.planTargetProbability, 0.8);
  assert.equal(monoCoverage.planTargetProbability, 0.5);
});

test("un surplus de 200 est dépensé avant le stock critique à 30", () => {
  const target = song("SP2", { vocal: 21 }, ["sp2-target"]);
  const pool = [target, song("f1", {}), song("f2", {}), song("f3", {})];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  assert.ok(
    compareTechniqueByContinuation(
      balance({ dance: 24 }),
      balance({ vocal: 16 }),
      balance({ dance: 200, vocal: 30 }),
      pool,
      plan,
    ) < 0,
  );
});

test("la DP multi-pages reproduit 42,86/71,43/88,57/97,14 %", () => {
  const target = song("SP2", {}, ["sp2-target"]);
  const pool = [
    target,
    ...Array.from({ length: 6 }, (_, index) => song(`f${index}`, {})),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const probabilities = [1, 2, 3, 4].map(
    (pages) =>
      evaluateUnknownSongPages({
        balance: balance(),
        pool,
        plan,
        pages,
      }).targetProbability,
  );
  const expected = [3 / 7, 5 / 7, 31 / 35, 34 / 35];
  probabilities.forEach((probability, index) =>
    assert.ok(Math.abs(probability - expected[index]) < 1e-10),
  );
});

test("l'ordre des songs ne change pas la valeur et une loi pondérée est configurable", () => {
  const target = song("target", {}, ["sp2-target"]);
  const pool = [target, song("a", {}), song("b", {}), song("c", {})];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const normal = evaluateUnknownSongPages({
    balance: balance(),
    pool,
    plan,
    pages: 1,
  });
  const reversed = evaluateUnknownSongPages({
    balance: balance(),
    pool: [...pool].reverse(),
    plan,
    pages: 1,
  });
  assert.equal(normal.targetProbability, reversed.targetProbability);
  const weighted = evaluateUnknownSongPages({
    balance: balance(),
    pool,
    plan,
    pages: 1,
    pageWeight: (ids) => (ids.includes("target") ? 9 : 1),
  });
  assert.equal(weighted.pageLaw, "weighted");
  assert.ok(weighted.targetProbability > normal.targetProbability);
});

test("ajouter des tokens ne dégrade jamais la couverture d'une même page", () => {
  const pool = crossedPool();
  const plan = c4Plan(pool);
  const lower = evaluatePageCoverage(
    balance({ dance: 41, visual: 42 }),
    pool,
    plan,
  );
  const higher = evaluatePageCoverage(
    balance({ dance: 42, visual: 42 }),
    pool,
    plan,
  );
  assert.ok(higher.planTargetProbability >= lower.planTargetProbability);
  assert.ok(higher.anyAffordableProbability >= lower.anyAffordableProbability);
  assert.ok(higher.affordableCount >= lower.affordableCount);
});

test("les tiers structurels restent ordinaux sur plusieurs pages", () => {
  const pool = [
    song("F10", {}, ["friendship-10"]),
    ...Array.from({ length: 6 }, (_, index) =>
      song(`specialty-${index}`, {}, ["specialty-priority"]),
    ),
  ];
  const plan = c4Plan(pool);
  const result = evaluateUnknownSongPages({
    balance: balance(),
    pool,
    plan,
    pages: 4,
  });
  assert.ok(result.expectedStructuralTier <= 4);
});

test("l'échantillonnage approché est invariant à l'ordre du catalogue", () => {
  const target = song("target-large", {}, ["sp2-target"]);
  const pool = [
    target,
    ...Array.from({ length: 11 }, (_, index) => song(`large-${index}`, {})),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const normal = evaluateUnknownSongPages({
    balance: balance(),
    pool,
    plan,
    pages: 2,
  });
  const reversed = evaluateUnknownSongPages({
    balance: balance(),
    pool: [...pool].reverse(),
    plan,
    pages: 2,
  });
  assert.equal(normal.targetProbability, reversed.targetProbability);
  assert.equal(normal.expectedRetainedTokens, reversed.expectedRetainedTokens);
});
