import type { Message } from "../i18n/messages.ts";
import type { Balance } from "../live-model.ts";
import type { SongRole } from "../domain/song-catalog.ts";
import {
  applyPromotionalLiveTransition,
  type TimingMode,
} from "../domain/live-rules.ts";
import {
  isChaseTarget,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";

const TOKEN_KEYS = ["dance", "passion", "vocal", "visual", "mental"] as const;

export type CarrySong = {
  id: string;
  name: string;
  cost: Balance;
  roles?: readonly SongRole[];
};

export type CarryEvaluation = {
  valid: boolean;
  affordableNow: boolean;
  affordableAfterLive: boolean;
  delayedBalance: Balance | null;
  savedInheritedTechniques: number;
  delayClass: "structural" | "friendship" | "minor" | "negligible";
  reasons: Message[];
};

const canAfford = (tokens: Balance, cost: Balance): boolean =>
  TOKEN_KEYS.every((key) => tokens[key] >= cost[key]);

const subtract = (tokens: Balance, cost: Balance): Balance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, tokens[key] - cost[key]]),
  ) as Balance;

const delayClassFor = (song: CarrySong): CarryEvaluation["delayClass"] => {
  const roles = song.roles ?? [];
  if (roles.includes("sp2-target") || roles.includes("sp3-target")) {
    return "structural";
  }
  if (roles.includes("friendship-10") || roles.includes("friendship-5")) {
    return "friendship";
  }
  if (roles.includes("specialty-priority")) return "minor";
  return "negligible";
};

/** Evaluates carrying an already exposed song page across the concert. */
export const evaluateExposedCarry = ({
  concertIndex,
  timingMode,
  tokens,
  song,
  totalSongs,
  plan,
}: {
  concertIndex: number;
  timingMode: TimingMode;
  tokens: Balance;
  song: CarrySong;
  totalSongs: number;
  plan: StrategicPlan;
}): CarryEvaluation => {
  const affordableNow = canAfford(tokens, song.cost);
  const afterLive = applyPromotionalLiveTransition(tokens, concertIndex);
  const affordableAfterLive = canAfford(afterLive, song.cost);
  const delayedBalance = affordableAfterLive
    ? subtract(afterLive, song.cost)
    : null;
  const delayClass = delayClassFor(song);
  const reasons: Message[] = [];

  if (concertIndex >= 4) {
    return {
      valid: false,
      affordableNow,
      affordableAfterLive: false,
      delayedBalance: null,
      savedInheritedTechniques: 0,
      delayClass,
      reasons: [{ code: "carry.noSectionAfterGrandLive" }],
    };
  }
  if (timingMode !== "deadline-now") {
    return {
      valid: false,
      affordableNow,
      affordableAfterLive,
      delayedBalance,
      savedInheritedTechniques: 1,
      delayClass,
      reasons: [{ code: "carry.sectionStillOpen" }],
    };
  }
  if (!affordableAfterLive) {
    return {
      valid: false,
      affordableNow,
      affordableAfterLive,
      delayedBalance: null,
      savedInheritedTechniques: 1,
      delayClass,
      reasons: [{ code: "carry.notAffordableEvenWithCredit" }],
    };
  }

  reasons.push({ code: "carry.savesOneInheritedTechnique" });
  if (plan.checkpointRequired && totalSongs < plan.checkpointRequired) {
    reasons.push({
      code: "carry.rhythmTargetMissed",
      required: plan.checkpointRequired,
    });
  }
  if (!affordableNow) {
    reasons.push({ code: "carry.creditMakesAffordable" });
  } else {
    reasons.push({ code: "carry.creditCommonToBothBranches" });
  }
  if (delayClass === "friendship") {
    reasons.push({ code: "carry.delaysFriendshipBonus" });
  } else if (delayClass === "structural" || isChaseTarget(song, plan)) {
    reasons.push({ code: "carry.delaysStructuralTarget" });
  } else if (delayClass === "negligible") {
    reasons.push({ code: "carry.negligibleStatBonus" });
  }

  return {
    valid: true,
    affordableNow,
    affordableAfterLive,
    delayedBalance,
    savedInheritedTechniques: 1,
    delayClass,
    reasons,
  };
};
