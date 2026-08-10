import { TOKEN_KEYS } from "@glcp/core";
import { isPlausibleTechniqueCost } from "./technique-cost.ts";
import type {
  RecognitionContext,
  SnapshotPage,
  VisionProfile,
  VisionSnapshot,
} from "./types.ts";

export type SnapshotReliability = {
  complete: boolean;
  reliable: boolean;
  missing: string[];
  uncertain: string[];
};

export const assessSnapshotReliability = ({
  snapshot,
  page,
  profile,
  context,
  availableSongIds,
  expectedSongCount,
}: {
  snapshot: VisionSnapshot;
  page: SnapshotPage;
  profile: VisionProfile;
  context: RecognitionContext;
  availableSongIds: readonly string[];
  expectedSongCount: number;
}): SnapshotReliability => {
  const missing: string[] = [];
  const uncertain: string[] = [];
  const available = new Set(availableSongIds);

  for (const key of TOKEN_KEYS) {
    const reading = snapshot.tokens[key];
    if (reading.value === null) {
      missing.push(`token ${key}`);
    } else if (reading.confidence < profile.ocr.minTokenConfidence) {
      uncertain.push(`token ${key}`);
    }
  }

  if (page === "techniques") {
    for (let slot = 0; slot < 3; slot += 1) {
      const reading = snapshot.techniques.find((item) => item.slot === slot);
      if (!reading || !isPlausibleTechniqueCost(reading.cost, context.period)) {
        missing.push(`technique ${slot + 1}`);
      } else if (
        reading.confidence < profile.ocr.minTechniqueConfidence ||
        reading.warnings.length > 0
      ) {
        uncertain.push(`technique ${slot + 1}`);
      }
    }
  } else {
    const ids: string[] = [];
    for (let slot = 0; slot < expectedSongCount; slot += 1) {
      const reading = snapshot.songs.find((item) => item.slot === slot);
      if (
        !reading?.songId ||
        (available.size > 0 && !available.has(reading.songId))
      ) {
        missing.push(`song ${slot + 1}`);
        continue;
      }
      ids.push(reading.songId);
      if (reading.confidence < profile.ocr.minSongConfidence) {
        uncertain.push(`song ${slot + 1}`);
      }
    }
    if (new Set(ids).size !== ids.length) {
      missing.push("songs distinctes");
    }
  }

  return {
    complete: missing.length === 0,
    reliable: missing.length === 0 && uncertain.length === 0,
    missing,
    uncertain,
  };
};
