import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedSongCountForSnapshot,
  songSlotsForSnapshot,
} from "../src/vision/snapshot-offer.ts";

const songs = Array.from({ length: 8 }, (_, index) => ({
  id: `song-${index}`,
  name: `Song ${index}`,
  image: "song.webp",
}));

test("une page portée courte ne regonfle pas avec la nouvelle pool", () => {
  assert.equal(
    expectedSongCountForSnapshot({
      period: "senior",
      songs,
      expectedSongCount: 2,
    }),
    2,
  );
  assert.deepEqual(songSlotsForSnapshot(2), [0, 1]);
});

test("une pool courte sans cardinalité explicite reste compatible", () => {
  assert.equal(
    expectedSongCountForSnapshot({
      period: "senior",
      songs: songs.slice(0, 1),
    }),
    1,
  );
  assert.deepEqual(songSlotsForSnapshot(1), [0]);
});

test("la cardinalité OCR reste bornée aux trois cartes de Lessons", () => {
  assert.equal(
    expectedSongCountForSnapshot({
      period: "senior",
      songs,
      expectedSongCount: 7,
    }),
    3,
  );
  assert.deepEqual(songSlotsForSnapshot(0), []);
});
