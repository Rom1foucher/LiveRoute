import test from "node:test";
import assert from "node:assert/strict";
import type { Balance } from "@glcp/core";
import { detectTechniquePeriodDrift } from "../src/vision/period-drift.ts";

const cost = (
  dance = 0,
  passion = 0,
  vocal = 0,
  visual = 0,
  mental = 0,
): Balance => ({
  dance,
  passion,
  vocal,
  visual,
  mental,
});

test("trois coûts Senior sous un état Classic signalent un concert de retard", () => {
  const drift = detectTechniquePeriodDrift(
    [cost(24), cost(0, 0, 0, 24), cost(25)],
    "classic",
  );
  assert.deepEqual(drift, {
    expected: "classic",
    detected: "senior",
    direction: "state-behind",
  });
});

test("trois coûts Classic sous un état Senior signalent un concert d'avance", () => {
  const drift = detectTechniquePeriodDrift(
    [cost(16), cost(0, 8, 8), cost(0, 10, 6)],
    "senior",
  );
  assert.deepEqual(drift, {
    expected: "senior",
    detected: "classic",
    direction: "state-ahead",
  });
});

test("une page ambiguë ne déclenche aucune resynchronisation", () => {
  assert.equal(
    detectTechniquePeriodDrift([cost(25), cost(30), cost(40)], "classic"),
    null,
  );
});

test("une page Classic après carryover reste validée avec le barème Classic", () => {
  assert.equal(
    detectTechniquePeriodDrift(
      [cost(0, 0, 0, 16), cost(0, 0, 15), cost(25)],
      "classic",
    ),
    null,
  );
});

test("une page Senior après carryover C3→C4 reste validée avec le barème Senior", () => {
  assert.equal(
    detectTechniquePeriodDrift(
      [cost(24), cost(0, 12, 0, 12), cost(0, 14, 10)],
      "senior",
    ),
    null,
  );
});
