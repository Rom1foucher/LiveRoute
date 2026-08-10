import type { Period } from "../live-model.ts";

export type TechniqueCarryoverContext = {
  currentPeriod: Period;
  currentOfferPeriod?: Period | null;
  techniquePageVisible: boolean;
  songPageCarried: boolean;
};

/**
 * Lessons already displayed do not expire at a Live. A technique page therefore
 * keeps the period/prices with which it was generated until one card is bought.
 * A carried song page is a different mechanic: after the song is bought, the
 * next technique offer is generated in the new concert period.
 */
export const techniqueOfferPeriodAfterConcert = ({
  currentPeriod,
  currentOfferPeriod,
  techniquePageVisible,
  songPageCarried,
}: TechniqueCarryoverContext): Period | null => {
  if (!techniquePageVisible || songPageCarried) return null;
  return currentOfferPeriod ?? currentPeriod;
};

/** A purchase refreshes the technique shop, so subsequent cards use the current period. */
export const techniqueOfferPeriodAfterTechniquePurchase = (): null => null;

/** Pricing law used by quick entry, OCR validation and the first simulation. */
export const resolveTechniqueInputPeriod = (
  currentPeriod: Period,
  currentOfferPeriod?: Period | null,
): Period => currentOfferPeriod ?? currentPeriod;
