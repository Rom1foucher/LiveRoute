import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationTargetLabel,
  localizeOcrRuntimeText,
  ocrText,
} from "../src/vision/i18n.ts";

test("le cockpit OCR suit la langue active", () => {
  assert.equal(ocrText("fr", "Réglages", "Settings"), "Réglages");
  assert.equal(ocrText("en", "Réglages", "Settings"), "Settings");
});

test("les diagnostics produits sous React sont localisés en anglais", () => {
  assert.equal(
    localizeOcrRuntimeText("en", "Passes OCR en désaccord : 6 / 62"),
    "OCR passes disagree: 6 / 62",
  );
  assert.equal(
    localizeOcrRuntimeText("en", "Lecture numérique apprise 2/5"),
    "Learned numeric reading 2/5",
  );
});

test("les libellés des zones de calibration ne restent pas en français", () => {
  assert.equal(
    calibrationTargetLabel("en", "technique.1.card", "Technique 2 · carte"),
    "Technique 2 · card",
  );
  assert.equal(
    calibrationTargetLabel("en", "song.2.cover", "Song 3 · pochette"),
    "Song 3 · cover",
  );
});
