import assert from "node:assert/strict";
import test from "node:test";
import {
  atLeastOneDrawProbability,
  buildQuickTechniqueCost,
  calculateTokenPressure,
  calculateTokenReservePlan,
  compareTechniqueSpending,
  FACILITY_STAT_WEIGHT,
  estimateRemainingTrainingsByFacility,
  contextualSongValues,
  evaluateTechniqueStrategy,
  exactBlockProbability,
  getTechniqueLevelOptions,
  resolveExpressObjective,
  resolveStrategicObjective,
  resolveEffectiveTechniqueObjective,
  runAnalysis,
  structuralTrainingValue,
  withStructuralTrainingValue,
  subtractCost,
} from "../src/live-model.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import type { Balance, SongTarget } from "../src/live-model.ts";
import type { SongRole } from "../src/domain/song-catalog.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { FIXTURE_MESSAGE, fr, hasCode } from "./helpers/messages.ts";

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
  priority = false,
  policyValue = 20,
  roles?: SongRole[],
): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  priority,
  utility: priority ? 5 : 2,
  policyValue,
  roles,
});

test("formule badge — Speed, transition avant/après", () => {
  const cardMultiplier = 1.799 * 1.26 * 1.2 * 1.15 * 1.15;
  const mainFloat = (12 + 1) * cardMultiplier;
  const mainDisplayed = Math.floor(mainFloat);
  const before = Math.floor((mainFloat + 0) * 1.1) - mainDisplayed;
  const after = Math.floor((mainFloat + 1) * 1.1) - mainDisplayed;

  assert.equal(mainDisplayed, 46);
  assert.equal(before, 5);
  assert.equal(after, 6);
});

test("formule badge — Wit, transition avant/après", () => {
  const cardMultiplier = 1.375 * 1.26 * 1.25 * 1.15;
  const mainFloat = (10 + 1) * cardMultiplier;
  const mainDisplayed = Math.floor(mainFloat);
  const before = Math.floor((mainFloat + 1) * 1.1) - mainDisplayed;
  const after = Math.floor((mainFloat + 3) * 1.1) - mainDisplayed;

  assert.equal(mainDisplayed, 27);
  assert.equal(before, 4);
  assert.equal(after, 6);
});

test("un bonus training de song ne modifie jamais main, seulement le badge", () => {
  const mainFloat = (12 + 1) * (1.799 * 1.26 * 1.2 * 1.15 * 1.15);
  const mainBefore = Math.floor(mainFloat);
  const mainAfter = Math.floor(mainFloat);
  const badgeBefore = Math.floor((mainFloat + 0) * 1.1) - mainBefore;
  const badgeAfter = Math.floor((mainFloat + 1) * 1.1) - mainAfter;

  assert.equal(mainBefore, mainAfter);
  assert.equal(badgeBefore, 5);
  assert.equal(badgeAfter, 6);
});

test("le tirage de trois songs suit l'hypergéométrique sans remise", () => {
  assert.ok(
    Math.abs(atLeastOneDrawProbability(10, 2) - 64 / 120) < Number.EPSILON,
  );
  assert.equal(atLeastOneDrawProbability(2, 1), 1);
  assert.equal(atLeastOneDrawProbability(0, 0), 0);
});

test("le blocage immédiat reste une probabilité bornée", () => {
  const emptyRisk = exactBlockProbability("classic", balance());
  const richRisk = exactBlockProbability(
    "classic",
    balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
  );
  assert.ok(emptyRisk >= 0 && emptyRisk <= 1);
  assert.ok(richRisk >= 0 && richRisk <= 1);
  assert.ok(emptyRisk > richRisk);
});

test("l'objectif Express ne transforme que la jauge finale en contrainte", () => {
  assert.equal(resolveExpressObjective(1, [], 0), "carryover");
  assert.equal(resolveExpressObjective(1, [], 1), "carryover");
  assert.equal(resolveExpressObjective(1, [], 3), "carryover");
  assert.equal(resolveExpressObjective(1, [], 4), "any-song");
  assert.equal(resolveExpressObjective(2, [], 4), "carryover");
});

test("l'objectif simple est identique avant projection et après achat", () => {
  const songs = [song("filler", { dance: 21 })];
  const closeC1 = deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  assert.equal(
    resolveStrategicObjective({
      plan: closeC1,
      songsThisSection: 1,
      totalSongs: 2,
      songs,
    }),
    "carryover",
  );
  assert.equal(
    resolveStrategicObjective({
      plan: closeC1,
      songsThisSection: 2,
      totalSongs: 3,
      songs,
    }),
    "carryover",
  );

  const hold = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  assert.equal(
    resolveStrategicObjective({
      plan: hold,
      songsThisSection: 1,
      totalSongs: 8,
      songs,
    }),
    "carryover",
  );
});

