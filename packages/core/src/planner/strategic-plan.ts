import type { Message } from "../i18n/messages.ts";
import type { SongRole } from "../domain/song-catalog.ts";
import {
  checkpointForSection,
  isGreatSuccess,
  manualSongsForGreatSuccess,
  type TimingMode,
} from "../domain/live-rules.ts";

export type PlanMode = "accumulate" | "hunt" | "hold" | "close" | "convert";

type StrategicTargetSet = {
  roles: SongRole[];
  ids: string[];
};

export type StrategicPlan = {
  concertIndex: number;
  id:
    | "accumulate-c1"
    | "hunt-sp2"
    | "hunt-sp3"
    | "hold"
    | "accumulate-c4"
    | "close-c4"
    | "close-checkpoint"
    | "convert-final";
  mode: PlanMode;
  /** Hidden targets for which opening a new song page is justified. */
  chaseTargets: StrategicTargetSet;
  /** Valuable songs that may be bought only when already visible. */
  visibleOptionalTargets: StrategicTargetSet;
  /** Future song vectors whose token costs must be protected. */
  reserveTargets: StrategicTargetSet;
  checkpointRequired: number | null;
  manualGaugeTarget: number;
  finalGateRequired: boolean;
};

export type StrategicSong = {
  id: string;
  roles?: readonly SongRole[];
};

export type StrategicPlanInput = {
  concertIndex: number;
  timingMode: TimingMode;
  remainingSongs: StrategicSong[];
  /** Manual songs already bought in the current section. Required to keep
   * HOLD from hiding an incomplete Great Success gauge at the deadline. */
  songsThisSection?: number;
  /** Targets deliberately abandoned earlier in the run. They remain visible
   * opportunities, but may no longer reopen a HUNT chain. */
  abandonedChaseTargetIds?: readonly string[];
};

const idsWithRole = (songs: StrategicSong[], role: SongRole): string[] =>
  songs
    .filter((song) => song.roles?.includes(role))
    .map((song) => song.id)
    .sort();

const idsWithRoles = (
  songs: StrategicSong[],
  roles: readonly SongRole[],
): string[] =>
  songs
    .filter((song) => roles.some((role) => song.roles?.includes(role)))
    .map((song) => song.id)
    .sort();

const targetSet = (
  songs: StrategicSong[],
  roles: SongRole[],
): StrategicTargetSet => ({
  roles,
  ids: idsWithRoles(songs, roles),
});

const EMPTY_TARGETS: StrategicTargetSet = { roles: [], ids: [] };
const FRIENDSHIP_ROLES: SongRole[] = ["friendship-10", "friendship-5"];
const ALL_STRUCTURAL_ROLES: SongRole[] = [
  "sp2-target",
  "sp3-target",
  ...FRIENDSHIP_ROLES,
];

