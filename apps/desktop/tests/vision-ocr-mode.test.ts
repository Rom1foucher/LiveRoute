import assert from "node:assert/strict";
import test from "node:test";
import { segmentationIntentForAtlas } from "../src/vision/ocr-mode.ts";

test("un atlas numérique multi-crops n'utilise jamais SINGLE_WORD ou SINGLE_CHAR", () => {
  assert.equal(segmentationIntentForAtlas("number-line", 23), "sparse-text");
  assert.equal(segmentationIntentForAtlas("single-number", 23), "sparse-text");
});

test("un crop appris isolé conserve son mode OCR strict", () => {
  assert.equal(segmentationIntentForAtlas("number-line", 1), "single-word");
  assert.equal(segmentationIntentForAtlas("single-number", 1), "single-char");
});

test("les modes généraux conservent leur segmentation", () => {
  assert.equal(segmentationIntentForAtlas("mixed", 35), "sparse-text");
  assert.equal(
    segmentationIntentForAtlas("technique-costs", 15),
    "single-block",
  );
});
