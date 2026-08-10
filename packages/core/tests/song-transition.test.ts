import assert from "node:assert/strict";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { evaluateTransitionAwareSongPages } from "../src/solver/song-transition.ts";

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
  priority: roles?.some((role) => role === "sp2-target") ?? false,
  utility: roles?.some((role) => role === "sp2-target") ? 5 : 1,
});

test("la projection transitionnelle paie les techniques avant la page", () => {
  const target = song("SP2", { dance: 40, visual: 40 }, ["sp2-target"]);
  const pool = [target, song("a", {}), song("b", {}), song("c", {})];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const result = evaluateTransitionAwareSongPages({
    period: "classic",
    balance: balance({
      dance: 45,
      passion: 45,
      vocal: 45,
      visual: 45,
      mental: 45,
    }),
    pool,
    plan,
    concertIndex: 1,
    nextSongCycle: 1,
    techniquesToNextSong: 2,
    pages: 1,
    trials: 3000,
    seedKey: "transition-cost-test",
  });
  assert.ok(result.firstPageReachProbability > 0.999);
  assert.ok(result.firstPageTargetAffordableProbability < 0.75);
  assert.ok(result.firstPageTargetAffordableProbability > 0.5);
});

test("une contrainte dure multi-pages ne peut plus être fermée gratuitement", () => {
  const pool = [
    song("a", { dance: 30 }),
    song("b", { passion: 30 }),
    song("c", { vocal: 30 }),
    song("d", { visual: 30 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "deadline-now",
    remainingSongs: pool,
  });
  const result = evaluateTransitionAwareSongPages({
    period: "senior",
    balance: balance({
      dance: 40,
      passion: 40,
      vocal: 40,
      visual: 40,
      mental: 40,
    }),
    pool,
    plan,
    concertIndex: 4,
    nextSongCycle: 1,
    techniquesToNextSong: 2,
    pages: 2,
    requiredPurchases: 2,
    trials: 3000,
    seedKey: "hard-close-cost-test",
  });
  assert.ok(result.checkpointProbability < 1);
});

test("la projection C2 passe à HOLD immédiatement après SP +2", () => {
  const pool = [
    song("sp2", { dance: 10 }, ["sp2-target"]),
    song("specialty-a", { passion: 10 }, ["specialty-priority"]),
    song("specialty-b", { vocal: 10 }, ["specialty-priority"]),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const result = evaluateTransitionAwareSongPages({
    period: "classic",
    balance: balance({
      dance: 200,
      passion: 200,
      vocal: 200,
      visual: 200,
      mental: 200,
    }),
    pool,
    plan,
    concertIndex: 1,
    nextSongCycle: 1,
    techniquesToNextSong: 0,
    pages: 3,
    timingMode: "section-open",
    continueForStructuralValue: true,
    trials: 30,
    seedKey: "hunt-to-hold-c2",
  });
  assert.equal(result.targetProbability, 1);
  assert.equal(result.expectedPurchases, 1);
  assert.equal(result.expectedStructuralPurchases, 1);
});

test("la projection C3 ne chasse pas une Friendship cachée après SP +3", () => {
  const pool = [
    song("sp3", { dance: 10 }, ["sp3-target"]),
    song("friendship", { passion: 10 }, ["friendship-10"]),
    song("specialty", { vocal: 10 }, ["specialty-priority"]),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: pool,
  });
  const result = evaluateTransitionAwareSongPages({
    period: "senior",
    balance: balance({
      dance: 200,
      passion: 200,
      vocal: 200,
      visual: 200,
      mental: 200,
    }),
    pool,
    plan,
    concertIndex: 2,
    nextSongCycle: 1,
    techniquesToNextSong: 0,
    pages: 3,
    timingMode: "section-open",
    continueForStructuralValue: true,
    trials: 30,
    seedKey: "hunt-to-hold-c3",
  });
  assert.equal(result.targetProbability, 1);
  assert.equal(result.expectedPurchases, 1);
  assert.equal(result.expectedFriendshipPurchases, 0);
});

test("une song achetée disparaît immédiatement des réserves courantes", async () => {
  const { resolveTransitionReserveSongs } =
    await import("../src/solver/song-transition.ts");
  const bought = song("bought", { dance: 42 }, ["friendship-10"]);
  const remaining = song("remaining", { visual: 42 }, ["friendship-10"]);
  const future = song("future", { vocal: 21 }, ["sp3-target"]);
  const reserves = resolveTransitionReserveSongs(
    [remaining],
    new Set([bought.id, remaining.id]),
    [future],
  );
  assert.deepEqual(
    reserves.map((candidate) => candidate.id),
    [future.id, remaining.id].sort(),
  );
});
