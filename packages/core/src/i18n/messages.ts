import type { CheckpointId, CheckpointStatus } from "../domain/live-rules.ts";
import type { TokenKey } from "../live-model.ts";
import type { PlanMode, StrategicPlan } from "../planner/strategic-plan.ts";

export type PlanId = StrategicPlan["id"];

export type MissingToken = { key: TokenKey; amount: number };

/**
 * Every human-readable string produced by the solver, planner and diagnostics
 * layers is expressed as one of these codes. Rendering happens exclusively in
 * the i18n layer, never in the decision logic.
 *
 * Two consequences beyond translation:
 *  - the decision log becomes machine-readable (codes diff, prose does not);
 *  - reason equality is decidable, so tests assert on codes, not wording.
 */
export type Message =
  // ── Strategic plan identity ──────────────────────────────────────────────
  | { code: "plan.label"; planId: PlanId; mode: PlanMode }
  | {
      code: "plan.exit";
      planId: PlanId;
      mode: PlanMode;
      manualGaugeTarget: number;
    }
  | { code: "plan.fallback"; planId: PlanId; mode: PlanMode }

  // ── Checkpoint supply ────────────────────────────────────────────────────
  | { code: "supply.status"; status: CheckpointStatus }
  | { code: "checkpoint.name"; checkpointId: CheckpointId }

  // ── Song policy: identity ────────────────────────────────────────────────
  | { code: "policy.noPurchase" }

  // ── Song policy: shared prefix ───────────────────────────────────────────
  | { code: "reason.plan"; planId: PlanId; mode: PlanMode }
  | { code: "reason.structuralTargetVisible" }
  | { code: "reason.chaseTargetVisible" }
  | { code: "reason.opportunityVisible" }
  | { code: "reason.gate18Impossible" }
  | { code: "reason.gate18FutureSupply" }
  | { code: "reason.capacityIndeterminate" }
  | { code: "reason.noAffordablePlanTarget" }

  // ── Song policy: buy branch ──────────────────────────────────────────────
  | { code: "reason.huntAbandonTechniqueCount"; techniques: number }
  | { code: "reason.huntAbandonBelowFloor"; probability: number; floor: number }
  | { code: "reason.huntContinuationRefused"; cause: Message }
  | {
      code: "reason.huntAbandonMarginalValue";
      probability: number;
      netValue: number;
      pages: number;
    }
  | {
      code: "reason.huntContinueMarginalValue";
      probability: number;
      netValue: number;
      pages: number;
    }
  | {
      code: "reason.huntAbandonUnreachable";
      appearanceProbability: number;
      pages: number;
    }
  | {
      code: "reason.huntContinueReachability";
      appearanceProbability: number;
      findAndFundProbability: number;
      zeroIncomeFundabilityProbability: number | null;
      fundingAssessment:
        | "zero-income-fundable"
        | "future-income-required"
        | "unreachable";
      pages: number;
    }
  | { code: "reason.securesGreatSuccess" }
  | {
      code: "reason.nextSectionCheckpoint";
      probability: number;
      checkpointRequired: number | null;
      horizonSections: number;
    }
  | {
      code: "reason.nextSectionValue";
      friendshipBonus: number;
      friendshipTrainingExposure: number;
      spTrainingExposure: number;
      practiceTrainingExposure: number;
      lessonSkillPoints: number;
      horizonSections: number;
    }
  | { code: "reason.boundedLessonSkillPoints"; points: number }
  | { code: "reason.stopNotCommitted" }
  | { code: "reason.reachNextPage"; probability: number }
  | { code: "reason.findAndFundTarget"; probability: number; pages: number }
  | { code: "reason.boundedMonteCarlo" }

  // ── Song policy: carry branch ────────────────────────────────────────────
  | {
      code: "reason.carryNextSectionCheckpoint";
      probability: number;
      horizonSections: number;
    }
  | {
      code: "reason.carryNextSectionValue";
      friendshipBonus: number;
      friendshipTrainingExposure: number;
      spTrainingExposure: number;
      practiceTrainingExposure: number;
      lessonSkillPoints: number;
    }
  | { code: "reason.carriedSongLessonSkillPoints"; points: number }

  // ── Song policy: stop branch ─────────────────────────────────────────────
  | { code: "reason.stopFullStockCarries" }
  | { code: "reason.pacingTargetMissed"; target: number; totalSongs: number }
  | {
      code: "reason.stopNextSectionCheckpoint";
      probability: number;
      checkpointRequired: number | null;
      horizonSections: number;
    }
  | {
      code: "reason.stopNextSectionFriendship";
      friendshipBonus: number;
      friendshipTrainingExposure: number;
      horizonSections: number;
    }
  | { code: "reason.greatSuccessSecured" }
  | { code: "reason.greatSuccessNotSecured" }

  // ── Song policy: Grand Live terminal (v0.23 removed 18 from scoring) ──────
  | { code: "reason.finalGateSecuredCounter"; totalSongs: number }
  | { code: "reason.noPriorityLeftInPool" }
  | { code: "reason.noVisiblePriorityJustifies" }
  | { code: "reason.finalFillerNonStrategic" }
  | { code: "reason.finalGateStillOpen" }

  // ── Song policy: wait branch ─────────────────────────────────────────────
  | {
      code: "reason.waitMissingTokens";
      missing: MissingToken[];
      songName: string;
    }
  | { code: "reason.waitWouldBlockReserve"; names: string[] }
  | { code: "reason.waitSameActivationNextLive" }
  | { code: "reason.waitProtectedReserveDominates" }
  | { code: "reason.huntAbandonNoFiller" }
  | { code: "reason.huntAbandonAtConcert" }
  | { code: "reason.sectionStaysOpen" }

  // ── Exposed carry evaluation ─────────────────────────────────────────────
  | { code: "carry.noSectionAfterGrandLive" }
  | { code: "carry.sectionStillOpen" }
  | { code: "carry.notAffordableEvenWithCredit" }
  | { code: "carry.savesOneInheritedTechnique" }
  | { code: "carry.rhythmTargetMissed"; required: number }
  | { code: "carry.creditMakesAffordable" }
  | { code: "carry.creditCommonToBothBranches" }
  | { code: "carry.delaysFriendshipBonus" }
  | { code: "carry.delaysStructuralTarget" }
  | { code: "carry.negligibleStatBonus" }

  // ── Terminal technique screen ────────────────────────────────────────────
  | { code: "terminal.gainFriendship10" }
  | { code: "terminal.gainExpectedFriendship" }
  | { code: "terminal.gainNextTarget" }
  | { code: "terminal.gainStructuralPurchases" }
  | { code: "terminal.gainNone" }
  | { code: "terminal.exposeAndCarry"; gain: Message }
  | { code: "terminal.stopNowPageNotReached" }
  | {
      code: "terminal.stopNowNotSeparated";
      coRecommendationReason:
        | "monte-carlo-not-separated"
        | "calibration-sensitive"
        | "both";
    }
  | { code: "terminal.stopNow"; gain: Message }
  | {
      code: "terminal.exposeAndCarryValue";
      grossValue: number;
      opportunityCost: number;
      riskPenalty: number;
      netValue: number;
      reachLowerBound: number;
      catastropheFloor: number;
    }
  | {
      code: "terminal.stopNowValue";
      grossValue: number;
      opportunityCost: number;
      riskPenalty: number;
      netValue: number;
      reachLowerBound: number;
      catastropheFloor: number;
    }
  | {
      code: "terminal.stopNowCatastropheFloor";
      grossValue: number;
      opportunityCost: number;
      riskPenalty: number;
      netValue: number;
      reachLowerBound: number;
      catastropheFloor: number;
    }

  // ── Token reserve explanation (v0.24 feasibility scale) ──────────────────
  | { code: "reserve.noNearbyTarget" }
  | { code: "reserve.feasibleScale"; anchors: string[] }
  | { code: "reserve.softPressure" }
  | { code: "reserve.infeasibleChaseTarget"; songName: string }
  | {
      code: "reserve.skippedInfeasibleChase";
      base: Message;
      skipped: string[];
    }

  // ── Forced push (override) ───────────────────────────────────────────────
  | { code: "override.forcedPushActive" }
  | { code: "override.forcedPushOption"; option: number }

  // ── Non-blocking advisory (diagnostics) ──────────────────────────────────
  | { code: "advisory.cheaperSameSupport"; option: number }

  // ── Blocking proofs (diagnostics) ────────────────────────────────────────
  | { code: "blocking.techniqueUnaffordable.label" }
  | { code: "blocking.techniqueUnaffordable.detail" }
  | { code: "blocking.blocksPriorityTarget.label" }
  | { code: "blocking.blocksPriorityTarget.detail"; names: string[] }
  | { code: "blocking.songUnaffordable.label" }
  | { code: "blocking.songUnaffordable.detail" }
  | { code: "blocking.closesFinalGate.label" }
  | { code: "blocking.closesFinalGate.detail" };

export type MessageCode = Message["code"];

/** Structural equality on messages, used by tests and by log de-duplication. */
export const sameMessage = (left: Message, right: Message): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
