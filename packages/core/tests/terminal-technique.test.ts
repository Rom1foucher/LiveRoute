import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualSongValues,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { SONGS } from "../src/domain/song-data.ts";
import { evaluateTerminalTechniqueOptions } from "../src/solver/terminal-technique.ts";
import { fr } from "./helpers/messages.ts";

const balance = (partial: Partial<Balance>): Balance => ({
  dance: partial.dance ?? 0,
  passion: partial.passion ?? 0,
  vocal: partial.vocal ?? 0,
  visual: partial.visual ?? 0,
  mental: partial.mental ?? 0,
});

const filler = (id: string, cost: Partial<Balance>): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  ...contextualSongValues({
    practiceBonus: "Stat training +2",
    liveBonusType: "event",
    liveBonusValue: 0,
    declaredPriority: "normal",
  }),
});

test("HOLD après SP+3 désactive entièrement la projection terminale de fillers", () => {
  const currentSongs = [
    filler("filler-a", { dance: 22, visual: 22 }),
    filler("filler-b", { passion: 22, mental: 22 }),
    filler("filler-c", { vocal: 22, visual: 22 }),
    filler("filler-d", { dance: 22, mental: 22 }),
  ];
  const futureSongs = [
    filler("future-a", { dance: 26, visual: 26 }),
    filler("future-b", { passion: 26, mental: 26 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "deadline-now",
    remainingSongs: [...currentSongs, ...futureSongs],
    songsThisSection: 3,
  });
  assert.equal(plan.mode, "hold");

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 2,
    period: "senior",
    tokens: balance({
      dance: 145,
      passion: 132,
      vocal: 124,
      visual: 150,
      mental: 138,
    }),
    candidates: [
      { id: "dance", cost: balance({ dance: 20 }) },
      { id: "mental", cost: balance({ mental: 20 }) },
      { id: "vocal", cost: balance({ vocal: 20 }) },
    ],
    techniquesRemaining: 4,
    currentSongs,
    futureSongs,
    totalSongs: 17,
    plan,
    trials: 120,
    seedKey: "regression-useless-terminal-carry",
  });

  assert.equal(assessments, null);
});

test("C4 sous 18 ne pousse pas une chaîne de fillers uniquement pour le compteur", () => {
  const currentSongs = [
    filler("filler-a", { dance: 22, visual: 22 }),
    filler("filler-b", { passion: 22, mental: 22 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
  });
  assert.equal(plan.mode, "close");

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 3,
    period: "senior",
    tokens: balance({
      dance: 180,
      passion: 180,
      vocal: 180,
      visual: 180,
      mental: 180,
    }),
    candidates: [{ id: "dance", cost: balance({ dance: 20 }) }],
    techniquesRemaining: 2,
    currentSongs,
    totalSongs: 17,
    plan,
    trials: 80,
  });

  assert.ok(assessments);
  assert.equal(assessments.length, 1);
  assert.equal(assessments[0].action, "stop-now");
  assert.equal(assessments[0].trials, 80);
  assert.equal(assessments[0].seedKey, "terminal-technique:crn");
  assert.equal(assessments[0].reason.code, "terminal.stopNowValue");
  assert.match(fr(assessments[0].reason), /coût pondéré|net/);
  assert.ok(assessments[0].expectedCommittedCost >= 20);
  assert.ok(
    assessments[0].expectedWeightedCommittedCost >=
      assessments[0].expectedCommittedCost,
  );
});

const songTarget = (id: string): SongTarget => {
  const song = SONGS.find((candidate) => candidate.id === id);
  assert.ok(song, `song ${id} missing`);
  return {
    id: song.id,
    name: song.name,
    cost: song.cost,
    ...contextualSongValues({
      practiceBonus: song.practiceBonus,
      liveBonusType: song.liveBonusType,
      liveBonusValue: song.liveBonusValue,
      declaredPriority: song.priority,
    }),
  };
};

test("C1 valorise naturellement une page bon marché pouvant révéler et acheter une Friendship avant le Live", () => {
  const currentSongs = [
    "kiseki",
    "tachiichi",
    "nigekiri",
    "go-this-way",
    "ring-ring",
    "seishun",
  ].map(songTarget);
  const plan = deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
  });

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 0,
    period: "junior",
    tokens: balance({
      dance: 18,
      passion: 123,
      vocal: 41,
      visual: 17,
      mental: 19,
    }),
    candidates: [
      { id: "visual-10", cost: balance({ visual: 10 }) },
      { id: "visual-15", cost: balance({ visual: 15 }) },
      { id: "vocal-10", cost: balance({ vocal: 10 }) },
    ],
    techniquesRemaining: 1,
    currentSongs,
    totalSongs: 3,
    plan,
    trials: 300,
    seedKey: "decision-7-seq23",
  });

  assert.ok(assessments);
  const cheapVisual = assessments.find(
    (assessment) => assessment.candidateId === "visual-10",
  );
  assert.ok(cheapVisual);
  assert.equal(cheapVisual.action, "expose-and-carry");
  assert.ok(cheapVisual.pushExpectedFriendshipBonus > 0);
  assert.match(fr(cheapVisual.reason), /Friendship|structurel/);
});

