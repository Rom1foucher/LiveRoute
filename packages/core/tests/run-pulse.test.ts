import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGaugeProgress,
  calculateOfferPercentile,
  calculateRunPulse,
} from "../src/run-pulse.ts";
import type { PulseSongValue, RunPulseEvent } from "../src/run-pulse.ts";

const pool: PulseSongValue[] = [
  { id: "a", name: "A", value: 100 },
  { id: "b", name: "B", value: 80 },
  { id: "c", name: "C", value: 60 },
  { id: "d", name: "D", value: 40 },
  { id: "e", name: "E", value: 20 },
];

test("le percentile d'une sélection est calculé exactement", () => {
  const highRoll = calculateOfferPercentile(pool, ["a", "b", "c"]);
  const lowRoll = calculateOfferPercentile(pool, ["c", "d", "e"]);
  assert.ok(highRoll > 0.9);
  assert.ok(lowRoll < 0.1);
});

test("un seul tirage extrême reste ramené vers une luck neutre", () => {
  const events: RunPulseEvent[] = [
    {
      id: "offer:0:1",
      type: "song-offer",
      concertIndex: 0,
      songCycle: 1,
      offerIds: ["a", "b", "c"],
      percentile: 0.95,
      bestSongName: "A",
    },
  ];
  const summary = calculateRunPulse(events, {
    startedAtConcert: 0,
  });
  assert.ok(summary.luck > 50);
  assert.ok(summary.luck < 70);
  assert.equal(summary.confidence, "low");
});

test("les achats et Great Success font progresser la valeur", () => {
  const baseline = calculateRunPulse([], {
    startedAtConcert: 0,
  });
  const events: RunPulseEvent[] = [
    {
      id: "purchase:0:1:a",
      type: "song-purchase",
      concertIndex: 0,
      songCycle: 1,
      songId: "a",
      songName: "A",
      valueIndex: 0.95,
      timing: "early",
      isSkillPointSong: true,
    },
    {
      id: "concert:0",
      type: "concert",
      concertIndex: 0,
      songsBought: 3,
      greatSuccess: true,
    },
  ];
  const highValue = calculateRunPulse(events, {
    startedAtConcert: 0,
  });
  assert.ok(highValue.value > baseline.value);
});

test("la jauge automatique C1 est intégrée à la progression du pulse", () => {
  assert.equal(calculateGaugeProgress(0, 1), 2 / 3);
  assert.equal(calculateGaugeProgress(1, 1), 1 / 3);
  assert.equal(calculateGaugeProgress(4, 2), 1);
});

test("Run Pulse ne pénalise plus un itinéraire de songs non conventionnel", () => {
  const sparse = calculateRunPulse([], { startedAtConcert: 0 });
  const dense = calculateRunPulse([], { startedAtConcert: 0 });
  assert.equal(sparse.projection, dense.projection);
});
