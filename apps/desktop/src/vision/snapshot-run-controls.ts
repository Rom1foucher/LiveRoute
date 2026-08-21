export type SnapshotRunProgressionAction =
  "advance-concert" | "enter-post-grand-live" | "post-grand-live-active";

/**
 * Keeps the OCR cockpit on the same explicit run phases as the shared Web UI.
 * The last concert is not an invalid ordinary transition: it exposes the
 * dedicated post-Grand-Live action, then a stable terminal state.
 */
export const snapshotRunProgressionAction = (input: {
  nextConcertLabel: string | null;
  postGrandLive: boolean;
}): SnapshotRunProgressionAction => {
  if (input.postGrandLive) return "post-grand-live-active";
  return input.nextConcertLabel === null
    ? "enter-post-grand-live"
    : "advance-concert";
};