test("la troisième song sécurise Great Success", () => {
  const visible = song("song-moyenne", { passion: 21, visual: 21 });
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 4,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 2,
    trials: 800,
  });
  const buyStop = result.policies.find(
    (policy) => policy.action === "buy-stop",
  );
  assert.equal(buyStop?.greatSuccessProbability, 1);
  assert.ok(hasCode(buyStop?.reasons ?? [], "reason.securesGreatSuccess"));
});

test("appel isolé sans contexte : la frontière statique conserve les deux vecteurs Friendship +10", () => {
  const priorities = [
    song("Precious Treasure Box", { dance: 42, visual: 26 }, true, 80),
    song("Fanfare for the Future!", { dance: 26, visual: 42 }, true, 80),
  ];
  const plan = calculateTokenReservePlan(priorities);
  const pressure = calculateTokenPressure(
    balance({
      dance: 50,
      passion: 50,
      vocal: 50,
      visual: 50,
      mental: 50,
    }),
    priorities,
    "speed-wit",
  );
  const dance = pressure.find((item) => item.key === "dance");
  const visual = pressure.find((item) => item.key === "visual");
  assert.equal(plan.mode, "frontier");
  assert.deepEqual(
    plan.targets.map((target) => target.cost),
    [balance({ dance: 26, visual: 42 }), balance({ dance: 42, visual: 26 })],
  );
  assert.equal(dance?.level, "critical");
  assert.equal(visual?.level, "critical");
  assert.equal(dance?.reserveTarget, 68);
  assert.equal(visual?.reserveTarget, 68);
  assert.equal(dance?.margin, -18);
  assert.equal(visual?.margin, -18);
  assert.equal(dance?.reserveReason.code, "reserve.feasibleScale");
});

test("une réserve insuffisante affiche un manque chiffré et sa cible", () => {
  const priority = song(
    "Grow Up and Shine!",
    { dance: 21, vocal: 21, mental: 21 },
    true,
    90,
  );
  const pressure = calculateTokenPressure(
    balance({ dance: 14, vocal: 8, mental: 30 }),
    [priority],
  );
  const dance = pressure.find((item) => item.key === "dance");
  const mental = pressure.find((item) => item.key === "mental");
  const passion = pressure.find((item) => item.key === "passion");

  assert.equal(dance?.level, "critical");
  assert.equal(dance?.reserveTarget, 21);
  assert.equal(dance?.margin, -7);
  assert.match(fr(dance?.reserveReason), /Grow Up and Shine/);
  assert.equal(mental?.level, "tight");
  assert.equal(mental?.margin, 9);
  assert.equal(passion?.level, "free");
  assert.equal(passion?.reserveTarget, 0);
});

