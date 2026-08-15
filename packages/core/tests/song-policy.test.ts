import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualSongValues,
  techniqueSpendMetrics,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import type { SongRole } from "../src/domain/song-catalog.ts";
import { SONGS } from "../src/domain/song-data.ts";
import { buildSolverStateContext } from "../src/solver/context.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import { createHuntState } from "../src/solver/hunt-state.ts";
import { compareDecisionVectors } from "../src/solver/value.ts";
import { assessSongChoices } from "../src/diagnostics/decision-safety.ts";
import { frAll, hasCode } from "./helpers/messages.ts";

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
  roles: SongRole[] = ["filler"],
): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  roles,
  priority: roles.some((role) =>
    ["sp2-target", "sp3-target", "friendship-10", "friendship-5"].includes(
      role,
    ),
  ),
  utility: roles.includes("sp2-target") || roles.includes("sp3-target") ? 5 : 1,
  policyValue:
    roles.includes("sp2-target") || roles.includes("sp3-target") ? 500 : 0,
});

const rich = balance({
  dance: 100,
  passion: 100,
  vocal: 100,
  visual: 100,
  mental: 100,
});

test("la deuxième song manuelle sécurise Great Success en C1 et au Grand Live", () => {
  for (const concertIndex of [0, 4]) {
    const visible = song(`visible-${concertIndex}`, { dance: 21 });
    const result = analyzeSongSelection({
      period: concertIndex === 0 ? "junior" : "senior",
      tokens: rich,
      visibleSongs: [visible],
      remainingSongs: [visible],
      techniquesToNextSong: 2,
      songsThisSection: 1,
      totalSongs: concertIndex === 4 ? 17 : 2,
      concertIndex,
      timingMode: "deadline-now",
      trials: 300,
    });
    const buy = result.policies.find((policy) => policy.action === "buy-stop");
    assert.equal(buy?.greatSuccessProbability, 1);
  }
});

test("C1 ne pousse pas une chaîne sans acquisition future finançable", () => {
  const visible = song("seishun", { vocal: 32, mental: 12 }, [
    "specialty-priority",
  ]);
  const next = song("next", { dance: 200, visual: 200 });
  const result = analyzeSongSelection({
    period: "junior",
    tokens: balance({
      dance: 71,
      passion: 86,
      vocal: 66,
      visual: 57,
      mental: 91,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible, next],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 1,
    concertIndex: 0,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 200,
  });

  const forcedGreatSuccess = result.policies.find(
    (policy) => policy.id === "seishun:buy-continue",
  );
  assert.equal(forcedGreatSuccess?.greatSuccessProbability, 0);
  assert.notEqual(result.recommended?.id, forcedGreatSuccess?.id);
  assert.equal(result.recommended?.action, "carry-page");
});

test("P4 : au Grand Live, Great Success puis conversion restent indépendants de 18", () => {
  const visible = song("gate", { dance: 21 });
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 12,
    concertIndex: 4,
    timingMode: "deadline-now",
    trials: 300,
  });
  assert.equal(result.recommended?.action, "buy-continue");
  assert.equal(result.recommended?.greatSuccessProbability, 1);
  assert.notEqual(result.recommended?.checkpoint18Status, "secured-now");
  assert.equal(result.recommended?.finalGateStatus, "open");
});

test("une cible à -3 tokens donne WAIT_RESERVE pendant une section ouverte", () => {
  const target = song("SP2", { passion: 21, visual: 21 }, ["sp2-target"]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({ passion: 18, visual: 21 }),
    visibleSongs: [target],
    remainingSongs: [target],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 5,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 200,
  });
  assert.equal(result.recommended?.action, "wait-reserve");
  assert.match(frAll(result.recommended?.reasons ?? []), /manque 3 passion/);
});

test("le crédit +10 vérifié peut rendre un carry faisable", () => {
  const target = song("SP2", { passion: 21, visual: 21 }, ["sp2-target"]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({ passion: 12, visual: 12 }),
    visibleSongs: [target],
    remainingSongs: [target],
    techniquesToNextSong: 2,
    songsThisSection: 3,
    totalSongs: 9,
    concertIndex: 1,
    timingMode: "deadline-now",
    trials: 200,
  });
  assert.equal(result.recommended?.action, "carry-page");
  assert.match(frAll(result.recommended?.reasons ?? []), /\+10/);
});

test("un filler exposé peut être porté quand il ne retarde aucun bonus utile", () => {
  const filler = song("filler", { dance: 21 }, ["filler"]);
  const result = analyzeSongSelection({
    period: "junior",
    tokens: balance({ dance: 21 }),
    visibleSongs: [filler],
    remainingSongs: [filler],
    techniquesToNextSong: 1,
    songsThisSection: 2,
    totalSongs: 5,
    concertIndex: 0,
    timingMode: "deadline-now",
    trials: 200,
  });
  assert.equal(result.recommended?.action, "carry-page");
  assert.ok(
    hasCode(
      result.recommended?.reasons ?? [],
      "carry.savesOneInheritedTechnique",
    ),
  );
});

test("une Friendship utile est activée avant le live plutôt que portée", () => {
  const friendship = song("friendship", { dance: 21 }, ["friendship-10"]);
  const result = analyzeSongSelection({
    period: "junior",
    tokens: rich,
    visibleSongs: [friendship],
    remainingSongs: [friendship],
    techniquesToNextSong: 1,
    songsThisSection: 2,
    totalSongs: 5,
    concertIndex: 0,
    timingMode: "deadline-now",
    trials: 200,
  });
  assert.equal(result.recommended?.action, "buy-continue");
  assert.notEqual(result.recommended?.continuationRecommendation, "stop");
});

test("aucun carry n'est valide après le Grand Live et 18 impossible reste à zéro", () => {
  const visible = song("blocked", { dance: 21 });
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance(),
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 15,
    concertIndex: 4,
    timingMode: "deadline-now",
    trials: 150,
  });
  assert.equal(result.recommended, null);
  assert.ok(
    result.policies
      .filter((policy) => policy.action === "carry-page")
      .every((policy) => !policy.valid),
  );
});

test("HUNT_SP3 préfère SP +3 à une ancienne Friendship +5 puis s'arrête", () => {
  const sp3 = song("SP3", { dance: 21 }, ["sp3-target"]);
  const friendship = song("friend", { vocal: 21 }, ["friendship-5"]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [friendship, sp3],
    remainingSongs: [friendship, sp3],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 9,
    concertIndex: 2,
    timingMode: "section-open",
    trials: 300,
  });
  assert.equal(result.plan.id, "hunt-sp3");
  assert.equal(result.recommended?.songId, "SP3");
  assert.equal(result.recommended?.action, "buy-stop");
  assert.equal(result.recommended?.postPurchasePlanId, "hold");
  assert.equal(result.recommended?.postPurchaseObjective, "carryover");
  assert.equal(result.recommended?.continuationRecommendation, "stop");
});

test("C4 ouverte achète une Friendship +10 déjà exposée", () => {
  const friendship = song("F10", { dance: 42, visual: 26 }, ["friendship-10"]);
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: [friendship],
    remainingSongs: [friendship],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 12,
    concertIndex: 3,
    timingMode: "section-open",
    trials: 250,
  });
  assert.equal(result.plan.id, "accumulate-c4");
  assert.equal(result.recommended?.songId, "F10");
  assert.ok(result.recommended?.action.startsWith("buy-"));
});

test("le même état produit exactement la même recommandation", () => {
  const target = song("SP2", { passion: 21, visual: 21 }, ["sp2-target"]);
  const input = {
    period: "classic" as const,
    tokens: balance({
      passion: 80,
      visual: 80,
      dance: 50,
      vocal: 50,
      mental: 50,
    }),
    visibleSongs: [target],
    remainingSongs: [target],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 5,
    concertIndex: 1,
    timingMode: "section-open" as const,
    trials: 300,
  };
  const first = analyzeSongSelection(input);
  const second = analyzeSongSelection(input);
  assert.deepEqual(first.recommended, second.recommended);
});

