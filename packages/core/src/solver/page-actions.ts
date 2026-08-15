import { canAfford, type Balance, type SongTarget } from "../live-model.ts";
import type { TimingMode } from "../domain/live-rules.ts";

/**
 * Physical actions available while a song page is exposed.
 *
 * This type deliberately contains no policy/risk judgement. It is the shared
 * action space used by the song policy and terminal rollouts; strategic
 * admission happens after enumeration.
 */
export type PageAction =
  | { kind: "buy-stop"; songId: string }
  | { kind: "buy-continue"; songId: string }
  | { kind: "carry-current-page"; songIds: readonly string[] }
  | { kind: "stop-no-page" };

export const canonicalPageSongIds = (
  visibleSongs: readonly Pick<SongTarget, "id">[],
): string[] =>
  [...new Set(visibleSongs.map((song) => song.id))].sort((left, right) =>
    left.localeCompare(right),
  );

export const pageActionKey = (action: PageAction): string => {
  switch (action.kind) {
    case "buy-stop":
    case "buy-continue":
      return `${action.kind}:${action.songId}`;
    case "carry-current-page":
      return `${action.kind}:${[...action.songIds].sort().join(",")}`;
    case "stop-no-page":
      return action.kind;
  }
};

/**
 * Enumerates only mechanically executable actions. In particular:
 * - every visible + affordable song always has a BUY_STOP action;
 * - carrying preserves the complete exposed page and never pre-buys a song;
 * - STOP_NO_PAGE is absent while a page is exposed.
 */
export const enumeratePageActions = ({
  tokens,
  visibleSongs,
  timingMode,
  concertIndex,
}: {
  tokens: Balance;
  visibleSongs: readonly SongTarget[];
  timingMode: TimingMode;
  concertIndex: number;
}): PageAction[] => {
  if (visibleSongs.length === 0) return [{ kind: "stop-no-page" }];

  const actions: PageAction[] = [];
  for (const song of [...visibleSongs].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (!canAfford(tokens, song.cost)) continue;
    actions.push({ kind: "buy-stop", songId: song.id });
    actions.push({ kind: "buy-continue", songId: song.id });
  }

  if (timingMode === "deadline-now" && concertIndex < 4) {
    actions.push({
      kind: "carry-current-page",
      songIds: canonicalPageSongIds(visibleSongs),
    });
  }

  return actions;
};
