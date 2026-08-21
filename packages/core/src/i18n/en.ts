import type { Message, PlanId } from "./messages.ts";
import type { PlanMode } from "../planner/strategic-plan.ts";

const pct1 = (value: number): string => String(Math.round(value * 1000) / 10);
const pct0 = (value: number): string => String(Math.round(value * 100));
const fixed1 = (value: number): string => (value * 100).toFixed(1);
const fixed0 = (value: number): string => (value * 100).toFixed(0);
const tenth = (value: number): string => String(Math.round(value * 10) / 10);
const whole = (value: number): string => String(Math.round(value));

const terminalLayerEn = (layer: "gate" | "structural" | "mechanical" | "t2"): string =>
  layer === "gate"
    ? "Concert objective"
    : layer === "structural"
      ? "structural target"
      : layer === "mechanical"
        ? "immediate reward"
        : "secondary bonus";

const terminalMetricEn = (metric: string): string => {
  if (metric === "great-success-secured") return "Great Success";
  if (metric === "structural-tier-5") return "priority SP target";
  if (metric === "structural-tier-4") return "Friendship +10 / strong target";
  if (metric === "structural-tier-3") return "Friendship +5";
  if (metric === "structural-tier-2") return "secondary structural target";
  if (metric === "mechanical-reward") return "immediate stats/SP";
  if (metric === "t2-practice") return "training bonus";
  if (metric === "t2-skill-points") return "training SP bonus";
  return metric;
};

const planLabelEn = (planId: PlanId, mode: PlanMode): string => {
  switch (planId) {
    case "convert-final":
      return "CONVERT · Grand Live";
    case "hunt-sp2":
      return "HUNT_SP2";
    case "hunt-sp3":
      return "HUNT_SP3";
    case "close-c4":
      return "CLOSE · end of C4";
    case "accumulate-c4":
      return "ACCUMULATE · prepare C4";
    case "accumulate-c1":
      return mode === "close"
        ? "CLOSE · C1 Concert"
        : "ACCUMULATE · wait before C1";
    case "close-checkpoint":
      return "CLOSE · Concert";
    case "hold":
      return "HOLD";
  }
};

const planExitEn = (
  planId: PlanId,
  mode: PlanMode,
  manualGaugeTarget: number,
): string => {
  switch (planId) {
    case "convert-final":
      return "Secure the final Great Success, then convert remaining tokens into +5 SP per Technique and +25 SP per Song.";
    case "hunt-sp2":
      return "SP training +2 bought, then switch to HOLD.";
    case "hunt-sp3":
      return "SP training +3 bought, then switch to HOLD.";
    case "close-c4":
      return "Prioritise the Songs still worth buying before the Grand Live, Friendship +10 first then +5; 16/18 stay trajectory indicators, not purchase goals.";
    case "accumulate-c4":
      return "Prepare C4 by prioritising Friendship +10 then +5 and their activation timing; 16/18 stay plain pacing references.";
    case "accumulate-c1":
      return mode === "close"
        ? `Buy the justified Songs; ${manualGaugeTarget} manual ones fill the C1 Hype Level.`
        : "The Concert is becoming imminent.";
    case "close-checkpoint":
      return `Reach ${manualGaugeTarget} manual Songs for Great Success, then switch to HOLD.`;
    case "hold":
      return "Wait without starting a new chain; buy only a structural opportunity that is already on offer.";
  }
};

const planFallbackEn = (planId: PlanId): string => {
  switch (planId) {
    case "convert-final":
      return "Stop when no affordable Technique or Song can convert the remaining tokens.";
    case "hunt-sp2":
      return "If the target is on offer but unaffordable, keep the Shop and train the missing Points.";
    case "hunt-sp3":
      return "Protect your cost vector; a Friendship Song only goes first if it keeps the target and genuinely dominates the continuation.";
    case "close-c4":
      return "Without a structural target worth its price, preserve the stock: late fillers are not worth a major Friendship Song bought at the right time.";
    case "accumulate-c4":
      return "Save: buying early does not activate the Concert Bonus before C4 and throws away information.";
    case "accumulate-c1":
      return "Keep the rare colours and do not push on for a micro stat bonus alone.";
    case "close-checkpoint":
      return "Once Great Success is secured, do not open another optional chain.";
    case "hold":
      return "Save, and keep the information the next Shop will bring.";
  }
};

