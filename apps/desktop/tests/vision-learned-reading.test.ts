import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreferLearnedNumericReading } from "../src/vision/learned-reading.ts";

test("un modèle appris exact remplace une mauvaise lecture générique trop confiante", () => {
  assert.equal(
    shouldPreferLearnedNumericReading(
      { text: "6", confidence: 1 },
      { text: "8", confidence: 0.96, learnedSource: "template" },
    ),
    true,
  );
});

test("le repli Tesseract appris ne remplace pas une lecture primaire plus confiante", () => {
  assert.equal(
    shouldPreferLearnedNumericReading(
      { text: "8", confidence: 0.98 },
      { text: "6", confidence: 0.82, learnedSource: "tesseract" },
    ),
    false,
  );
});