test("la probabilité de la prochaine cible utilise le solde après techniques", () => {
  const visible = song("f0", {}, ["filler"]);
  const target = song("SP2", { dance: 40, visual: 40 }, ["sp2-target"]);
  const fillers = [
    song("a", {}, ["filler"]),
    song("b", {}, ["filler"]),
    song("c", {}, ["filler"]),
  ];
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 45,
      passion: 45,
      vocal: 45,
      visual: 45,
      mental: 45,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible, target, ...fillers],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 5,
    concertIndex: 1,
    timingMode: "section-open",
    continuationObjective: "priority-song",
    nextSongCycle: 1,
    trials: 2000,
  });
  const continuation = result.policies.find(
    (policy) => policy.songId === "f0" && policy.action === "buy-continue",
  );
  assert.ok(continuation);
  // 3/4 est la simple probabilité de tirage. Le financement réel après deux
  // techniques est strictement inférieur dans cet état serré.
  assert.ok(continuation.priorityAffordableProbability < 0.75);
  assert.ok(continuation.priorityAffordableProbability > 0.5);
  assert.ok(
    continuation.conditionalPagesProbability >=
      continuation.priorityAffordableProbability,
  );
});

test("la politique song respecte une période de première offre explicitement fournie", () => {
  const visible = song("f0", {}, ["filler"]);
  const target = song("SP2", { dance: 40, visual: 40 }, ["sp2-target"]);
  const fillers = [
    song("a", {}, ["filler"]),
    song("b", {}, ["filler"]),
    song("c", {}, ["filler"]),
  ];
  const common = {
    period: "senior" as const,
    tokens: balance({
      dance: 50,
      passion: 50,
      vocal: 50,
      visual: 50,
      mental: 50,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible, target, ...fillers],
    techniquesToNextSong: 3,
    songsThisSection: 0,
    totalSongs: 5,
    concertIndex: 1,
    timingMode: "section-open" as const,
    continuationObjective: "priority-song" as const,
    nextSongCycle: 1,
    trials: 2000,
  };
  const inherited = analyzeSongSelection({
    ...common,
    firstOfferPeriod: "classic",
  }).policies.find(
    (policy) => policy.songId === "f0" && policy.action === "buy-continue",
  );
  const fullSeniorPrice = analyzeSongSelection({
    ...common,
    firstOfferPeriod: "senior",
  }).policies.find(
    (policy) => policy.songId === "f0" && policy.action === "buy-continue",
  );
  assert.ok(inherited && fullSeniorPrice);
  assert.ok(
    inherited.priorityAffordableProbability >
      fullSeniorPrice.priorityAffordableProbability,
  );
});

test("Great Success multi-pages n'est plus remplacé par la simple reach", () => {
  const visible = song("f0", {}, ["filler"]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [visible],
    remainingSongs: [visible, song("a", {}, ["filler"])],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 8,
    concertIndex: 2,
    timingMode: "section-open",
    trials: 500,
  });
  const continuation = result.policies.find(
    (policy) => policy.songId === "f0" && policy.action === "buy-continue",
  );
  assert.equal(continuation?.greatSuccessProbability, null);
});

test("CLOSE garde la Friendship visible devant un filler légèrement plus sûr", () => {
  const blue = song("blue", { dance: 21, visual: 42 }, ["specialty-priority"]);
  const precious = song("precious", { dance: 42, visual: 26 }, [
    "friendship-10",
  ]);
  const fanfare = song("fanfare", { dance: 26, visual: 42 }, ["friendship-10"]);
  const pool = [
    blue,
    precious,
    fanfare,
    song("sp2", { passion: 21, visual: 21 }, ["sp2-target"]),
    song("sp3", { dance: 21, vocal: 21, mental: 21 }, ["sp3-target"]),
    song("friend-5", { passion: 32, vocal: 12 }, ["friendship-5"]),
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 75,
      passion: 135,
      vocal: 39,
      visual: 97,
      mental: 35,
    }),
    visibleSongs: [blue, precious, fanfare],
    remainingSongs: pool,
    techniquesToNextSong: 2,
    songsThisSection: 3,
    totalSongs: 14,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 4,
    trials: 2500,
  });

  assert.equal(result.plan.id, "close-c4");
  assert.ok(
    result.recommended?.songId === "precious" ||
      result.recommended?.songId === "fanfare",
  );
  assert.equal(result.recommended?.action, "buy-continue");
  const filler = result.policies.find(
    (policy) => policy.id === "blue:buy-continue",
  );
  const chosen = result.recommended;
  assert.ok(filler && chosen);
  assert.equal(filler.decisionVector.hard, chosen.decisionVector.hard);
  assert.equal(
    filler.decisionVector.riskAdmissible,
    chosen.decisionVector.riskAdmissible,
  );
  assert.ok(
    chosen.decisionVector.structural > filler.decisionVector.structural,
  );
});

test("C4 à 10 songs conserve 16/18 comme diagnostics sans porte dure", () => {
  const visible = [
    song("komorebi", { dance: 21 }),
    song("bluebird", { visual: 21 }),
    song("ring-ring", { vocal: 21 }),
  ];
  const tokenKeys = ["dance", "passion", "vocal", "visual", "mental"] as const;
  const remaining = [
    ...visible,
    ...Array.from({ length: 12 }, (_, index) =>
      song(`remaining-${index}`, { [tokenKeys[index % 5]]: 21 }),
    ),
  ];

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 200,
      passion: 186,
      vocal: 183,
      visual: 205,
      mental: 178,
    }),
    visibleSongs: visible,
    remainingSongs: remaining,
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 10,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    maxSongPages: 4,
    trials: 300,
  });

  const carry = result.policies.find(
    (policy) => policy.action === "carry-page",
  );
  assert.ok(carry);
  assert.equal(carry.checkpoint16Status, "closable-before-deadline");
  assert.equal(carry.valid, true);
  assert.doesNotMatch(
    frAll(carry.reasons),
    /checkpoint 16 impossible|porte 16/i,
  );
  assert.equal(
    result.policies.some((policy) => policy.action === "stop-and-carry-stock"),
    false,
  );

  assert.ok(
    result.policies.some(
      (policy) => policy.action === "buy-continue" && policy.valid,
    ),
  );
  assert.ok(
    result.policies
      .filter((policy) => policy.action === "buy-stop" && policy.valid)
      .every(
        (policy) =>
          policy.continuationRecommendation === "stop" ||
          policy.continuationRecommendation === "invalid" ||
          policy.abandonsHunt,
      ),
  );
  assert.ok(result.recommended?.valid);
  assert.notEqual(result.recommended?.finalGateStatus, "failed");
  assert.ok(
    result.policies.some(
      (policy) => policy.action === "buy-continue" && policy.valid,
    ),
  );
});

test("HOLD n'ouvre pas une nouvelle chaîne pour Great Success intermédiaire", () => {
  const filler = song("filler", { dance: 21 }, ["filler"]);
  const futureSp3 = song("SP3", { dance: 21, vocal: 21, mental: 21 }, [
    "sp3-target",
  ]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [filler],
    remainingSongs: [filler],
    futureSongs: [futureSp3],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 8,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 300,
  });

  assert.equal(result.plan.mode, "hold");
  assert.equal(result.recommended?.action, "wait-reserve");
  const forcedContinuation = result.policies.find(
    (policy) => policy.id === "filler:buy-continue",
  );
  assert.equal(forcedContinuation?.valid, false);
  assert.equal(forcedContinuation?.overrideEligible, true);
});

test("HOLD achète une Friendship visible puis s'arrête", () => {
  const friendship = song("friendship", { dance: 42, visual: 26 }, [
    "friendship-10",
  ]);
  const futureSp3 = song("SP3", { dance: 21, vocal: 21, mental: 21 }, [
    "sp3-target",
  ]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [friendship],
    remainingSongs: [friendship],
    futureSongs: [futureSp3],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 8,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 300,
  });

  assert.equal(result.plan.mode, "hold");
  assert.equal(result.recommended?.songId, "friendship");
  assert.equal(result.recommended?.action, "buy-stop");
  assert.equal(
    result.policies.find((policy) => policy.id === "friendship:buy-continue")
      ?.valid,
    false,
  );
});

