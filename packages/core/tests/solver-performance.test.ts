import assert from "node:assert/strict";
import test from "node:test";
import {
  createTechniqueSimulationMemo,
  runAnalysis,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";

const tokens: Balance = {
  dance: 120,
  passion: 110,
  vocal: 100,
  visual: 120,
  mental: 100,
};

const song = (
  id: string,
  cost: Partial<Balance>,
  roles: NonNullable<SongTarget["roles"]>,
): SongTarget => ({
  id,
  name: id,
  cost: {
    dance: 0,
    passion: 0,
    vocal: 0,
    visual: 0,
    mental: 0,
    ...cost,
  },
  priority: roles.includes("sp3-target"),
  utility: roles.includes("sp3-target") ? 4 : 1,
  policyValue: roles.includes("sp3-target") ? 100 : 10,
  roles,
});

test("une cible de chasse déjà visible supprime le rollout multi-pages inutile", () => {
  const target = song("perf-visible-sp3", { dance: 21, vocal: 21 }, [
    "sp3-target",
  ]);
  const fillerA = song("perf-visible-a", { dance: 21 }, ["filler"]);
  const fillerB = song("perf-visible-b", { visual: 21 }, ["filler"]);
  const result = analyzeSongSelection({
    period: "senior",
    tokens,
    visibleSongs: [target, fillerA, fillerB],
    remainingSongs: [target, fillerA, fillerB],
    techniquesToNextSong: 4,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 2,
    timingMode: "section-open",
    trials: 7000,
    nextSongCycle: 4,
    maxSongPages: 4,
  });
  assert.equal(result.recommended?.songId, target.id);
  assert.equal(result.diagnostics.transitionSamples, 0);
  assert.equal(result.diagnostics.runAnalysisSamples, 3 * 512);
});

test("les analyses sœurs réutilisent exactement les mêmes offres Monte-Carlo", () => {
  const target = song("perf-shared-offers", { dance: 21, vocal: 21 }, [
    "sp3-target",
  ]);
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [target],
  });
  const memo = createTechniqueSimulationMemo();
  const input = {
    period: "senior" as const,
    tokens,
    techniquesRemaining: 3,
    songs: [target],
    reserveSongs: [target],
    objective: "priority-song" as const,
    strategicPlan: plan,
    seedKey: "shared-offer-regression",
    trials: 128,
    techniqueMemo: memo,
  };

  const first = runAnalysis(input);
  const generatedOfferCount = memo.offers.size;
  const second = runAnalysis(input);

  assert.ok(generatedOfferCount > 0);
  assert.equal(memo.offers.size, generatedOfferCount);
  assert.equal(second.reachProbability, first.reachProbability);
  assert.equal(second.goalProbability, first.goalProbability);
});

test("la projection cachée est bornée et un état identique vient du cache", () => {
  const target = song("perf-hidden-sp3", { dance: 21, vocal: 21 }, [
    "sp3-target",
  ]);
  const fillerA = song("perf-hidden-a", { dance: 21 }, ["filler"]);
  const fillerB = song("perf-hidden-b", { visual: 21 }, ["filler"]);
  const fillerC = song("perf-hidden-c", { mental: 21 }, ["filler"]);
  const input = {
    period: "senior" as const,
    tokens,
    visibleSongs: [fillerA, fillerB, fillerC],
    remainingSongs: [target, fillerA, fillerB, fillerC],
    techniquesToNextSong: 4,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 2,
    timingMode: "section-open" as const,
    trials: 7000,
    nextSongCycle: 4,
    maxSongPages: 4,
  };
  const first = analyzeSongSelection(input);
  const second = analyzeSongSelection(input);
  assert.ok(first.diagnostics.transitionSamples <= 3 * 384);
  assert.equal(first.diagnostics.cacheHit, false);
  assert.equal(second.diagnostics.cacheHit, true);
  assert.equal(second.recommended?.id, first.recommended?.id);
});
