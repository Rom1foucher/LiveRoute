import type { AnalysisResult } from "../live-model.ts";
import type { TechniqueChoiceAssessment } from "../diagnostics/decision-safety.ts";
import type { SongPolicyEvaluation, SongPolicyResult } from "./song-policy.ts";
import { compareDecisionVectors } from "./value.ts";

/**
 * Selects the best explicit continuation hidden by the normal song policy.
 * The override never relaxes a real hard constraint. Raw 16/18 counters are
 * diagnostic only and therefore never veto the override.
 */
export const selectForcedSongPolicy = (
  result: SongPolicyResult,
): SongPolicyEvaluation | null => {
  const normal = result.recommended;
  if (normal?.action === "buy-continue") return null;

  return (
    [...result.policies]
      .filter(
        (candidate) =>
          candidate.action === "buy-continue" &&
          candidate.overrideEligible &&
          candidate.decisionVector.hard >= (normal?.decisionVector.hard ?? 0) &&
          candidate.finalGateStatus !== "failed",
      )
      .sort((left, right) =>
        compareDecisionVectors(right.decisionVector, left.decisionVector),
      )[0] ?? null
  );
};

type TechniqueOverrideCandidate = {
  index: number | null;
  result: Pick<AnalysisResult, "valid" | "recommendation">;
};

type IndexedTechniqueOverrideCandidate<Candidate> = Candidate & {
  index: number;
};

/**
 * The technique override is derived from the real candidate safety. It does
 * not depend on an optional overrideEligible flag: purchasable, valid and
 * non-hard-blocking is sufficient, even when the normal verdict is STOP/HOLD.
 */
export const selectForcedTechniqueCandidate = <
  Candidate extends TechniqueOverrideCandidate,
>(
  rankedCandidates: readonly Candidate[],
  assessments: readonly TechniqueChoiceAssessment[],
): IndexedTechniqueOverrideCandidate<Candidate> | null => {
  const selected = rankedCandidates.find((candidate) => {
    if (
      candidate.index === null ||
      !candidate.result.valid ||
      candidate.result.recommendation === "invalid"
    ) {
      return false;
    }
    const assessment = assessments.find(
      (item) => item.index === candidate.index,
    );
    return Boolean(assessment && assessment.safety !== "hard-blocking");
  });
  return selected && selected.index !== null
    ? (selected as IndexedTechniqueOverrideCandidate<Candidate>)
    : null;
};