test("la politique terminale consomme la vraie valeur inter-section", () => {
  const filler = song("current-filler", { passion: 21, visual: 21 }, [
    "filler",
  ]);
  const futureSongs = [
    song("f10-a", { dance: 42, visual: 26 }, ["friendship-10"]),
    song("f10-b", { dance: 26, visual: 42 }, ["friendship-10"]),
    song("f5-a", { passion: 22, mental: 22 }, ["friendship-5"]),
    song("f5-b", { vocal: 22, mental: 22 }, ["friendship-5"]),
  ];
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 180,
      passion: 180,
      vocal: 180,
      visual: 180,
      mental: 180,
    }),
    visibleSongs: [filler],
    remainingSongs: [filler],
    futureSongs,
    techniquesToNextSong: 4,
    songsThisSection: 3,
    totalSongs: 10,
    concertIndex: 2,
    timingMode: "deadline-now",
    nextSongCycle: 4,
    trials: 600,
  });

  const buyStop = result.policies.find(
    (policy) => policy.id === "current-filler:buy-stop",
  );
  const carry = result.policies.find(
    (policy) => policy.action === "carry-page",
  );
  assert.ok(buyStop?.nextSectionReadiness);
  assert.ok(carry?.nextSectionReadiness);
  assert.equal(
    buyStop.nextSectionReadiness.supplyScope,
    "verified-live-transition-no-training-income",
  );
  assert.equal(buyStop.nextSectionReadiness.transitionTokenGain, 10);
  assert.ok(buyStop.nextSectionReadiness.expectedFriendshipBonus > 0);
  // Carrying the page itself commits no purchase before the Live. After the
  // verified +10, the next-section policy may legitimately buy the carried
  // filler to continue toward the known Friendship pool.
  assert.equal(carry.decisionVector.committedCost, 0);
  assert.ok(carry.nextSectionReadiness.expectedFriendshipBonus > 0);
  assert.ok(carry.nextSectionReadiness.expectedPurchases > 0);
});

test("C2 peut refuser un filler et porter la page jusqu'aux Friendship de C4", () => {
  const filler = {
    ...song("bluebird", { dance: 21, visual: 42 }, ["specialty-priority"]),
    practiceValue: 2,
    liveValue: 1,
  };
  const futureSp3 = {
    ...song("sp3", { dance: 21, vocal: 21, mental: 21 }, ["sp3-target"]),
    practiceValue: 5,
  };
  const laterFriendships = [
    song("f10-a", { dance: 42, visual: 26 }, ["friendship-10"]),
    song("f10-b", { dance: 26, visual: 42 }, ["friendship-10"]),
    song("f5-a", { passion: 22, mental: 22 }, ["friendship-5"]),
    song("f5-b", { vocal: 22, mental: 22 }, ["friendship-5"]),
    song("f5-c", { passion: 32, vocal: 12 }, ["friendship-5"]),
    song("f5-d", { dance: 12, visual: 32 }, ["friendship-5"]),
  ];
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 70,
      passion: 80,
      vocal: 70,
      visual: 70,
      mental: 80,
    }),
    visibleSongs: [filler],
    remainingSongs: [
      filler,
      song("current-other", { passion: 21, mental: 21 }, ["filler"]),
    ],
    futureSongs: [futureSp3],
    laterSongs: laterFriendships,
    techniquesToNextSong: 2,
    songsThisSection: 3,
    totalSongs: 9,
    concertIndex: 1,
    timingMode: "deadline-now",
    trials: 600,
  });

  assert.equal(result.recommended?.action, "carry-page");
  assert.equal(result.recommended?.songId, null);
  assert.deepEqual(result.recommended?.carriedSongIds, ["bluebird"]);
  assert.equal(result.recommended?.nextSectionReadiness?.horizonSections, 2);
  assert.match(frAll(result.recommended?.reasons ?? []), /C4/);
});

test("le troisième achat terminal sécurise Great Success puis passe en HOLD", () => {
  const filler = {
    ...song("bluebird-gs", { dance: 21, visual: 42 }, ["specialty-priority"]),
    practiceValue: 2,
    liveValue: 1,
  };
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [filler],
    remainingSongs: [filler],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 8,
    concertIndex: 1,
    timingMode: "deadline-now",
    trials: 250,
  });

  const buyStop = result.policies.find(
    (policy) => policy.id === "bluebird-gs:buy-stop",
  );
  assert.ok(buyStop);
  assert.equal(buyStop.valueOutcome.greatSuccessStatGain, 35);
  assert.equal(buyStop.valueOutcome.lessonSkillPoints, 25);
  assert.equal(buyStop.valueOutcome.practiceBonusValue, 2);
  assert.equal(result.recommended?.id, buyStop.id);
  assert.equal(result.recommended?.postPurchasePlanId, "hold");
});

test("WAIT_RESERVE explique la cible rendue inachetable, pas une fausse pénurie", () => {
  const visible = song("zensoku", { dance: 32, visual: 12 }, ["friendship-5"]);
  const sp2 = song("sp2-protected", { passion: 21, visual: 21 }, [
    "sp2-target",
  ]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 47,
      passion: 40,
      vocal: 40,
      visual: 25,
      mental: 40,
    }),
    visibleSongs: [visible],
    remainingSongs: [visible, sp2],
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 5,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 200,
  });

  assert.equal(result.recommended?.action, "wait-reserve");
  assert.equal(
    result.recommended?.reasons.at(-2)?.code,
    "reason.waitWouldBlockReserve",
  );
  assert.match(
    frAll(result.recommended?.reasons ?? []),
    /achat possible.*sp2-protected.*inachetable/,
  );
});

const catalogTarget = (id: string): SongTarget => {
  const source = SONGS.find((candidate) => candidate.id === id);
  assert.ok(source, `song ${id} absente du catalogue`);
  return {
    id: source.id,
    name: source.name,
    cost: source.cost,
    ...contextualSongValues({
      practiceBonus: source.practiceBonus,
      liveBonusType: source.liveBonusType,
      liveBonusValue: source.liveBonusValue,
      declaredPriority: source.priority,
    }),
  };
};

test("replay C4 : une Friendship +10 déjà visible n'est plus comptée comme une opportunité future perdue", () => {
  const remainingIds = [
    "nigekiri",
    "ring-ring",
    "a-no-ne",
    "bluebird",
    "pyoitto",
    "nanairo",
    "yumezora",
    "present-march",
    "sekai",
    "harusora",
    "fanfare",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["fanfare", "nigekiri", "sekai"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 150,
      passion: 169,
      vocal: 161,
      visual: 163,
      mental: 191,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 11,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    trials: 224,
  });

  const fanfare = result.policies.find(
    (policy) => policy.id === "fanfare:buy-stop",
  );
  const sekai = result.policies.find(
    (policy) => policy.id === "sekai:buy-stop",
  );
  assert.ok(fanfare?.nextSectionReadiness && sekai?.nextSectionReadiness);
  assert.equal(fanfare.nextSectionReadiness.friendship10Probability, 1);
  assert.ok(
    fanfare.nextSectionReadiness.expectedFriendshipBonus >=
      sekai.nextSectionReadiness.expectedFriendshipBonus,
  );
  assert.equal(result.recommended?.songId, "fanfare");
});

