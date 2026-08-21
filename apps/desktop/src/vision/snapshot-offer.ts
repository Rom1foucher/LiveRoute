import type { RecognitionContext } from "./types.ts";

/**
 * The shared shell knows the actual composition of the exposed page. This is
 * especially important for a short page carried into a section that unlocks
 * more songs: the full available pool must not inflate the carried page back
 * to three cards.
 */
export const expectedSongCountForSnapshot = (
  context: RecognitionContext,
): number =>
  Math.min(
    3,
    Math.max(0, Math.trunc(context.expectedSongCount ?? context.songs.length)),
  );

export const songSlotsForSnapshot = (expectedSongCount: number): number[] =>
  [0, 1, 2].slice(0, Math.min(3, Math.max(0, expectedSongCount)));
