import assert from "node:assert/strict";
import test from "node:test";

import { workflowScrollTarget } from "../src/workflow-scroll.ts";

test("le suivi live remonte vers le choix de song", () => {
  assert.equal(
    workflowScrollTarget({
      hydrated: true,
      workflowMode: "live",
      previousSongSelectionOpen: false,
      songSelectionOpen: true,
    }),
    "songs",
  );
});

test("un achat de song redescend vers les techniques", () => {
  assert.equal(
    workflowScrollTarget({
      hydrated: true,
      workflowMode: "live",
      previousSongSelectionOpen: true,
      songSelectionOpen: false,
    }),
    "techniques",
  );
});

test("hydratation, mode manuel et rendu identique ne déplacent pas la page", () => {
  for (const input of [
    {
      hydrated: false,
      workflowMode: "live" as const,
      previousSongSelectionOpen: false,
      songSelectionOpen: true,
    },
    {
      hydrated: true,
      workflowMode: "manual" as const,
      previousSongSelectionOpen: false,
      songSelectionOpen: true,
    },
    {
      hydrated: true,
      workflowMode: "live" as const,
      previousSongSelectionOpen: false,
      songSelectionOpen: false,
    },
  ]) {
    assert.equal(workflowScrollTarget(input), null);
  }
});
