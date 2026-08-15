export type SanitizedSongState = {
  ownedSongIds: string[];
  activeSongIds: string[];
  visibleSongIds: string[];
  carryoverSongIds: string[] | null;
};

const uniqueValid = (
  values: unknown,
  validIds: ReadonlySet<string>,
): string[] => {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !validIds.has(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
};

/**
 * Restores only semantically valid relationships between persisted song sets.
 * Active bonuses must be owned. Visible offers remain the current page even
 * while a carry is active; carryover stores the complete exposed page. The
 * field name remains v3-compatible while its PR-1 semantics become page-level.
 */
export const sanitizePersistedSongState = ({
  validIds,
  ownedSongIds,
  activeSongIds,
  visibleSongIds,
  carryoverSongIds,
}: {
  validIds: ReadonlySet<string>;
  ownedSongIds: unknown;
  activeSongIds: unknown;
  visibleSongIds: unknown;
  carryoverSongIds: unknown;
}): SanitizedSongState => {
  const owned = uniqueValid(ownedSongIds, validIds);
  const ownedSet = new Set(owned);
  const active = uniqueValid(activeSongIds, validIds).filter((id) =>
    ownedSet.has(id),
  );
  const carried = Array.isArray(carryoverSongIds)
    ? uniqueValid(carryoverSongIds, validIds)
        .filter((id) => !ownedSet.has(id))
        .slice(0, 3)
    : null;
  const normalizedCarry = carried && carried.length > 0 ? carried : null;
  const visible = uniqueValid(visibleSongIds, validIds)
    .filter((id) => !ownedSet.has(id))
    .slice(0, 3);

  return {
    ownedSongIds: owned,
    activeSongIds: active,
    visibleSongIds: visible,
    carryoverSongIds: normalizedCarry,
  };
};