test("replay C4 : une Friendship +10 visible passe devant un filler malgré le repère 16", () => {
  const remainingIds = [
    "tachiichi",
    "nigekiri",
    "a-no-ne",
    "bluebird",
    "komorebi",
    "pyoitto",
    "yumezora",
    "present-march",
    "daisuki",
    "sekai",
    "fanfare",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["a-no-ne", "komorebi", "daisuki"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 164,
      passion: 75,
      vocal: 68,
      visual: 70,
      mental: 131,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 11,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    maxSongPages: 4,
    trials: 300,
  });

  assert.equal(result.plan.id, "close-c4");
  assert.equal(result.plan.checkpointRequired, null);
  assert.equal(result.recommended?.songId, "daisuki");
  assert.ok(
    result.recommended?.action === "buy-stop" ||
      result.recommended?.action === "buy-continue",
  );
  assert.doesNotMatch(
    frAll(result.recommended?.reasons ?? []),
    /checkpoint 16 impossible/i,
  );
});

test("C4 : une Friendship +10 reste principale face à un filler seulement marginalement plus sûr", () => {
  const remainingSongs = SONGS.filter(
    (candidate) =>
      candidate.unlockPhase <= 3 &&
      candidate.id !== "grow-up-shine" &&
      candidate.id !== "yume-wo-kakeru",
  ).map((candidate) => catalogTarget(candidate.id));
  const visibleSongs = ["daisuki", "a-no-ne", "bluebird"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 70,
      passion: 100,
      vocal: 70,
      visual: 70,
      mental: 100,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    maxSongPages: 3,
    trials: 64,
  });

  const friendship = result.policies.find(
    (policy) => policy.id === "daisuki:buy-continue",
  );
  const filler = result.policies.find(
    (policy) => policy.id === "a-no-ne:buy-continue",
  );
  assert.ok(friendship && filler);
  assert.equal(friendship.decisionVector.hard, filler.decisionVector.hard);
  assert.equal(
    friendship.decisionVector.riskAdmissible,
    filler.decisionVector.riskAdmissible,
  );
  assert.equal(result.recommended?.id, "daisuki:buy-continue");
});

test("Great Success intermédiaire ne redevient jamais une gate devant une Friendship +10", () => {
  const remainingSongs = SONGS.filter(
    (candidate) =>
      candidate.unlockPhase <= 3 &&
      candidate.id !== "grow-up-shine" &&
      candidate.id !== "yume-wo-kakeru",
  ).map((candidate) => catalogTarget(candidate.id));
  const visibleSongs = ["daisuki", "a-no-ne", "bluebird"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  // Low enough reserves make the +10 branch materially worse for completing
  // the intermediate live, while it remains affordable and strategically sound.
  // The persistent +10 must still outrank a filler: only the final GL 18 ∧ GS
  // condition is allowed to act as a hard viability gate.
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 100,
      passion: 110,
      vocal: 136,
      visual: 46,
      mental: 46,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    maxSongPages: 3,
    trials: 64,
  });

  const friendship = result.policies.find(
    (policy) => policy.id === "daisuki:buy-continue",
  );
  const filler = result.policies.find(
    (policy) => policy.id === "a-no-ne:buy-continue",
  );
  assert.ok(friendship && filler);
  assert.equal(friendship.decisionVector.hard, filler.decisionVector.hard);
  assert.equal(
    friendship.decisionVector.riskAdmissible,
    filler.decisionVector.riskAdmissible,
  );
  assert.equal(result.recommended?.songId, "daisuki");
});

test("replay C4 : Fanfare +10 est recommandée sans faux blocage 16", () => {
  const remainingIds = [
    "tachiichi",
    "nigekiri",
    "a-no-ne",
    "bluebird",
    "komorebi",
    "pyoitto",
    "present-march",
    "sekai",
    "fanfare",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["a-no-ne", "nigekiri", "fanfare"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 34,
      passion: 53,
      vocal: 20,
      visual: 44,
      mental: 109,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 4,
    songsThisSection: 3,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 4,
    maxSongPages: 4,
    trials: 300,
  });

  assert.equal(result.recommended?.id, "fanfare:buy-stop");
  assert.notEqual(result.recommended?.checkpoint16Status, "impossible");
  assert.doesNotMatch(
    frAll(result.recommended?.reasons ?? []),
    /fermeture 16\/18|checkpoint 16 impossible/i,
  );

  const assessments = assessSongChoices({
    policyResult: result,
    visibleSongIds: visibleSongs.map((song) => song.id),
    recommendedSongId: result.recommended?.songId ?? null,
    recommendedPolicyId: result.recommended?.id ?? null,
  });
  const fanfare = assessments.find(
    (assessment) => assessment.songId === "fanfare",
  );
  assert.equal(fanfare?.safety, "recommended");
  assert.equal(fanfare?.blocking, null);
});

test("le replay C3 cycle 4 du log abandonne HUNT sans acheter Komorebi", () => {
  const remainingIds = [
    "tachiichi",
    "nigekiri",
    "go-this-way",
    "zensoku",
    "grow-up-shine",
    "komorebi",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["nigekiri", "tachiichi", "komorebi"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );
  const futureSongs = SONGS.filter(
    (candidate) => candidate.unlockPhase === 3,
  ).map((candidate) => catalogTarget(candidate.id));

  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 57,
      passion: 59,
      vocal: 33,
      visual: 47,
      mental: 46,
    }),
    visibleSongs,
    remainingSongs,
    futureSongs,
    techniquesToNextSong: 5,
    songsThisSection: 3,
    totalSongs: 10,
    concertIndex: 2,
    generationProfile: "speed-wit",
    riskProfile: "standard",
    nextSongCycle: 5,
    timingMode: "section-open",
    maxSongPages: 4,
    continuationObjective: "priority-song",
    huntState: {
      ...createHuntState(["grow-up-shine"]),
      pagesSeenWithoutTarget: 3,
      lastObservedPageKey: "2:4",
    },
    trials: 300,
  });

  assert.equal(result.plan.id, "hunt-sp3");
  assert.equal(result.recommended?.id, "nigekiri:wait-reserve");
  assert.equal(result.recommended?.abandonsHunt, true);
  assert.equal(
    result.recommended?.huntAbandonReason?.code,
    "reason.huntAbandonMarginalValue",
  );
  assert.equal(result.recommended?.huntDecision?.action, "abandon-to-hold");
  assert.equal(
    result.policies.find((policy) => policy.id === "komorebi:buy-continue")
      ?.valid,
    false,
  );
});

test("PR-6 : après trois misses, une cible SP rentable et un cycle court peuvent encore poursuivre HUNT", () => {
  const filler = song("filler-profitable-hunt", { dance: 5 }, ["filler"]);
  const sp3 = {
    ...song("SP3-profitable-hunt", { vocal: 21 }, ["sp3-target"]),
    practiceBonus: "Skill Pt training +3",
  };
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [filler],
    remainingSongs: [filler, sp3],
    techniquesToNextSong: 1,
    songsThisSection: 2,
    totalSongs: 9,
    concertIndex: 2,
    timingMode: "section-open",
    nextSongCycle: 3,
    huntState: {
      ...createHuntState(["SP3-profitable-hunt"]),
      pagesSeenWithoutTarget: 3,
      lastObservedPageKey: "2:3",
    },
    trials: 400,
  });

  const continuation = result.policies.find(
    (policy) => policy.id === "filler-profitable-hunt:buy-continue",
  );
  assert.equal(result.plan.mode, "hunt");
  assert.equal(continuation?.huntDecision?.action, "continue-hunt");
  assert.equal(continuation?.huntAbandonReason, undefined);
  assert.equal(continuation?.valid, true);
});

