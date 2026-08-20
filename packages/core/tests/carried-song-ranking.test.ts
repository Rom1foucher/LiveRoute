import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateRemainingTrainingsByFacility,
  type Balance,
  type SongTarget,
  type TokenShadowPrice,
} from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { simulateCrossSectionReadinessTrial } from "../src/solver/cross-section.ts";
import {
  carriedSongRankMetrics,
  compareCarriedSongMetrics,
  selectCarriedPageSong,
} from "../src/solver/carried-song-ranking.ts";

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
  practiceBonus?: string,
): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  priority: false,
  roles: ["filler"],
  utility: 0,
  policyValue: 0,
  practiceBonus,
});

const zeroShadowPrices: TokenShadowPrice[] = [
  "dance",
  "passion",
  "vocal",
  "visual",
  "mental",
].map((key) => ({
  key: key as TokenShadowPrice["key"],
  shadowValue: 0,
  weightedDemand: 0,
}));

const planFor = (songs: SongTarget[]) =>
  deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: songs,
    songsThisSection: 0,
  });

const rich = balance({
  dance: 100,
  passion: 100,
  vocal: 100,
  visual: 100,
  mental: 100,
});

const assertClose = (actual: number, expected: number): void => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
};

test("P2 départage tachiichi/nigekiri par le delta de stats après égalité de coûts", () => {
  const tachiichi = song(
    "tachiichi",
    { dance: 21, visual: 21 },
    "Speed training +1",
  );
  const nigekiri = song(
    "nigekiri",
    { dance: 21, visual: 21 },
    "Guts training +1",
  );
  const plan = planFor([tachiichi, nigekiri]);
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;

  const tachiichiMetrics = carriedSongRankMetrics({
    song: tachiichi,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance: rich,
    remainingTrainingsByFacility,
    friendshipSongMultiplier: 1.1,
  });
  const nigekiriMetrics = carriedSongRankMetrics({
    song: nigekiri,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance: rich,
    remainingTrainingsByFacility,
    friendshipSongMultiplier: 1.1,
  });

  assert.equal(tachiichiMetrics.weightedCost, nigekiriMetrics.weightedCost);
  assert.equal(
    tachiichiMetrics.scarcityNormalisedCost,
    nigekiriMetrics.scarcityNormalisedCost,
  );
  assert.equal(tachiichiMetrics.totalCost, nigekiriMetrics.totalCost);
  assertClose(tachiichiMetrics.expectedPracticeStatDelta, 41.8);
  assertClose(nigekiriMetrics.expectedPracticeStatDelta, 6.6);
  assert.ok(compareCarriedSongMetrics(tachiichiMetrics, nigekiriMetrics) > 0);

  assert.equal(
    selectCarriedPageSong({
      songs: [nigekiri, tachiichi],
      plan,
      commonShadowPrices: zeroShadowPrices,
      purchasePointBalance: rich,
      remainingTrainingsByFacility,
      friendshipSongMultiplier: 1.1,
    })?.song.id,
    "tachiichi",
  );
});

test("P2 weightedCost utilise les shadow prices communs avant la rareté du wallet", () => {
  const dance = song("dance-cost", { dance: 20 });
  const vocal = song("vocal-cost", { vocal: 20 });
  const plan = planFor([dance, vocal]);
  const commonShadowPrices = zeroShadowPrices.map((price) => ({
    ...price,
    shadowValue: price.key === "dance" ? 0.2 : price.key === "vocal" ? 0.01 : 0,
  }));
  const purchasePointBalance = balance({ dance: 1000, vocal: 21 });
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;

  const danceMetrics = carriedSongRankMetrics({
    song: dance,
    plan,
    commonShadowPrices,
    purchasePointBalance,
    remainingTrainingsByFacility,
  });
  const vocalMetrics = carriedSongRankMetrics({
    song: vocal,
    plan,
    commonShadowPrices,
    purchasePointBalance,
    remainingTrainingsByFacility,
  });

  assert.ok(danceMetrics.weightedCost > vocalMetrics.weightedCost);
  assert.ok(
    danceMetrics.scarcityNormalisedCost < vocalMetrics.scarcityNormalisedCost,
  );
  assert.equal(
    selectCarriedPageSong({
      songs: [dance, vocal],
      plan,
      commonShadowPrices,
      purchasePointBalance,
      remainingTrainingsByFacility,
    })?.song.id,
    "vocal-cost",
  );
});

