import type { SongPolicyEvaluation } from "../solver/song-policy.ts";
import { compareDecisionVectors } from "../solver/value.ts";

export const selectCarryoverPolicy = ({
  policies,
  displayed,
  visibleSongIds,
}: {
  policies: readonly SongPolicyEvaluation[];
  displayed: SongPolicyEvaluation | null;
  visibleSongIds: ReadonlySet<string>;
}): SongPolicyEvaluation | null => {
  const isUsableCarry = (
    policy: SongPolicyEvaluation | null,
  ): policy is SongPolicyEvaluation =>
    Boolean(
      policy &&
      policy.action === "carry-page" &&
      policy.valid &&
      policy.songId &&
      visibleSongIds.has(policy.songId),
    );

  if (isUsableCarry(displayed)) return displayed;

  return (
    policies
      .filter(isUsableCarry)
      .sort((left, right) =>
        compareDecisionVectors(right.decisionVector, left.decisionVector),
      )[0] ?? null
  );
};
