import type { Balance } from "../live-model.ts";

export type ConcertIndex = 0 | 1 | 2 | 3 | 4;
export type TimingMode = "section-open" | "deadline-now";
export type CheckpointId = "songs-16" | "songs-18";

export type SongCheckpoint = {
  id: CheckpointId;
  required: number;
  /** Section associated with this planning reference. Raw 16/18 counts are diagnostic; the Grand Live GS gauge is handled separately. */
  concertIndex: ConcertIndex;
};

export type GrandLiveRuleSet = {
  id: string;
  poolSizeBySection: readonly [number, number, number, number, number];
  unlocksBySection: readonly [number, number, number, number, number];
  automaticGaugeSongs: readonly [number, number, number, number, number];
  juniorTechniquePrefix: readonly number[];
  regularTechniqueInitial: readonly number[];
  regularTechniqueLoop: readonly number[];
  grandLiveTechniqueLoop: readonly number[];
  initialTokenCap: number;
  promotionalLiveCapGain: number;
  promotionalLiveTokenGain: number;
  promotionalLiveTokenGainConfidence: "unverified" | "verified";
  techniqueCarryoverPricingConfidence: "unverified" | "verified";
  checkpoints: readonly SongCheckpoint[];
};

export const GRAND_LIVE_RULES: GrandLiveRuleSet = {
  id: "global-grand-live-2026-08-r3",
  poolSizeBySection: [8, 11, 15, 21, 21],
  unlocksBySection: [8, 3, 4, 6, 0],
  automaticGaugeSongs: [1, 0, 0, 0, 1],
  // No loop is assumed after this verified prefix.
  juniorTechniquePrefix: [1, 2, 3, 4, 4, 2, 3],
  regularTechniqueInitial: [2, 2, 2],
  regularTechniqueLoop: [4, 5, 2, 2],
  grandLiveTechniqueLoop: [4, 3, 2, 2],
  initialTokenCap: 200,
  promotionalLiveCapGain: 50,
  promotionalLiveTokenGain: 10,
  // Verified in the Global client on a non-scenario-link trainee: the
  // post-concert “New Supporters!” event grants +10 to all five balances,
  // independently of the +50 cap increase.
  promotionalLiveTokenGainConfidence: "verified",
  // Verified in-game on 2026-08-08: a technique page exposed before a
  // Promotional Live keeps the previous section price until its first buy;
  // the refresh after that purchase uses the current section price.
  techniqueCarryoverPricingConfidence: "verified",
  checkpoints: [
    {
      id: "songs-16",
      required: 16,
      concertIndex: 3,
    },
    {
      id: "songs-18",
      required: 18,
      concertIndex: 4,
    },
  ],
};

const asConcertIndex = (value: number): ConcertIndex =>
  Math.max(0, Math.min(4, Math.trunc(value))) as ConcertIndex;

