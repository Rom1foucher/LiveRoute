import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assessSnapshotReliability } from "../src/vision/snapshot-validation.ts";
import type { VisionProfile, VisionSnapshot } from "../src/vision/types.ts";

const profile = JSON.parse(
  await readFile(
    new URL("../public/vision-profile.json", import.meta.url),
    "utf8",
  ),
) as VisionProfile;

const tokens = (confidence = 0.9) => ({
  dance: { value: 10, confidence, raw: "10" },
  passion: { value: 20, confidence, raw: "20" },
  vocal: { value: 30, confidence, raw: "30" },
  visual: { value: 40, confidence, raw: "40" },
  mental: { value: 50, confidence, raw: "50" },
});

const baseSnapshot = (): VisionSnapshot => ({
  page: "songs",
  pageConfidence: 0.9,
  tokens: tokens(),
  techniques: [],
  songs: [
    {
      slot: 0,
      songId: "a",
      songName: "A",
      confidence: 0.9,
      titleScore: 0.9,
      coverScore: 0.9,
      rawTitle: "A",
    },
    {
      slot: 1,
      songId: "b",
      songName: "B",
      confidence: 0.9,
      titleScore: 0.9,
      coverScore: 0.9,
      rawTitle: "B",
    },
    {
      slot: 2,
      songId: "c",
      songName: "C",
      confidence: 0.9,
      titleScore: 0.9,
      coverScore: 0.9,
      rawTitle: "C",
    },
  ],
  signature: "",
  warnings: [],
  capturedAt: 0,
});

const context = {
  period: "classic" as const,
  songs: [
    { id: "a", name: "A", image: "" },
    { id: "b", name: "B", image: "" },
    { id: "c", name: "C", image: "" },
  ],
};

test("un snapshot complet et fiable peut être analysé automatiquement", () => {
  const result = assessSnapshotReliability({
    snapshot: baseSnapshot(),
    page: "songs",
    profile,
    context,
    availableSongIds: ["a", "b", "c"],
    expectedSongCount: 3,
  });
  assert.equal(result.complete, true);
  assert.equal(result.reliable, true);
});

test("une lecture faible demande une seconde validation sans perdre les valeurs", () => {
  const snapshot = baseSnapshot();
  snapshot.tokens.dance.confidence = 0.2;
  const result = assessSnapshotReliability({
    snapshot,
    page: "songs",
    profile,
    context,
    availableSongIds: ["a", "b", "c"],
    expectedSongCount: 3,
  });
  assert.equal(result.complete, true);
  assert.equal(result.reliable, false);
  assert.ok(result.uncertain.includes("token dance"));
});

test("une song manquante bloque l'analyse jusqu'à correction", () => {
  const snapshot = baseSnapshot();
  snapshot.songs[1].songId = null;
  const result = assessSnapshotReliability({
    snapshot,
    page: "songs",
    profile,
    context,
    availableSongIds: ["a", "b", "c"],
    expectedSongCount: 3,
  });
  assert.equal(result.complete, false);
  assert.equal(result.reliable, false);
  assert.ok(result.missing.includes("song 2"));
});

test("une offre mixte à deux songs n'exige pas une troisième song inexistante", () => {
  const snapshot = baseSnapshot();
  snapshot.songs = snapshot.songs.slice(0, 2);
  const result = assessSnapshotReliability({
    snapshot,
    page: "songs",
    profile,
    context,
    availableSongIds: ["a", "b"],
    expectedSongCount: 2,
  });
  assert.equal(result.complete, true);
  assert.equal(result.reliable, true);
  assert.equal(result.missing.includes("song 3"), false);
});