test("HUNT abandonne avant un cycle à cinq techniques et persiste en HOLD", () => {
  const filler = song("filler-abandon", { dance: 21 }, ["filler"]);
  const sp3 = song("SP3-abandon", { dance: 21, vocal: 21, mental: 21 }, [
    "sp3-target",
  ]);
  const result = analyzeSongSelection({
    period: "classic",
    tokens: rich,
    visibleSongs: [filler],
    remainingSongs: [filler, sp3],
    techniquesToNextSong: 5,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 2,
    timingMode: "section-open",
    nextSongCycle: 4,
    huntState: {
      ...createHuntState(["SP3-abandon"]),
      pagesSeenWithoutTarget: 3,
      lastObservedPageKey: "2:4",
    },
    trials: 300,
  });
  assert.equal(result.plan.mode, "hunt");
  assert.equal(result.recommended?.action, "wait-reserve");
  assert.equal(result.recommended?.abandonsHunt, true);
  const continuation = result.policies.find(
    (policy) => policy.id === "filler-abandon:buy-continue",
  );
  const stop = result.policies.find(
    (policy) => policy.id === "filler-abandon:buy-stop",
  );
  assert.equal(continuation?.valid, false);
  assert.equal(continuation?.overrideEligible, false);
  assert.equal(continuation?.huntDecision?.action, "abandon-to-hold");
  assert.match(frAll(continuation?.reasons ?? []), /valeur marginale/);
  assert.equal(stop?.abandonsHunt, true);
  assert.equal(stop?.postPurchasePlanId, "hold");
});

test("HUNT applique le seuil probabiliste avant un cycle profond", () => {
  const filler = song("filler-low-probability", { dance: 21 }, ["filler"]);
  const sp3 = song(
    "SP3-low-probability",
    { dance: 120, vocal: 120, mental: 120 },
    ["sp3-target"],
  );
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 45,
      passion: 45,
      vocal: 45,
      visual: 45,
      mental: 45,
    }),
    visibleSongs: [filler],
    remainingSongs: [filler, sp3],
    techniquesToNextSong: 4,
    songsThisSection: 2,
    totalSongs: 9,
    concertIndex: 2,
    timingMode: "section-open",
    nextSongCycle: 3,
    huntState: {
      ...createHuntState(["SP3-low-probability"]),
      pagesSeenWithoutTarget: 3,
      lastObservedPageKey: "2:3",
    },
    trials: 300,
  });

  assert.equal(result.recommended?.action, "wait-reserve");
  assert.equal(result.recommended?.abandonsHunt, true);
  assert.equal(
    result.recommended?.huntAbandonReason?.code,
    "reason.huntAbandonMarginalValue",
  );
  assert.equal(result.recommended?.huntDecision?.action, "abandon-to-hold");
});

test("Grand Live : Great Success incomplet force encore la conversion, indépendamment de 18", () => {
  const fillers = [
    song("gl-filler-a", { dance: 21 }),
    song("gl-filler-b", { passion: 21 }),
    song("gl-filler-c", { vocal: 21 }),
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: fillers,
    remainingSongs: fillers,
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 16,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 120,
  });

  assert.equal(result.plan.id, "convert-final");
  assert.equal(result.recommended?.action, "buy-continue");
  assert.ok(
    result.policies
      .filter((policy) => policy.action === "stop-and-carry-stock")
      .every((policy) => !policy.valid),
  );
});

test("Grand Live : une deuxième song manuelle sécurise la jauge puis continue la conversion", () => {
  const visible = song("gl-last", { dance: 21 });
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: [visible],
    remainingSongs: [visible],
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 17,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 120,
  });

  assert.equal(result.recommended?.action, "buy-continue");
  assert.equal(result.recommended?.finalGateStatus, "secured");
});

test("Grand Live : après Great Success, les fillers convertissent encore les tokens en SP", () => {
  const fillers = [
    song("gl-save-a", { dance: 21 }),
    song("gl-save-b", { passion: 21 }),
    song("gl-save-c", { vocal: 21 }),
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: fillers,
    remainingSongs: fillers,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 18,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 120,
  });

  assert.deepEqual(result.plan.chaseTargets.ids, [
    "gl-save-a",
    "gl-save-b",
    "gl-save-c",
  ]);
  assert.equal(result.recommended?.action, "buy-continue");
  assert.ok((result.recommended?.valueOutcome.lessonSkillPoints ?? 0) > 25);
});

test("replay run v0.25.1 s49/s70 : après SP, la troisième song sécurise Great Success", () => {
  const fixtures = [
    {
      concertIndex: 1,
      tokens: balance({
        dance: 125,
        passion: 65,
        vocal: 64,
        visual: 63,
        mental: 75,
      }),
      ownedSongIds: ["nigekiri", "seishun", "yume-wo-kakeru", "zensoku"],
      activeSongIds: ["seishun", "zensoku"],
      selectedOfferIds: ["bluebird", "tachiichi", "kiseki"],
      totalSongs: 5,
    },
    {
      concertIndex: 2,
      tokens: balance({
        dance: 176,
        passion: 141,
        vocal: 122,
        visual: 121,
        mental: 111,
      }),
      ownedSongIds: [
        "grow-up-shine",
        "nigekiri",
        "seishun",
        "tachiichi",
        "yume-wo-kakeru",
        "zensoku",
      ],
      activeSongIds: ["nigekiri", "seishun", "yume-wo-kakeru", "zensoku"],
      selectedOfferIds: ["nanairo", "run-run", "bluebird"],
      totalSongs: 7,
    },
  ] as const;

  for (const fixture of fixtures) {
    const context = buildSolverStateContext({
      catalog: SONGS,
      concertIndex: fixture.concertIndex,
      period: "classic",
      techniqueOfferPeriod: null,
      songCycle: 2,
      techniquesToNextSong: 0,
      tokens: fixture.tokens,
      ownedSongIds: fixture.ownedSongIds,
      activeSongIds: fixture.activeSongIds,
      selectedOfferIds: fixture.selectedOfferIds,
      solverMode: "expert",
      riskProfile: "standard",
      generationProfile: "speed-wit",
      analysisObjective: "priority-song",
      songsThisSection: 2,
      totalSongs: fixture.totalSongs,
      timingMode: "deadline-now",
    });
    assert.equal(context.strategicPlan.id, "close-checkpoint");
    assert.equal(context.effectiveObjective, "any-song");

    const result = analyzeSongSelection({
      period: "classic",
      firstOfferPeriod: context.firstOfferPeriod,
      tokens: fixture.tokens,
      visibleSongs: context.visibleSongs,
      remainingSongs: context.currentSongs,
      futureSongs: context.futureSongs,
      laterSongs: context.laterSongs,
      techniquesToNextSong: 2,
      songsThisSection: 2,
      totalSongs: fixture.totalSongs,
      concertIndex: fixture.concertIndex,
      generationProfile: context.effectiveGenerationProfile,
      friendshipSongMultiplier: context.friendshipSongMultiplier,
      remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
      riskProfile: context.effectiveRiskProfile,
      trials: 256,
      nextSongCycle: 3,
      timingMode: "deadline-now",
      maxSongPages: 4,
      continuationObjective: context.effectiveObjective,
    });

    assert.equal(result.recommended?.action, "buy-stop");
    assert.equal(result.recommended?.greatSuccessProbability, 1);
    assert.equal(result.recommended?.valueOutcome.greatSuccessStatGain, 35);
    assert.equal(result.recommended?.postPurchasePlanId, "hold");
  }
});

test("replay run A s59 : une chasse SP+2 rentable domine les projections Friendship futures", () => {
  const context = buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 1,
    period: "classic",
    techniqueOfferPeriod: null,
    songCycle: 3,
    techniquesToNextSong: 0,
    tokens: balance({
      dance: 73,
      passion: 72,
      vocal: 33,
      visual: 45,
      mental: 25,
    }),
    ownedSongIds: ["bluebird", "kiseki", "run-run", "seishun", "zensoku"],
    activeSongIds: ["run-run", "seishun", "zensoku"],
    selectedOfferIds: ["nigekiri", "ring-ring", "a-no-ne"],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "priority-song",
    songsThisSection: 2,
    totalSongs: 6,
    timingMode: "deadline-now",
  });
  const result = analyzeSongSelection({
    period: "classic",
    firstOfferPeriod: context.firstOfferPeriod,
    tokens: balance({
      dance: 73,
      passion: 72,
      vocal: 33,
      visual: 45,
      mental: 25,
    }),
    visibleSongs: context.visibleSongs,
    remainingSongs: context.currentSongs,
    futureSongs: context.futureSongs,
    laterSongs: context.laterSongs,
    techniquesToNextSong: 3,
    songsThisSection: 2,
    totalSongs: 6,
    concertIndex: 1,
    generationProfile: context.effectiveGenerationProfile,
    friendshipSongMultiplier: context.friendshipSongMultiplier,
    remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
    riskProfile: context.effectiveRiskProfile,
    trials: 512,
    nextSongCycle: 4,
    timingMode: "deadline-now",
    maxSongPages: 4,
    continuationObjective: "priority-song",
  });

  assert.equal(result.plan.id, "hunt-sp2");
  assert.equal(result.recommended?.action, "buy-continue");
  assert.equal(result.recommended?.abandonsHunt, false);
  assert.ok((result.recommended?.conditionalPagesProbability ?? 0) >= 0.25);
  assert.notEqual(result.recommended?.id, "stop-and-carry-stock");
});

