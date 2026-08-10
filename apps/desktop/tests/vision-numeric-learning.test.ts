import assert from "node:assert/strict";
import test from "node:test";
import {
  componentTemplate,
  learnNumericSegmentation,
  matchComponentsWithTemplates,
  mergeDigitTemplate,
  numericTextMatchesComponentCount,
  segmentWithLearnedInk,
  type Digit,
  type PixelBuffer,
} from "../src/vision/numeric-learning-model.ts";

const WIDTH = 140;
const HEIGHT = 80;
const BACKGROUND: [number, number, number] = [232, 246, 214];
const INK: [number, number, number] = [151, 89, 218];
const LABEL: [number, number, number] = [104, 149, 83];

const blank = (): PixelBuffer => {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = BACKGROUND[0];
    data[offset + 1] = BACKGROUND[1];
    data[offset + 2] = BACKGROUND[2];
    data[offset + 3] = 255;
  }
  return { width: WIDTH, height: HEIGHT, data };
};

const fillRect = (
  image: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: [number, number, number],
) => {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const offset = (py * image.width + px) * 4;
      image.data[offset] = colour[0];
      image.data[offset + 1] = colour[1];
      image.data[offset + 2] = colour[2];
      image.data[offset + 3] = 255;
    }
  }
};

const segmentsFor: Record<Digit, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

const drawDigit = (image: PixelBuffer, digit: Digit, x: number) => {
  const thickness = 4;
  const length = 20;
  const top = 20;
  const left = x;
  const positions: Record<string, [number, number, number, number]> = {
    a: [left + thickness, top, length, thickness],
    g: [left + thickness, top + 20, length, thickness],
    d: [left + thickness, top + 40, length, thickness],
    f: [left, top + thickness, thickness, 20],
    b: [left + length + thickness, top + thickness, thickness, 20],
    e: [left, top + 20, thickness, 24],
    c: [left + length + thickness, top + 20, thickness, 24],
  };
  for (const segment of segmentsFor[digit]) {
    const [sx, sy, sw, sh] = positions[segment];
    fillRect(image, sx, sy, sw, sh, INK);
  }
};

const imageFor = (text: string): PixelBuffer => {
  const image = blank();
  // Green label-like fragments on the left: they must not be confused with the
  // purple numeric ink.
  fillRect(image, 4, 8, 34, 3, LABEL);
  fillRect(image, 4, 14, 22, 3, LABEL);
  fillRect(image, 30, 14, 14, 3, LABEL);
  // Purple cell border: a full-width component that the geometry filter must
  // reject.
  fillRect(image, 0, 0, WIDTH, 2, INK);
  fillRect(image, 0, HEIGHT - 2, WIDTH, 2, INK);
  const digitWidth = 28;
  const gap = 5;
  const total = text.length * digitWidth + Math.max(0, text.length - 1) * gap;
  let x = WIDTH - total - 8;
  for (const character of text) {
    drawDigit(image, character as Digit, x);
    x += digitWidth + gap;
  }
  return image;
};

test("la couleur localise le chiffre sans apprendre le libellé ni la bordure", () => {
  const image = imageFor("8");
  const learned = learnNumericSegmentation(image, "8");
  assert.ok(learned);
  assert.equal(learned.components.length, 1);
  assert.ok(learned.union.x > WIDTH * 0.55);
  assert.ok(Math.abs(learned.ink.rgb[2] - INK[2]) < 30);
});

test("un unique exemple 8 ne force jamais un 6 ultérieur", () => {
  const eightImage = imageFor("8");
  const learnedEight = learnNumericSegmentation(eightImage, "8");
  assert.ok(learnedEight);
  const eightTemplate = componentTemplate(
    learnedEight.components[0],
    eightImage.width,
  );
  const templates = mergeDigitTemplate({}, "8", eightTemplate);

  const sixImage = imageFor("6");
  const locatedSix = segmentWithLearnedInk(sixImage, learnedEight.ink, 2);
  assert.ok(locatedSix);
  const result = matchComponentsWithTemplates(
    locatedSix.components,
    sixImage.width,
    templates,
  );
  assert.equal(result.text, null);
});

test("les confirmations s'ajoutent sans effacer les chiffres précédents", () => {
  const eightImage = imageFor("8");
  const sixImage = imageFor("6");
  const learnedEight = learnNumericSegmentation(eightImage, "8");
  const learnedSix = learnNumericSegmentation(sixImage, "6");
  assert.ok(learnedEight && learnedSix);

  let templates = mergeDigitTemplate(
    {},
    "8",
    componentTemplate(learnedEight.components[0], eightImage.width),
  );
  templates = mergeDigitTemplate(
    templates,
    "6",
    componentTemplate(learnedSix.components[0], sixImage.width),
  );
  assert.equal(templates["8"]?.length, 1);
  assert.equal(templates["6"]?.length, 1);
});

test("la segmentation conserve tous les glyphes d'un nombre plus long", () => {
  const eightImage = imageFor("8");
  const learnedEight = learnNumericSegmentation(eightImage, "8");
  assert.ok(learnedEight);
  const image = imageFor("18");
  const located = segmentWithLearnedInk(image, learnedEight.ink, 3);
  assert.ok(located);
  assert.equal(located.components.length, 2);
});

test("le nombre de composantes rejette une lecture Tesseract tronquée", () => {
  assert.equal(numericTextMatchesComponentCount("6", 2), false);
  assert.equal(numericTextMatchesComponentCount("6 2", 2), true);
  assert.equal(numericTextMatchesComponentCount("91", 2), true);
});
