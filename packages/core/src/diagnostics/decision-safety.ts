import type { Message } from "../i18n/messages.ts";
import {
  subtractCost,
  type AnalysisResult,
  type Balance,
  type SongTarget,
} from "../live-model.ts";
import type { StrategicPlan } from "../planner/strategic-plan.ts";
import type {
  SongPolicyEvaluation,
  SongPolicyResult,
} from "../solver/song-policy.ts";
import {
  compareSameTokenSupportDominance,
  immediateBlockingTargets,
} from "../solver/technique-dp.ts";
import { riskThreshold } from "../solver/value.ts";

export type DecisionSafety =
  "recommended" | "safe-alternative" | "secondary" | "hard-blocking";

export type BlockingProof = {
  label: Message;
  detail: Message;
  proof: "deterministic" | "exact-transition";
  targetId?: string;
};

export type TechniqueChoiceAssessment = {
  index: number;
  safety: DecisionSafety;
  blocking: BlockingProof | null;
  /** Non-blocking warning: the choice remains usable but is dominated for
   * lesson-token progression unless its intrinsic technique effect justifies it. */
  advisory: Message | null;
  probabilityDelta: number;
};

export type SongChoiceAssessment = {
  songId: string;
  safety: DecisionSafety;
  blocking: BlockingProof | null;
  policyId: string | null;
};

type TechniqueCandidate = {
  index: number;
  cost: Balance;
  result: AnalysisResult;
};

const techniqueBlockingProof = ({
  tokens,
  candidate,
  songs,
  plan,
}: {
  tokens: Balance;
  candidate: TechniqueCandidate;
  songs: SongTarget[];
  plan: StrategicPlan;
}): BlockingProof | null => {
  const after = subtractCost(tokens, candidate.cost);
  if (
    !after ||
    !candidate.result.valid ||
    candidate.result.recommendation === "invalid"
  ) {
    return {
      label: { code: "blocking.techniqueUnaffordable.label" },
      detail: { code: "blocking.techniqueUnaffordable.detail" },
      proof: "deterministic",
    };
  }

  const blockedTargets = immediateBlockingTargets({
    tokens,
    cost: candidate.cost,
    songs,
    plan,
  });
  if (blockedTargets.length > 0) {
    const names = blockedTargets.map((song) => song.name).slice(0, 2);
    return {
      label: { code: "blocking.blocksPriorityTarget.label" },
      detail: { code: "blocking.blocksPriorityTarget.detail", names },
      proof: "deterministic",
      targetId: blockedTargets[0]?.id,
    };
  }

  return null;
};

export const assessTechniqueChoices = ({
  tokens,
  candidates,
  songs,
  plan,
  riskProfile,
  recommendedIndex,
}: {
  tokens: Balance;
  candidates: TechniqueCandidate[];
  songs: SongTarget[];
  plan: StrategicPlan;
  riskProfile: "safe" | "standard" | "greedy";
  recommendedIndex: number | null;
}): TechniqueChoiceAssessment[] => {
  const recommended =
    candidates.find((candidate) => candidate.index === recommendedIndex) ??
    null;
  const threshold = riskThreshold(riskProfile);

  return candidates.map((candidate) => {
    const blocking = techniqueBlockingProof({
      tokens,
      candidate,
      songs,
      plan,
    });
    if (blocking) {
      return {
        index: candidate.index,
        safety: "hard-blocking" as const,
        blocking,
        advisory: null,
        probabilityDelta: recommended
          ? candidate.result.goalProbability -
            recommended.result.goalProbability
          : 0,
      };
    }
    if (candidate.index === recommendedIndex) {
      return {
        index: candidate.index,
        safety: "recommended" as const,
        blocking: null,
        advisory: null,
        probabilityDelta: 0,
      };
    }

    const cheaperSameSupport = candidates.find(
      (other) =>
        other.index !== candidate.index &&
        other.result.valid &&
        other.result.recommendation !== "invalid" &&
        compareSameTokenSupportDominance(other.cost, candidate.cost) < 0,
    );
    const progressionDominated = Boolean(cheaperSameSupport);
    const advisory: Message | null = cheaperSameSupport
      ? {
          code: "advisory.cheaperSameSupport",
          option: cheaperSameSupport.index + 1,
        }
      : null;

    const probabilityDelta = recommended
      ? candidate.result.goalProbability - recommended.result.goalProbability
      : 0;
    const sameRiskClass =
      candidate.result.reachProbability >= threshold &&
      (recommended?.result.reachProbability ?? 0) >= threshold;
    const sameObjectiveClass =
      !recommended ||
      candidate.result.goalProbability >=
        Math.max(0, recommended.result.goalProbability - 0.05);
    const safe =
      candidate.result.recommendation !== "invalid" &&
      candidate.result.recommendation !== "stop" &&
      sameRiskClass &&
      sameObjectiveClass;

    return {
      index: candidate.index,
      safety: progressionDominated
        ? "secondary"
        : safe
          ? "safe-alternative"
          : "secondary",
      blocking: null,
      advisory,
      probabilityDelta,
    };
  });
};

