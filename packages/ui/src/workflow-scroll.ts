import type { WorkflowMode } from "./constants.tsx";

export type WorkflowScrollTarget = "songs" | "techniques" | null;

/**
 * Scroll only when live tracking actually changes page. Hydration, manual
 * reconstruction and repeated renders must never move the user's viewport.
 */
export const workflowScrollTarget = ({
  hydrated,
  workflowMode,
  previousSongSelectionOpen,
  songSelectionOpen,
}: {
  hydrated: boolean;
  workflowMode: WorkflowMode;
  previousSongSelectionOpen: boolean;
  songSelectionOpen: boolean;
}): WorkflowScrollTarget => {
  if (
    !hydrated ||
    workflowMode !== "live" ||
    previousSongSelectionOpen === songSelectionOpen
  ) {
    return null;
  }
  return songSelectionOpen ? "songs" : "techniques";
};