export const deriveStrategicPlan = ({
  concertIndex,
  timingMode,
  remainingSongs,
  songsThisSection = 0,
  abandonedChaseTargetIds = [],
}: StrategicPlanInput): StrategicPlan => {
  const abandoned = new Set(abandonedChaseTargetIds);
  const checkpoint = checkpointForSection(concertIndex);
  const checkpointRequired =
    timingMode === "deadline-now" ? (checkpoint?.required ?? null) : null;
  const manualGaugeTarget = manualSongsForGreatSuccess(concertIndex);
  const sectionSpTargetStillInPool =
    concertIndex === 1
      ? idsWithRole(remainingSongs, "sp2-target").length > 0
      : concertIndex === 2
        ? idsWithRole(remainingSongs, "sp3-target").length > 0
        : false;

  if (concertIndex === 4) {
    const terminalTargets: StrategicTargetSet = {
      roles: [],
      ids: remainingSongs.map((song) => song.id).sort(),
    };
    return {
      concertIndex,
      id: "convert-final",
      mode: "convert",
      // No training follows the Grand Live. Every remaining Lesson therefore
      // has the same terminal base value (+25 SP); future training/live roles
      // no longer create a structural hierarchy.
      chaseTargets: terminalTargets,
      visibleOptionalTargets: terminalTargets,
      reserveTargets: EMPTY_TARGETS,
      checkpointRequired: null,
      manualGaugeTarget,
      finalGateRequired: false,
    };
  }

  if (concertIndex === 1) {
    const targets = idsWithRole(remainingSongs, "sp2-target").filter(
      (id) => !abandoned.has(id),
    );
    if (targets.length > 0) {
      return {
        concertIndex,
        id: "hunt-sp2",
        mode: "hunt",
        chaseTargets: { roles: ["sp2-target"], ids: targets },
        visibleOptionalTargets: EMPTY_TARGETS,
        reserveTargets: targetSet(remainingSongs, ALL_STRUCTURAL_ROLES),
        checkpointRequired,
        manualGaugeTarget,
        finalGateRequired: false,
      };
    }
  }

  if (concertIndex === 2) {
    const targets = idsWithRole(remainingSongs, "sp3-target").filter(
      (id) => !abandoned.has(id),
    );
    if (targets.length > 0) {
      return {
        concertIndex,
        id: "hunt-sp3",
        mode: "hunt",
        chaseTargets: { roles: ["sp3-target"], ids: targets },
        visibleOptionalTargets: EMPTY_TARGETS,
        reserveTargets: targetSet(remainingSongs, ALL_STRUCTURAL_ROLES),
        checkpointRequired,
        manualGaugeTarget,
        finalGateRequired: false,
      };
    }
  }

  if (concertIndex === 3) {
    const friendshipTargets = targetSet(remainingSongs, FRIENDSHIP_ROLES);
    if (timingMode === "deadline-now") {
      return {
        concertIndex,
        id: "close-c4",
        mode: "close",
        chaseTargets: friendshipTargets,
        visibleOptionalTargets: friendshipTargets,
        reserveTargets: friendshipTargets,
        checkpointRequired: null,
        manualGaugeTarget,
        finalGateRequired: false,
      };
    }
    return {
      concertIndex,
      id: "accumulate-c4",
      mode: "accumulate",
      chaseTargets: friendshipTargets,
      visibleOptionalTargets: friendshipTargets,
      reserveTargets: friendshipTargets,
      checkpointRequired: null,
      manualGaugeTarget,
      finalGateRequired: false,
    };
  }

  if (concertIndex === 0) {
    const friendshipTargets = targetSet(remainingSongs, FRIENDSHIP_ROLES);
    return {
      concertIndex,
      id: "accumulate-c1",
      mode: timingMode === "deadline-now" ? "close" : "accumulate",
      chaseTargets: friendshipTargets,
      visibleOptionalTargets: friendshipTargets,
      reserveTargets: targetSet(remainingSongs, ALL_STRUCTURAL_ROLES),
      checkpointRequired: null,
      manualGaugeTarget,
      finalGateRequired: false,
    };
  }

  const holdReserveRoles: SongRole[] =
    concertIndex === 1
      ? ["sp3-target", ...FRIENDSHIP_ROLES]
      : [...FRIENDSHIP_ROLES];
  // Abandoning a hidden SP chase only suppresses new-page spending. If that
  // target appears later, HOLD must still treat it as a visible opportunity.
  const holdVisibleRoles: SongRole[] =
    concertIndex === 1
      ? ["sp2-target", ...FRIENDSHIP_ROLES]
      : concertIndex === 2
        ? ["sp2-target", "sp3-target", ...FRIENDSHIP_ROLES]
        : [...FRIENDSHIP_ROLES];

  if (
    timingMode === "deadline-now" &&
    !sectionSpTargetStillInPool &&
    !isGreatSuccess(concertIndex, songsThisSection)
  ) {
    const gaugeTargets: StrategicTargetSet = {
      roles: [],
      ids: remainingSongs.map((song) => song.id).sort(),
    };
    return {
      concertIndex,
      id: "close-checkpoint",
      mode: "close",
      // Once SP+2/SP+3 is secured, fillers must not be hunted for their own
      // value. They do become valid targets at the deadline while one manual
      // purchase is still required for the section's Great Success.
      chaseTargets: gaugeTargets,
      visibleOptionalTargets: gaugeTargets,
      reserveTargets: targetSet(remainingSongs, holdReserveRoles),
      checkpointRequired,
      manualGaugeTarget,
      finalGateRequired: false,
    };
  }

  return {
    concertIndex,
    // Once both the section's SP target and its Great Success are secured, the
    // controller is in HOLD even on the concert screen. Hidden Friendship and
    // filler chains may no longer reopen spending.
    id: "hold",
    mode: "hold",
    chaseTargets: EMPTY_TARGETS,
    visibleOptionalTargets: targetSet(remainingSongs, holdVisibleRoles),
    reserveTargets: targetSet(remainingSongs, holdReserveRoles),
    checkpointRequired,
    manualGaugeTarget,
    finalGateRequired: false,
  };
};

