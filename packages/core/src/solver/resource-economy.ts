import {
  activationMoment,
  atLeastOneDrawProbability,
  calculateShadowPrices,
  calculateTokenPressure,
  calculateTokenReservePlan,
  type Balance,
  type GenerationProfile,
  type ResourceDemand,
  type SongTarget,
  type TokenPressure,
  type TokenReservePlan,
  type TokenShadowPrice,
  type ReserveFeasibilityContext,
} from "../live-model.ts";
import type { TimingMode } from "../domain/live-rules.ts";
import {
  isChaseTarget,
  isReserveTarget,
  isVisibleOptionalTarget,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";

export type ReachableDemandInput = {
  currentSongs: readonly SongTarget[];
  futureSongs?: readonly SongTarget[];
  laterSongs?: readonly SongTarget[];
  visibleSongIds?: readonly string[];
  plan: StrategicPlan;
  concertIndex: number;
  timingMode?: TimingMode;
  /** Number of additional song purchases the active policy must still secure. */
  requiredPurchases?: number;
};

const sourceRank: Record<ResourceDemand["source"], number> = {
  "reachable-policy-action": 0,
  terminal: 1,
  "required-song": 2,
  hunt: 3,
};

const boundedConcert = (value: number): number =>
  Math.max(0, Math.min(4, Math.trunc(value)));

const pageAppearance = (poolSize: number): number =>
  poolSize <= 0 ? 0 : atLeastOneDrawProbability(poolSize, 1);

const chooseDemandSource = ({
  song,
  plan,
  requiredPurchases,
}: {
  song: SongTarget;
  plan: StrategicPlan;
  requiredPurchases: number;
}): ResourceDemand["source"] | null => {
  if (plan.mode === "convert") return "terminal";
  if (isChaseTarget(song, plan)) {
    if (plan.mode === "hunt") return "hunt";
    if (requiredPurchases > 0) return "required-song";
    return "reachable-policy-action";
  }
  if (isReserveTarget(song, plan) || isVisibleOptionalTarget(song, plan)) {
    return "reachable-policy-action";
  }
  return null;
};

/**
 * PR-5 policy-facing demand derivation. This is intentionally downstream of
 * StrategicPlan: it describes vectors the current policy can actually consume,
 * including required filler conversions, rather than reinterpreting song roles
 * independently in each decision maker.
 */
export const deriveReachableDemands = ({
  currentSongs,
  futureSongs = [],
  laterSongs = [],
  visibleSongIds = [],
  plan,
  concertIndex,
  requiredPurchases = 0,
}: ReachableDemandInput): ResourceDemand[] => {
  const visible = new Set(visibleSongIds);
  const currentAppearance = pageAppearance(currentSongs.length);
  const phases: Array<{
    songs: readonly SongTarget[];
    offset: number;
    reachDiscount: number;
  }> = [
    { songs: currentSongs, offset: 0, reachDiscount: 1 },
    { songs: futureSongs, offset: 1, reachDiscount: 0.7 },
    { songs: laterSongs, offset: 2, reachDiscount: 0.45 },
  ];
  const bySong = new Map<string, ResourceDemand>();

  for (const phase of phases) {
    const phaseAppearance = pageAppearance(phase.songs.length);
    const phaseDemands: ResourceDemand[] = [];
    for (const song of phase.songs) {
      const isVisible = phase.offset === 0 && visible.has(song.id);
      const source = chooseDemandSource({
        song,
        plan,
        requiredPurchases,
      });
      if (!source) continue;

      const baseProbability = isVisible
        ? 1
        : phase.offset === 0
          ? currentAppearance
          : phaseAppearance * phase.reachDiscount;
      phaseDemands.push({
        source,
        songId: song.id,
        earliestUse: activationMoment({
          concertIndex: boundedConcert(concertIndex + phase.offset),
          beforeLive: true,
        }),
        probability: Math.max(0, Math.min(1, baseProbability)),
        cost: song.cost,
      });
    }

    // A checkpoint that needs one more song describes an OR-choice between
    // eligible songs, not an AND-demand for every visible/hidden alternative.
    // Keep the aggregate probability mass of `required-song` vectors bounded
    // by the number of purchases still required. Other target classes may be
    // accumulated independently and therefore keep their individual reach law.
    const required = phaseDemands.filter(
      (demand) => demand.source === "required-song",
    );
    const requiredMass = required.reduce(
      (sum, demand) => sum + demand.probability,
      0,
    );
    const requiredScale =
      requiredMass > 0 && requiredPurchases > 0
        ? Math.min(1, requiredPurchases / requiredMass)
        : 1;

    for (const rawDemand of phaseDemands) {
      const demand =
        rawDemand.source === "required-song"
          ? {
              ...rawDemand,
              probability: rawDemand.probability * requiredScale,
            }
          : rawDemand;
      const previous = bySong.get(demand.songId ?? "");
      if (
        !previous ||
        sourceRank[demand.source] > sourceRank[previous.source] ||
        (sourceRank[demand.source] === sourceRank[previous.source] &&
          demand.probability > previous.probability)
      ) {
        bySong.set(demand.songId ?? "", demand);
      }
    }
  }

  return [...bySong.values()].sort(
    (left, right) =>
      sourceRank[right.source] - sourceRank[left.source] ||
      right.probability - left.probability ||
      (left.songId ?? "").localeCompare(right.songId ?? ""),
  );
};

export type SharedResourceEconomyInput = ReachableDemandInput & {
  tokens: Balance;
  generationProfile?: GenerationProfile;
  reserveFeasibility?: ReserveFeasibilityContext;
};

export type SharedResourceEconomy = {
  demands: ResourceDemand[];
  shadowPrices: TokenShadowPrice[];
  tokenPressure: TokenPressure[];
  tokenReservePlan: TokenReservePlan;
};

/** One contract used by UI context, song policy and technique simulation. */
export const buildSharedResourceEconomy = (
  input: SharedResourceEconomyInput,
): SharedResourceEconomy => {
  const generationProfile = input.generationProfile ?? "speed-wit";
  const demands = deriveReachableDemands(input);
  const shadowPrices = calculateShadowPrices(
    input.tokens,
    demands,
    generationProfile,
  );
  const allSongs = [
    ...input.currentSongs,
    ...(input.futureSongs ?? []),
    ...(input.laterSongs ?? []),
  ];
  const tokenPressure = calculateTokenPressure(
    input.tokens,
    allSongs,
    generationProfile,
    input.plan,
    input.reserveFeasibility,
    demands,
  );
  const tokenReservePlan = calculateTokenReservePlan(allSongs, input.plan, {
    tokens: input.tokens,
    feasibility: input.reserveFeasibility,
    shadowByKey: Object.fromEntries(
      shadowPrices.map((price) => [price.key, price.shadowValue]),
    ),
  });
  return { demands, shadowPrices, tokenPressure, tokenReservePlan };
};