export const poolSizeForSection = (
  concertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number => rules.poolSizeBySection[asConcertIndex(concertIndex)];

export type LessonOfferComposition = {
  songSlots: number;
  techniqueSlots: number;
};

/**
 * A lesson refresh always exposes three cards. If fewer than three songs remain
 * in the current pool, every remaining song is guaranteed and the empty slots
 * are ordinary techniques.
 */
export const lessonOfferComposition = (
  remainingSongCount: number,
): LessonOfferComposition => {
  const songSlots = Math.min(3, Math.max(0, Math.trunc(remainingSongCount)));
  return { songSlots, techniqueSlots: 3 - songSlots };
};

/**
 * Training turns that remain after the Grand Live, before the career ends.
 * Token income over these turns is negligible, so the post-Grand-Live phase is
 * a bounded liquidation of the stock already held rather than a new economy.
 */
export const POST_GRAND_LIVE_TRAINING_TURNS = 3;

export type PostGrandLiveEntryBlockReason =
  "not-at-grand-live" | "already-post-grand-live";

/**
 * The post-Grand-Live phase is entered explicitly, like the ordinary concert
 * transition, rather than inferred from an empty song offer: a carried song
 * page survives the Grand Live and would otherwise look like an ongoing
 * section.
 */
export const postGrandLiveEntryBlockReason = (input: {
  concertIndex: number;
  concertCount: number;
  postGrandLive: boolean;
}): PostGrandLiveEntryBlockReason | null => {
  if (input.postGrandLive) return "already-post-grand-live";
  if (input.concertIndex < input.concertCount - 1) return "not-at-grand-live";
  return null;
};

/**
 * After the Grand Live no new song page is offered. A page carried across the
 * Grand Live keeps its songs, so the offer is only technique-only once that
 * page is gone.
 */
export const postGrandLiveOfferSongPool = (
  carriedPageSongCount: number,
): number => Math.max(0, Math.trunc(carriedPageSongCount));

export const automaticGaugeSongsForConcert = (
  concertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number => rules.automaticGaugeSongs[asConcertIndex(concertIndex)];

export const manualSongsForGreatSuccess = (
  concertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number => 3 - automaticGaugeSongsForConcert(concertIndex, rules);

export const gaugeSongCount = (
  concertIndex: number,
  manualSongs: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number =>
  Math.max(0, manualSongs) + automaticGaugeSongsForConcert(concertIndex, rules);

export const isGreatSuccess = (
  concertIndex: number,
  manualSongs: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): boolean => gaugeSongCount(concertIndex, manualSongs, rules) >= 3;

export const tokenCapForSection = (
  concertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number =>
  rules.initialTokenCap +
  asConcertIndex(concertIndex) * rules.promotionalLiveCapGain;

/**
 * Applies the verified Global transition after C1-C4: the next section cap is
 * raised by 50, then the “New Supporters!” event credits +10 to each token,
 * clamped against that new cap. There is no post-Grand-Live transition because
 * no lesson section follows it.
 */
export const applyPromotionalLiveTransition = (
  tokens: Balance,
  completedConcertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): Balance => {
  if (completedConcertIndex < 0 || completedConcertIndex >= 4) {
    return { ...tokens };
  }
  const nextCap = tokenCapForSection(completedConcertIndex + 1, rules);
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      key,
      Math.min(nextCap, value + rules.promotionalLiveTokenGain),
    ]),
  ) as Balance;
};

/** Returns null when the measured rules intentionally do not define a cycle. */
export const techniquesForSongCycle = (
  concertIndex: number,
  songCycle: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): number | null => {
  const cycle = Math.max(1, Math.trunc(songCycle));
  const section = asConcertIndex(concertIndex);
  if (section === 0) {
    return rules.juniorTechniquePrefix[cycle - 1] ?? null;
  }

  if (cycle <= rules.regularTechniqueInitial.length) {
    return rules.regularTechniqueInitial[cycle - 1];
  }
  const loop =
    section === 4 ? rules.grandLiveTechniqueLoop : rules.regularTechniqueLoop;
  return loop[(cycle - rules.regularTechniqueInitial.length - 1) % loop.length];
};

export const checkpointForSection = (
  concertIndex: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): SongCheckpoint | null =>
  rules.checkpoints.find(
    (checkpoint) => checkpoint.concertIndex === asConcertIndex(concertIndex),
  ) ?? null;

export type ConcertTransitionBlockReason =
  "last-concert" | "incomplete-song-offer";

/**
 * Mechanical tracker guard only. Strategic checkpoints are deliberately absent:
 * recording a concert that already happened in-game must never be blocked by a
 * missed 16/18 pacing objective.
 */
export const concertTransitionBlockReason = (input: {
  concertIndex: number;
  concertCount: number;
  songSelectionReady: boolean;
  songOfferComplete: boolean;
}): ConcertTransitionBlockReason | null => {
  if (input.concertIndex >= input.concertCount - 1) return "last-concert";
  if (input.songSelectionReady && !input.songOfferComplete) {
    return "incomplete-song-offer";
  }
  return null;
};

export type CheckpointStatus =
  | "secured-now"
  | "closable-before-deadline"
  | "reachable-with-future-supply"
  | "indeterminate"
  | "impossible";

export const finalGateSecured = (
  totalSongs: number,
  grandLiveManualSongs: number,
  rules: GrandLiveRuleSet = GRAND_LIVE_RULES,
): boolean =>
  totalSongs >= 18 && isGreatSuccess(4, grandLiveManualSongs, rules);
