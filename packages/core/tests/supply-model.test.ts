import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "../src/live-model.ts";
import { maximumAffordablePurchases } from "../src/solver/song-dp.ts";
import { assessCheckpointSupply } from "../src/solver/supply-model.ts";

const balance = (dance: number): Balance => ({
  dance,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

const song = (id: string, dance: number) => ({
  id,
  name: id,
  cost: balance(dance),
});

test("une capacité tronquée insuffisante reste indéterminée", () => {
  const songs = [
    song("cost-2", 2),
    ...Array.from({ length: 13 }, (_, index) => song(`cost-1-${index}`, 1)),
  ];
  const bounded = maximumAffordablePurchases(balance(10), songs, 20);
  assert.equal(bounded.exact, false);
  const assessment = assessCheckpointSupply({
    totalSongs: 8,
    requiredSongs: 18,
    currentStockCapacity: 9,
    currentStockCapacityExact: bounded.exact,
    timingMode: "deadline-now",
  });
  assert.equal(assessment.status, "indeterminate");
  assert.equal(assessment.confidence, "heuristic");
});

test("un minorant tronqué suffisant prouve encore la faisabilité", () => {
  const assessment = assessCheckpointSupply({
    totalSongs: 16,
    requiredSongs: 18,
    currentStockCapacity: 2,
    currentStockCapacityExact: false,
    timingMode: "deadline-now",
  });
  assert.equal(assessment.status, "closable-before-deadline");
  assert.equal(assessment.confidence, "verified");
});

test("sécurisé, finançable et dépendant de futurs gains restent trois états distincts", () => {
  assert.equal(
    assessCheckpointSupply({
      totalSongs: 16,
      requiredSongs: 16,
      currentStockCapacity: 0,
      timingMode: "deadline-now",
    }).status,
    "secured-now",
  );
  assert.equal(
    assessCheckpointSupply({
      totalSongs: 10,
      requiredSongs: 16,
      currentStockCapacity: 6,
      timingMode: "deadline-now",
    }).status,
    "closable-before-deadline",
  );
  assert.equal(
    assessCheckpointSupply({
      totalSongs: 10,
      requiredSongs: 16,
      currentStockCapacity: 5,
      timingMode: "section-open",
    }).status,
    "reachable-with-future-supply",
  );
});