test("un choix équivalent dépense le token au plus gros surplus réel", () => {
  const tokens = balance({
    dance: 203,
    passion: 18,
    vocal: 27,
    visual: 97,
    mental: 19,
  });
  const pressure = [
    {
      key: "dance",
      shadowValue: 0.25,
      reserveTarget: 42,
      margin: 161,
      demandCount: 4,
      priorityDemandCount: 2,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
    {
      key: "passion",
      shadowValue: 0.2,
      reserveTarget: 12,
      margin: 6,
      demandCount: 2,
      priorityDemandCount: 1,
      reserveReason: FIXTURE_MESSAGE,
      level: "tight",
    },
    {
      key: "vocal",
      shadowValue: 0.12,
      reserveTarget: 21,
      margin: 6,
      demandCount: 2,
      priorityDemandCount: 1,
      reserveReason: FIXTURE_MESSAGE,
      level: "tight",
    },
    {
      key: "visual",
      shadowValue: 0.32,
      reserveTarget: 21,
      margin: 76,
      demandCount: 5,
      priorityDemandCount: 2,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
    {
      key: "mental",
      shadowValue: 0.1,
      reserveTarget: 12,
      margin: 7,
      demandCount: 2,
      priorityDemandCount: 1,
      reserveReason: FIXTURE_MESSAGE,
      level: "tight",
    },
  ] satisfies ReturnType<typeof calculateTokenPressure>;
  const offers = [
    balance({ vocal: 24 }),
    balance({ visual: 30 }),
    balance({ dance: 25 }),
  ].sort((left, right) =>
    compareTechniqueSpending(left, right, tokens, pressure),
  );

  assert.deepEqual(offers, [
    balance({ dance: 25 }),
    balance({ visual: 30 }),
    balance({ vocal: 24 }),
  ]);
});

test("Skill Pt training +2 vaut davantage qu'une stat training +2", () => {
  const common = {
    liveBonusType: "speciality" as const,
    liveBonusValue: 5,
    declaredPriority: "normal" as const,
  };
  const skillPoints = contextualSongValues({
    ...common,
    practiceBonus: "Skill Pt training +2",
  });
  const guts = contextualSongValues({
    ...common,
    practiceBonus: "Guts training +2",
  });

  assert.ok(
    (skillPoints.immediateValue ?? 0) > (guts.immediateValue ?? 0) * 1.6,
  );
  assert.ok((skillPoints.policyValue ?? 0) > (guts.policyValue ?? 0));
});

test("Run for Our Dream passe devant Hey, Guess What sur l'offre observée", () => {
  const tokens = balance({
    dance: 110,
    passion: 36,
    vocal: 14,
    visual: 47,
    mental: 13,
  });
  const target = (
    id: string,
    name: string,
    cost: Partial<Balance>,
    practiceBonus: string,
    declaredPriority: "normal" | "high" | "top" = "normal",
  ): SongTarget => ({
    id,
    name,
    cost: balance(cost),
    ...contextualSongValues({
      practiceBonus,
      liveBonusType: "speciality",
      liveBonusValue: 5,
      declaredPriority,
    }),
  });
  const getaway = target(
    "nigekiri",
    "Getaway! Fallin' Love",
    { dance: 21, visual: 21 },
    "Guts training +1",
  );
  const hey = target(
    "a-no-ne",
    "Hey, Guess What!",
    { dance: 42, visual: 21 },
    "Guts training +2",
  );
  const runForOurDream = target(
    "yume-wo-kakeru",
    "Run for Our Dream!",
    { passion: 21, visual: 21 },
    "Skill Pt training +2",
    "high",
  );
  const visible = [getaway, hey, runForOurDream];
  const remaining = [
    ...visible,
    song("Believe in Miracles!", { passion: 21, mental: 21 }),
    song("Zero Is Where the Center Stands!", {
      dance: 21,
      visual: 21,
    }),
    song("Go This Way", { vocal: 21, mental: 21 }),
    song("Ring Ring Diary", { passion: 21, visual: 21 }),
    song("Here Comes Our Time", { vocal: 32, mental: 12 }, true, 33),
    song("Run n' Run!", { dance: 14, visual: 16, mental: 14 }, true, 34),
    song("Full Speed Ahead!", { dance: 32, visual: 12 }, true, 33),
    song("Our Blue Bird Days", { dance: 21, visual: 42 }, false, 37),
  ];
  const result = analyzeSongSelection({
    period: "classic",
    tokens,
    visibleSongs: visible,
    remainingSongs: remaining,
    techniquesToNextSong: 1,
    songsThisSection: 1,
    totalSongs: 5,
    concertIndex: 1,
    trials: 1600,
    nextSongCycle: 3,
  });

  assert.equal(result.recommended?.songId, "yume-wo-kakeru");
  assert.ok(
    hasCode(
      result.recommended?.reasons ?? [],
      "reason.structuralTargetVisible",
    ),
  );
});

test("une song inachetable ne peut pas être recommandée à l'achat", () => {
  const visible = song("trop-chere", { dance: 42, visual: 26 }, true, 80);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance(),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 4,
    songsThisSection: 1,
    totalSongs: 8,
    concertIndex: 2,
    trials: 400,
  });
  assert.equal(result.recommended?.action, "wait-reserve");
  assert.ok(
    result.policies
      .filter((policy) => policy.action.startsWith("buy-"))
      .every((policy) => !policy.valid),
  );
  assert.ok(
    result.policies
      .filter((policy) => policy.action === "carry-page")
      .every((policy) => !policy.valid),
  );
});

test("l'objectif 18 songs n'est plus survalorisé une fois sécurisé", () => {
  const visible = song("bonus-sp", { vocal: 21, mental: 21 }, true, 60);
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 18,
    concertIndex: 4,
    trials: 400,
  });
  assert.ok(
    result.policies
      .filter((policy) => policy.valid)
      .every((policy) => policy.checkpoint18Status === "secured-now"),
  );
});

test("la saisie rapide applique les coûts exacts de la période", () => {
  assert.deepEqual(
    buildQuickTechniqueCost("classic", "mono", ["passion"]),
    balance({ passion: 16 }),
  );
  assert.deepEqual(
    buildQuickTechniqueCost("classic", "duo-balanced", ["passion", "dance"]),
    balance({ passion: 8, dance: 8 }),
  );
  assert.deepEqual(
    buildQuickTechniqueCost("classic", "duo-split", ["dance", "visual"]),
    balance({ dance: 10, visual: 6 }),
  );
  assert.deepEqual(
    buildQuickTechniqueCost("senior", "duo-split", ["visual", "mental"]),
    balance(),
  );
  assert.deepEqual(
    buildQuickTechniqueCost("senior", "duo-split", ["visual", "dance"]),
    balance({ visual: 14, dance: 10 }),
  );
});

