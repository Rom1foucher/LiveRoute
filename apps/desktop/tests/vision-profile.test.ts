import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCalibrationTargets,
  CALIBRATION_GROUPS,
  DEFAULT_VISION_PROFILE,
  normalizeVisionProfile,
} from "../src/vision/profile.ts";

type Rect = { x: number; y: number; width: number; height: number };

const profile = JSON.parse(
  await readFile(
    new URL("../public/vision-profile.json", import.meta.url),
    "utf8",
  ),
) as typeof DEFAULT_VISION_PROFILE;

test("le profil public est identique au profil TypeScript canonique", () => {
  assert.deepEqual(profile, DEFAULT_VISION_PROFILE);
});

test("le profil snapshot n'expose plus l'ancienne automatisation hybride", () => {
  assert.equal(profile.schemaVersion, 5);
  assert.deepEqual(Object.keys(profile.capture), ["hotkey"]);
  assert.deepEqual(Object.keys(profile.automation), ["overlayEnabled"]);
  assert.deepEqual(Object.keys(profile.regions).sort(), [
    "songs",
    "techniques",
    "tokens",
  ]);
});

test("le profil public expose toutes les zones snapshot nécessaires", () => {
  assert.equal(Object.keys(profile.regions.tokens).length, 5);
  assert.equal(profile.regions.techniques.length, 3);
  assert.ok(
    profile.regions.techniques.every((card) => card.costSlots.length === 5),
  );
  assert.equal(profile.regions.songs.length, 3);
});

test("les coordonnées livrées sont normalisées", () => {
  const rectangles: Rect[] = [
    ...Object.values(profile.regions.tokens),
    ...profile.regions.techniques.flatMap((card) => [
      card.card,
      card.text,
      ...card.costSlots.map((slot) => slot.rect),
    ]),
    ...profile.regions.songs.flatMap((card) => [
      card.card,
      card.cover,
      card.title,
    ]),
  ];
  for (const rectangle of rectangles) {
    assert.ok(rectangle.x >= 0 && rectangle.x <= 1);
    assert.ok(rectangle.y >= 0 && rectangle.y <= 1);
    assert.ok(rectangle.width > 0 && rectangle.width <= 1);
    assert.ok(rectangle.height > 0 && rectangle.height <= 1);
    assert.ok(rectangle.x + rectangle.width <= 1.000001);
    assert.ok(rectangle.y + rectangle.height <= 1.000001);
  }
});

test("le calibrage expose chaque région réellement consommée par l'OCR", () => {
  const targets = buildCalibrationTargets();
  assert.equal(targets.length, 35);
  assert.deepEqual(
    [...new Set(targets.map((target) => target.group))],
    [...CALIBRATION_GROUPS],
  );
  assert.equal(
    targets.filter((target) => target.id.startsWith("token.")).length,
    5,
  );
  assert.equal(
    targets.filter((target) => /^technique\.\d\.card$/.test(target.id)).length,
    3,
  );
  assert.equal(
    targets.filter((target) => /^technique\.\d\.text$/.test(target.id)).length,
    3,
  );
  assert.equal(
    targets.filter((target) => /^technique\.\d\.cost\.\d$/.test(target.id))
      .length,
    15,
  );
  assert.equal(
    targets.filter((target) => target.id.startsWith("song.")).length,
    9,
  );
});

test("les réglages numériques appris sont migrés et bornés", () => {
  const normalized = normalizeVisionProfile({
    ...DEFAULT_VISION_PROFILE,
    schemaVersion: 5,
    // Deliberately partial: this is the legacy shape the migration must
    // complete, so it cannot satisfy the current type.
    numericFieldTuning: {
      "token.dance": {
        threshold: "none",
        scale: 99,
        mode: "single-number",
        verifiedSamples: 3.4,
        lastExpected: 62.2,
        lastConfidence: 4,
      },
    } as never,
  });
  assert.deepEqual(normalized.numericFieldTuning["token.dance"], {
    threshold: "none",
    scale: 5,
    mode: "single-number",
    verifiedSamples: 3,
    lastExpected: 62,
    lastConfidence: 1,
    ink: null,
    templates: {},
  });
});

test("un apprentissage v0.21 réinitialise uniquement sa zone surajustée", () => {
  const legacyRect = { x: 0.9, y: 0.9, width: 0.01, height: 0.01 };
  const normalized = normalizeVisionProfile({
    ...DEFAULT_VISION_PROFILE,
    schemaVersion: 4 as never,
    regions: {
      ...DEFAULT_VISION_PROFILE.regions,
      techniques: DEFAULT_VISION_PROFILE.regions.techniques.map(
        (technique, index) =>
          index === 0
            ? {
                ...technique,
                costSlots: technique.costSlots.map((slot, costIndex) =>
                  costIndex === 4 ? { ...slot, rect: legacyRect } : slot,
                ) as typeof technique.costSlots,
              }
            : technique,
      ) as typeof DEFAULT_VISION_PROFILE.regions.techniques,
    },
    numericFieldTuning: {
      "technique.0.cost.4": {
        threshold: "none",
        scale: 4.2,
        mode: "single-number",
        verifiedSamples: 1,
        lastExpected: 8,
        lastConfidence: 0.9,
        ink: null,
        templates: {},
      },
    },
  });
  assert.deepEqual(
    normalized.regions.techniques[0].costSlots[4].rect,
    DEFAULT_VISION_PROFILE.regions.techniques[0].costSlots[4].rect,
  );
  assert.equal(normalized.numericFieldTuning["technique.0.cost.4"], undefined);
});