test("replay run B s218 : sécuriser les 35 stats de Great Success bat le carry filler", () => {
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
    trials: 512,
    nextSongCycle: 3,
    timingMode: "deadline-now",
    maxSongPages: 4,
    continuationObjective: "priority-song",
  });

  assert.equal(result.recommended?.songId, "ring-ring");
  assert.ok(result.recommended?.action.startsWith("buy-"));
  assert.equal(result.recommended?.greatSuccessProbability, 1);
  assert.equal(result.recommended?.valueOutcome.greatSuccessStatGain, 35);
  assert.notEqual(result.recommended?.action, "carry-page");
});

test("replay pré-patch s5 : la chaîne C1 conserve toute sa valeur d'horizon", () => {
  const context = buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 0,
    period: "junior",
    techniqueOfferPeriod: null,
    songCycle: 1,
    techniquesToNextSong: 0,
    tokens: balance({
      dance: 102,
      passion: 73,
      vocal: 78,
      visual: 86,
      mental: 73,
    }),
    ownedSongIds: [],
    activeSongIds: [],
    selectedOfferIds: ["go-this-way", "nigekiri", "tachiichi"],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "priority-song",
    songsThisSection: 0,
    totalSongs: 1,
    timingMode: "deadline-now",
  });
  const result = analyzeSongSelection({
    period: "junior",
    firstOfferPeriod: context.firstOfferPeriod,
    tokens: balance({
      dance: 102,
      passion: 73,
      vocal: 78,
      visual: 86,
      mental: 73,
    }),
    visibleSongs: context.visibleSongs,
    remainingSongs: context.currentSongs,
    futureSongs: context.futureSongs,
    laterSongs: context.laterSongs,
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 1,
    concertIndex: 0,
    generationProfile: context.effectiveGenerationProfile,
    friendshipSongMultiplier: context.friendshipSongMultiplier,
    remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
    riskProfile: context.effectiveRiskProfile,
    trials: 512,
    nextSongCycle: 2,
    timingMode: "deadline-now",
    maxSongPages: 4,
    continuationObjective: "priority-song",
  });

  const continuation = result.policies.find(
    (policy) => policy.id === "tachiichi:buy-continue",
  );
  const stop = result.policies.find((policy) => policy.action === "carry-page");
  assert.ok(continuation && stop);
  assert.equal(result.recommended?.action, "buy-continue");
  // A carried full page may buy after the Live and therefore execute more
  // total purchases than the old preselected-song carry model. What matters
  // here is that the explicit C1 continuation still wins on horizon value.
  assert.ok(
    (continuation.nextSectionReadiness?.expectedFriendshipBonus ?? 0) >
      (stop.nextSectionReadiness?.expectedFriendshipBonus ?? 0),
  );

  // The horizon comparison already prefers the C1 chain before the 35-stat
  // Great Success component is considered. This protects the calculation from
  // regressing into a concert-specific hardcoded rule.
  const withoutGreatSuccess = {
    ...continuation.decisionVector,
    continuation: continuation.decisionVector.continuation.map(
      (value, index) => (index === 3 ? 0 : value),
    ),
  };
  assert.ok(
    compareDecisionVectors(withoutGreatSuccess, stop.decisionVector) > 0,
  );
});

test("replay run B s402 : le Grand Live sécurisé convertit un filler abordable", () => {
  const tokens = balance({
    dance: 68,
    passion: 41,
    vocal: 47,
    visual: 42,
    mental: 80,
  });
  const context = buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 4,
    period: "senior",
    techniqueOfferPeriod: null,
    songCycle: 3,
    techniquesToNextSong: 0,
    tokens,
    ownedSongIds: [
      "a-no-ne",
      "bluebird",
      "daisuki",
      "fanfare",
      "grow-up-shine",
      "harusora",
      "kiseki",
      "komorebi",
      "nanairo",
      "present-march",
      "run-run",
      "seishun",
      "sekai",
      "tachiichi",
      "yume-wo-kakeru",
      "yumezora",
      "zensoku",
    ],
    activeSongIds: [
      "bluebird",
      "daisuki",
      "fanfare",
      "grow-up-shine",
      "kiseki",
      "komorebi",
      "nanairo",
      "present-march",
      "run-run",
      "seishun",
      "sekai",
      "tachiichi",
      "yume-wo-kakeru",
      "yumezora",
      "zensoku",
    ],
    selectedOfferIds: ["go-this-way", "pyoitto", "nigekiri"],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "priority-song",
    songsThisSection: 2,
    totalSongs: 18,
    timingMode: "section-open",
  });
  const result = analyzeSongSelection({
    period: "senior",
    firstOfferPeriod: context.firstOfferPeriod,
    tokens,
    visibleSongs: context.visibleSongs,
    remainingSongs: context.currentSongs,
    techniquesToNextSong: 3,
    songsThisSection: 2,
    totalSongs: 18,
    concertIndex: 4,
    generationProfile: context.effectiveGenerationProfile,
    friendshipSongMultiplier: context.friendshipSongMultiplier,
    remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
    riskProfile: context.effectiveRiskProfile,
    trials: 256,
    nextSongCycle: 4,
    timingMode: "section-open",
    maxSongPages: 4,
    continuationObjective: "priority-song",
  });

  assert.ok(
    result.recommended?.id === "go-this-way:buy-continue" ||
      result.recommended?.id === "nigekiri:buy-continue",
  );
  const affordableBuyPolicies = result.policies.filter(
    (policy) => policy.action.startsWith("buy-") && policy.affordable === true,
  );
  assert.ok(affordableBuyPolicies.length > 0);
  assert.ok(affordableBuyPolicies.some((policy) => policy.valid));
  const assessments = assessSongChoices({
    policyResult: result,
    visibleSongIds: context.visibleSongs.map((song) => song.id),
    recommendedSongId: result.recommended?.songId ?? null,
    recommendedPolicyId: result.recommended?.id,
  });
  for (const songId of ["nigekiri", "go-this-way"]) {
    assert.equal(
      assessments.find((assessment) => assessment.songId === songId)?.blocking,
      null,
    );
  }
  assert.equal(
    assessments.find((assessment) => assessment.songId === "pyoitto")?.blocking
      ?.detail.code,
    "blocking.songUnaffordable.detail",
  );
});

test("replay run v0.25.1 s211 : Go This Way convertit les derniers tokens en +25 SP", () => {
  const remainingSongs = ["go-this-way", "a-no-ne", "pyoitto"].map(
    catalogTarget,
  );
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 19,
      passion: 1,
      vocal: 31,
      visual: 47,
      mental: 34,
    }),
    visibleSongs: remainingSongs,
    remainingSongs,
    techniquesToNextSong: 3,
    songsThisSection: 3,
    totalSongs: 19,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 5,
    trials: 256,
  });

  assert.equal(result.recommended?.id, "go-this-way:buy-continue");
  assert.ok((result.recommended?.valueOutcome.lessonSkillPoints ?? 0) >= 25);
  assert.equal(result.recommended?.valueOutcome.practiceBonusValue, 0);
  assert.equal(result.recommended?.valueOutcome.liveBonusValue, 0);
  assert.equal(
    result.policies.find((policy) => policy.id === "a-no-ne:buy-continue")
      ?.affordable,
    false,
  );
  assert.equal(
    result.policies.find((policy) => policy.id === "pyoitto:buy-continue")
      ?.affordable,
    false,
  );
});

