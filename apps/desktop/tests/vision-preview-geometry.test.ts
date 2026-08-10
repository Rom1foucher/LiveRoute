import assert from "node:assert/strict";
import test from "node:test";
import { fitContainedFrame } from "../src/vision/preview-geometry.ts";

test("une capture 16:9 letterboxée utilise son propre repère vertical", () => {
  const frame = fitContainedFrame(1000, 600, 2048, 1152);
  assert.equal(frame.width, 1000);
  assert.equal(frame.height, 562.5);
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 18.75);
});

test("une capture plus haute est centrée horizontalement", () => {
  const frame = fitContainedFrame(900, 600, 1000, 1000);
  assert.equal(frame.width, 600);
  assert.equal(frame.height, 600);
  assert.equal(frame.x, 150);
  assert.equal(frame.y, 0);
});