test("P2 scarcityNormalisedCost est la fraction exacte du wallet sans +1 de lissage", () => {
  const scarce = song("scarce", { dance: 20 });
  const abundant = song("abundant", { vocal: 20 });
  const plan = planFor([scarce, abundant]);
  const purchasePointBalance = balance({ dance: 20, vocal: 100 });
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;

  const scarceMetrics = carriedSongRankMetrics({
    song: scarce,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance,
    remainingTrainingsByFacility,
  });
  const abundantMetrics = carriedSongRankMetrics({
    song: abundant,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance,
    remainingTrainingsByFacility,
  });

  assert.equal(scarceMetrics.scarcityNormalisedCost, 1);
  assert.equal(abundantMetrics.scarcityNormalisedCost, 0.2);
  assert.equal(
    selectCarriedPageSong({
      songs: [scarce, abundant],
      plan,
      commonShadowPrices: zeroShadowPrices,
      purchasePointBalance,
      remainingTrainingsByFacility,
    })?.song.id,
    "abundant",
  );
});

test("P3b2 garde le coût factuel devant une projection T2 de training", () => {
  const cheap = song("cheap", { dance: 20 });
  const expensiveStats = song(
    "expensive-stats",
    { dance: 21 },
    "Speed training +1",
  );
  const plan = planFor([cheap, expensiveStats]);
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;

  assert.equal(
    selectCarriedPageSong({
      songs: [expensiveStats, cheap],
      plan,
      commonShadowPrices: zeroShadowPrices,
      purchasePointBalance: rich,
      remainingTrainingsByFacility,
    })?.song.id,
    "cheap",
  );
});

test("P2 n'injecte pas les Skill Points dans expectedPracticeStatDelta", () => {
  const skillPoints = song(
    "yume-wo-kakeru",
    { passion: 21, visual: 21 },
    "Skill Pt training +2",
  );
  const plan = planFor([skillPoints]);
  const metrics = carriedSongRankMetrics({
    song: skillPoints,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance: rich,
    remainingTrainingsByFacility:
      estimateRemainingTrainingsByFacility("speed-wit", 0)!,
    friendshipSongMultiplier: 1.1,
  });

  assert.equal(metrics.expectedPracticeStatDelta, 0);
});


test("P2 cross-section normalise la rareté sur le wallet post-Live +10", () => {
  const cheaperAfterTransition: SongTarget = {
    ...song("dance-carried", { dance: 10 }),
    priority: true,
    roles: ["friendship-5"],
    utility: 3,
    policyValue: 100,
    liveValue: 5,
  };
  const cheaperBeforeTransition: SongTarget = {
    ...song("vocal-carried", { vocal: 20 }),
    priority: true,
    roles: ["friendship-5"],
    utility: 3,
    policyValue: 100,
    liveValue: 5,
  };
  const result = simulateCrossSectionReadinessTrial(
    {
      completedConcertIndex: 0,
      currentPeriod: "junior",
      balanceBeforeLive: balance({
        dance: 10,
        passion: 100,
        vocal: 25,
        visual: 100,
        mental: 100,
      }),
      currentPool: [cheaperAfterTransition, cheaperBeforeTransition],
      carriedPage: [cheaperAfterTransition, cheaperBeforeTransition],
      totalSongsBeforeNextSection: 3,
      generationProfile: "speed-wit",
      commonShadowPrices: zeroShadowPrices,
    },
    0,
  );

  assert.ok(result);
  // Before the Live: 10/10 > 20/25, so Vocal looks cheaper. After the verified
  // +10: 10/20 < 20/35, so Dance is the correct physical purchase-point pick.
  assert.deepEqual(
    result.remainingPool.map((candidate) => candidate.id),
    ["vocal-carried"],
  );
  assert.equal(result.retainedBalance.dance, 10);
  assert.equal(result.retainedBalance.vocal, 35);
});

test("P2 l'id ne départage qu'une égalité sémantique exacte", () => {
  const alpha = song("alpha", { dance: 20 });
  const beta = song("beta", { dance: 20 });
  const plan = planFor([alpha, beta]);
  const remainingTrainingsByFacility =
    estimateRemainingTrainingsByFacility("speed-wit", 0)!;
  const alphaMetrics = carriedSongRankMetrics({
    song: alpha,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance: rich,
    remainingTrainingsByFacility,
  });
  const betaMetrics = carriedSongRankMetrics({
    song: beta,
    plan,
    commonShadowPrices: zeroShadowPrices,
    purchasePointBalance: rich,
    remainingTrainingsByFacility,
  });

  assert.equal(compareCarriedSongMetrics(alphaMetrics, betaMetrics), 0);
  assert.equal(
    selectCarriedPageSong({
      songs: [beta, alpha],
      plan,
      commonShadowPrices: zeroShadowPrices,
      purchasePointBalance: rich,
      remainingTrainingsByFacility,
    })?.song.id,
    "alpha",
  );
});