test("Grand Live : après Great Success, toute song cachée reste une conversion possible", () => {
  const visible = [
    song("gl-open-a", { dance: 21 }),
    song("gl-open-b", { passion: 21 }),
    song("gl-open-c", { vocal: 21 }),
  ];
  const priority = song("gl-hidden-f10", { visual: 21 }, ["friendship-10"]);
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: visible,
    remainingSongs: [...visible, priority],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 18,
    concertIndex: 4,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    trials: 160,
  });

  assert.deepEqual(result.plan.chaseTargets.ids, [
    "gl-hidden-f10",
    "gl-open-a",
    "gl-open-b",
    "gl-open-c",
  ]);
  assert.equal(result.recommended?.action, "buy-continue");
  assert.notEqual(result.recommended?.id, "stop-and-carry-stock");
});

test("buy-continue normal est invariant : l'état post-achat ne conseille jamais STOP", () => {
  const targets = [
    song("invariant-a", { dance: 21 }, ["friendship-10"]),
    song("invariant-b", { passion: 21 }),
    song("invariant-c", { vocal: 21 }),
    song("invariant-hidden", { visual: 21 }, ["friendship-5"]),
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: targets.slice(0, 3),
    remainingSongs: targets,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    trials: 120,
  });

  const continuations = result.policies.filter(
    (policy) => policy.action === "buy-continue" && policy.valid,
  );
  assert.ok(continuations.length > 0);
  for (const policy of continuations) {
    assert.notEqual(policy.continuationRecommendation, "stop");
    assert.notEqual(policy.continuationRecommendation, "invalid");
  }
});

test("C4 10/18 : trois fillers n'imposent plus une conversion uniquement pour le compteur 18", () => {
  const remainingIds = [
    "go-this-way",
    "ring-ring",
    "seishun",
    "a-no-ne",
    "komorebi",
    "nanairo",
    "yumezora",
    "present-march",
    "daisuki",
    "fanfare",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["nanairo", "komorebi", "a-no-ne"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 152,
      passion: 134,
      vocal: 145,
      visual: 151,
      mental: 133,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 0,
    totalSongs: 10,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 1,
    maxSongPages: 3,
    trials: 128,
  });

  assert.equal(result.plan.id, "close-c4");
  assert.ok(result.recommended?.valid);
});

test("invariance symétrique : buy-stop n'est normal que si l'état post-achat veut réellement s'arrêter", () => {
  const targets = [
    song("invariant-symmetric-a", { dance: 21 }, ["friendship-10"]),
    song("invariant-symmetric-b", { passion: 21 }),
    song("invariant-symmetric-c", { vocal: 21 }),
    song("invariant-symmetric-hidden", { visual: 21 }, ["friendship-5"]),
  ];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: rich,
    visibleSongs: targets.slice(0, 3),
    remainingSongs: targets,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 2,
    trials: 120,
  });

  for (const policy of result.policies.filter(
    (candidate) => candidate.action === "buy-stop" && candidate.valid,
  )) {
    assert.ok(
      policy.continuationRecommendation === "stop" ||
        policy.continuationRecommendation === "invalid" ||
        policy.abandonsHunt,
      `${policy.id} reste buy-stop alors que le post-achat vaut ${policy.continuationRecommendation}`,
    );
  }
});

test("une song structurelle inachetable n'expose jamais goal=1 ni hard=1", () => {
  const fanfare = song("fanfare-impossible", { dance: 26, visual: 42 }, [
    "friendship-10",
  ]);
  const fillerA = song("filler-a", { passion: 21 });
  const fillerB = song("filler-b", { mental: 21 });
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 75,
      passion: 75,
      vocal: 26,
      visual: 19,
      mental: 60,
    }),
    visibleSongs: [fanfare, fillerA, fillerB],
    remainingSongs: [fanfare, fillerA, fillerB],
    techniquesToNextSong: 2,
    songsThisSection: 6,
    totalSongs: 15,
    concertIndex: 3,
    timingMode: "deadline-now",
    trials: 96,
  });
  const buyStop = result.policies.find(
    (policy) => policy.id === "fanfare-impossible:buy-stop",
  );
  assert.ok(buyStop);
  assert.equal(buyStop.valid, false);
  assert.equal(buyStop.nextSongProbability, 0);
  assert.equal(buyStop.priorityAffordableProbability, 0);
  assert.equal(buyStop.decisionVector.hard, 0);
  assert.equal(buyStop.decisionVector.riskAdmissible, 0);
});

test("P2 replay e57e s161 : pyoitto domine a-no-ne comme filler", () => {
  const toTarget = (id: string): SongTarget => {
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
  };
  const pyoitto = toTarget("pyoitto");
  const aNoNe = toTarget("a-no-ne");
  const futureFriendships = [toTarget("daisuki"), toTarget("fanfare")];
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 132,
      passion: 75,
      vocal: 26,
      visual: 40,
      mental: 60,
    }),
    visibleSongs: [pyoitto, aNoNe],
    remainingSongs: [pyoitto, aNoNe],
    futureSongs: futureFriendships,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 11,
    concertIndex: 2,
    generationProfile: "speed-wit",
    friendshipSongMultiplier: 1.4,
    timingMode: "section-open",
    trials: 250,
  });

  const pyoBuy = result.policies.find(
    (policy) => policy.id === "pyoitto:buy-stop",
  );
  const aNoNeBuy = result.policies.find(
    (policy) => policy.id === "a-no-ne:buy-stop",
  );
  assert.ok(pyoBuy);
  assert.ok(aNoNeBuy);
  assert.ok(
    pyoBuy.valueOutcome.practiceBonusValue >
      aNoNeBuy.valueOutcome.practiceBonusValue,
  );

  // v0.24 no longer hard-reserves locked future Friendship vectors here.
  // The acceptance point of this fixture is P2: the better filler also spends
  // outside the currently contested Visual reserve.
  const pyoPressure = techniqueSpendMetrics(
    pyoitto.cost,
    balance({
      dance: 132,
      passion: 75,
      vocal: 26,
      visual: 40,
      mental: 60,
    }),
    result.tokenPressure,
  );
  const aNoNePressure = techniqueSpendMetrics(
    aNoNe.cost,
    balance({
      dance: 132,
      passion: 75,
      vocal: 26,
      visual: 40,
      mental: 60,
    }),
    result.tokenPressure,
  );
  assert.equal(pyoPressure.reserveBreachCount, 0);
  assert.equal(aNoNePressure.reserveBreachCount, 0);
  assert.ok(pyoPressure.weightedDemandCost < aNoNePressure.weightedDemandCost);
});