test("le troisième Hint ne partage plus son coût avec Energy +40", () => {
  // GitHub issue #1: the in-game cost is 30. The OCR classifier separates hint
  // from energy by cost when the label is unreadable, so the pair of ambiguous
  // amounts must stay exactly two: 25 and 30.
  const hint = getTechniqueLevelOptions("senior", "hint").map((l) => l.cost);
  const energy = getTechniqueLevelOptions("senior", "energy").map(
    (l) => l.cost,
  );
  assert.equal(hint.at(-1), 30);
  assert.deepEqual(
    hint.filter((cost) => energy.includes(cost)),
    [25, 30],
  );
  assert.equal(hint.includes(35), false);
});

test("Hint et Energy gardent leurs trois niveaux à toutes les périodes", () => {
  for (const period of ["junior", "classic", "senior"] as const) {
    assert.deepEqual(
      getTechniqueLevelOptions(period, "hint").map((level) => level.cost),
      [15, 25, 30],
    );
    assert.deepEqual(
      getTechniqueLevelOptions(period, "energy").map((level) => [
        level.effect,
        level.cost,
      ]),
      [
        ["Energy +20", 25],
        ["Energy +30", 30],
        ["Energy +40", 35],
      ],
    );
  }
  assert.deepEqual(
    buildQuickTechniqueCost("classic", "hint", ["vocal"], 1),
    balance({ vocal: 25 }),
  );
  assert.deepEqual(
    buildQuickTechniqueCost("senior", "energy", ["mental"], 2),
    balance({ mental: 35 }),
  );
});

test("le push conseillé est simulé après paiement de la song", () => {
  const tokens = balance({
    dance: 45,
    passion: 45,
    vocal: 45,
    visual: 45,
    mental: 45,
  });
  const nextTarget = song(
    "prochaine-priorite",
    { dance: 21, visual: 21 },
    true,
    70,
    ["sp2-target"],
  );
  const evaluate = (purchaseCost: Partial<Balance>) => {
    const visible = song("song-visible", purchaseCost, false, 20);
    const result = analyzeSongSelection({
      period: "classic",
      tokens,
      visibleSongs: [visible],
      remainingSongs: [visible, nextTarget],
      techniquesToNextSong: 4,
      songsThisSection: 1,
      totalSongs: 8,
      concertIndex: 1,
      trials: 1200,
    });
    return result.policies.find(
      (policy) => policy.id === "song-visible:buy-continue",
    );
  };

  const paid = evaluate({ dance: 42 });
  const free = evaluate({});
  assert.ok(paid && free);
  assert.ok(
    paid.nextSongProbability < free.nextSongProbability,
    "payer la song doit réduire la probabilité du push suivant",
  );
  assert.ok(hasCode(paid.reasons, "reason.reachNextPage"));
});

test("acheter puis pousser et le diagnostic post-achat sont invariants", () => {
  const tokens = balance({
    dance: 100,
    passion: 100,
    vocal: 100,
    visual: 100,
    mental: 100,
  });
  const visible = song("song-visible", { passion: 21, visual: 21 }, false, 26);
  const nextPool = [
    song("prochaine-priorite", { dance: 21, vocal: 21, mental: 21 }, true, 80, [
      "sp2-target",
    ]),
  ];
  const techniquesToNextSong = 4;
  const nextSongCycle = 4;
  const trials = 1200;
  const policy = analyzeSongSelection({
    period: "classic",
    tokens,
    visibleSongs: [visible],
    remainingSongs: [visible, ...nextPool],
    techniquesToNextSong,
    songsThisSection: 1,
    totalSongs: 8,
    concertIndex: 1,
    nextSongCycle,
    trials,
  });
  const projected = policy.policies.find(
    (item) => item.id === "song-visible:buy-continue",
  );
  const afterPurchase = subtractCost(tokens, visible.cost);
  const diagnostic = runAnalysis({
    period: "classic",
    tokens: afterPurchase,
    techniquesRemaining: techniquesToNextSong,
    songs: nextPool,
    objective: resolveExpressObjective(2, nextPool),
    strategicPlan: policy.plan,
    generationProfile: "speed-wit",
    seedKey: `technique:1:${nextSongCycle}:0`,
    trials,
  });

  assert.ok(projected);
  assert.equal(
    projected?.continuationRecommendation,
    diagnostic.recommendation,
  );
  assert.equal(
    projected?.decisionVector.riskAdmissible,
    diagnostic.reachProbability >= 0.92 ? 1 : 0,
  );
});

