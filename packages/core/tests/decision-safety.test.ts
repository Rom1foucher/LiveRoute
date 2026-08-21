import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisResult, Balance, SongTarget } from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import {
  assessSongChoices,
  assessTechniqueChoices,
} from "../src/diagnostics/decision-safety.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import { fr } from "./helpers/messages.ts";

const balance = (partial: Partial<Balance>): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const target: SongTarget = {
  id: "sp3",
  name: "Grow-up Shine!",
  cost: balance({ vocal: 32 }),
  priority: true,
  roles: ["sp3-target"],
  utility: 10,
};

const analysis = (
  goalProbability: number,
  reachProbability = 1,
): AnalysisResult => ({
  valid: true,
  objective: "priority-song",
  physicalAffordable: true,
  immediateFundingGap: balance({}),
  weightedFundingGap: 0,
  zeroIncomeFundabilityProbability: goalProbability,
  goalProbability,
  jointGoalProbability: Math.min(goalProbability, reachProbability),
  conditionalGoalProbability:
    reachProbability > 0 ? Math.min(1, goalProbability / reachProbability) : 0,
  reachProbability,
  failProbability: 1 - reachProbability,
  anySongShownProbability: 1,
  prioritySongShownProbability: goalProbability,
  reachAnySongAffordableProbability: reachProbability,
  reachPrioritySongAffordableProbability: goalProbability,
  expectedBestSongUtility: 0,
  songOutcomes: [],
  immediateBlockProbability: 0,
  lateBlockProbability: 0,
  expectedWaste: 0,
  conditionalWaste: 0,
  averageSuccessSpend: 0,
  failureDepth: [],
  criticalToken: null,
  criticalTokenGain: 0,
  trials: 1,
  maxTrials: 1,
  converged: true,
  uncertainAtBudgetLimit: false,
  recommendation: "safe",
  probabilityScope: "conditional-shop",
});

test("une technique rouge est réservée à un blocage déterministe de la cible", () => {
  const tokens = balance({ dance: 100, vocal: 40 });
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [target],
  });
  const assessments = assessTechniqueChoices({
    tokens,
    candidates: [
      {
        index: 0,
        cost: balance({ dance: 16 }),
        result: analysis(0.8),
      },
      {
        index: 1,
        cost: balance({ vocal: 16 }),
        result: analysis(0),
      },
    ],
    songs: [target],
    plan,
    riskProfile: "standard",
    recommendedIndex: 0,
  });

  assert.equal(assessments[0]?.safety, "recommended");
  assert.equal(assessments[1]?.safety, "hard-blocking");
  assert.match(fr(assessments[1]?.blocking?.detail), /Grow-up Shine/);
});

test("une option légèrement moins bonne n'est pas rouge tant que la cible reste finançable", () => {
  const tokens = balance({ dance: 100, vocal: 60 });
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [target],
  });
  const assessments = assessTechniqueChoices({
    tokens,
    candidates: [
      {
        index: 0,
        cost: balance({ dance: 16 }),
        result: analysis(0.8),
      },
      {
        index: 1,
        cost: balance({ vocal: 16 }),
        result: analysis(0.76),
      },
    ],
    songs: [target],
    plan,
    riskProfile: "standard",
    recommendedIndex: 0,
  });

  assert.equal(assessments[1]?.safety, "safe-alternative");
  assert.equal(assessments[1]?.blocking, null);
});

test("une technique plus chère sur les mêmes couleurs est secondaire, pas rouge", () => {
  const tokens = balance({ vocal: 94, dance: 49 });
  const plan = deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: [],
  });
  const assessments = assessTechniqueChoices({
    tokens,
    candidates: [
      {
        index: 0,
        cost: balance({ vocal: 10 }),
        result: analysis(0.49, 0.98),
      },
      {
        index: 1,
        cost: balance({ vocal: 30 }),
        result: analysis(0.49, 0.99),
      },
    ],
    songs: [],
    plan,
    riskProfile: "standard",
    recommendedIndex: 0,
  });

  assert.equal(assessments[1]?.safety, "secondary");
  assert.equal(assessments[1]?.blocking, null);
  assert.equal(assessments[1]?.advisory?.code, "advisory.cheaperSameSupport");
  assert.match(fr(assessments[1]?.advisory), /effet propre.*Energy/i);
});