const matchesTargetSet = (
  song: StrategicSong,
  targets: StrategicTargetSet,
): boolean =>
  targets.ids.includes(song.id) ||
  targets.roles.some((role) => song.roles?.includes(role));

/** Hidden target whose absence can justify opening a new song page. */
export const isChaseTarget = (
  song: StrategicSong,
  plan: StrategicPlan,
): boolean => matchesTargetSet(song, plan.chaseTargets);

/** Valuable song that may be bought when already visible, without chasing it. */
export const isVisibleOptionalTarget = (
  song: StrategicSong,
  plan: StrategicPlan,
): boolean => matchesTargetSet(song, plan.visibleOptionalTargets);

/** Song vector whose future cost participates in token-pressure protection. */
export const isReserveTarget = (
  song: StrategicSong,
  plan: StrategicPlan,
): boolean => matchesTargetSet(song, plan.reserveTargets);

/**
 * Importance d'une song pour la protection du portefeuille. Cette hiérarchie
 * ne classe pas directement les achats : elle sert uniquement à déterminer
 * quelles cibles doivent exercer une pression sur leurs vecteurs de coût.
 * La cible HUNT active domine, puis les Friendship, tandis qu'une SP manquée
 * décroît avec le retard.
 */
export const strategicReserveWeight = (
  song: StrategicSong,
  plan: StrategicPlan,
): number => {
  if (plan.id === "convert-final") return 0;
  const roles = song.roles ?? [];
  if (plan.mode === "hunt" && isChaseTarget(song, plan)) return 100;
  if (roles.includes("friendship-10")) return 90;
  if (roles.includes("friendship-5")) {
    // Une Friendship achetée tôt capitalise sur davantage d'entraînements.
    return Math.max(58, 76 - plan.concertIndex * 6);
  }
  if (roles.includes("sp3-target")) {
    if (plan.concertIndex <= 2) return 82;
    if (plan.concertIndex === 3) return 56;
    return 30;
  }
  if (roles.includes("sp2-target")) {
    if (plan.concertIndex <= 1) return 78;
    if (plan.concertIndex === 2) return 48;
    if (plan.concertIndex === 3) return 24;
    return 10;
  }
  if (roles.includes("specialty-priority")) return 10;
  return 0;
};

/**
 * Lexicographic structural tier. This is deliberately ordinal: it never mixes
 * SP and Friendship into one arbitrary unit. Specialty is deliberately not a
 * structural tier: it may only participate in a late filler tie-break.
 */
export const structuralTier = (
  song: StrategicSong,
  plan: StrategicPlan,
): number => {
  // There is no training after the Grand Live. Terminal Lesson conversion is
  // ordered by immediate SP and feasibility, not by expired song bonuses.
  if (plan.id === "convert-final") return 0;
  const roles = song.roles ?? [];
  if (plan.id === "hunt-sp2" && roles.includes("sp2-target")) return 5;
  if (plan.id === "hunt-sp3" && roles.includes("sp3-target")) return 5;
  // A missed SP song keeps an intrinsic, time-decaying value after its hunt
  // section. The plan adds urgency; it no longer creates the whole value.
  if (roles.includes("sp3-target") && plan.concertIndex === 3) return 4;
  if (roles.includes("sp2-target") && plan.concertIndex === 2) return 4;
  if (roles.includes("sp2-target") && plan.concertIndex === 3) return 2;
  if (roles.includes("friendship-10")) return 4;
  if (roles.includes("friendship-5")) return 3;
  return 0;
};

/**
 * A plan carries an identity, not prose. These factories turn that identity
 * into a message the i18n layer renders; the planner never spells a sentence.
 */
export const planLabelMessage = (plan: StrategicPlan): Message => ({
  code: "plan.label",
  planId: plan.id,
  mode: plan.mode,
});

export const planExitMessage = (plan: StrategicPlan): Message => ({
  code: "plan.exit",
  planId: plan.id,
  mode: plan.mode,
  manualGaugeTarget: plan.manualGaugeTarget,
});

export const planFallbackMessage = (plan: StrategicPlan): Message => ({
  code: "plan.fallback",
  planId: plan.id,
  mode: plan.mode,
});
