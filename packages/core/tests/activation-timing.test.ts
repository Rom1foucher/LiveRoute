import assert from "node:assert/strict";
import test from "node:test";
import {
  acquiredEffectsForSong,
  contextualSongValues,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  immediatePracticeRewards,
  parseSongPracticeEffect,
  structuralTrainingValue,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { evaluateCrossSectionReadiness } from "../src/solver/cross-section.ts";
import { SONGS } from "../src/domain/song-data.ts";

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



test("P3b2 : chaque Practice Bonus du catalogue a une forme sémantique explicite", () => {
  const parsed = SONGS.map((song) => ({
    id: song.id,
    effect: parseSongPracticeEffect(song.practiceBonus),
  }));
  assert.deepEqual(
    parsed.filter((entry) => entry.effect === null),
    [],
  );
  assert.ok(parsed.some((entry) => entry.effect?.kind === "training-stat"));
  assert.ok(
    parsed.some((entry) => entry.effect?.kind === "training-skill-point"),
  );
  assert.ok(parsed.some((entry) => entry.effect?.kind === "immediate-stat"));
  assert.ok(
    parsed.some((entry) => entry.effect?.kind === "immediate-skill-point"),
  );
});

test("P3b2 : au Grand Live un bonus permanent vaut zéro d'horizon, un bonus plat reste immédiat", () => {
  const noTrainings = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
  assert.equal(structuralTrainingValue("Speed training +1", noTrainings, 1), 0);
  assert.deepEqual(immediatePracticeRewards("Speed +26"), {
    statPoints: 26,
    skillPoints: 0,
  });
  assert.deepEqual(immediatePracticeRewards("Skill Pts +22"), {
    statPoints: 0,
    skillPoints: 22,
  });
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

test("P3b1 : la table mécanique garde stats, Skill Points et Friendship dans trois unités", () => {
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;
  const exposures = ({
    id,
    practiceBonus,
    roles = ["filler"],
  }: {
    id: string;
    practiceBonus: string;
    roles?: SongTarget["roles"];
  }) => {
    const effects = acquiredEffectsForSong({
      song: {
        id,
        name: id,
        cost: balance(),
        roles,
        priority: false,
        utility: 0,
        policyValue: 0,
        practiceBonus,
      },
      concertIndex: 0,
      remainingTrainingsByFacility,
      friendshipSongMultiplier: 1.1,
    });
    return {
      practice: Number(effectExposure(effects, "practice").toFixed(1)),
      skillPoints: Number(effectExposure(effects, "sp-training").toFixed(1)),
      friendship: Number(effectExposure(effects, "friendship").toFixed(1)),
    };
  };

  assert.deepEqual(exposures({ id: "tachiichi", practiceBonus: "Speed training +1" }), {
    practice: 41.8,
    skillPoints: 0,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "go-this-way", practiceBonus: "Power training +1" }), {
    practice: 29.7,
    skillPoints: 0,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "kiseki", practiceBonus: "Wisdom training +1" }), {
    practice: 16.5,
    skillPoints: 0,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "ring-ring", practiceBonus: "Stamina training +1" }), {
    practice: 7.7,
    skillPoints: 0,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "nigekiri", practiceBonus: "Guts training +1" }), {
    practice: 6.6,
    skillPoints: 0,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "yume-wo-kakeru", practiceBonus: "Skill Pt training +2" }), {
    practice: 0,
    skillPoints: 99,
    friendship: 0,
  });
  assert.deepEqual(exposures({ id: "grow-up-shine", practiceBonus: "Skill Pt training +3" }), {
    practice: 0,
    skillPoints: 148.5,
    friendship: 0,
  });
  assert.deepEqual(
    exposures({
      id: "zensoku",
      practiceBonus: "Speed +22",
      roles: ["friendship-5"],
    }),
    { practice: 0, skillPoints: 0, friendship: 225 },
  );
});

test("P3b1 : Skill Pt Training reste dimensionnel même sans rôle SP", () => {
  const effects = acquiredEffectsForSong({
    song: {
      id: "roleless-sp",
      name: "roleless-sp",
      cost: balance(),
      roles: ["filler"],
      priority: false,
      utility: 1,
      policyValue: 0,
      practiceBonus: "Skill Pt Training +3",
    },
    concertIndex: 3,
  });

  assert.equal(effectExposure(effects, "practice"), 0);
  assert.equal(effectExposure(effects, "sp-training"), 45);
  assert.deepEqual(effects.map((effect) => effect.kind), ["sp-training"]);
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
