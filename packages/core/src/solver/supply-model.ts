import type { CheckpointStatus, TimingMode } from "../domain/live-rules.ts";

export type SupplyAssessment = {
  status: CheckpointStatus;
  confidence: "verified" | "heuristic";
};

export const assessCheckpointSupply = ({
  totalSongs,
  requiredSongs,
  currentStockCapacity,
  currentStockCapacityExact = true,
  timingMode,
}: {
  totalSongs: number;
  requiredSongs: number;
  currentStockCapacity: number;
  currentStockCapacityExact?: boolean;
  timingMode: TimingMode;
}): SupplyAssessment => {
  if (totalSongs >= requiredSongs) {
    return {
      status: "secured-now",
      confidence: "verified",
    };
  }
  if (totalSongs + currentStockCapacity >= requiredSongs) {
    return {
      status: "closable-before-deadline",
      // La capacité peut être un minorant tronqué : s'il suffit déjà,
      // la faisabilité avant deadline est néanmoins prouvée.
      confidence: "verified",
    };
  }
  if (!currentStockCapacityExact) {
    return {
      status: "indeterminate",
      confidence: "heuristic",
    };
  }
  if (timingMode === "section-open") {
    return {
      status: "reachable-with-future-supply",
      confidence: "heuristic",
    };
  }
  return {
    status: "impossible",
    confidence: "verified",
  };
};
