import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "@glcp/core";
import { assessStockContinuity } from "../src/vision/stock-continuity.ts";

const balance = (
  dance: number,
  passion: number,
  vocal: number,
  visual: number,
  mental: number,
): Balance => ({ dance, passion, vocal, visual, mental });

test("128 vers 8 signale une probable troncature sans bloquer les écarts ordinaires", () => {
  const suspicious = assessStockContinuity(
    balance(128, 80, 60, 40, 20),
    balance(8, 80, 60, 40, 20),
  );
  assert.ok(suspicious);
  assert.equal(suspicious.issues.length, 1);
  assert.equal(suspicious.issues[0]?.key, "dance");
  assert.equal(suspicious.issues[0]?.kind, "probable-truncation");
  assert.equal(suspicious.strongOcrSignal, true);

  assert.equal(
    assessStockContinuity(
      balance(28, 80, 60, 40, 20),
      balance(8, 80, 60, 40, 20),
    ),
    null,
  );
});

test("une baisse forte sans suffixe exact reste détectée", () => {
  const result = assessStockContinuity(
    balance(103, 75, 50, 40, 30),
    balance(13, 75, 50, 40, 30),
  );
  assert.ok(result);
  assert.equal(result.issues[0]?.kind, "abrupt-drop");
  assert.equal(result.strongOcrSignal, false);
});

test("les achats et revenus plausibles ne déclenchent aucun avertissement", () => {
  assert.equal(
    assessStockContinuity(
      balance(128, 103, 71, 35, 26),
      balance(108, 118, 56, 49, 16),
    ),
    null,
  );
});

test("un état vide établit seulement la première référence OCR", () => {
  assert.equal(
    assessStockContinuity(
      balance(0, 0, 0, 0, 0),
      balance(128, 103, 71, 35, 26),
    ),
    null,
  );
});

test("plusieurs ruptures simultanées sont présentées comme dérive globale possible", () => {
  const result = assessStockContinuity(
    balance(128, 103, 97, 88, 91),
    balance(8, 3, 7, 8, 1),
  );
  assert.ok(result);
  assert.equal(result.broadStateDrift, true);
  assert.equal(result.issues.length, 5);
});