const bestBuyPolicy = (
  policies: SongPolicyEvaluation[],
  songId: string,
): SongPolicyEvaluation | null =>
  policies
    .filter(
      (policy) => policy.songId === songId && policy.action.startsWith("buy-"),
    )
    .sort((left, right) => right.score - left.score)[0] ?? null;

const songBlockingProof = ({
  policy,
  recommended,
}: {
  policy: SongPolicyEvaluation | null;
  recommended: SongPolicyEvaluation | null;
}): BlockingProof | null => {
  if (!policy || policy.affordable === false) {
    return {
      label: { code: "blocking.songUnaffordable.label" },
      detail: { code: "blocking.songUnaffordable.detail" },
      proof: "deterministic",
    };
  }
  // An affordable buy may still be invalid because the strategic controller
  // says HOLD (notably late Grand Live fillers). That is a secondary choice,
  // never deterministic proof that the wallet cannot pay it.
  if (!policy.valid) return null;
  if (!recommended) return null;
  // Rouge signifie « impossible », pas simplement « moins bon ». Une action qui
  // transforme un checkpoint sécurisé en checkpoint encore faisable reste un
  // second choix, jamais un blocage immédiat.
  if (policy.finalGateStatus === "failed") {
    return {
      label: { code: "blocking.closesFinalGate.label" },
      detail: { code: "blocking.closesFinalGate.detail" },
      proof: "exact-transition",
    };
  }
  // checkpoint18Status is telemetry only in v0.23. It must never turn a song
  // red or veto an otherwise valid choice.
  return null;
};

export const assessSongChoices = ({
  policyResult,
  visibleSongIds,
  recommendedSongId,
  recommendedPolicyId,
}: {
  policyResult: SongPolicyResult | null;
  visibleSongIds: string[];
  recommendedSongId: string | null;
  recommendedPolicyId?: string | null;
}): SongChoiceAssessment[] => {
  if (!policyResult) return [];
  const recommended =
    policyResult.policies.find((policy) => policy.id === recommendedPolicyId) ??
    policyResult.recommended;
  return visibleSongIds.map((songId) => {
    const policy = bestBuyPolicy(policyResult.policies, songId);
    const blocking = songBlockingProof({ policy, recommended });
    if (blocking) {
      return {
        songId,
        safety: "hard-blocking" as const,
        blocking,
        policyId: policy?.id ?? null,
      };
    }
    if (songId === recommendedSongId) {
      return {
        songId,
        safety: "recommended" as const,
        blocking: null,
        policyId: policy?.id ?? null,
      };
    }
    const safe = Boolean(
      policy &&
      recommended &&
      policy.decisionVector.hard >= recommended.decisionVector.hard &&
      policy.decisionVector.riskAdmissible >=
        recommended.decisionVector.riskAdmissible &&
      policy.decisionVector.structural >=
        Math.max(0, recommended.decisionVector.structural - 1),
    );
    return {
      songId,
      safety: safe ? "safe-alternative" : "secondary",
      blocking: null,
      policyId: policy?.id ?? null,
    };
  });
};
