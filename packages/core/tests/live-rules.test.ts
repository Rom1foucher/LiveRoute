import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAND_LIVE_RULES,
  applyPromotionalLiveTransition,
  checkpointForSection,
  concertTransitionBlockReason,
  finalGateSecured,
  gaugeSongCount,
  isGreatSuccess,
  lessonOfferComposition,
  manualSongsForGreatSuccess,
  poolSizeForSection,
  techniquesForSongCycle,
  tokenCapForSection,
} from "../src/domain/live-rules.ts";
import type { Balance } from "../src/live-model.ts";
import { SONGS } from "../src/domain/song-data.ts";

const balance = (value: number): Balance => ({
  dance: value,
  passion: value,
  vocal: value,
  visual: value,
  mental: value,
});

test("le RuleSet expose les pools cumulées 8/11/15/21", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((section) => poolSizeForSection(section)),
    [8, 11, 15, 21, 21],
  );
  assert.deepEqual(GRAND_LIVE_RULES.unlocksBySection, [8, 3, 4, 6, 0]);
});

test("le catalogue réel respecte les déblocages du RuleSet", () => {
  const byUnlock = [0, 1, 2, 3, 4].map(
    (phase) => SONGS.filter((song) => song.unlockPhase === phase).length,
  );
  assert.deepEqual(byUnlock, GRAND_LIVE_RULES.unlocksBySection);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(
      (phase) => SONGS.filter((song) => song.unlockPhase <= phase).length,
    ),
    GRAND_LIVE_RULES.poolSizeBySection,
  );
});

test("le préfixe Junior est fermé après 1-2-3-4-4-2-3", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((cycle) => techniquesForSongCycle(0, cycle)),
    [1, 2, 3, 4, 4, 2, 3],
  );
  assert.equal(techniquesForSongCycle(0, 8), null);
});

test("les patterns C2-C4 et Grand Live bouclent sur leurs règles mesurées", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((cycle) => techniquesForSongCycle(2, cycle)),
    [2, 2, 2, 4, 5, 2, 2, 4],
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((cycle) => techniquesForSongCycle(4, cycle)),
    [2, 2, 2, 4, 3, 2, 2, 4],
  );
});

test("Make Debut et GLU réduisent la jauge manuelle C1/GL à deux songs", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((concert) => manualSongsForGreatSuccess(concert)),
    [2, 3, 3, 3, 2],
  );
  assert.equal(gaugeSongCount(0, 2), 3);
  assert.equal(gaugeSongCount(4, 2), 3);
  assert.equal(isGreatSuccess(0, 2), true);
  assert.equal(isGreatSuccess(4, 1), false);
});

test("le RuleSet marque le crédit +10 et le tarif carryover comme vérifiés", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((concert) => tokenCapForSection(concert)),
    [200, 250, 300, 350, 400],
  );
  assert.equal(GRAND_LIVE_RULES.promotionalLiveTokenGainConfidence, "verified");
  assert.equal(
    GRAND_LIVE_RULES.techniqueCarryoverPricingConfidence,
    "verified",
  );
  assert.deepEqual(
    applyPromotionalLiveTransition(balance(195), 0),
    balance(205),
  );
  assert.deepEqual(
    applyPromotionalLiveTransition(balance(200), 0),
    balance(210),
  );
  assert.deepEqual(
    applyPromotionalLiveTransition(balance(400), 4),
    balance(400),
  );
});

test("16 reste un repère explicite et seule la porte finale 18 ∧ GS est conjointe", () => {
  assert.equal(checkpointForSection(3)?.required, 16);
  assert.equal(checkpointForSection(4)?.required, 18);
  assert.equal(finalGateSecured(18, 2), true);
  assert.equal(finalGateSecured(17, 2), false);
  assert.equal(finalGateSecured(18, 1), false);
});

test("un objectif 16 manqué ne bloque jamais l'enregistrement de C4", () => {
  assert.equal(
    concertTransitionBlockReason({
      concertIndex: 3,
      concertCount: 5,
      songSelectionReady: false,
      songOfferComplete: false,
    }),
    null,
  );
});

test("la transition reste bloquée uniquement par une incohérence mécanique", () => {
  assert.equal(
    concertTransitionBlockReason({
      concertIndex: 3,
      concertCount: 5,
      songSelectionReady: true,
      songOfferComplete: false,
    }),
    "incomplete-song-offer",
  );
  assert.equal(
    concertTransitionBlockReason({
      concertIndex: 4,
      concertCount: 5,
      songSelectionReady: false,
      songOfferComplete: true,
    }),
    "last-concert",
  );
});

test("une page de songs déjà portée peut traverser un autre concert", () => {
  assert.equal(
    concertTransitionBlockReason({
      concertIndex: 1,
      concertCount: 5,
      songSelectionReady: true,
      songOfferComplete: true,
    }),
    null,
  );
});

test("une pool sous trois songs produit une offre mixte song/technique", () => {
  assert.deepEqual(lessonOfferComposition(8), {
    songSlots: 3,
    techniqueSlots: 0,
  });
  assert.deepEqual(lessonOfferComposition(3), {
    songSlots: 3,
    techniqueSlots: 0,
  });
  assert.deepEqual(lessonOfferComposition(2), {
    songSlots: 2,
    techniqueSlots: 1,
  });
  assert.deepEqual(lessonOfferComposition(1), {
    songSlots: 1,
    techniqueSlots: 2,
  });
  assert.deepEqual(lessonOfferComposition(0), {
    songSlots: 0,
    techniqueSlots: 3,
  });
});