test("avant C4, le diagnostic sépare faisabilité et rentabilité", () => {
  const tokens = balance({
    dance: 85,
    passion: 10,
    vocal: 78,
    visual: 76,
    mental: 64,
  });
  const currentSongs = [
    song("ring-ring", { passion: 21, visual: 21 }),
    song("bluebird", { dance: 21, visual: 42 }),
    song("sunbeam", { passion: 42, mental: 21 }),
    song("seven-colors", { vocal: 21, mental: 42 }),
  ];
  const futureSongs = [
    song("friendship-10-a", { dance: 42, visual: 26 }, true, 90),
    song("friendship-10-b", { dance: 26, visual: 42 }, true, 90),
    song("friendship-5-a", { passion: 22, mental: 22 }, true, 55),
    song("friendship-5-b", { vocal: 22, mental: 22 }, true, 55),
    song("friendship-5-c", { passion: 32, vocal: 12 }, true, 55),
    song("friendship-5-d", { dance: 12, visual: 32 }, true, 55),
  ];
  const analysis = runAnalysis({
    period: "classic",
    tokens,
    candidateCost: balance({ dance: 10, visual: 6 }),
    techniquesRemaining: 4,
    songs: currentSongs,
    objective: "carryover",
    trials: 800,
  });
  const strategy = evaluateTechniqueStrategy({
    concertIndex: 2,
    songsThisSection: 3,
    tokens,
    currentSongs,
    futureSongs,
    futureTopCount: 2,
    result: analysis,
    strategicPlan: deriveStrategicPlan({
      concertIndex: 2,
      timingMode: "section-open",
      remainingSongs: currentSongs,
    }),
  });

  assert.ok(analysis.reachProbability > 0.9);
  assert.equal(strategy.applies, true);
  assert.equal(strategy.shouldSave, true);
  assert.ok(Math.abs(strategy.topVisibilityBefore - 64 / 120) < Number.EPSILON);
  assert.ok(
    Math.abs(strategy.topVisibilityAfterThinning - 49 / 84) < Number.EPSILON,
  );
  assert.ok(strategy.estimatedCommitment >= 70);
});

test("HOLD reste strict même si Great Success intermédiaire est incomplet", () => {
  const tokens = balance({
    dance: 85,
    passion: 60,
    vocal: 78,
    visual: 76,
    mental: 64,
  });
  const normal = song("moyenne", { passion: 21, visual: 21 });
  const priority = song(
    "sp-3",
    { dance: 21, vocal: 21, mental: 21 },
    true,
    80,
    ["sp3-target"],
  );
  const futureSongs = Array.from({ length: 6 }, (_, index) =>
    song(
      `future-${index}`,
      index < 2
        ? { dance: index === 0 ? 42 : 26, visual: index === 0 ? 26 : 42 }
        : { passion: 22, mental: 22 },
      true,
      index < 2 ? 90 : 55,
    ),
  );
  const analysis = runAnalysis({
    period: "classic",
    tokens,
    techniquesRemaining: 2,
    songs: [normal],
    objective: "carryover",
    trials: 300,
  });

  assert.equal(
    evaluateTechniqueStrategy({
      concertIndex: 2,
      songsThisSection: 2,
      tokens,
      currentSongs: [normal],
      futureSongs,
      futureTopCount: 2,
      result: analysis,
      strategicPlan: deriveStrategicPlan({
        concertIndex: 2,
        timingMode: "section-open",
        remainingSongs: [normal],
      }),
    }).shouldSave,
    true,
  );
  assert.equal(
    evaluateTechniqueStrategy({
      concertIndex: 2,
      songsThisSection: 3,
      tokens,
      currentSongs: [priority],
      futureSongs,
      futureTopCount: 2,
      result: analysis,
      strategicPlan: deriveStrategicPlan({
        concertIndex: 2,
        timingMode: "section-open",
        remainingSongs: [priority],
      }),
    }).shouldSave,
    false,
  );
});

test("une chaîne engagée en milieu de section ne crée aucune urgence", () => {
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: [song("filler", { dance: 21 })],
  });
  assert.equal(plan.mode, "hold");

  const analysis = runAnalysis({
    period: "classic",
    tokens: balance({
      dance: 100,
      passion: 100,
      vocal: 100,
      visual: 100,
      mental: 100,
    }),
    candidateCost: balance({ dance: 16 }),
    techniquesRemaining: 1,
    songs: [song("filler", { dance: 21 })],
    objective: "carryover",
    strategicPlan: plan,
    trials: 300,
  });

  assert.equal(analysis.reachProbability, 1);
  assert.equal(analysis.recommendation, "stop");
});

test("le dernier achat ne repasse pas à stop quand une song reste achetable", () => {
  const target = song("priority", { passion: 80 }, true, 5);
  const fallback = song("fallback", { dance: 10 }, false, 1);
  const result = runAnalysis({
    period: "classic",
    tokens: balance({ dance: 30, passion: 30 }),
    candidateCost: balance({ dance: 5 }),
    techniquesRemaining: 1,
    songs: [target, fallback],
    objective: "priority-song",
    trials: 200,
  });
  assert.equal(result.reachProbability, 1);
  assert.equal(result.reachPrioritySongAffordableProbability, 0);
  assert.equal(result.reachAnySongAffordableProbability, 1);
  assert.notEqual(result.recommendation, "stop");
});

