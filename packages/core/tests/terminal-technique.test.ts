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
  assert.equal(assessments[0].reason.code, "terminal.stopNow");
  assert.match(fr(assessments[0].reason), /aucun gain prospectif structurel/);
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
