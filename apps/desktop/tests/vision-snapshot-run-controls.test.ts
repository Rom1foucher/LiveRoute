import assert from "node:assert/strict";
import test from "node:test";
import { snapshotRunProgressionAction } from "../src/vision/snapshot-run-controls.ts";

test("le cockpit OCR avance normalement avant le Grand Live", () => {
  assert.equal(
    snapshotRunProgressionAction({
      nextConcertLabel: "C2",
      postGrandLive: false,
    }),
    "advance-concert",
  );
});

test("le cockpit OCR expose le post-Grand Live au dernier concert", () => {
  assert.equal(
    snapshotRunProgressionAction({
      nextConcertLabel: null,
      postGrandLive: false,
    }),
    "enter-post-grand-live",
  );
});

test("le cockpit OCR stabilise l affichage une fois en post-Grand Live", () => {
  assert.equal(
    snapshotRunProgressionAction({
      nextConcertLabel: null,
      postGrandLive: true,
    }),
    "post-grand-live-active",
  );
});
