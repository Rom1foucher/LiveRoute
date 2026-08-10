import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSolverStateContext,
  rankObservedTechniques,
  SONGS,
  structuralTrainingValue,
  type Balance,
  type SolverStateContextInput,
} from "../src/index.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const buildContext = (overrides: Partial<SolverStateContextInput>) =>
  buildSolverStateContext({
    catalog: SONGS,
    concertIndex: 3,
    period: "senior",
    songCycle: 1,
    techniquesToNextSong: 0,
    tokens: balance(),
    ownedSongIds: [],
    activeSongIds: [],
    solverMode: "expert",
    riskProfile: "standard",
    generationProfile: "speed-wit",
    analysisObjective: "carryover",
    songsThisSection: 0,
    totalSongs: 1,
    timingMode: "deadline-now",
    ...overrides,
  });

test("le contexte de production reproduit s110 et protège Daisuki, pas Fanfare", () => {
  const remaining = new Set([
    "daisuki",
    "fanfare",
    "harusora",
    "present-march",
    "yumezora",
    "sekai",
    "pyoitto",
  ]);
  const context = buildContext({
    tokens: balance({
      dance: 126,
      passion: 76,
      vocal: 59,
      visual: 54,
      mental: 50,
    }),
    ownedSongIds: SONGS.filter((song) => !remaining.has(song.id)).map(
      (song) => song.id,
    ),
    selectedOfferIds: ["pyoitto"],
    totalSongs: 12,
  });

  assert.equal(
    context.tokenPressure.find((item) => item.key === "visual")?.reserveTarget,
    26,
  );
  assert.equal(
    context.tokenPressure.find((item) => item.key === "dance")?.reserveTarget,
    42,
  );
  assert.ok(
    context.tokenReservePlan.targets.some((target) => target.id === "daisuki"),
  );
  assert.ok(
    !context.tokenReservePlan.targets.some((target) => target.id === "fanfare"),
  );
});

test("le contexte de production reproduit s154 avec les offres réellement observées", () => {
  const tokens = balance({
    dance: 187,
    passion: 43,
    vocal: 32,
    visual: 44,
    mental: 34,
  });
  const offers = [
    balance({ visual: 24 }),
    balance({ visual: 25 }),
    balance({ dance: 14, visual: 10 }),
  ];
  const remaining = new Set(["fanfare", "harusora", "sekai"]);
  const context = buildContext({
    techniqueOfferPeriod: "classic",
    songCycle: 4,
    techniquesToNextSong: 1,
    tokens,
    ownedSongIds: SONGS.filter((song) => !remaining.has(song.id)).map(
      (song) => song.id,
    ),
    currentTechniqueOffers: offers,
    totalSongs: 16,
  });

  assert.equal(context.firstOfferPeriod, "classic");
  assert.deepEqual(context.reserveFeasibility.currentTechniqueOffers, offers);
  assert.equal(
    context.tokenPressure.find((item) => item.key === "visual")?.reserveTarget,
    32,
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
    songs: context.currentSongs,
    plan: context.strategicPlan,
    riskProfile: context.effectiveRiskProfile,
    tokenPressure: context.tokenPressure,
  });
  assert.equal(ranked[0]?.id, "option-3");
});

test("le contexte conserve le bonus brut et active P2 avec le multiplicateur Friendship", () => {
  const context = buildContext({
    concertIndex: 2,
    period: "classic",
    ownedSongIds: SONGS.filter(
      (song) => song.id !== "pyoitto" && song.id !== "a-no-ne",
    ).map((song) => song.id),
    activeSongIds: ["seishun"],
  });
  const pyoitto = context.currentSongs.find((song) => song.id === "pyoitto");
  const aNoNe = context.currentSongs.find((song) => song.id === "a-no-ne");

  assert.ok(pyoitto);
  assert.ok(aNoNe);
  assert.equal(pyoitto.practiceBonus, "Stamina training +2");
  assert.equal(context.friendshipSongMultiplier, 1.05);
  assert.ok(context.remainingTrainings);
  assert.equal(
    pyoitto.practiceValue,
    structuralTrainingValue(
      pyoitto.practiceBonus,
      context.remainingTrainings,
      context.friendshipSongMultiplier,
    ),
  );
  assert.ok((pyoitto.practiceValue ?? 0) > (aNoNe.practiceValue ?? 0));
});

test("au Grand Live, un bonus d'entraînement dynamique vaut bien zéro", () => {
  const context = buildContext({
    concertIndex: 4,
    ownedSongIds: SONGS.filter((song) => song.id !== "pyoitto").map(
      (song) => song.id,
    ),
  });
  const pyoitto = context.currentSongs.find((song) => song.id === "pyoitto");
  assert.ok(pyoitto);
  assert.equal(pyoitto.practiceValue, 0);
});