test("P-R1 C4-D430E7F8 : le +10 garanti préserve Harusora à la frontière du concert", () => {
  const harusora: SongTarget = {
    id: "harusora",
    name: "Sky-Blue Spring",
    cost: balance({ dance: 12, visual: 32 }),
    priority: true,
    roles: ["friendship-5"],
    utility: 4,
  };
  const tokens = balance({
    dance: 29,
    passion: 31,
    vocal: 10,
    visual: 37,
    mental: 32,
  });
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: [harusora],
    songsThisSection: 5,
  });
  const assessments = assessTechniqueChoices({
    tokens,
    candidates: [
      {
        index: 0,
        cost: balance({ passion: 10 }),
        result: analysis(0.8),
      },
      {
        index: 2,
        cost: balance({ dance: 14, visual: 10 }),
        result: analysis(0.76),
      },
    ],
    songs: [harusora],
    plan,
    riskProfile: "standard",
    recommendedIndex: 0,
    fundingHorizon: {
      timingMode: "deadline-now",
      techniquesRemaining: 1,
    },
  });

  const option3 = assessments.find((candidate) => candidate.index === 2);
  assert.ok(option3);
  assert.notEqual(option3.safety, "hard-blocking");
  assert.equal(option3.blocking, null);
});

test("P-R1 C3-C795E47F : sans transition garantie, le blocage SP3 reste dur", () => {
  const growUp: SongTarget = {
    id: "grow-up-shine",
    name: "Grow Up and Shine!",
    cost: balance({ dance: 21, vocal: 21, mental: 21 }),
    priority: true,
    roles: ["sp3-target"],
    utility: 10,
  };
  const tokens = balance({
    dance: 42,
    passion: 34,
    vocal: 30,
    visual: 43,
    mental: 52,
  });
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [growUp],
  });
  const assessments = assessTechniqueChoices({
    tokens,
    candidates: [
      {
        index: 0,
        cost: balance({ passion: 10 }),
        result: analysis(0.8),
      },
      {
        index: 1,
        cost: balance({ dance: 25 }),
        result: analysis(0),
      },
    ],
    songs: [growUp],
    plan,
    riskProfile: "standard",
    recommendedIndex: 0,
    fundingHorizon: {
      timingMode: "section-open",
      techniquesRemaining: 1,
    },
  });

  assert.equal(assessments[1]?.safety, "hard-blocking");
  assert.equal(assessments[1]?.blocking?.targetId, "grow-up-shine");
});

test("P4 : checkpoint 18 impossible ne rend plus une song rouge", () => {
  const visible: SongTarget[] = [
    {
      id: "f10",
      name: "Friendship +10",
      cost: balance({ dance: 21 }),
      priority: false,
      roles: ["friendship-10"],
      utility: 4,
      policyValue: 360,
    },
    {
      id: "filler-a",
      name: "Filler A",
      cost: balance({ passion: 21 }),
      priority: false,
      roles: ["filler"],
      utility: 1,
      policyValue: 40,
    },
    {
      id: "filler-b",
      name: "Filler B",
      cost: balance({ vocal: 21 }),
      priority: false,
      roles: ["filler"],
      utility: 1,
      policyValue: 40,
    },
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    visibleSongs: visible,
    remainingSongs: visible,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 80,
  });

  assert.equal(result.recommended?.checkpoint18Status, "impossible");
  const assessments = assessSongChoices({
    policyResult: result,
    visibleSongIds: visible.map((song) => song.id),
    recommendedSongId: result.recommended?.songId ?? null,
    recommendedPolicyId: result.recommended?.id ?? null,
  });
  // v0.23 removed 18 from scoring: no blocking proof may cite it any more.
  assert.ok(
    assessments.every(
      (item) => item.blocking?.label.code !== "blocking.closesFinalGate.label",
    ),
  );
  assert.notEqual(
    assessments.find((item) => item.songId === "f10")?.safety,
    "hard-blocking",
  );
});