test("P4 : le classement filler de fin C4 est invariant entre 10/18 et 17/18", () => {
  const speedFiller: SongTarget = {
    id: "p4-speed",
    name: "P4 Speed",
    cost: balance({ dance: 21 }),
    roles: ["filler"],
    priority: false,
    utility: 1,
    policyValue: 0,
    practiceBonus: "Speed training +3",
  };
  const gutsFiller: SongTarget = {
    id: "p4-guts",
    name: "P4 Guts",
    cost: balance({ passion: 21 }),
    roles: ["filler"],
    priority: false,
    utility: 1,
    policyValue: 0,
    practiceBonus: "Guts training +2",
  };

  const run = (totalSongs: number) =>
    analyzeSongSelection({
      period: "senior",
      tokens: rich,
      visibleSongs: [speedFiller, gutsFiller],
      remainingSongs: [speedFiller, gutsFiller],
      techniquesToNextSong: 2,
      songsThisSection: 3,
      totalSongs,
      concertIndex: 3,
      generationProfile: "speed-wit",
      friendshipSongMultiplier: 1.45,
      timingMode: "deadline-now",
      nextSongCycle: 1,
      trials: 96,
    });

  const at10 = run(10);
  const at17 = run(17);
  assert.equal(at10.recommended?.id, at17.recommended?.id);
  assert.equal(at10.recommended?.action, at17.recommended?.action);

  for (const result of [at10, at17]) {
    const speed = result.policies.find(
      (policy) => policy.id === "p4-speed:buy-continue",
    );
    const guts = result.policies.find(
      (policy) => policy.id === "p4-guts:buy-continue",
    );
    assert.ok(speed && guts);
    assert.equal(speed.decisionVector.hard, guts.decisionVector.hard);
    assert.equal(
      speed.decisionVector.riskAdmissible,
      guts.decisionVector.riskAdmissible,
    );
    assert.ok(
      speed.valueOutcome.practiceBonusValue >
        guts.valueOutcome.practiceBonusValue,
    );
    assert.ok(
      speed.decisionVector.continuation[0] >
        guts.decisionVector.continuation[0],
    );
  }
});

test("PR-1 : un rollout risky sous le seuil n'interdit plus BUY_STOP", () => {
  const fanfare = song("fanfare-risk", { dance: 26, visual: 42 }, [
    "friendship-10",
  ]);
  const fillerA = song("a", { passion: 21 }, ["filler"]);
  const fillerB = song("b", { vocal: 21 }, ["filler"]);
  const hidden = song("hidden", { mental: 42 }, ["friendship-5"]);
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 60,
      passion: 30,
      vocal: 30,
      visual: 45,
      mental: 40,
    }),
    visibleSongs: [fanfare, fillerA, fillerB],
    remainingSongs: [fanfare, fillerA, fillerB, hidden],
    techniquesToNextSong: 4,
    songsThisSection: 3,
    totalSongs: 13,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 4,
    maxSongPages: 4,
    trials: 120,
  });

  const buyStop = result.policies.find((policy) => policy.id === "a:buy-stop");
  const buyContinue = result.policies.find(
    (policy) => policy.id === "a:buy-continue",
  );
  assert.ok(buyStop && buyContinue);
  assert.equal(buyStop.continuationRecommendation, "risky");
  assert.equal(buyStop.valid, true);
  assert.equal(buyContinue.valid, false);
  assert.ok(buyContinue.nextSongProbability < 0.92);
});

test("PR-1 audit 85/33/43/51/6 : Fanfare BUY_STOP ferme la zone morte", () => {
  const remainingIds = [
    "tachiichi",
    "nigekiri",
    "a-no-ne",
    "bluebird",
    "komorebi",
    "pyoitto",
    "present-march",
    "sekai",
    "fanfare",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["a-no-ne", "nigekiri", "fanfare"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );

  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 85,
      passion: 33,
      vocal: 43,
      visual: 51,
      mental: 6,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 10,
    concertIndex: 3,
    timingMode: "deadline-now",
    nextSongCycle: 4,
    maxSongPages: 4,
    trials: 180,
  });

  const buyStop = result.policies.find(
    (policy) => policy.id === "fanfare:buy-stop",
  );
  const buyContinue = result.policies.find(
    (policy) => policy.id === "fanfare:buy-continue",
  );
  assert.ok(buyStop && buyContinue);
  assert.equal(buyStop.affordable, true);
  assert.equal(buyStop.valid, true);
  assert.equal(buyContinue.continuationRecommendation, "risky");
  assert.equal(buyContinue.valid, false);
  assert.ok(buyContinue.nextSongProbability < 0.92);
  assert.equal(result.recommended?.id, "fanfare:buy-stop");
  assert.equal(
    result.policies.some((policy) => policy.action === "stop-and-carry-stock"),
    false,
  );
});

test("PR-7 : un micro-écart probabiliste cède au critère structurel suivant", () => {
  const noisyHigh = {
    hard: 1,
    riskAdmissible: 1,
    prospective: [0.996],
    structural: 1,
    continuation: [0.99],
    retainedTokens: 100,
    committedCost: 20,
    tieId: "noisy-high",
  };
  const structurallyBetter = {
    hard: 1,
    riskAdmissible: 1,
    prospective: [0.99],
    structural: 2,
    continuation: [0.99],
    retainedTokens: 100,
    committedCost: 20,
    tieId: "structural",
  };

  assert.ok(compareDecisionVectors(structurallyBetter, noisyHigh) > 0);
});

test("hotfix v6 replay C2 : Speed +1 passe devant Guts +1 à coût identique", () => {
  const tokens = balance({
    dance: 147,
    passion: 22,
    vocal: 45,
    visual: 49,
    mental: 35,
  });
  const context = buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 1,
    period: "classic",
    techniqueOfferPeriod: null,
    songCycle: 2,
    techniquesToNextSong: 0,
    tokens,
    ownedSongIds: [
      "kiseki",
      "ring-ring",
      "run-run",
      "seishun",
      "yume-wo-kakeru",
    ],
    activeSongIds: ["kiseki", "ring-ring", "run-run", "seishun"],
    selectedOfferIds: ["nigekiri", "bluebird", "tachiichi"],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "priority-song",
    songsThisSection: 1,
    totalSongs: 6,
    timingMode: "deadline-now",
  });
  const result = analyzeSongSelection({
    period: "classic",
    firstOfferPeriod: context.firstOfferPeriod,
    tokens,
    visibleSongs: context.visibleSongs,
    remainingSongs: context.currentSongs,
    futureSongs: context.futureSongs,
    techniquesToNextSong: 2,
    songsThisSection: 1,
    totalSongs: 6,
    concertIndex: 1,
    generationProfile: context.effectiveGenerationProfile,
    friendshipSongMultiplier: context.friendshipSongMultiplier,
    remainingTrainingsByFacility: context.remainingTrainings ?? undefined,
    riskProfile: context.effectiveRiskProfile,
    trials: 224,
    nextSongCycle: 2,
    timingMode: "deadline-now",
    continuationObjective: "priority-song",
  });
  const tachiichiIndex = result.policies.findIndex(
    (policy) => policy.id === "tachiichi:buy-continue",
  );
  const nigekiriIndex = result.policies.findIndex(
    (policy) => policy.id === "nigekiri:buy-continue",
  );
  assert.ok(tachiichiIndex >= 0 && nigekiriIndex >= 0);
  assert.ok(tachiichiIndex < nigekiriIndex);
});

test("hotfix v6 replay C2 : Friendship +5 visible passe devant Go This Way", () => {
  const remainingIds = [
    "nigekiri",
    "go-this-way",
    "zensoku",
    "a-no-ne",
    "bluebird",
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["zensoku", "go-this-way", "bluebird"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({
      dance: 126,
      passion: 16,
      vocal: 29,
      visual: 28,
      mental: 25,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 7,
    concertIndex: 1,
    generationProfile: "speed-wit",
    riskProfile: "standard",
    nextSongCycle: 3,
    timingMode: "deadline-now",
    trials: 224,
  });
  assert.equal(result.recommended?.songId, "zensoku");
});

test("hotfix v6 replay C4 : Grow Up and Shine passe devant Nigekiri", () => {
  const remainingIds = [
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
  ];
  const remainingSongs = remainingIds.map(catalogTarget);
  const visibleSongs = ["nigekiri", "pyoitto", "grow-up-shine"].map((id) =>
    remainingSongs.find((candidate) => candidate.id === id)!,
  );
  const result = analyzeSongSelection({
    period: "senior",
    tokens: balance({
      dance: 134,
      passion: 104,
      vocal: 107,
      visual: 57,
      mental: 127,
    }),
    visibleSongs,
    remainingSongs,
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 12,
    concertIndex: 3,
    generationProfile: "speed-wit",
    riskProfile: "standard",
    nextSongCycle: 3,
    timingMode: "deadline-now",
    trials: 224,
  });
  assert.equal(result.recommended?.songId, "grow-up-shine");
});
