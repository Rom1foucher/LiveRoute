import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VISION_PROFILE } from "../src/vision/profile.ts";
import { recognizeAtlas } from "../src/vision/ocr.ts";
import type { OcrAtlas } from "../src/vision/image.ts";

const atlas = {
  canvas: {} as HTMLCanvasElement,
  placements: [
    { id: "first", x: 10, y: 10, width: 40, height: 30 },
    { id: "second", x: 10, y: 60, width: 40, height: 30 },
  ],
} satisfies OcrAtlas;

test("recognizeAtlas réattribue un atlas numérique multi-crops avec SPARSE_TEXT", async () => {
  const readings = await recognizeAtlas(
    atlas,
    DEFAULT_VISION_PROFILE,
    undefined,
    "number-line",
    async ({ segmentation, numericMode }) => {
      assert.equal(segmentation, "sparse-text");
      assert.equal(numericMode, true);
      return [
        { text: "8", confidence: 95, bbox: { x0: 15, y0: 15, x1: 35, y1: 35 } },
        {
          text: "62",
          confidence: 91,
          bbox: { x0: 15, y0: 65, x1: 40, y1: 85 },
        },
      ];
    },
  );
  assert.equal(readings.get("first")?.text, "8");
  assert.equal(readings.get("second")?.text, "62");
});
