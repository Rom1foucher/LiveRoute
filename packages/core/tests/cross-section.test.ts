import assert from "node:assert/strict";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import { subtractCost } from "../src/live-model.ts";
import type { SongRole } from "../src/domain/song-catalog.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { evaluateCrossSectionReadiness } from "../src/solver/cross-section.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = (
  id: string,
  cost: Partial<Balance>,
  roles: SongRole[],
): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  roles,
  priority: roles.some((role) =>
    ["friendship-10", "friendship-5", "sp2-target", "sp3-target"].includes(
      role,
    ),
  ),
  utility: roles.includes("friendship-10")
    ? 4
    : roles.includes("friendship-5")
      ? 3
      : 1,
  policyValue: roles.includes("friendship-10")
    ? 360
    : roles.includes("friendship-5")
      ? 260
      : 0,
});

const c4Friendships = (): SongTarget[] => [
  song("f10-a", { dance: 42, visual: 26 }, ["friendship-10"]),
  song("f10-b", { dance: 26, visual: 42 }, ["friendship-10"]),
  song("f5-a", { passion: 22, mental: 22 }, ["friendship-5"]),
  song("f5-b", { vocal: 22, mental: 22 }, ["friendship-5"]),
  song("f5-c", { passion: 32, vocal: 12 }, ["friendship-5"]),
  song("f5-d", { dance: 12, visual: 32 }, ["friendship-5"]),
];

test("V_C4 valorise les Friendships sans transformer 16 en dette obligatoire", () => {
  const result = evaluateCrossSectionReadiness({
    completedConcertIndex: 2,
    currentPeriod: "classic",
    balanceBeforeLive: balance({
      dance: 200,
      passion: 200,
      vocal: 200,
      visual: 200,
      mental: 200,
    }),
    currentPool: [],
    futureSongs: c4Friendships(),
    totalSongsBeforeNextSection: 10,
    trials: 600,
    seedKey: "c4-rich",
  });

  assert.ok(result);
  assert.equal(
    result.supplyScope,
    "verified-live-transition-no-training-income",
  );
  assert.equal(result.nextConcertIndex, 3);
  assert.equal(result.checkpointRequired, null);
  // 16 reste un repère de rythme hors de ce rollout : C4 dépense uniquement
  // pour la valeur réelle des songs, et non pour fermer artificiellement 16.
  assert.equal(result.checkpointProbability, 1);
  assert.equal(result.friendship10Probability, 1);
  assert.ok(result.expectedFriendshipBonus > 39.5);
  assert.ok(result.expectedPurchases > 5.8);
});

test("la valeur inter-section n'invente aucun revenu d'entraînement", () => {
  const result = evaluateCrossSectionReadiness({
    completedConcertIndex: 2,
    currentPeriod: "classic",
    balanceBeforeLive: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    currentPool: [],
    futureSongs: c4Friendships(),
    totalSongsBeforeNextSection: 10,
    trials: 500,
    seedKey: "c4-no-supply",
  });

  assert.ok(result);
  assert.equal(result.checkpointRequired, null);
  assert.equal(result.checkpointProbability, 1);
  assert.ok(result.expectedPurchases < 6);
  assert.ok(result.expectedFriendshipBonus > 0);
});

test("la valeur inter-section cumule les acquisitions de la section fermée", () => {
  const earlyFriendship = song("early-friendship", { dance: 21, visual: 21 }, [
    "friendship-5",
  ]);
  const currentPool = [earlyFriendship];
  const result = evaluateCrossSectionReadiness({
    completedConcertIndex: 0,
    currentPeriod: "junior",
    balanceBeforeLive: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    currentPool,
    totalSongsBeforeNextSection: 1,
    currentContinuation: {
      plan: deriveStrategicPlan({
        concertIndex: 0,
        timingMode: "deadline-now",
        remainingSongs: currentPool,
      }),
      nextSongCycle: 1,
      techniquesToNextSong: 0,
      pages: 1,
      requiredPurchases: 1,
      acquiredPlanTarget: false,
    },
    trials: 64,
    seedKey: "current-section-value",
  });

  assert.ok(result);
  assert.equal(result.currentSectionCompletionProbability, 1);
  assert.equal(result.expectedFriendshipBonus, 5);
  assert.equal(result.expectedFriendshipPurchases, 1);
  assert.equal(result.expectedStructuralPurchases, 1);
  assert.equal(result.expectedPurchases, 1);
  assert.equal(result.expectedTechniquePurchases, 0);
  assert.equal(result.expectedLessonSkillPoints, 25);
});

test("un filler porté gagne bien le point de pattern futur sans prime de sunk cost", () => {
  const filler = song("carried-filler", { passion: 21, visual: 21 }, [
    "filler",
  ]);
  const tokens = balance({
    dance: 150,
    passion: 150,
    vocal: 150,
    visual: 150,
    mental: 150,
  });
  const common = {
    completedConcertIndex: 2,
    currentPeriod: "classic" as const,
    currentPool: [] as SongTarget[],
    futureSongs: c4Friendships(),
    trials: 1200,
    seedKey: "carry-vs-buy",
  };

  const boughtBeforeLive = evaluateCrossSectionReadiness({
    ...common,
    balanceBeforeLive: subtractCost(tokens, filler.cost),
    totalSongsBeforeNextSection: 11,
  });
  const carried = evaluateCrossSectionReadiness({
    ...common,
    balanceBeforeLive: tokens,
    totalSongsBeforeNextSection: 10,
    carriedSong: filler,
  });

  assert.ok(boughtBeforeLive && carried);
  assert.ok(
    carried.checkpointProbability >= boughtBeforeLive.checkpointProbability,
  );
  assert.ok(
    carried.expectedFriendshipBonus > boughtBeforeLive.expectedFriendshipBonus,
  );
});

test("la fermeture C2 valorise C4 après deux transitions coûtées", () => {
  const sp3 = song("sp3", { dance: 21, vocal: 21, mental: 21 }, ["sp3-target"]);
  const result = evaluateCrossSectionReadiness({
    completedConcertIndex: 1,
    currentPeriod: "classic",
    balanceBeforeLive: balance({
      dance: 200,
      passion: 200,
      vocal: 200,
      visual: 200,
      mental: 200,
    }),
    currentPool: [],
    futureSongs: [sp3],
    laterSongs: c4Friendships(),
    totalSongsBeforeNextSection: 9,
    trials: 500,
    seedKey: "c2-to-c4",
  });

  assert.ok(result);
  assert.equal(result.horizonSections, 2);
  assert.equal(result.nextConcertIndex, 2);
  assert.equal(result.checkpointRequired, null);
  assert.equal(result.checkpointProbability, 1);
  assert.equal(result.friendship10Probability, 1);
  assert.ok(result.expectedFriendshipBonus > 39.5);
  assert.ok(result.expectedLessonSkillPoints >= 190);
});