test("à réserve sûre la technique paie la couleur à plus faible pression relative", () => {
  const tokens = balance({
    dance: 139,
    passion: 113,
    vocal: 93,
    visual: 8,
    mental: 105,
  });
  const pressure = [
    {
      key: "dance",
      shadowValue: 0.235,
      reserveTarget: 26,
      margin: 113,
      demandCount: 4,
      priorityDemandCount: 2,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
    {
      key: "passion",
      shadowValue: 0.189,
      reserveTarget: 32,
      margin: 81,
      demandCount: 3,
      priorityDemandCount: 1,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
    {
      key: "vocal",
      shadowValue: 0.107,
      reserveTarget: 22,
      margin: 71,
      demandCount: 2,
      priorityDemandCount: 0,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
    {
      key: "visual",
      shadowValue: 0.31,
      reserveTarget: 42,
      margin: -34,
      demandCount: 5,
      priorityDemandCount: 2,
      reserveReason: FIXTURE_MESSAGE,
      level: "critical",
    },
    {
      key: "mental",
      shadowValue: 0.12,
      reserveTarget: 21,
      margin: 84,
      demandCount: 2,
      priorityDemandCount: 0,
      reserveReason: FIXTURE_MESSAGE,
      level: "useful",
    },
  ] satisfies ReturnType<typeof calculateTokenPressure>;

  const offers = [
    balance({ vocal: 24 }),
    balance({ passion: 25 }),
    balance({ dance: 30 }),
  ].sort((left, right) =>
    compareTechniqueSpending(left, right, tokens, pressure),
  );

  assert.deepEqual(offers, [
    balance({ vocal: 24 }),
    balance({ passion: 25 }),
    balance({ dance: 30 }),
  ]);
});

test("P4 : au Grand Live, la conversion terminale reste indépendante de 18", () => {
  const remainingSongs = [
    song("gl-replay-a", { dance: 21 }),
    song("gl-replay-b", { passion: 21 }),
    song("gl-replay-c", { vocal: 21 }),
    song("gl-replay-d", { visual: 21 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "deadline-now",
    remainingSongs,
  });
  const objective = resolveStrategicObjective({
    plan,
    songsThisSection: 2,
    totalSongs: 13,
    songs: remainingSongs,
  });
  assert.equal(objective, "any-song");

  const result = runAnalysis({
    period: "senior",
    tokens: balance({
      dance: 115,
      passion: 102,
      vocal: 74,
      visual: 72,
      mental: 103,
    }),
    candidateCost: balance({ dance: 30 }),
    techniquesRemaining: 2,
    songs: remainingSongs,
    objective,
    strategicPlan: plan,
    trials: 160,
  });

  assert.ok(["safe", "push"].includes(result.recommendation));
});

test("Grand Live terminal : une technique abordable reste un gain immédiat même sans song", () => {
  const plan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "deadline-now",
    remainingSongs: [],
    songsThisSection: 2,
  });
  const result = runAnalysis({
    period: "senior",
    tokens: balance({ dance: 16 }),
    candidateCost: balance({ dance: 16 }),
    techniquesRemaining: 1,
    songs: [],
    objective: "any-song",
    strategicPlan: plan,
    trials: 64,
  });

  assert.equal(result.valid, true);
  assert.equal(result.goalProbability, 0);
  assert.equal(result.recommendation, "push");
});

test("le Grand Live force any-song ; C4 reste orienté qualité même en mode expert", () => {
  const songs = [
    song("filler-a", { dance: 21 }),
    song("filler-b", { passion: 21 }),
    song("filler-c", { vocal: 21 }),
  ];
  const grandLivePlan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "section-open",
    remainingSongs: songs,
  });
  assert.equal(
    resolveEffectiveTechniqueObjective({
      solverMode: "expert",
      analysisObjective: "priority-song",
      plan: grandLivePlan,
      songsThisSection: 0,
      totalSongs: 17,
      songs,
    }),
    "any-song",
  );

  const c4Plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: songs,
  });
  assert.equal(
    resolveEffectiveTechniqueObjective({
      solverMode: "expert",
      analysisObjective: "priority-song",
      plan: c4Plan,
      songsThisSection: 3,
      totalSongs: 17,
      songs,
    }),
    "priority-song",
  );
});

