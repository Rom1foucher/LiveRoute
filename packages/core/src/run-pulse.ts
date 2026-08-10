import { gaugeSongCount } from "./domain/live-rules.ts";

export type PulseOfferEvent = {
  id: string;
  type: "song-offer";
  concertIndex: number;
  songCycle: number;
  offerIds: string[];
  percentile: number;
  bestSongName: string;
};

export type PulsePurchaseEvent = {
  id: string;
  type: "song-purchase";
  concertIndex: number;
  songCycle: number;
  songId: string;
  songName: string;
  valueIndex: number;
  timing: "early" | "normal" | "late" | "carryover";
  isSkillPointSong: boolean;
};

export type PulseConcertEvent = {
  id: string;
  type: "concert";
  concertIndex: number;
  songsBought: number;
  greatSuccess: boolean;
};

export type RunPulseEvent =
  PulseOfferEvent | PulsePurchaseEvent | PulseConcertEvent;

export type PulseSongValue = {
  id: string;
  name: string;
  value: number;
};

export type RunPulseSummary = {
  luck: number;
  value: number;
  projection: number;
  confidence: "low" | "medium" | "high";
  confidenceScore: number;
  observedOffers: number;
  trackedPurchases: number;
  completedConcerts: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const calculateGaugeProgress = (
  concertIndex: number,
  manualSongs: number,
): number => Math.min(1, gaugeSongCount(concertIndex, manualSongs) / 3);

const offerValue = (songs: PulseSongValue[]): number => {
  const sorted = [...songs].sort((a, b) => b.value - a.value);
  return (
    (sorted[0]?.value ?? 0) +
    (sorted[1]?.value ?? 0) * 0.3 +
    (sorted[2]?.value ?? 0) * 0.1
  );
};

const combinations = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [[]];
  if (size > items.length) return [];
  const result: T[][] = [];
  const visit = (start: number, picked: T[]) => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (
      let index = start;
      index <= items.length - (size - picked.length);
      index += 1
    ) {
      picked.push(items[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
};

/**
 * Exact mid-rank percentile of an observed three-song offer among every
 * possible draw from the same pool. A value of 0.8 means that the offer was
 * better than roughly 80% of the possible offers.
 */
export const calculateOfferPercentile = (
  pool: PulseSongValue[],
  offerIds: string[],
): number => {
  const drawSize = Math.min(3, pool.length);
  if (drawSize === 0) return 0.5;
  const offerSet = new Set(offerIds);
  const observed = pool.filter((song) => offerSet.has(song.id));
  if (observed.length !== drawSize) return 0.5;

  const observedValue = offerValue(observed);
  const possibleValues = combinations(pool, drawSize).map(offerValue);
  const epsilon = 1e-9;
  const lower = possibleValues.filter(
    (value) => value < observedValue - epsilon,
  ).length;
  const equal = possibleValues.filter(
    (value) => Math.abs(value - observedValue) <= epsilon,
  ).length;
  return clamp01((lower + equal * 0.5) / possibleValues.length);
};

export const calculateRunPulse = (
  events: RunPulseEvent[],
  state: {
    startedAtConcert: number | null;
  },
): RunPulseSummary => {
  const offers = events.filter(
    (event): event is PulseOfferEvent => event.type === "song-offer",
  );
  const purchases = events.filter(
    (event): event is PulsePurchaseEvent => event.type === "song-purchase",
  );
  const concerts = events.filter(
    (event): event is PulseConcertEvent => event.type === "concert",
  );

  const offerReliability = offers.length / (offers.length + 3);
  const rawLuck =
    offers.length === 0
      ? 0.5
      : offers.reduce((sum, event) => sum + event.percentile, 0) /
        offers.length;
  const luck = 50 + (rawLuck * 100 - 50) * offerReliability;

  const purchaseWeight = purchases.length;
  const concertWeight = concerts.length * 1.2;
  const purchaseValue = purchases.reduce(
    (sum, event) => sum + event.valueIndex,
    0,
  );
  const concertValue = concerts.reduce(
    (sum, event) =>
      sum +
      (event.greatSuccess
        ? 1
        : calculateGaugeProgress(event.concertIndex, event.songsBought) * 0.65),
    0,
  );
  const totalValueWeight = purchaseWeight + concertWeight;
  const rawValue =
    totalValueWeight === 0
      ? 0.5
      : (purchaseValue + concertValue * 1.2) / totalValueWeight;
  const valueReliability = totalValueWeight / Math.max(1, totalValueWeight + 2);
  const value = 50 + (rawValue * 100 - 50) * valueReliability;

  // Run Pulse is deliberately descriptive, not a second route planner. The
  // previous fixed pace targets [5, 9, 12, 15, 18] penalised valid routes such
  // as 4/2/3/7 and contradicted the solver's no-fixed-itinerary contract.
  const projection = value * 0.6 + luck * 0.4;

  const startedAtBeginning = state.startedAtConcert === 0;
  const confidenceScore = clamp01(
    (offers.length / 5) * 0.55 +
      (concerts.length / 3) * 0.25 +
      (startedAtBeginning ? 0.2 : 0),
  );
  const confidence =
    confidenceScore >= 0.72
      ? "high"
      : confidenceScore >= 0.38
        ? "medium"
        : "low";

  return {
    luck: Math.round(luck),
    value: Math.round(value),
    projection: Math.round(projection),
    confidence,
    confidenceScore,
    observedOffers: offers.length,
    trackedPurchases: purchases.length,
    completedConcerts: concerts.length,
  };
};
