import assert from "node:assert/strict";
import test from "node:test";
import {
  classify069Mask,
  type BinaryGlyphMask,
} from "../src/vision/digit-shape.ts";

const mask = (rows: string[]): BinaryGlyphMask => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8Array.from(
    rows.flatMap((row) => [...row].map((value) => (value === "#" ? 1 : 0))),
  ),
});

const ZERO = mask([
  ".#####.",
  "##...##",
  "##...##",
  "##...##",
  "##...##",
  "##...##",
  ".#####.",
]);

const SIX = mask([
  "..####.",
  ".##....",
  "##.....",
  "######.",
  "##...##",
  "##...##",
  ".#####.",
]);

const NINE = mask([
  ".#####.",
  "##...##",
  "##...##",
  ".######",
  ".....##",
  "....##.",
  ".####..",
]);

test("la position du trou sépare 0, 6 et 9", () => {
  assert.equal(classify069Mask(ZERO)?.digit, 0);
  assert.equal(classify069Mask(SIX)?.digit, 6);
  assert.equal(classify069Mask(NINE)?.digit, 9);
});

test("un glyphe sans trou n'invente pas un 0/6/9", () => {
  assert.equal(
    classify069Mask(
      mask([
        "..##...",
        ".###...",
        "..##...",
        "..##...",
        "..##...",
        "..##...",
        ".####..",
      ]),
    ),
    null,
  );
});
