import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTechniqueInputPeriod,
  techniqueOfferPeriodAfterConcert,
  techniqueOfferPeriodAfterTechniquePurchase,
} from "../src/domain/technique-carryover.ts";
import type { Period } from "../src/live-model.ts";

const transitions: Array<[Period, Period]> = [
  ["junior", "classic"],
  ["classic", "classic"],
  ["classic", "senior"],
  ["senior", "senior"],
];

test("une page de techniques conserve son ancien tarif à travers tous les concerts", () => {
  for (const [before] of transitions) {
    assert.equal(
      techniqueOfferPeriodAfterConcert({
        currentPeriod: before,
        currentOfferPeriod: null,
        techniquePageVisible: true,
        songPageCarried: false,
      }),
      before,
    );
  }
});

test("une page de techniques peut traverser plusieurs concerts sans être achetée", () => {
  assert.equal(
    techniqueOfferPeriodAfterConcert({
      currentPeriod: "classic",
      currentOfferPeriod: "junior",
      techniquePageVisible: true,
      songPageCarried: false,
    }),
    "junior",
  );
});

test("acheter une technique portée rafraîchit immédiatement au tarif courant", () => {
  assert.equal(resolveTechniqueInputPeriod("senior", "classic"), "classic");
  assert.equal(techniqueOfferPeriodAfterTechniquePurchase(), null);
  assert.equal(resolveTechniqueInputPeriod("senior", null), "senior");
});

test("un carryover de song ne transporte jamais l’ancien tarif des techniques", () => {
  for (const [before] of transitions) {
    assert.equal(
      techniqueOfferPeriodAfterConcert({
        currentPeriod: before,
        currentOfferPeriod: before,
        techniquePageVisible: false,
        songPageCarried: true,
      }),
      null,
    );
  }
});