test("C1 ne pousse pas par règle fixe quand une page chère ne contient que des fillers", () => {
  const currentSongs = [
    filler("filler-a", { dance: 22, visual: 22 }),
    filler("filler-b", { passion: 22, mental: 22 }),
    filler("filler-c", { vocal: 22, visual: 22 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
  });
  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 0,
    period: "junior",
    tokens: balance({
      dance: 70,
      passion: 70,
      vocal: 70,
      visual: 70,
      mental: 70,
    }),
    candidates: [{ id: "expensive", cost: balance({ dance: 30 }) }],
    techniquesRemaining: 4,
    currentSongs,
    totalSongs: 4,
    plan,
    trials: 120,
    seedKey: "c1-no-hardcoded-push",
  });
  assert.ok(assessments);
  assert.equal(assessments[0].action, "stop-now");
});

test("PR-2 : porter une Friendship jusqu'au Grand Live ne justifie plus PUSH par son bonus brut", () => {
  const f10: SongTarget = {
    id: "grand-live-f10",
    name: "grand-live-f10",
    cost: balance({ dance: 21 }),
    ...contextualSongValues({
      practiceBonus: "Speed +10",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      declaredPriority: "top",
    }),
  };
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: [f10],
  });

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 3,
    period: "senior",
    tokens: balance({ dance: 15, mental: 20 }),
    // The technique exposes the known page but cannot buy F+10 before the
    // Live. The +10 transition makes it affordable only at Grand Live. A real
    // 20-token cost prevents the +25 SP terminal conversion from masking the
    // invariant under test: the late Friendship bonus itself has zero horizon.
    candidates: [{ id: "mental-20", cost: balance({ mental: 20 }) }],
    techniquesRemaining: 1,
    currentSongs: [f10],
    totalSongs: 17,
    plan,
    trials: 80,
    seedKey: "pr2-terminal-grand-live-friendship",
  });

  assert.ok(assessments);
  const assessment = assessments[0];
  assert.ok(assessment);
  assert.equal(assessment.pushExpectedFriendshipBonus, 10);
  assert.equal(assessment.pushFriendship10Probability, 1);
  assert.equal(assessment.pushExpectedFriendshipTrainingExposure, 0);
  assert.equal(assessment.pushEffectiveFriendship10Probability, 0);
  assert.equal(assessment.action, "stop-now");
  assert.equal(assessment.reason.code, "terminal.stopNowValue");
  assert.ok(assessment.expectedWeightedCommittedCost >= 20);
  assert.ok(assessment.netValue <= 0);
});

