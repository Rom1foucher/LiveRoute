import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contextualSongValues,
  type Balance,
  type SongTarget,
} from "../src/live-model.ts";
import { deriveStrategicPlan } from "../src/planner/strategic-plan.ts";
import { evaluateTerminalTechniqueOptions } from "../src/solver/terminal-technique.ts";

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

test("P5 source contract removes the separate C4 economy", () => {
  const source = readFileSync(
    new URL("../src/solver/terminal-technique.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "evaluateTerminalC4Value",
    "evaluateTerminalC4OpportunityCost",
    "maxFundableFriendshipOptionValue",
    "TERMINAL_C4_VALUE_CALIBRATION",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(/Math\.max\(0,\s*\w*delta/i.test(source), false);
});


test("P-T4 source contract removes the terminal compatibility scalar", () => {
  const terminalSource = readFileSync(
    new URL("../src/solver/terminal-technique.ts", import.meta.url),
    "utf8",
  );
  assert.equal(terminalSource.includes("terminal-compat-utility"), false);
  assert.equal(terminalSource.includes("FRIENDSHIP_EXPOSURE_STAT_RATE"), false);
  assert.equal(terminalSource.includes("GATE18_STAT_DELTA"), false);
  assert.equal(terminalSource.includes("terminalUtilityFromTrial"), false);
});

test("P5 terminal page action switch is exhaustive and includes BUY_CONTINUE", () => {
  const source = readFileSync(
    new URL("../src/solver/terminal-technique.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /switch \(action\.kind\)/);
  assert.match(source, /case "buy-stop"/);
  assert.match(source, /case "buy-continue"/);
  assert.match(source, /case "carry-current-page"/);
  assert.match(source, /return assertNever\(action\)/);
});

test("P4 generalizes the retained P5 paired comparison through one robustness seam", () => {
  const terminalSource = readFileSync(
    new URL("../src/solver/terminal-technique.ts", import.meta.url),
    "utf8",
  );
  const robustnessSource = readFileSync(
    new URL("../src/solver/robustness.ts", import.meta.url),
    "utf8",
  );
  assert.match(terminalSource, /createPairedDifferenceStats/);
  assert.match(terminalSource, /pairedUtilityRobustness/);
  assert.match(robustnessSource, /pairedMeanInterval/);
  assert.match(robustnessSource, /pairedDifferenceSeparated/);
});

test("P5 BUY_CONTINUE contributes the second manual song instead of falling through", () => {
  const currentSongs = [
    filler("filler-a", { dance: 22, visual: 22 }),
    filler("filler-b", { passion: 22, mental: 22 }),
    filler("filler-c", { vocal: 22, visual: 22 }),
  ];
  const plan = deriveStrategicPlan({
    concertIndex: 0,
    timingMode: "deadline-now",
    remainingSongs: currentSongs,
    songsThisSection: 0,
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
    candidates: [{ id: "dance-30", cost: balance({ dance: 30 }) }],
    techniquesRemaining: 4,
    currentSongs,
    totalSongs: 4,
    songsThisSection: 0,
    plan,
    trials: 120,
    minimumSamples: 120,
    seedKey: "p5-buy-continue-exhaustive",
  });
  assert.ok(assessments);
  const assessment = assessments[0];
  assert.ok(assessment);
  // One BUY_STOP cannot secure C1 Great Success from 0/2. The layered outcome
  // reaches the discrete gate only through BUY_CONTINUE, proving that branch
  // was evaluated rather than skipped by the terminal loop.
  assert.equal(assessment.action, "expose-and-carry");
  assert.equal(assessment.decisionLayer, "gate");
  assert.equal(assessment.decisionMetric, "great-success-secured");
  assert.equal(assessment.decisionDelta, 1);
});
