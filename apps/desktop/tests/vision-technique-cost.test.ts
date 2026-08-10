import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "@glcp/core";
import { isPlausibleTechniqueCost } from "../src/vision/technique-cost.ts";

const cost = (
  dance = 0,
  passion = 0,
  vocal = 0,
  visual = 0,
  mental = 0,
): Balance => ({ dance, passion, vocal, visual, mental });

test("le Duo Classic 8 + 8 est un vecteur complet", () => {
  assert.equal(isPlausibleTechniqueCost(cost(8, 0, 8), "classic"), true);
});

test("un seul 8 déclenche le second passage OCR", () => {
  assert.equal(isPlausibleTechniqueCost(cost(8), "classic"), false);
});

test("les Duos asymétriques et les techniques simples restent valides", () => {
  assert.equal(isPlausibleTechniqueCost(cost(10, 0, 0, 6), "classic"), true);
  assert.equal(isPlausibleTechniqueCost(cost(0, 0, 24), "senior"), true);
  assert.equal(isPlausibleTechniqueCost(cost(0, 15), "junior"), true);
});

test("Energy +40 coûte 35 et reste plausible dès le premier concert", () => {
  for (const period of ["junior", "classic", "senior"] as const) {
    assert.equal(isPlausibleTechniqueCost(cost(0, 0, 0, 0, 35), period), true);
    assert.equal(isPlausibleTechniqueCost(cost(0, 0, 0, 0, 40), period), false);
  }
});
