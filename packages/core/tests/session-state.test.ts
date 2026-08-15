import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePersistedSongState } from "../src/domain/session-state.ts";

test("la restauration impose les invariants entre owned, active, visible et carry", () => {
  const state = sanitizePersistedSongState({
    validIds: new Set(["owned", "visible", "carry", "fourth"]),
    ownedSongIds: ["owned", "owned", "unknown"],
    activeSongIds: ["owned", "visible", "unknown"],
    visibleSongIds: ["owned", "visible", "carry", "fourth", "unknown"],
    carryoverSongIds: ["owned", "carry", "carry"],
  });

  assert.deepEqual(state, {
    ownedSongIds: ["owned"],
    activeSongIds: ["owned"],
    visibleSongIds: ["visible", "carry", "fourth"],
    carryoverSongIds: ["carry"],
  });
});

test("un carry vide ou invalide est restauré comme absent", () => {
  const state = sanitizePersistedSongState({
    validIds: new Set(["owned"]),
    ownedSongIds: ["owned"],
    activeSongIds: [],
    visibleSongIds: [],
    carryoverSongIds: ["owned", "unknown"],
  });
  assert.equal(state.carryoverSongIds, null);
});

test("une session restaurée conserve la page portée jusqu’à trois songs", () => {
  const state = sanitizePersistedSongState({
    validIds: new Set(["carry-a", "carry-b", "visible"]),
    ownedSongIds: [],
    activeSongIds: [],
    visibleSongIds: ["visible"],
    carryoverSongIds: ["carry-a", "carry-b"],
  });

  assert.deepEqual(state.carryoverSongIds, ["carry-a", "carry-b"]);
  assert.deepEqual(state.visibleSongIds, ["visible"]);
});

test("la page visible et la page portée restent deux informations distinctes", () => {
  const state = sanitizePersistedSongState({
    validIds: new Set(["a", "b", "c"]),
    ownedSongIds: [],
    activeSongIds: [],
    visibleSongIds: ["a", "b", "c"],
    carryoverSongIds: ["b"],
  });

  assert.deepEqual(state.visibleSongIds, ["a", "b", "c"]);
  assert.deepEqual(state.carryoverSongIds, ["b"]);
});