test("Grand Live 17/18 : le mode expert pousse encore si Great Success est incomplet", () => {
  const remainingSongs = [
    song("nigekiri", { dance: 21, visual: 21 }),
    song("a-no-ne", { dance: 42, visual: 21 }),
    song("bluebird", { dance: 21, visual: 42 }),
    song("pyoitto", { passion: 42, vocal: 21 }),
    song("nanairo", { vocal: 21, mental: 42 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "section-open",
    remainingSongs,
  });
  const objective = resolveEffectiveTechniqueObjective({
    solverMode: "expert",
    analysisObjective: "priority-song",
    plan,
    songsThisSection: 0,
    totalSongs: 17,
    songs: remainingSongs,
  });
  const result = runAnalysis({
    period: "senior",
    firstOfferPeriod: "senior",
    tokens: balance({
      dance: 93,
      passion: 130,
      vocal: 163,
      visual: 95,
      mental: 86,
    }),
    candidateCost: balance({ visual: 24 }),
    techniquesRemaining: 2,
    songs: remainingSongs,
    objective,
    strategicPlan: plan,
    trials: 240,
  });
  assert.ok(result.goalProbability > 0);
  assert.notEqual(result.recommendation, "stop");
});

test("la réserve dure suit uniquement la meilleure frontière ; les cibles secondaires restent une pression souple", () => {
  const f10 = song("Fanfare", { dance: 26, visual: 42 }, true, 360);
  f10.roles = ["friendship-10"];
  const f5 = song("Present March", { vocal: 22, mental: 22 }, true, 260);
  f5.roles = ["friendship-5"];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: [f10, f5],
  });
  const pressure = calculateTokenPressure(
    balance({ dance: 100, passion: 100, vocal: 26, visual: 100, mental: 100 }),
    [f10, f5],
    "speed-wit",
    plan,
  );
  assert.equal(
    pressure.find((item) => item.key === "visual")?.reserveTarget,
    42,
  );
  assert.equal(
    pressure.find((item) => item.key === "dance")?.reserveTarget,
    26,
  );
  assert.equal(pressure.find((item) => item.key === "vocal")?.reserveTarget, 0);
  assert.ok(
    (pressure.find((item) => item.key === "vocal")?.shadowValue ?? 0) > 0,
  );
});

test("la probabilité d'objectif jointe ne dépasse jamais la probabilité d'atteindre la page", () => {
  const target = song("joint-target", { dance: 21 }, true, 100, [
    "friendship-10",
  ]);
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: [target],
  });
  const result = runAnalysis({
    period: "senior",
    tokens: balance({
      dance: 30,
      passion: 20,
      vocal: 20,
      visual: 20,
      mental: 20,
    }),
    candidateCost: balance({ passion: 24 }),
    techniquesRemaining: 2,
    songs: [target],
    reserveSongs: [target],
    objective: "priority-song",
    strategicPlan: plan,
    trials: 160,
  });
  assert.ok(result.jointGoalProbability <= result.reachProbability + 1e-12);
  assert.equal(result.goalProbability, result.jointGoalProbability);
  if (result.reachProbability > 0) {
    assert.ok(
      Math.abs(
        result.conditionalGoalProbability -
          result.jointGoalProbability / result.reachProbability,
      ) < 1e-12,
    );
  }
});

test("P1 v0.24 s110 : l'échelle saute Fanfare impossible mais protège Daisuki", () => {
  const daisuki = song("Daisuki", { dance: 42, visual: 26 }, true, 360, [
    "friendship-10",
  ]);
  const fanfare = song("Fanfare", { dance: 26, visual: 42 }, true, 360, [
    "friendship-10",
  ]);
  const harusora = song("Harusora", { dance: 12, visual: 32 }, true, 260, [
    "friendship-5",
  ]);
  const present = song("Present March", { vocal: 22, mental: 22 }, true, 260, [
    "friendship-5",
  ]);
  const yumezora = song("Yumezora", { passion: 22, mental: 22 }, true, 260, [
    "friendship-5",
  ]);
  const sekai = song("Sekai", { passion: 32, vocal: 12 }, true, 260, [
    "friendship-5",
  ]);
  const pool = [daisuki, fanfare, harusora, present, yumezora, sekai];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: pool,
  });
  const tokens = balance({
    dance: 126,
    passion: 76,
    vocal: 59,
    visual: 54,
    mental: 50,
  });
  const bridge = song("Pyoitto", { passion: 42, vocal: 21 }, false, 0, [
    "filler",
  ]);
  const context = {
    period: "senior" as const,
    concertIndex: 3,
    nextSongCycle: 1,
    techniquesToNextSong: 0,
    visibleSongs: [bridge],
    reserveSongIds: pool.map((target) => target.id),
  };
  const pressure = calculateTokenPressure(
    tokens,
    pool,
    "speed-wit",
    plan,
    context,
  );
  const reserve = calculateTokenReservePlan(pool, plan, {
    tokens,
    feasibility: context,
    shadowByKey: Object.fromEntries(
      pressure.map((item) => [item.key, item.shadowValue]),
    ),
  });

  assert.equal(
    pressure.find((item) => item.key === "visual")?.reserveTarget,
    26,
  );
  assert.equal(
    pressure.find((item) => item.key === "dance")?.reserveTarget,
    42,
  );
  assert.ok(reserve.targets.some((target) => target.id === "Daisuki"));
  assert.ok(!reserve.targets.some((target) => target.id === "Fanfare"));
  assert.match(
    fr(pressure.find((item) => item.key === "visual")?.reserveReason),
    /Fanfare.*infaisable|infaisable.*Fanfare/i,
  );
});

