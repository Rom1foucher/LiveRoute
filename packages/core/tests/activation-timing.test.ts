import assert from "node:assert/strict";
import test from "node:test";
import {
  acquiredEffectsForSong,
  contextualSongValues,
  effectExposure,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { evaluateCrossSectionReadiness } from "../src/solver/cross-section.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const friendship10 = (id = "f10", cost: Partial<Balance> = {}): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  ...contextualSongValues({
    practiceBonus: "Speed +10",
    liveBonusType: "friendship",
    liveBonusValue: 10,
    declaredPriority: "top",
  }),
});

const sp3 = (concertIndex: number) =>
  acquiredEffectsForSong({
    song: {
      id: `sp3-${concertIndex}`,
      name: `sp3-${concertIndex}`,
      cost: balance(),
      ...contextualSongValues({
        practiceBonus: "Skill Pt Training +3",
        liveBonusType: "event",
        liveBonusValue: 0,
        declaredPriority: "top",
      }),
    },
    concertIndex,
  });

test("PR-2 : Friendship C4 garde une exposition positive, Grand Live vaut zéro", () => {
  const c4 = acquiredEffectsForSong({
    song: friendship10(),
    concertIndex: 3,
  });
  const grandLive = acquiredEffectsForSong({
    song: friendship10(),
    concertIndex: 4,
  });

  assert.equal(effectExposure(c4, "friendship"), 150);
  assert.equal(effectExposure(grandLive, "friendship"), 0);
  assert.equal(c4[0]?.activation.beforeLive, false);
  assert.equal(c4[0]?.activation.remainingTrainingOpportunities, 15);
  assert.equal(grandLive[0]?.activation.remainingTrainingOpportunities, 0);
});

test("PR-2 : SP Training est lui aussi horizon-aware", () => {
  assert.equal(effectExposure(sp3(2), "sp-training"), 66);
  assert.equal(effectExposure(sp3(3), "sp-training"), 45);
  assert.equal(effectExposure(sp3(4), "sp-training"), 0);
});

test("PR-2 : une Friendship achetée seulement au Grand Live reste acquise mais son exposition est nulle", () => {
  const f10 = friendship10("grand-live-f10", { dance: 21 });
  const carried = evaluateCrossSectionReadiness({
    completedConcertIndex: 3,
    currentPeriod: "senior",
    // It is not affordable before C4, but the verified +10 makes the carried
    // page affordable at Grand Live.
    balanceBeforeLive: balance({ dance: 15 }),
    currentPool: [f10],
    carriedPage: [f10],
    totalSongsBeforeNextSection: 17,
    trials: 32,
    seedKey: "pr2-grand-live-zero-exposure",
  });

  assert.ok(carried);
  assert.equal(carried.expectedFriendshipBonus, 10);
  assert.equal(carried.friendship10Probability, 1);
  assert.equal(carried.expectedFriendshipTrainingExposure, 0);
  assert.equal(carried.effectiveFriendship10Probability, 0);
});

test("PR-2 : la même Friendship sécurisée avant le C4 Live conserve 15 entraînements d'exposition", () => {
  const result = evaluateCrossSectionReadiness({
    completedConcertIndex: 3,
    currentPeriod: "senior",
    balanceBeforeLive: balance(),
    currentPool: [],
    totalSongsBeforeNextSection: 17,
    activatedFriendshipBonus: 10,
    activatedFriendship10: true,
    trials: 16,
    seedKey: "pr2-c4-pre-live-positive-exposure",
  });

  assert.ok(result);
  assert.equal(result.expectedFriendshipBonus, 10);
  assert.equal(result.expectedFriendshipTrainingExposure, 150);
  assert.equal(result.effectiveFriendship10Probability, 1);
});
