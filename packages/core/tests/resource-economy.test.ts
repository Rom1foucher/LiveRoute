import assert from "node:assert/strict";
import test from "node:test";
import {
  SONGS,
  activationMoment,
  analyzeSongSelection,
  buildSolverStateContext,
  chooseSafestTechnique,
  deriveReachableDemands,
  deriveStrategicPlan,
  totalCost,
  type Balance,
  type ResourceDemand,
  type SongTarget,
} from "../src/index.ts";
import { horizonMetricNumber } from "../src/solver/horizon-outcome.ts";
const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const filler = (id: string, cost: Partial<Balance>): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  roles: ["filler"],
  priority: false,
  utility: 1,
  policyValue: 0,
  practiceValue: 1,
});

test("PR-5 : une song requise parmi plusieurs alternatives reste une demande OR", () => {
  const songs = [
    filler("option-a", { dance: 21 }),
    filler("option-b", { passion: 21 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "deadline-now",
    remainingSongs: songs,
    songsThisSection: 2,
  });
  assert.equal(plan.id, "close-checkpoint");

  const demands = deriveReachableDemands({
    currentSongs: songs,
    visibleSongIds: songs.map((song) => song.id),
    plan,
    concertIndex: 1,
    timingMode: "deadline-now",
    requiredPurchases: 1,
  });
  const required = demands.filter(
    (demand) => demand.source === "required-song",
  );

  assert.equal(required.length, 2);
  assert.ok(
    Math.abs(
      required.reduce((sum, demand) => sum + demand.probability, 0) - 1,
    ) < 1e-12,
  );
  assert.deepEqual(
    required.map((demand) => demand.probability),
    [0.5, 0.5],
  );
});

test("PR-5 : la technique évite la couleur d'une action aval réellement demandée", () => {
  const tokens = balance({
    dance: 100,
    passion: 100,
    vocal: 100,
    visual: 100,
    mental: 100,
  });
  const demands: ResourceDemand[] = [
    {
      source: "reachable-policy-action",
      songId: "future-dance-song",
      earliestUse: activationMoment({ concertIndex: 2, beforeLive: true }),
      probability: 1,
      cost: balance({ dance: 60 }),
    },
  ];
  const danceOffer = balance({ dance: 20 });
  const passionOffer = balance({ passion: 20 });

  const chosen = chooseSafestTechnique(
    "classic",
    tokens,
    [danceOffer, passionOffer],
    true,
    "carryover",
    [],
    [],
    "speed-wit",
    undefined,
    "standard",
    undefined,
    undefined,
    demands,
  );

  assert.deepEqual(chosen, passionOffer);
});

test("PR-5 : BUY_CONTINUE paie au minimum le prochain cycle technique", () => {
  const context = buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 0,
    period: "junior",
    techniqueOfferPeriod: null,
    songCycle: 2,
    techniquesToNextSong: 0,
    tokens: balance({
      dance: 76,
      passion: 50,
      vocal: 53,
      visual: 42,
      mental: 65,
    }),
    ownedSongIds: ["run-run"],
    activeSongIds: [],
    selectedOfferIds: ["nigekiri", "kiseki", "ring-ring"],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "priority-song",
    songsThisSection: 1,
    totalSongs: 2,
    timingMode: "deadline-now",
  });
  const result = analyzeSongSelection({
    period: "junior",
    firstOfferPeriod: context.firstOfferPeriod,
    tokens: balance({
      dance: 76,
      passion: 50,
      vocal: 53,
      visual: 42,
      mental: 65,
    }),
    visibleSongs: context.visibleSongs,
    remainingSongs: context.currentSongs,
    futureSongs: context.futureSongs,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 2,
    concertIndex: 0,
    generationProfile: context.effectiveGenerationProfile,
    friendshipSongMultiplier: context.friendshipSongMultiplier,
    remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
    riskProfile: context.effectiveRiskProfile,
    trials: 256,
    nextSongCycle: 3,
    timingMode: "deadline-now",
    maxSongPages: 4,
    continuationObjective: "priority-song",
  });
  const buyContinues = result.policies.filter(
    (policy) => policy.action === "buy-continue" && policy.affordable,
  );
  assert.ok(buyContinues.length > 0);

  for (const policy of buyContinues) {
    const song = context.visibleSongs.find(
      (candidate) => candidate.id === policy.songId,
    );
    assert.ok(song);
    assert.equal(
      horizonMetricNumber(policy.horizonOutcome, "visible-song-cost"),
      totalCost(song.cost),
    );
    assert.ok(
      (horizonMetricNumber(
        policy.horizonOutcome,
        "future-technique-cost-expected",
      ) ?? 0) > 0,
      `${policy.id} must expose future technique cost as token state`,
    );
    // This fixture closes Great Success with the current purchase, so the
    // extra cost comes from the cheap one-cycle estimate rather than a deeper
    // multi-page transition rollout.
    assert.equal(
      policy.sampling?.some((run) => run.purpose === "transition-lookahead"),
      false,
    );
  }
});
