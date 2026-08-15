import type { Song, UnlockPhase } from "../domain/song-data.ts";
import type { TimingMode } from "../domain/live-rules.ts";
import {
  contextualSongValues,
  estimateRemainingTrainingsByFacility,
  resolveEffectiveTechniqueObjective,
  totalCost,
  withStructuralTrainingValue,
  type AnalysisObjective,
  type Balance,
  type GenerationProfile,
  type Period,
  type ReserveFeasibilityContext,
  type RiskProfile,
  type SongTarget,
} from "../live-model.ts";
import {
  deriveStrategicPlan,
  isReserveTarget,
} from "../planner/strategic-plan.ts";
import { buildSharedResourceEconomy } from "./resource-economy.ts";

export type SolverMode = "express" | "expert";

export type SolverStateContextInput = {
  catalog: readonly Song[];
  concertIndex: number;
  period: Period;
  techniqueOfferPeriod?: Period | null;
  songCycle: number;
  techniquesToNextSong: number;
  tokens: Balance;
  ownedSongIds: readonly string[];
  activeSongIds: readonly string[];
  selectedOfferIds?: readonly string[];
  currentTechniqueOffers?: readonly Balance[];
  solverMode: SolverMode;
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  analysisObjective: AnalysisObjective;
  songsThisSection: number;
  totalSongs: number;
  timingMode: TimingMode;
  abandonedChaseTargetIds?: readonly string[];
};

/**
 * The complete, pure adapter between tracked application state and the engine.
 * Web, desktop and OCR all use the shared App shell; keeping every derived
 * solver input here prevents one surface from silently losing reserve,
 * practice-value or inherited-price context during a refactor.
 */
export const buildSolverStateContext = (input: SolverStateContextInput) => {
  const owned = new Set(input.ownedSongIds);
  const active = new Set(input.activeSongIds);
  const selected = new Set(input.selectedOfferIds ?? []);
  const phaseUnlock = Math.min(input.concertIndex, 3) as UnlockPhase;
  const nextPhaseUnlock = Math.min(input.concertIndex + 1, 3) as UnlockPhase;
  const laterPhaseUnlock = Math.min(input.concertIndex + 2, 3) as UnlockPhase;

  const effectiveGenerationProfile: GenerationProfile =
    input.solverMode === "express" ? "speed-wit" : input.generationProfile;
  const effectiveRiskProfile: RiskProfile =
    input.solverMode === "express" ? "standard" : input.riskProfile;
  const activeFriendshipBonus = input.catalog
    .filter(
      (song) => active.has(song.id) && song.liveBonusType === "friendship",
    )
    .reduce((sum, song) => sum + song.liveBonusValue, 0);
  const friendshipSongMultiplier = 1 + activeFriendshipBonus / 100;
  const remainingTrainings = estimateRemainingTrainingsByFacility(
    effectiveGenerationProfile,
    input.concertIndex,
  );

  const toSongTarget = (song: Song): SongTarget =>
    withStructuralTrainingValue(
      {
        id: song.id,
        name: song.name,
        cost: song.cost,
        // Keep the raw label. P2 cannot be recomputed from the legacy scalar.
        practiceBonus: song.practiceBonus,
        ...contextualSongValues({
          practiceBonus: song.practiceBonus,
          liveBonusType: song.liveBonusType,
          liveBonusValue: song.liveBonusValue,
          declaredPriority: song.priority,
        }),
      },
      remainingTrainings,
      friendshipSongMultiplier,
    );

  const currentSongs = input.catalog
    .filter((song) => song.unlockPhase <= phaseUnlock && !owned.has(song.id))
    .map(toSongTarget);
  const futureSongs = input.catalog
    .filter(
      (song) =>
        song.unlockPhase > phaseUnlock &&
        song.unlockPhase <= nextPhaseUnlock &&
        !owned.has(song.id),
    )
    .map(toSongTarget);
  const laterSongs =
    input.concertIndex === 1
      ? input.catalog
          .filter(
            (song) =>
              song.unlockPhase > nextPhaseUnlock &&
              song.unlockPhase <= laterPhaseUnlock &&
              !owned.has(song.id),
          )
          .map(toSongTarget)
      : [];
  const allReserveSongs = [...currentSongs, ...futureSongs, ...laterSongs];
  const strategicPlan = deriveStrategicPlan({
    concertIndex: input.concertIndex,
    timingMode: input.timingMode,
    remainingSongs: allReserveSongs,
    songsThisSection: input.songsThisSection,
    abandonedChaseTargetIds: input.abandonedChaseTargetIds ?? [],
  });
  const protectedReserveSongs = allReserveSongs.filter((song) =>
    isReserveTarget(song, strategicPlan),
  );
  const visibleSongs = currentSongs.filter((song) => selected.has(song.id));
  const observedOffers = (input.currentTechniqueOffers ?? []).filter(
    (cost) => totalCost(cost) > 0,
  );
  const reserveFeasibility: ReserveFeasibilityContext = {
    period: input.period,
    firstOfferPeriod: input.techniqueOfferPeriod ?? input.period,
    concertIndex: input.concertIndex,
    nextSongCycle: Math.max(1, Math.trunc(input.songCycle)),
    techniquesToNextSong:
      visibleSongs.length > 0
        ? 0
        : Math.max(0, Math.trunc(input.techniquesToNextSong)),
    currentTechniqueOffers:
      visibleSongs.length === 0 && observedOffers.length > 0
        ? observedOffers
        : undefined,
    visibleSongs: visibleSongs.length > 0 ? visibleSongs : undefined,
    // Locked future pools affect soft pressure/value, never the hard reserve.
    reserveSongIds: currentSongs.map((song) => song.id),
  };
  const resourceEconomy = buildSharedResourceEconomy({
    tokens: input.tokens,
    currentSongs,
    futureSongs,
    laterSongs,
    visibleSongIds: visibleSongs.map((song) => song.id),
    plan: strategicPlan,
    concertIndex: input.concertIndex,
    timingMode: input.timingMode,
    requiredPurchases:
      input.timingMode === "deadline-now"
        ? Math.max(0, strategicPlan.manualGaugeTarget - input.songsThisSection)
        : 0,
    generationProfile: effectiveGenerationProfile,
    reserveFeasibility,
  });
  const { tokenPressure, tokenReservePlan } = resourceEconomy;
  const effectiveObjective = resolveEffectiveTechniqueObjective({
    solverMode: input.solverMode,
    analysisObjective: input.analysisObjective,
    plan: strategicPlan,
    songsThisSection: input.songsThisSection,
    totalSongs: input.totalSongs,
    songs: currentSongs,
  });

  return {
    currentSongs,
    futureSongs,
    laterSongs,
    allReserveSongs,
    protectedReserveSongs,
    visibleSongs,
    strategicPlan,
    reserveFeasibility,
    tokenPressure,
    tokenReservePlan,
    resourceDemands: resourceEconomy.demands,
    shadowPrices: resourceEconomy.shadowPrices,
    effectiveGenerationProfile,
    effectiveRiskProfile,
    effectiveObjective,
    friendshipSongMultiplier,
    remainingTrainings,
    firstOfferPeriod: input.techniqueOfferPeriod ?? input.period,
  };
};

export type SolverStateContext = ReturnType<typeof buildSolverStateContext>;