test("PR-5.1 : le rollout terminal transmet les demandes aval aux techniques futures", () => {
  const currentSongs = [
    filler("demand-a", { dance: 22, visual: 22 }),
    filler("demand-b", { passion: 22, mental: 22 }),
    filler("demand-c", { vocal: 22, visual: 22 }),
    filler("demand-d", { dance: 30, passion: 10 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
  });
  const baseInput = {
    concertIndex: 3,
    period: "senior" as const,
    tokens: balance({
      dance: 70,
      passion: 70,
      vocal: 70,
      visual: 70,
      mental: 70,
    }),
    candidates: [{ id: "mental", cost: balance({ mental: 24 }) }],
    techniquesRemaining: 3,
    currentSongs,
    totalSongs: 16,
    plan,
    trials: 80,
    minimumSamples: 80,
    seedKey: "search-0",
  };

  const withoutDemand = evaluateTerminalTechniqueOptions(baseInput);
  const withDemand = evaluateTerminalTechniqueOptions({
    ...baseInput,
    resourceDemands: [
      {
        source: "terminal",
        songId: "future-dance-demand",
        earliestUse: {
          concertIndex: 3,
          beforeLive: true,
          remainingTrainingOpportunities: 10,
        },
        probability: 1,
        cost: balance({ dance: 100 }),
      },
    ],
  });

  assert.ok(withoutDemand);
  assert.ok(withDemand);
  assert.equal(withoutDemand.length, 1);
  assert.equal(withDemand.length, 1);
  // The visible candidate is identical and no tokenPressure is injected here.
  // Any divergence therefore comes from the demand reaching the simulated
  // future technique sequence. Without PR-5.1 propagation these two costs are
  // bit-for-bit identical because resourceDemands would be ignored.
  assert.notEqual(
    withDemand[0].expectedCommittedCost,
    withoutDemand[0].expectedCommittedCost,
  );
});

test("C4 replay C4-89AB27AB : le gros stock pousse malgré un spend brut supérieur au gain", () => {
  const currentSongs = [
    "go-this-way",
    "a-no-ne",
    "bluebird",
    "komorebi",
    "pyoitto",
    "yumezora",
    "present-march",
    "daisuki",
    "sekai",
    "harusora",
    "fanfare",
  ].map(songTarget);
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
    songsThisSection: 0,
  });

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 3,
    period: "senior",
    firstOfferPeriod: "classic",
    tokens: balance({
      dance: 129,
      passion: 166,
      vocal: 137,
      visual: 127,
      mental: 141,
    }),
    candidates: [
      { id: "vocal-15", cost: balance({ vocal: 15 }) },
      { id: "passion-16", cost: balance({ passion: 16 }) },
      { id: "mental-16", cost: balance({ mental: 16 }) },
    ],
    techniquesRemaining: 2,
    nextSongCycle: 1,
    currentSongs,
    totalSongs: 11,
    plan,
    riskProfile: "standard",
    generationProfile: "speed-wit",
    trials: 160,
    minimumSamples: 160,
    seedKey: "replay-c4-89ab27ab",
  });

  assert.ok(assessments);
  const best = assessments[0];
  assert.ok(best);
  assert.equal(best.action, "expose-and-carry");
  assert.ok(best.grossValue > 0);
  assert.ok(best.expectedWeightedCommittedCost > best.grossValue);
  assert.ok(best.expectedOpportunityCost < best.grossValue);
  assert.ok(best.netValue > 0);
});

test("hotfix v6 replay C4 : un miss ne retombe plus sur le coût brut quand le stock préserve les options", () => {
  const currentSongs = [
    "nigekiri",
    "go-this-way",
    "bluebird",
    "grow-up-shine",
    "komorebi",
    "pyoitto",
    "yumezora",
    "present-march",
    "sekai",
    "harusora",
  ].map(songTarget);
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
    songsThisSection: 2,
  });

  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 3,
    period: "senior",
    tokens: balance({
      dance: 183,
      passion: 104,
      vocal: 107,
      visual: 57,
      mental: 127,
    }),
    candidates: [
      { id: "visual-24", cost: balance({ visual: 24 }) },
      { id: "dance-24", cost: balance({ dance: 24 }) },
    ],
    techniquesRemaining: 3,
    nextSongCycle: 3,
    currentSongs,
    totalSongs: 12,
    plan,
    riskProfile: "standard",
    generationProfile: "speed-wit",
    trials: 160,
    minimumSamples: 160,
    seedKey: "replay-20260814-c4-183-104-107-57-127",
  });

  assert.ok(assessments);
  assert.ok(
    assessments.every((assessment) => assessment.action === "expose-and-carry"),
  );
  assert.ok(
    assessments.every(
      (assessment) =>
        assessment.expectedOpportunityCost <
        assessment.expectedWeightedCommittedCost * 0.2,
    ),
  );
  assert.ok(assessments.every((assessment) => assessment.netValue > 0));
});

test("hotfix v6 : le budget temporel terminal rend la main avec un diagnostic d'incertitude", () => {
  const currentSongs = [
    "nigekiri",
    "go-this-way",
    "bluebird",
    "grow-up-shine",
    "komorebi",
    "pyoitto",
    "yumezora",
    "present-march",
    "sekai",
    "harusora",
  ].map(songTarget);
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
    songsThisSection: 2,
  });
  const assessments = evaluateTerminalTechniqueOptions({
    concertIndex: 3,
    period: "senior",
    tokens: balance({
      dance: 83,
      passion: 104,
      vocal: 86,
      visual: 57,
      mental: 106,
    }),
    candidates: [
      { id: "dance-24", cost: balance({ dance: 24 }) },
      { id: "passion-24", cost: balance({ passion: 24 }) },
    ],
    techniquesRemaining: 4,
    currentSongs,
    totalSongs: 12,
    plan,
    trials: 7200,
    minimumSamples: 320,
    maxDurationMs: 0,
    seedKey: "hotfix-v6-wall-clock-budget",
  });
  assert.ok(assessments);
  assert.ok(
    assessments.every((assessment) => assessment.timeBudgetExceeded === true),
  );
  assert.ok(
    assessments.every(
      (assessment) => assessment.uncertainAtBudgetLimit === true,
    ),
  );
  assert.ok(assessments.every((assessment) => assessment.trials < 7200));
});
