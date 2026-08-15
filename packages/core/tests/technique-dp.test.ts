import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTokenPressure,
  chooseSafestTechnique,
  contextualSongValues,
  techniqueSpendMetrics,
  type Balance,
  type SongTarget,
  type TokenPressure,
} from "../src/live-model.ts";
import { SONGS } from "../src/domain/song-data.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { rankObservedTechniques } from "../src/solver/technique-dp.ts";
import { FIXTURE_MESSAGE, fr } from "./helpers/messages.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = ({
  id,
  practiceBonus,
  liveBonusType,
  liveBonusValue,
  cost,
}: {
  id: string;
  practiceBonus: string;
  liveBonusType: "friendship" | "speciality" | "event";
  liveBonusValue: number;
  cost: Partial<Balance>;
}): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  practiceBonus,
  ...contextualSongValues({
    practiceBonus,
    liveBonusType,
    liveBonusValue,
    declaredPriority: "normal",
  }),
});

test("le chemin observé réutilise le surplus réel au lieu du coût brut", () => {
  const tokens = balance({
    dance: 242,
    passion: 64,
    vocal: 78,
    visual: 65,
    mental: 98,
  });
  const songs = [
    song({
      id: "sp2",
      practiceBonus: "Skill Pt training +2",
      liveBonusType: "speciality",
      liveBonusValue: 5,
      cost: { passion: 21, visual: 21 },
    }),
    song({
      id: "friendship-dvm",
      practiceBonus: "Skill Pts +22",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { dance: 14, visual: 16, mental: 14 },
    }),
    song({
      id: "friendship-vm",
      practiceBonus: "Power +22",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { vocal: 32, mental: 12 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(tokens, songs, "speed-wit");
  const candidates = [
    { id: "visual", cost: balance({ visual: 16 }) },
    { id: "mental", cost: balance({ mental: 15 }) },
    { id: "dance", cost: balance({ dance: 16 }) },
  ].map((candidate) => ({
    ...candidate,
    reachProbability: 0.96,
    goalProbability: 0.92,
    payload: candidate.id,
  }));

  const ranked = rankObservedTechniques({
    candidates,
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "dance");
  assert.deepEqual(
    ranked.map((candidate) => candidate.id),
    ["dance", "mental", "visual"],
  );

  const simulatedChoice = chooseSafestTechnique(
    "classic",
    tokens,
    candidates.map((candidate) => candidate.cost),
    false,
    "priority-song",
    songs,
    songs,
    "speed-wit",
    plan,
    "standard",
  );
  assert.deepEqual(simulatedChoice, balance({ dance: 16 }));
});

test("la couverture réelle reste prioritaire sur le surplus", () => {
  const tokens = balance({ dance: 242, mental: 98 });
  const target = song({
    id: "expensive-target",
    practiceBonus: "Skill Pt training +2",
    liveBonusType: "speciality",
    liveBonusValue: 5,
    cost: { dance: 230 },
  });
  const songs = [target];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const tokenPressure: TokenPressure[] = [
    {
      key: "dance",
      shadowValue: 0,
      reserveTarget: 0,
      margin: 242,
      demandCount: 0,
      priorityDemandCount: 0,
      reserveReason: FIXTURE_MESSAGE,
      level: "free",
    },
    {
      key: "mental",
      shadowValue: 1,
      reserveTarget: 98,
      margin: 0,
      demandCount: 1,
      priorityDemandCount: 1,
      reserveReason: FIXTURE_MESSAGE,
      level: "tight",
    },
  ];
  const candidates = [
    {
      id: "dance",
      cost: balance({ dance: 16 }),
      reachProbability: 0.96,
      goalProbability: 0.92,
      payload: "dance",
    },
    {
      id: "mental",
      cost: balance({ mental: 15 }),
      reachProbability: 0.96,
      goalProbability: 0.92,
      payload: "mental",
    },
  ];

  const ranked = rankObservedTechniques({
    candidates,
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "mental");
});

test("les cas croisés 42/42 et 50/50 passent par le classement utilisateur", () => {
  const songs = [
    song({
      id: "friendship-a",
      practiceBonus: "Speed +26",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 42, visual: 26 },
    }),
    song({
      id: "friendship-b",
      practiceBonus: "Guts +26",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const mono = balance({ dance: 16 });
  const duo = balance({ dance: 8, visual: 8 });
  const rankAt = (tokens: Balance) =>
    rankObservedTechniques({
      candidates: [
        {
          id: "mono",
          cost: mono,
          reachProbability: 0.96,
          goalProbability: 0.92,
          payload: "mono",
        },
        {
          id: "duo",
          cost: duo,
          reachProbability: 0.96,
          goalProbability: 0.92,
          payload: "duo",
        },
      ],
      tokens,
      songs,
      plan,
      riskProfile: "standard",
      tokenPressure: calculateTokenPressure(tokens, songs, "speed-wit"),
    })[0]?.id;

  // P1a protège désormais la somme des deux F+10 tant qu'elles restent
  // simultanément dans la frontière. À 42/42 comme à 50/50, les deux options
  // franchissent déjà la réserve sommée 68/68 ; le départage économique reste
  // alors stable au lieu d'optimiser la couverture d'un seul substitut.
  assert.equal(rankAt(balance({ dance: 42, visual: 42 })), "mono");
  assert.equal(rankAt(balance({ dance: 50, visual: 50 })), "mono");
});

test("le profil de génération influence le départage réel", () => {
  const tokens = balance({
    dance: 123,
    passion: 132,
    vocal: 94,
    visual: 185,
    mental: 65,
  });
  const roles = contextualSongValues({
    practiceBonus: "Speed +26",
    liveBonusType: "friendship",
    liveBonusValue: 10,
    declaredPriority: "normal",
  });
  const songs: SongTarget[] = [
    balance({ vocal: 37, mental: 30 }),
    balance({ dance: 21, vocal: 12 }),
    balance({ passion: 30 }),
    balance({ dance: 29, vocal: 38 }),
  ].map((cost, index) => ({
    id: `profile-${index}`,
    name: `profile-${index}`,
    cost,
    ...roles,
  }));
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const candidates = (["dance", "passion", "vocal"] as const).map((key) => ({
    id: key,
    cost: balance({ [key]: 16 }),
    reachProbability: 0.96,
    goalProbability: 0.92,
    payload: key,
  }));
  const topFor = (profile: "speed-wit" | "power-present") =>
    rankObservedTechniques({
      candidates,
      tokens,
      songs,
      plan,
      riskProfile: "standard",
      tokenPressure: calculateTokenPressure(tokens, songs, profile),
    })[0]?.id;

  assert.equal(topFor("speed-wit"), "dance");
  assert.equal(topFor("power-present"), "passion");
});

test("les songs de la prochaine section alimentent aussi les réserves simulées", () => {
  const tokens = balance({
    dance: 100,
    passion: 100,
    vocal: 100,
    visual: 100,
    mental: 100,
  });
  const roles = contextualSongValues({
    practiceBonus: "Speed +26",
    liveBonusType: "friendship",
    liveBonusValue: 10,
    declaredPriority: "normal",
  });
  const currentSongs: SongTarget[] = [
    {
      id: "current",
      name: "current",
      cost: balance({ passion: 10 }),
      ...roles,
    },
  ];
  const futureSong: SongTarget = {
    id: "future-mental",
    name: "future-mental",
    cost: balance({ mental: 90 }),
    ...roles,
  };
  const offers = [balance({ dance: 16 }), balance({ mental: 15 })];
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: [...currentSongs, futureSong],
  });

  assert.deepEqual(
    chooseSafestTechnique(
      "classic",
      tokens,
      offers,
      false,
      "priority-song",
      currentSongs,
      currentSongs,
      "speed-wit",
      plan,
      "standard",
    ),
    balance({ mental: 15 }),
  );
  assert.deepEqual(
    chooseSafestTechnique(
      "classic",
      tokens,
      offers,
      false,
      "priority-song",
      currentSongs,
      [...currentSongs, futureSong],
      "speed-wit",
      plan,
      "standard",
    ),
    balance({ dance: 16 }),
  );
});

test("un bloqueur déterministe passe après un choix sûr malgré de meilleures probabilités", () => {
  const tokens = balance({ dance: 80, vocal: 40 });
  const target = song({
    id: "sp3-target",
    practiceBonus: "Skill Pt training +3",
    liveBonusType: "speciality",
    liveBonusValue: 5,
    cost: { vocal: 32 },
  });
  const songs = [target];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(tokens, songs, "speed-wit");

  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "vocal-blocking",
        cost: balance({ vocal: 16 }),
        reachProbability: 0.99,
        goalProbability: 0.99,
        payload: null,
      },
      {
        id: "dance-safe",
        cost: balance({ dance: 16 }),
        reachProbability: 0.82,
        goalProbability: 0.78,
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.deepEqual(
    ranked.map((candidate) => candidate.id),
    ["dance-safe", "vocal-blocking"],
  );
});

test("à mêmes couleurs consommées, la technique strictement moins chère domine", () => {
  const tokens = balance({ dance: 120, visual: 120 });
  const songs = [
    song({
      id: "filler",
      practiceBonus: "Speed training +2",
      liveBonusType: "speciality",
      liveBonusValue: 5,
      cost: { passion: 21 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(tokens, songs, "speed-wit");

  const rankedMono = rankObservedTechniques({
    candidates: [
      {
        id: "dance-30",
        cost: balance({ dance: 30 }),
        // Deliberately better noisy rollout: exact cost dominance must still win.
        reachProbability: 0.99,
        goalProbability: 0.99,
        terminalDecisionVector: [1, 1, 2, 2],
        payload: null,
      },
      {
        id: "dance-24",
        cost: balance({ dance: 24 }),
        reachProbability: 0.93,
        goalProbability: 0.93,
        terminalDecisionVector: [1, 1, 1, 1],
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });
  assert.equal(rankedMono[0]?.id, "dance-24");

  const rankedDuo = rankObservedTechniques({
    candidates: [
      {
        id: "duo-expensive",
        cost: balance({ dance: 14, visual: 10 }),
        reachProbability: 0.99,
        goalProbability: 0.99,
        payload: null,
      },
      {
        id: "duo-cheap",
        cost: balance({ dance: 12, visual: 10 }),
        reachProbability: 0.92,
        goalProbability: 0.92,
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });
  assert.equal(rankedDuo[0]?.id, "duo-cheap");
});

test("replay C4 : une réserve déterministe bat quelques points de Monte-Carlo", () => {
  const tokens = balance({
    dance: 74,
    passion: 41,
    vocal: 41,
    visual: 50,
    mental: 112,
  });
  const songs = [
    song({
      id: "present-march",
      practiceBonus: "Power training +2",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { vocal: 22, mental: 22 },
    }),
    song({
      id: "daisuki",
      practiceBonus: "Speed training +2",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
    song({
      id: "fanfare",
      practiceBonus: "Guts training +2",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 42, visual: 26 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(tokens, songs, "speed-wit");

  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "visual-25",
        cost: balance({ visual: 25 }),
        reachProbability: 1,
        goalProbability: 0.9821428571,
        terminalDecisionVector: [
          1, 1, 2, 1, 0.7433, 11.8167, 1, 1.79, -25, 99.16,
        ],
        payload: null,
      },
      {
        id: "vocal-25",
        cost: balance({ vocal: 25 }),
        reachProbability: 1,
        goalProbability: 0.9285714286,
        terminalDecisionVector: [
          1, 1, 2, 1, 0.9433, 12.9667, 1, 1.7267, -25, 103.61,
        ],
        payload: null,
      },
      {
        id: "passion12-vocal12",
        cost: balance({ passion: 12, vocal: 12 }),
        reachProbability: 1,
        goalProbability: 1,
        terminalDecisionVector: [
          1, 1, 2, 1, 0.91, 12.5833, 1, 1.6867, -24, 111.26,
        ],
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "passion12-vocal12");
});

test("des micro-écarts 99/100 % ne justifient plus un gros surcoût", () => {
  const tokens = balance({
    dance: 115,
    passion: 59,
    vocal: 84,
    visual: 93,
    mental: 80,
  });
  const songs = [
    song({
      id: "future-f10",
      practiceBonus: "Speed training +2",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
    song({
      id: "future-f5",
      practiceBonus: "Power training +2",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { passion: 32, vocal: 12 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(tokens, songs, "speed-wit");

  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "passion-16",
        cost: balance({ passion: 16 }),
        reachProbability: 1,
        goalProbability: 0.5,
        terminalDecisionVector: [
          1, 1, 2, 2, 0.99, 21.7167, 1, 2.95, -31.82, 117.5,
        ],
        payload: null,
      },
      {
        id: "dance-25",
        cost: balance({ dance: 25 }),
        reachProbability: 1,
        goalProbability: 0.5,
        terminalDecisionVector: [
          1, 1, 2, 2, 0.9967, 21.4833, 1, 2.94, -40.81, 115.84,
        ],
        payload: null,
      },
      {
        id: "vocal-30",
        cost: balance({ vocal: 30 }),
        reachProbability: 1,
        goalProbability: 0.5,
        terminalDecisionVector: [1, 1, 2, 2, 1, 21.5, 1, 2.91, -45.81, 108.01],
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.notEqual(ranked[0]?.id, "vocal-30");
  assert.equal(ranked[0]?.id, "passion-16");
});

test("replay seq143 : la frontière F+10 évite le faux plancher Vocal et préserve Visual", () => {
  const tokens = balance({
    dance: 165,
    passion: 136,
    vocal: 26,
    visual: 112,
    mental: 84,
  });
  const songs = [
    song({
      id: "fanfare",
      practiceBonus: "Guts +26",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
    song({
      id: "present-march",
      practiceBonus: "Power +22",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { vocal: 22, mental: 22 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
  );
  assert.equal(
    tokenPressure.find((item) => item.key === "vocal")?.reserveTarget,
    0,
  );
  assert.equal(
    tokenPressure.find((item) => item.key === "visual")?.reserveTarget,
    42,
  );

  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "vocal-24",
        cost: balance({ vocal: 24 }),
        reachProbability: 0.9765625,
        goalProbability: 0.9765625,
        terminalDecisionVector: [
          1, 2, 1, 1, 0.8967, 8.9667, 0.98, 1.85, -67.95, 136.09,
        ],
        payload: null,
      },
      {
        id: "visual-30",
        cost: balance({ visual: 30 }),
        reachProbability: 1,
        goalProbability: 1,
        terminalDecisionVector: [
          1, 2, 1, 1, 0.7967, 11.7, 1, 2.32, -75.56, 135.66,
        ],
        payload: null,
      },
      {
        id: "dance12-vocal12",
        cost: balance({ dance: 12, vocal: 12 }),
        reachProbability: 0.9951171875,
        goalProbability: 0.9951171875,
        terminalDecisionVector: [
          1, 2, 1, 1, 0.87, 12.6667, 0.9967, 2.5633, -69.24, 114.53,
        ],
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "dance12-vocal12");
  assert.equal(ranked[0]?.rankReason, "terminal-structural-band");
});

test("contre-régression seq122 : 15 Visual peut rester meilleur que 24 ailleurs si la F+10 reste largement protégée", () => {
  const tokens = balance({
    dance: 177,
    passion: 185,
    vocal: 64,
    visual: 127,
    mental: 140,
  });
  const songs = [
    song({
      id: "fanfare",
      practiceBonus: "Guts +26",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
    song({
      id: "present-march",
      practiceBonus: "Power +22",
      liveBonusType: "friendship",
      liveBonusValue: 5,
      cost: { vocal: 22, mental: 22 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
  );

  const commonTerminal = [1, 2, 1, 1, 0.84, 12, 1, 2, -60, 140] as const;
  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "vocal-24",
        cost: balance({ vocal: 24 }),
        reachProbability: 1,
        goalProbability: 1,
        terminalDecisionVector: commonTerminal,
        payload: null,
      },
      {
        id: "visual-15",
        cost: balance({ visual: 15 }),
        reachProbability: 1,
        goalProbability: 1,
        terminalDecisionVector: commonTerminal,
        payload: null,
      },
      {
        id: "dance-24",
        cost: balance({ dance: 24 }),
        reachProbability: 1,
        goalProbability: 1,
        terminalDecisionVector: commonTerminal,
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "visual-15");
  assert.ok(
    ["weighted-demand-cost", "total-cost"].includes(
      ranked[0]?.rankReason ?? "",
    ),
  );
});

test("P1 v0.24 replay fbde s154 : Fanfare infaisable cède l'ancre à Harusora", () => {
  const tokens = balance({
    dance: 187,
    passion: 43,
    vocal: 32,
    visual: 44,
    mental: 34,
  });
  const fanfare = song({
    id: "fanfare",
    practiceBonus: "Guts +26",
    liveBonusType: "friendship",
    liveBonusValue: 10,
    cost: { dance: 26, visual: 42 },
  });
  const harusora = song({
    id: "harusora",
    practiceBonus: "Speed training +1",
    liveBonusType: "friendship",
    liveBonusValue: 5,
    cost: { dance: 12, visual: 32 },
  });
  const sekai = song({
    id: "sekai",
    practiceBonus: "Power training +1",
    liveBonusType: "friendship",
    liveBonusValue: 5,
    cost: { passion: 32, vocal: 12 },
  });
  const songs = [fanfare, harusora, sekai];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const offers = [
    balance({ visual: 24 }),
    balance({ visual: 25 }),
    balance({ dance: 14, visual: 10 }),
  ];
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
    {
      period: "senior",
      concertIndex: 3,
      nextSongCycle: 4,
      techniquesToNextSong: 1,
      currentTechniqueOffers: offers,
      reserveSongIds: songs.map((target) => target.id),
    },
  );
  assert.equal(
    tokenPressure.find((item) => item.key === "visual")?.reserveTarget,
    32,
  );
  assert.match(
    fr(tokenPressure.find((item) => item.key === "visual")?.reserveReason),
    /Fanfare.*infaisable|infaisable.*Fanfare/i,
  );

  const commonTerminal = [1, 2, 1, 1, 0.8, 10, 1, 2, -60, 120] as const;
  const ranked = rankObservedTechniques({
    candidates: offers.map((cost, index) => ({
      id: `option-${index + 1}`,
      cost,
      reachProbability: 0.98,
      goalProbability: 0.98,
      terminalDecisionVector: commonTerminal,
      payload: null,
    })),
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "option-3");
  const safe = techniqueSpendMetrics(offers[2], tokens, tokenPressure);
  const broken = techniqueSpendMetrics(offers[0], tokens, tokenPressure);
  assert.equal(safe.reserveBreachCount, 0);
  assert.ok(broken.reserveBreachCount > 0);
});

test("PR-4 : le ranking terminal ne réapplique pas le cliff Standard 92 %", () => {
  const tokens = balance({
    dance: 120,
    passion: 120,
    vocal: 120,
    visual: 120,
    mental: 120,
  });
  const songs = [
    song({
      id: "terminal-f10",
      practiceBonus: "Speed training +2",
      liveBonusType: "friendship",
      liveBonusValue: 10,
      cost: { dance: 26, visual: 42 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
  );

  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "valuable-below-92",
        cost: balance({ dance: 20 }),
        reachProbability: 0.9,
        goalProbability: 0.9,
        // Terminal policy says PUSH: above catastrophe floor and net-positive.
        terminalDecisionVector: [1, 1, 1, 1, 0.8, 120, 0, 0, -20, 100],
        payload: null,
      },
      {
        id: "safe-but-stop",
        cost: balance({ vocal: 20 }),
        reachProbability: 0.94,
        goalProbability: 0.94,
        terminalDecisionVector: [0, 2, 0, 1, 0, 0, 0, 0, -20, 100],
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });

  assert.equal(ranked[0]?.id, "valuable-below-92");
  assert.equal(ranked[0]?.rankReason, "terminal-hard-state");
});

test("PR-7 : le triplet historique de dominance est invariant aux permutations", () => {
  const tokens = balance({ dance: 100, passion: 100 });
  const songs: SongTarget[] = [];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const candidates = [
    {
      id: "a-dance20-low-risk",
      cost: balance({ dance: 20 }),
      reachProbability: 0.9,
      goalProbability: 0.9,
      payload: null,
    },
    {
      id: "b-dance30-admissible",
      cost: balance({ dance: 30 }),
      reachProbability: 0.95,
      goalProbability: 0.95,
      payload: null,
    },
    {
      id: "c-passion10-low-risk",
      cost: balance({ passion: 10 }),
      reachProbability: 0.9,
      goalProbability: 0.9,
      payload: null,
    },
  ];
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const outputs = permutations.map((order) =>
    rankObservedTechniques({
      candidates: order.map((index) => candidates[index]!),
      tokens,
      songs,
      plan,
      riskProfile: "standard",
      tokenPressure: [],
    }).map((candidate) => candidate.id),
  );

  for (const output of outputs) assert.deepEqual(output, outputs[0]);
  assert.deepEqual(outputs[0], [
    "c-passion10-low-risk",
    "a-dance20-low-risk",
    "b-dance30-admissible",
  ]);
});

test("PR-7 property : le ranking de triplets aléatoires est invariant aux six permutations", () => {
  const tokens = balance({
    dance: 160,
    passion: 160,
    vocal: 160,
    visual: 160,
    mental: 160,
  });
  const songs = [
    song({
      id: "property-target",
      practiceBonus: "Skill Pt training +2",
      liveBonusType: "speciality",
      liveBonusValue: 5,
      cost: { dance: 42, visual: 26 },
    }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
  );
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let state = 0x51f15e;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const keys = ["dance", "passion", "vocal", "visual", "mental"] as const;

  for (let sample = 0; sample < 64; sample += 1) {
    const candidates = Array.from({ length: 3 }, (_, index) => {
      const first = keys[Math.floor(random() * keys.length)]!;
      const useSecond = random() > 0.65;
      let second = keys[Math.floor(random() * keys.length)]!;
      if (second === first)
        second = keys[(keys.indexOf(first) + 1) % keys.length]!;
      const partial: Partial<Balance> = {
        [first]: 8 + Math.floor(random() * 25),
      };
      if (useSecond) partial[second] = 8 + Math.floor(random() * 17);
      return {
        id: `sample-${sample}-${index}`,
        cost: balance(partial),
        reachProbability: 0.72 + random() * 0.28,
        goalProbability: 0.65 + random() * 0.35,
        terminalDecisionVector:
          random() > 0.5
            ? [
                1,
                1,
                Math.floor(random() * 3),
                1,
                random(),
                random() * 30,
                random(),
                random() * 4,
                -random() * 80,
                random() * 200,
              ]
            : undefined,
        payload: null,
      };
    });
    const expected = rankObservedTechniques({
      candidates,
      tokens,
      songs,
      plan,
      riskProfile: "standard",
      tokenPressure,
    }).map((candidate) => candidate.id);

    for (const order of permutations) {
      const actual = rankObservedTechniques({
        candidates: order.map((index) => candidates[index]!),
        tokens,
        songs,
        plan,
        riskProfile: "standard",
        tokenPressure,
      }).map((candidate) => candidate.id);
      assert.deepEqual(
        actual,
        expected,
        `sample ${sample} / ${order.join("")}`,
      );
    }
  }
});

test("hotfix v6 replay C4 : la pile Dance à 288 est consommée avant Passion à 104", () => {
  const ids = [
    "nigekiri",
    "go-this-way",
    "bluebird",
    "grow-up-shine",
    "komorebi",
    "pyoitto",
    "yumezora",
    "present-march",
    "daisuki",
    "sekai",
    "harusora",
    "fanfare",
  ];
  const songs = ids.map((id) => {
    const source = SONGS.find((candidate) => candidate.id === id);
    assert.ok(source);
    return {
      id: source.id,
      name: source.name,
      cost: source.cost,
      practiceBonus: source.practiceBonus,
      ...contextualSongValues({
        practiceBonus: source.practiceBonus,
        liveBonusType: source.liveBonusType,
        liveBonusValue: source.liveBonusValue,
        declaredPriority: source.priority,
      }),
    };
  });
  const tokens = balance({
    dance: 288,
    passion: 104,
    vocal: 107,
    visual: 137,
    mental: 142,
  });
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
    songsThisSection: 0,
  });
  const tokenPressure = calculateTokenPressure(
    tokens,
    songs,
    "speed-wit",
    plan,
  );
  const ranked = rankObservedTechniques({
    candidates: [
      {
        id: "passion-24",
        cost: balance({ passion: 24 }),
        reachProbability: 1,
        goalProbability: 1,
        payload: null,
      },
      {
        id: "visual-25",
        cost: balance({ visual: 25 }),
        reachProbability: 1,
        goalProbability: 1,
        payload: null,
      },
      {
        id: "dance-25",
        cost: balance({ dance: 25 }),
        reachProbability: 1,
        goalProbability: 1,
        payload: null,
      },
    ],
    tokens,
    songs,
    plan,
    riskProfile: "standard",
    tokenPressure,
  });
  assert.equal(ranked[0]?.id, "dance-25");
  assert.equal(ranked[0]?.rankReason, "reserve-drain");
});