export const renderEn = (message: Message): string => {
  switch (message.code) {
    // ── Strategic plan identity ────────────────────────────────────────────
    case "plan.label":
      return planLabelEn(message.planId, message.mode);
    case "plan.exit":
      return planExitEn(
        message.planId,
        message.mode,
        message.manualGaugeTarget,
      );
    case "plan.fallback":
      return planFallbackEn(message.planId);

    // ── Checkpoint supply ──────────────────────────────────────────────────
    case "supply.status":
      switch (message.status) {
        case "secured-now":
          return "already secured";
        case "closable-before-deadline":
          return "to close before the Concert";
        case "reachable-with-future-supply":
          return "depends on future gains";
        case "indeterminate":
          return "capacity undetermined";
        case "impossible":
          return "impossible";
      }
    // eslint-disable-next-line no-fallthrough
    case "checkpoint.name":
      return message.checkpointId === "songs-16"
        ? "16-Song pacing reference"
        : "18-Song checkpoint";

    // ── Song policy: shared prefix ─────────────────────────────────────────
    case "policy.noPurchase":
      return "No purchase";
    case "reason.plan":
      return `plan ${planLabelEn(message.planId, message.mode)}`;
    case "reason.structuralTargetVisible":
      return "structural target already on offer";
    case "reason.chaseTargetVisible":
      return "hunt target already on offer";
    case "reason.opportunityVisible":
      return "opportunity on offer, without extra hunting";
    case "reason.gate18Impossible":
      return "18 impossible with the current stock";
    case "reason.gate18FutureSupply":
      return "18 still depends on future Point gains";
    case "reason.capacityIndeterminate":
      return "exact capacity undetermined: bounded search";
    case "reason.noAffordablePlanTarget":
      return "no target in the plan is still affordable right now";

    // ── Song policy: buy branch ────────────────────────────────────────────
    case "reason.huntAbandonTechniqueCount":
      return `HUNT abandoned: the next cycle needs ${message.techniques} Techniques`;
    case "reason.huntAbandonBelowFloor":
      return `HUNT abandoned: ${fixed1(message.probability)} % to find and fund the target, below the ${fixed0(message.floor)} % floor`;
    case "reason.huntContinuationRefused":
      return `${renderEn(message.cause)} · HUNT continuation refused`;
    case "reason.huntAbandonMarginalValue":
      return `HUNT abandoned after ${message.pages} missed page(s): ${fixed1(message.probability)} % find & fund, marginal value ${message.netValue.toFixed(1)}`;
    case "reason.huntContinueMarginalValue":
      return `HUNT continues after ${message.pages} missed page(s): ${fixed1(message.probability)} % find & fund, marginal value ${message.netValue >= 0 ? "+" : ""}${message.netValue.toFixed(1)}`;
    case "reason.huntAbandonUnreachable":
      return `HUNT abandoned: target appearance is ${fixed1(message.appearanceProbability)} % after ${message.pages} missed page(s)`;
    case "reason.huntContinueReachability": {
      const funding =
        message.fundingAssessment === "future-income-required"
          ? "current zero-income funding is insufficient; future training income remains unknown"
          : `zero-income fundability ${message.zeroIncomeFundabilityProbability === null ? "unknown" : `${fixed1(message.zeroIncomeFundabilityProbability)} %`}`;
      return `HUNT stays active after ${message.pages} missed page(s): ${fixed1(message.appearanceProbability)} % appearance, ${fixed1(message.findAndFundProbability)} % zero-income find & fund; ${funding}`;
    }
    case "reason.securesGreatSuccess":
      return "secures Great Success";
    case "reason.nextSectionCheckpoint": {
      const horizon =
        message.horizonSections === 2 ? "up to C4" : "over the next section";
      const checkpoint = message.checkpointRequired
        ? `checkpoint ${message.checkpointRequired}`
        : "the next section's objective";
      return `${pct1(message.probability)} % on ${checkpoint} ${horizon}, verified +10 transition(s) included`;
    }
    case "reason.nextSectionValue": {
      const horizon =
        message.horizonSections === 2 ? "up to C4" : "over the next section";
      return `cross-section value with no future income: ${tenth(message.friendshipBonus)} % Friendship acquired, ${tenth(message.friendshipTrainingExposure)} %-training exposure, ${tenth(message.spTrainingExposure)} SP-training exposure, ${tenth(message.practiceTrainingExposure)} other training exposure, and ${whole(message.lessonSkillPoints)} Lesson SP expected ${horizon}`;
    }
    case "reason.boundedLessonSkillPoints":
      return `${message.points} Lesson SP along this bounded path`;
    case "reason.stopNotCommitted":
      return "stop not committed: the Techniques actually offered will be re-evaluated after the purchase";
    case "reason.reachNextPage":
      return `${pct0(message.probability)} % to reach the next Shop`;
    case "reason.findAndFundTarget":
      return `${pct1(message.probability)} % to find and fund the target over ${message.pages} Shop(s) with Techniques paid`;
    case "reason.boundedMonteCarlo":
      return "bounded Monte Carlo projection, with no future training gain";

    // ── Song policy: carry branch ──────────────────────────────────────────
    case "reason.carryNextSectionCheckpoint":
      return `${pct1(message.probability)} % over ${message.horizonSections === 2 ? "the C4 horizon" : "the next section"} after verified +10 transition(s)`;
    case "reason.carryNextSectionValue":
      return `cross-section value with no future income: ${tenth(message.friendshipBonus)} % Friendship acquired, ${tenth(message.friendshipTrainingExposure)} %-training exposure, ${tenth(message.spTrainingExposure)} SP-training exposure, ${tenth(message.practiceTrainingExposure)} other training exposure, and ${whole(message.lessonSkillPoints)} Lesson SP expected`;
    case "reason.carriedSongLessonSkillPoints":
      return `${message.points} Lesson SP when the carried Song is bought`;

    // ── Song policy: stop branch ───────────────────────────────────────────
    case "reason.stopFullStockCarries":
      return "no Song bought: the whole stock crosses the Concert, then takes the +10 credit";
    case "reason.pacingTargetMissed":
      return `pacing target ${message.target} not reached: ${message.totalSongs}/${message.target}, with no mechanical block`;
    case "reason.stopNextSectionCheckpoint": {
      const horizon =
        message.horizonSections === 2 ? "up to C4" : "over the next section";
      const checkpoint = message.checkpointRequired
        ? `checkpoint ${message.checkpointRequired}`
        : "the future objective";
      return `${pct1(message.probability)} % on ${checkpoint} ${horizon}`;
    }
    case "reason.stopNextSectionFriendship": {
      const horizon =
        message.horizonSections === 2 ? "up to C4" : "over the next section";
      return `${tenth(message.friendshipBonus)} % Friendship acquired ${horizon}, effective exposure ${tenth(message.friendshipTrainingExposure)} %-training, Techniques and Songs paid`;
    }
    case "reason.greatSuccessSecured":
      return "Great Success is already secured";
    case "reason.finalGateSecuredCounter":
      return `final Great Success secured; the 18 counter is informative: ${message.totalSongs}/18`;
    case "reason.noPriorityLeftInPool":
      return "no Song left in the pool: terminal conversion is complete";
    case "reason.noVisiblePriorityJustifies":
      return "no visible Song is affordable: terminal conversion is complete";
    case "reason.finalFillerNonStrategic":
      return "non-strategic filler after final Great Success is secured; affordable, but not recommended";
    case "reason.finalGateStillOpen":
      return "final Great Success still open: stopping now is invalid";
    case "reason.greatSuccessNotSecured":
      return "Great Success is not secured without a further purchase";

    // ── Song policy: wait branch ───────────────────────────────────────────
    case "reason.waitMissingTokens":
      return `missing ${message.missing.map((token) => `${token.amount} ${token.key}`).join(" · ")} for ${message.songName}; keep this Shop and train`;
    case "reason.waitWouldBlockReserve":
      return `purchase possible, but it would make ${message.names.join(" / ")} immediately unaffordable`;
    case "reason.waitSameActivationNextLive":
      return "same activation at the next Concert: waiting keeps both Points and information";
    case "reason.waitProtectedReserveDominates":
      return "purchase possible, but the protected reserve dominates this visible opportunity";
    case "reason.huntAbandonAtConcert":
      return "HUNT abandoned: the Concert is crossed without acquiring the target";
    case "reason.huntAbandonNoFiller":
      return "drops the hunt without buying a filler; keeps the stock until the Concert";
    case "reason.sectionStaysOpen":
      return "the section stays open: future gains are observed, never assumed";

    // ── Exposed carry evaluation ───────────────────────────────────────────
    case "carry.noSectionAfterGrandLive":
      return "no section follows the Grand Live: final carryover not allowed";
    case "carry.sectionStillOpen":
      return "the section stays open: reserving the Shop is not a carryover yet";
    case "carry.notAffordableEvenWithCredit":
      return "even the verified +10 credit does not make the Song affordable; the new pool would stay blocked";
    case "carry.savesOneInheritedTechnique":
      return "saves exactly one inherited Technique at equal total";
    case "carry.rhythmTargetMissed":
      return `pacing target ${message.required} missed before the Concert; the carryover stays mechanically possible`;
    case "carry.creditMakesAffordable":
      return "the verified +10 credit makes the Song affordable";
    case "carry.creditCommonToBothBranches":
      return "the verified +10 credit is common to both branches and is not worth a premium";
    case "carry.delaysFriendshipBonus":
      return "delays a Friendship Concert Bonus by one section";
    case "carry.delaysStructuralTarget":
      return "delays a structural target of the active plan";
    case "carry.negligibleStatBonus":
      return "no micro stat bonus is valued against these savings";

    // ── Terminal technique screen ──────────────────────────────────────────
    case "terminal.gainFriendship10":
      return "genuinely improves access to a Friendship +10 %";
    case "terminal.gainExpectedFriendship":
      return "raises the Friendship expected in the next section";
    case "terminal.gainNextTarget":
      return "genuinely improves acquiring the next target";
    case "terminal.gainStructuralPurchases":
      return "raises the structural purchases expected downstream";
    case "terminal.gainNone":
      return "no structural prospective gain offsets the cost of the remaining Techniques";
    case "terminal.exposeAndCarry":
      return `EXPOSE_AND_CARRY justified: ${renderEn(message.gain)}`;
    case "terminal.stopNowPageNotReached":
      return "STOP_NOW: the carried Shop is not reached reliably enough";
    case "terminal.coRecommendedAlternative":
      return message.action === "expose-and-carry"
        ? "Defensible alternative: PUSH"
        : "Defensible alternative: STOP";
    case "terminal.stopNowNotSeparated":
      return message.coRecommendationReason === "resource-tradeoff"
        ? "STOP_NOW remains the primary; PUSH is also defensible: the immediate gain is real, but the model does not invent an exchange rate against the resources spent"
        : message.coRecommendationReason === "both"
          ? "STOP_NOW is the stable primary; EXPOSE_AND_CARRY is co-recommended because paired Monte Carlo is not separated and calibration can also reverse the order"
          : "STOP_NOW is the stable primary; EXPOSE_AND_CARRY is co-recommended because paired Monte Carlo has not separated the actions";
    case "terminal.stopNow":
      return `STOP_NOW: ${renderEn(message.gain)}`;
    case "terminal.exposeAndCarryLayered":
      return `PUSH · ${terminalLayerEn(message.layer)} advantage (${terminalMetricEn(message.metric)}) ${message.delta >= 0 ? "+" : ""}${tenth(message.delta)} · safety ${pct1(message.reachLowerBound)} % (floor ${pct1(message.catastropheFloor)} %)`;
    case "terminal.stopNowLayered":
      return `STOP · PUSH delta on ${terminalLayerEn(message.layer)} (${terminalMetricEn(message.metric)}) ${message.delta >= 0 ? "+" : ""}${tenth(message.delta)} · safety ${pct1(message.reachLowerBound)} % (floor ${pct1(message.catastropheFloor)} %)`;
    case "terminal.exposeAndCarryValue":
      return `EXPOSE_AND_CARRY · value ${tenth(message.grossValue)} - opportunity cost ${tenth(message.opportunityCost)} - risk ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · reach lower bound ${pct1(message.reachLowerBound)} % (floor ${pct1(message.catastropheFloor)} %)`;
    case "terminal.stopNowValue":
      return `STOP_NOW · value ${tenth(message.grossValue)} - opportunity cost ${tenth(message.opportunityCost)} - risk ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · reach lower bound ${pct1(message.reachLowerBound)} % (floor ${pct1(message.catastropheFloor)} %)`;
    case "terminal.stopNowCatastropheFloorLayered":
      return `STOP_NOW · reach lower bound ${pct1(message.reachLowerBound)} % is below the catastrophe floor ${pct1(message.catastropheFloor)} %`;
    case "terminal.stopNowCatastropheFloor":
      return `STOP_NOW · value ${tenth(message.grossValue)} - opportunity cost ${tenth(message.opportunityCost)} - risk ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · reach lower bound ${pct1(message.reachLowerBound)} % is below the catastrophe floor ${pct1(message.catastropheFloor)} %`;

    // ── Token reserve explanation ──────────────────────────────────────────
    case "reserve.noNearbyTarget":
      return "no target Song nearby";
    case "reserve.feasibleScale":
      return `feasible scale · ${message.anchors.join(" / ")}`;
    case "reserve.softPressure":
      return "soft pressure · future strategic demand";
    case "reserve.infeasibleChaseTarget":
      return `${message.songName}: infeasible chase, no real path preserves its full cost`;
    case "reserve.skippedInfeasibleChase":
      return `${renderEn(message.base)} · infeasible chase skipped: ${message.skipped.join(" / ")}`;

    // ── Forced push (override) ─────────────────────────────────────────────
    case "override.forcedPushActive":
      return "Forced push on: the normal STOP/HOLD verdict is ignored.";
    case "override.forcedPushOption":
      return `Option ${message.option}: best valid, non-blocking purchase.`;

    // ── Non-blocking advisory (diagnostics) ────────────────────────────────
    case "advisory.cheaperSameSupport":
      return `More expensive than option ${message.option} on the same colours. Pick it only if its own effect (Energy, Hint, etc.) justifies the extra cost.`;

    // ── Blocking proofs (diagnostics) ──────────────────────────────────────
    case "blocking.techniqueUnaffordable.label":
      return "Choice not affordable";
    case "blocking.techniqueUnaffordable.detail":
      return "The cost exceeds at least one current Point balance.";
    case "blocking.blocksPriorityTarget.label":
      return "Blocks the priority target";
    case "blocking.blocksPriorityTarget.detail":
      return message.names.length === 1
        ? `${message.names[0]} becomes permanently unaffordable before the next selection.`
        : `${message.names.join(" / ")} become unaffordable before the next selection.`;
    case "blocking.songUnaffordable.label":
      return "Purchase not affordable";
    case "blocking.songUnaffordable.detail":
      return "The cost exceeds the current stock, or the action is invalid in this state.";
    case "blocking.closesFinalGate.label":
      return "Closes the final gate";
    case "blocking.closesFinalGate.detail":
      return "The 18 ∧ final Great Success gate becomes impossible in this branch.";
  }
};
