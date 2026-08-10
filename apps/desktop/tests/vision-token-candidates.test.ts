import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseNumericOcrCandidate,
  hasWholeNumberLengthConflict,
  parseOcrNumber,
  shouldDeepRefineTokenNumber,
  shouldRefineAsSingleDigit,
  shouldUseSingleCharacterRefinement,
} from "../src/vision/token-candidates.ts";
import type {
  NumericOcrCandidate,
  NumericOcrSource,
} from "../src/vision/token-candidates.ts";

const candidate = (
  text: string,
  confidence: number,
  source: NumericOcrSource,
) => ({ text, confidence, source });

test("les tokens à un chiffre déclenchent toujours les passes spécialisées", () => {
  assert.equal(
    shouldRefineAsSingleDigit(candidate("6", 0.94, "general"), 250, 0.58),
    true,
  );
  assert.equal(
    shouldRefineAsSingleDigit(candidate("14", 0.94, "general"), 250, 0.58),
    false,
  );
  assert.equal(
    shouldRefineAsSingleDigit(candidate("", 0, "general"), 250, 0.58),
    true,
  );
});

test("l'accord Otsu et brut corrige un chiffre général erroné", () => {
  const result = chooseNumericOcrCandidate(
    [
      candidate("8", 0.74, "general"),
      candidate("6", 0.83, "single-otsu"),
      candidate("6", 0.77, "single-raw"),
    ],
    250,
    0.58,
  );
  assert.equal(result.value, 6);
  assert.equal(result.uncertain, false);
  assert.ok(result.confidence >= 0.83);
});

test("les accords 1, 8 et 9 restent stables", () => {
  for (const digit of ["1", "8", "9"]) {
    const result = chooseNumericOcrCandidate(
      [
        candidate(digit, 0.61, "general"),
        candidate(digit, 0.78, "single-otsu"),
        candidate(digit, 0.71, "single-raw"),
      ],
      250,
      0.58,
    );
    assert.equal(result.value, Number(digit));
    assert.equal(result.uncertain, false);
  }
});

test("les confusions proches sans majorité fiable demandent une correction", () => {
  for (const [left, right] of [
    ["6", "8"],
    ["5", "6"],
    ["1", "7"],
  ]) {
    const result = chooseNumericOcrCandidate(
      [candidate(left, 0.73, "general"), candidate(right, 0.74, "single-otsu")],
      250,
      0.58,
    );
    assert.equal(result.value, null);
    assert.equal(result.uncertain, true);
    assert.ok(result.confidence < 0.58);
  }
});

test("les confusions g/q des champs numériques sont normalisées en 9", () => {
  assert.equal(parseOcrNumber("g", 250), 9);
  assert.equal(parseOcrNumber("Q", 250), 9);
  assert.equal(parseOcrNumber("19q", 250), 199);
});

test("le b minuscule est traité comme une substitution OCR de 6", () => {
  assert.equal(parseOcrNumber("b", 250), 6);
  assert.equal(parseOcrNumber("1b", 250), 16);
});

test("les valeurs multi-chiffres contenant 0/6/9 déclenchent le consensus profond", () => {
  assert.equal(
    shouldDeepRefineTokenNumber([candidate("96", 0.96, "general")], 250, 0.58),
    true,
  );
  assert.equal(
    shouldDeepRefineTokenNumber([candidate("14", 0.96, "general")], 250, 0.58),
    false,
  );
});

test("une lecture entière multi-chiffres interdit SINGLE_CHAR sur le crop complet", () => {
  const readings: NumericOcrCandidate[] = [
    candidate("6", 0.91, "general"),
    candidate("6", 0.93, "word-otsu"),
    candidate("62", 0.79, "word-raw"),
  ];
  assert.equal(shouldUseSingleCharacterRefinement(readings, 250, 0.58), false);
  assert.equal(hasWholeNumberLengthConflict(readings, 250), true);
});

for (const [short, complete] of [
  ["6", "62"],
  ["9", "91"],
]) {
  test(`le crop serré confirme ${complete} contre la lecture tronquée ${short}`, () => {
    const result = chooseNumericOcrCandidate(
      [
        candidate(short, 0.93, "general"),
        candidate(short, 0.95, "word-otsu"),
        candidate(complete, 0.82, "word-raw"),
        candidate(complete, 0.86, "word-tight-raw"),
      ],
      250,
      0.58,
    );
    assert.equal(result.value, Number(complete));
    assert.equal(result.uncertain, false);
    assert.equal(result.ambiguity, null);
    assert.match(result.diagnostic, /Nombre entier confirmé/);
  });
}

test("un seul signal long face à plusieurs lectures tronquées reste à vérifier", () => {
  const result = chooseNumericOcrCandidate(
    [
      candidate("6", 0.93, "general"),
      candidate("6", 0.95, "word-otsu"),
      candidate("62", 0.71, "word-raw"),
    ],
    250,
    0.58,
  );
  assert.equal(result.value, null);
  assert.equal(result.uncertain, true);
  assert.equal(result.ambiguity, "truncated");
  assert.match(result.diagnostic, /Conflit de longueur/);
});

test("un conflit multi-chiffres 0/6/9 reste manuel sans consensus indépendant", () => {
  const result = chooseNumericOcrCandidate(
    [
      { text: "90", confidence: 0.79, source: "general" },
      { text: "96", confidence: 0.8, source: "word-otsu" },
      { text: "99", confidence: 0.79, source: "word-raw" },
    ],
    250,
    0.58,
  );
  assert.equal(result.value, null);
  assert.equal(result.uncertain, true);
  assert.equal(result.ambiguity, "0/6/9");
  assert.deepEqual(new Set(result.alternatives), new Set([90, 96, 99]));
});

test("Otsu et brut concordants résolvent une confusion multi-chiffres", () => {
  const result = chooseNumericOcrCandidate(
    [
      { text: "90", confidence: 0.72, source: "general" },
      { text: "96", confidence: 0.85, source: "word-otsu" },
      { text: "96", confidence: 0.82, source: "word-raw" },
    ],
    250,
    0.58,
  );
  assert.equal(result.value, 96);
  assert.equal(result.uncertain, false);
});

test("deux lectures Otsu ne battent pas seules un contre-signal brut 0/6/9", () => {
  const result = chooseNumericOcrCandidate(
    [
      { text: "90", confidence: 0.95, source: "general" },
      { text: "90", confidence: 0.94, source: "word-otsu" },
      { text: "96", confidence: 0.91, source: "word-raw" },
    ],
    250,
    0.58,
  );
  assert.equal(result.value, null);
  assert.equal(result.ambiguity, "0/6/9");
});

test("un modèle appris confirmé remplace un consensus générique erroné", () => {
  const result = chooseNumericOcrCandidate(
    [
      { text: "6", confidence: 1, source: "general" },
      { text: "6", confidence: 0.98, source: "word-raw" },
      { text: "8", confidence: 0.96, source: "learned-template" },
    ],
    999,
    0.68,
  );
  assert.equal(result.value, 8);
  assert.equal(result.uncertain, false);
  assert.match(result.diagnostic, /Modèle appris/);
});
