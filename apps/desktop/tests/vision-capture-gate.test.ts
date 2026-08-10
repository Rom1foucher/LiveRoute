import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureGate } from "../src/vision/capture-gate.ts";

test("une double pression de hotkey ne lance qu'une capture", () => {
  const gate = createCaptureGate();
  const first = gate.begin();
  assert.equal(typeof first, "number");
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(first as number), true);
  gate.finish(first as number);
  assert.equal(typeof gate.begin(), "number");
});

test("un résultat invalidé ne peut plus être appliqué", () => {
  const gate = createCaptureGate();
  const generation = gate.begin() as number;
  gate.invalidate();
  assert.equal(gate.isCurrent(generation), false);
});