test("P1 v0.24 visibilité : une Fanfare exposée redevient immédiatement protégeable", () => {
  const fanfare = song("Fanfare", { dance: 26, visual: 42 }, true, 360, [
    "friendship-10",
  ]);
  const harusora = song("Harusora", { dance: 12, visual: 32 }, true, 260, [
    "friendship-5",
  ]);
  const pool = [fanfare, harusora];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: pool,
  });
  const tokens = balance({
    dance: 173,
    visual: 46,
    passion: 43,
    vocal: 32,
    mental: 34,
  });
  const context = {
    period: "senior" as const,
    concertIndex: 3,
    nextSongCycle: 4,
    techniquesToNextSong: 0,
    visibleSongs: [fanfare, harusora],
    reserveSongIds: pool.map((target) => target.id),
  };
  const pressure = calculateTokenPressure(
    tokens,
    pool,
    "speed-wit",
    plan,
    context,
  );
  assert.equal(
    pressure.find((item) => item.key === "visual")?.reserveTarget,
    42,
  );
  assert.match(
    fr(pressure.find((item) => item.key === "visual")?.reserveReason),
    /Fanfare/,
  );
});

test("P3 : ajouter des tokens ne réduit pas la valeur structurelle protégée", () => {
  const high = song("High", { dance: 20, visual: 20 }, true, 360, [
    "friendship-10",
  ]);
  const low = song("Low", { dance: 10, visual: 20 }, true, 260, [
    "friendship-5",
  ]);
  const pool = [high, low];
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: pool,
  });
  const context = {
    period: "senior" as const,
    concertIndex: 3,
    nextSongCycle: 4,
    techniquesToNextSong: 0,
    visibleSongs: [high],
    reserveSongIds: pool.map((target) => target.id),
  };
  const value = (tokens: Balance): number =>
    calculateTokenReservePlan(pool, plan, {
      tokens,
      feasibility: context,
    }).targets.reduce((sum, target) => sum + target.policyValue, 0);
  const lower = value(balance({ dance: 40, visual: 40 }));
  const higher = value(balance({ dance: 80, visual: 80 }));
  assert.ok(higher >= lower);
});

test("P2a : les poids speed-wit sont dérivés de la topologie des facilités", () => {
  const weights = FACILITY_STAT_WEIGHT["speed-wit"];
  assert.ok(weights);
  assert.ok(Math.abs(weights.speed - 1) < 1e-12);
  assert.ok(Math.abs(weights.power - 27 / 38) < 1e-12);
  assert.ok(Math.abs(weights.wisdom - 15 / 38) < 1e-12);
  assert.ok(Math.abs(weights.stamina - 7 / 38) < 1e-12);
  assert.ok(Math.abs(weights.guts - 6 / 38) < 1e-12);
  assert.equal(FACILITY_STAT_WEIGHT["balanced"], undefined);
  assert.equal(estimateRemainingTrainingsByFacility("balanced", 2), null);
});

test("P2b : Training X Gain applique N × phi × tous les clics producteurs du stat", () => {
  const remaining = {
    speed: 20,
    stamina: 3,
    power: 4,
    guts: 3,
    wisdom: 15,
  };
  assert.equal(
    structuralTrainingValue("Speed training +2", remaining, 1.5),
    2 * 1.5 * 38,
  );
  assert.equal(
    structuralTrainingValue("Stamina training +2", remaining, 1.5),
    2 * 1.5 * 7,
  );
  assert.equal(
    structuralTrainingValue("Guts training +2", remaining, 1.5),
    2 * 1.5 * 6,
  );
  assert.equal(
    structuralTrainingValue("Skill Pt training +2", remaining, 1.5),
    2 * 1.5 * 45,
  );
  assert.equal(structuralTrainingValue("Speed +22", remaining, 1.5), 0);
});

test("P2b : la valeur dynamique reste strictement dans le tier filler", () => {
  const remaining = { speed: 20, stamina: 3, power: 4, guts: 3, wisdom: 15 };
  const structural: SongTarget = {
    id: "sp2",
    name: "SP2",
    cost: balance({ dance: 21 }),
    priority: true,
    roles: ["sp2-target"],
    utility: 5,
    policyValue: 480,
    practiceBonus: "Skill Pt training +2",
    practiceValue: 4,
  };
  const filler: SongTarget = {
    id: "speed-filler",
    name: "Speed filler",
    cost: balance({ passion: 21 }),
    priority: false,
    roles: ["specialty-priority", "negligible-training-stat"],
    utility: 1,
    policyValue: 40,
    practiceBonus: "Speed training +2",
    practiceValue: 2,
  };
  assert.equal(
    withStructuralTrainingValue(structural, remaining, 1.5).practiceValue,
    4,
  );
  assert.equal(
    withStructuralTrainingValue(filler, remaining, 1.5).practiceValue,
    2 * 1.5 * 38,
  );
});
