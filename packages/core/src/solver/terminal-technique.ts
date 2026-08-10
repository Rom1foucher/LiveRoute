import type { Message } from "../i18n/messages.ts";
import {
  canAfford,
  simulateTechniqueTransition,
  subtractCost,
  totalCost,
  type Balance,
  type GenerationProfile,
  type Period,
  type RiskProfile,
  type SongTarget,
  type TerminalTechniqueDecisionSummary,
} from "../live-model.ts";
import {
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import { evaluateExposedCarry } from "./carry.ts";
import {
  simulateCrossSectionReadinessTrial,
  type CrossSectionTrialResult,
} from "./cross-section.ts";
import { drawTransitionSongPage } from "./song-transition.ts";
import { riskThreshold } from "./value.ts";

export type TerminalTechniqueCandidate = {
  id: string;
  cost: Balance;
};

export type TerminalTechniqueOptionAssessment =
  TerminalTechniqueDecisionSummary & {
    candidateId: string;
    decisionVector: readonly number[];
  };

export type TerminalTechniqueOptionsInput = {
  concertIndex: number;
  period: Period;
  firstOfferPeriod?: Period;
  tokens: Balance;
  candidates: TerminalTechniqueCandidate[];
  techniquesRemaining: number;
  nextSongCycle?: number;
  currentSongs: SongTarget[];
  futureSongs?: SongTarget[];
  totalSongs: number;
  plan: StrategicPlan;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  trials?: number;
  seedKey?: string;
};

type Aggregate = {
  completions: number;
  checkpoints: number;
  targets: number;
  friendship10: number;
  friendshipBonus: number;
  structuralPurchases: number;
  purchases: number;
  retainedTokens: number;
  committedCost: number;
};

const emptyAggregate = (): Aggregate => ({
  completions: 0,
  checkpoints: 0,
  targets: 0,
  friendship10: 0,
  friendshipBonus: 0,
  structuralPurchases: 0,
  purchases: 0,
  retainedTokens: 0,
  committedCost: 0,
});

const addTrial = (
  aggregate: Aggregate,
  result: CrossSectionTrialResult,
  committedCost = 0,
): void => {
  aggregate.completions += 1;
  aggregate.checkpoints += result.checkpointMet ? 1 : 0;
  aggregate.targets += result.targetAcquired ? 1 : 0;
  aggregate.friendship10 += result.friendship10Acquired ? 1 : 0;
  aggregate.friendshipBonus += result.friendshipBonus;
  aggregate.structuralPurchases += result.structuralPurchases;
  aggregate.purchases += result.purchases;
  aggregate.retainedTokens += totalCost(result.retainedBalance);
  aggregate.committedCost += committedCost;
};

const normalized = (aggregate: Aggregate, trials: number) => ({
  completionProbability: aggregate.completions / trials,
  checkpointProbability: aggregate.checkpoints / trials,
  targetProbability: aggregate.targets / trials,
  friendship10Probability: aggregate.friendship10 / trials,
  expectedFriendshipBonus: aggregate.friendshipBonus / trials,
  expectedStructuralPurchases: aggregate.structuralPurchases / trials,
  expectedPurchases: aggregate.purchases / trials,
  expectedRetainedTokens: aggregate.retainedTokens / trials,
  expectedCommittedCost: aggregate.committedCost / trials,
});

const trialVector = (result: CrossSectionTrialResult): readonly number[] => [
  // Promotional-Live terminal choices optimise structural song value/timing.
  // Checkpoint progress is telemetry only until the Grand Live itself.
  result.friendship10Acquired ? 1 : 0,
  result.friendshipBonus,
  result.targetAcquired ? 1 : 0,
  result.structuralPurchases,
  result.purchases,
  totalCost(result.retainedBalance),
  result.checkpointMet ? 1 : 0,
];

const compareVector = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta;
  }
  return 0;
};

const stateFor = (probability: number, threshold: number): 0 | 1 | 2 =>
  probability >= threshold ? 2 : probability > 0 ? 1 : 0;

const friendshipValue = (song: SongTarget): number =>
  song.roles?.includes("friendship-10")
    ? 10
    : song.roles?.includes("friendship-5")
      ? 5
      : 0;

const withImmediateSongPurchase = ({
  result,
  song,
  plan,
}: {
  result: CrossSectionTrialResult;
  song: SongTarget;
  plan: StrategicPlan;
}): CrossSectionTrialResult => {
  const friendship = friendshipValue(song);
  const structural = structuralTier(song, plan) > 0 ? 1 : 0;
  return {
    ...result,
    targetAcquired: result.targetAcquired || isChaseTarget(song, plan),
    friendship10Acquired: result.friendship10Acquired || friendship >= 10,
    friendshipBonus: result.friendshipBonus + friendship,
    friendshipPurchases: result.friendshipPurchases + (friendship > 0 ? 1 : 0),
    structuralPurchases: result.structuralPurchases + structural,
    purchases: result.purchases + 1,
    lessonSkillPoints: result.lessonSkillPoints + 25,
  };
};

const meaningfulGain = (
  stop: ReturnType<typeof normalized>,
  push: ReturnType<typeof normalized>,
): { gained: boolean; reason: Message } => {
  if (push.friendship10Probability > stop.friendship10Probability + 0.015) {
    return {
      gained: true,
      reason: { code: "terminal.gainFriendship10" },
    };
  }
  if (push.expectedFriendshipBonus > stop.expectedFriendshipBonus + 0.25) {
    return {
      gained: true,
      reason: { code: "terminal.gainExpectedFriendship" },
    };
  }
  if (push.targetProbability > stop.targetProbability + 0.015) {
    return {
      gained: true,
      reason: { code: "terminal.gainNextTarget" },
    };
  }
  if (
    push.expectedStructuralPurchases >
    stop.expectedStructuralPurchases + 0.1
  ) {
    return {
      gained: true,
      reason: { code: "terminal.gainStructuralPurchases" },
    };
  }
  return {
    gained: false,
    reason: { code: "terminal.gainNone" },
  };
};

/**
 * Compares STOP_NOW with EXPOSE_AND_CARRY at a terminal technique screen.
 * The outgoing chain is never valued because it was already started: only the
 * future state produced by the remaining techniques and the carried page is
 * compared with passing to the concert immediately.
 */
export const evaluateTerminalTechniqueOptions = (
  input: TerminalTechniqueOptionsInput,
): TerminalTechniqueOptionAssessment[] | null => {
  if (
    input.plan.mode !== "close" ||
    input.concertIndex < 0 ||
    input.concertIndex >= 4
  ) {
    return null;
  }

  const trials = Math.max(80, Math.trunc(input.trials ?? 240));
  const riskProfile = input.riskProfile ?? "standard";
  const generationProfile = input.generationProfile ?? "speed-wit";
  const threshold = riskThreshold(riskProfile);
  const stopAggregate = emptyAggregate();
  const pushAggregates = new Map(
    input.candidates.map((candidate) => [candidate.id, emptyAggregate()]),
  );

  for (let trial = 0; trial < trials; trial += 1) {
    const stopResult = simulateCrossSectionReadinessTrial(
      {
        completedConcertIndex: input.concertIndex,
        currentPeriod: input.period,
        currentFirstOfferPeriod: input.firstOfferPeriod,
        balanceBeforeLive: input.tokens,
        currentPool: input.currentSongs,
        futureSongs: input.futureSongs,
        totalSongsBeforeNextSection: input.totalSongs,
        riskProfile,
        generationProfile,
        seedKey: `${input.seedKey ?? "terminal-technique"}:stop`,
      },
      trial,
    );
    if (stopResult) addTrial(stopAggregate, stopResult);

    for (const candidate of input.candidates) {
      const aggregate = pushAggregates.get(candidate.id);
      if (!aggregate || !canAfford(input.tokens, candidate.cost)) continue;

      const afterCandidate = subtractCost(input.tokens, candidate.cost);
      const remainingAfterCandidate = Math.max(
        0,
        input.techniquesRemaining - 1,
      );
      const transition = simulateTechniqueTransition({
        period: input.period,
        // The observed candidate already consumed the inherited offer slot.
        firstOfferPeriod: input.period,
        tokens: afterCandidate,
        techniquesRemaining: remainingAfterCandidate,
        nextSongCycle: input.nextSongCycle ?? 1,
        songs: input.currentSongs,
        reserveSongs: [...input.currentSongs, ...(input.futureSongs ?? [])],
        objective: "carryover",
        strategicPlan: input.plan,
        riskProfile,
        generationProfile,
        seedKey: `${input.seedKey ?? "terminal-technique"}:${candidate.id}:tech`,
        trialIndex: trial,
      });
      if (!transition.reached) continue;

      const page = drawTransitionSongPage(
        input.currentSongs,
        `${input.seedKey ?? "terminal-technique"}:${candidate.id}:page:${trial}`,
      );
      let bestResult: CrossSectionTrialResult | null = null;
      let bestVector: readonly number[] | null = null;
      for (const song of page) {
        // A page exposed before a Promotional Live can be used in two distinct
        // ways: buy a worthwhile song immediately (activating it at this Live),
        // or leave the page untouched and carry it across the Live.  The old
        // terminal model only simulated the second branch, which systematically
        // undervalued cheap C1 pushes: a visible Friendship +5 was treated as if
        // it could only be bought in C2, one whole section late.
        if (canAfford(transition.balance, song.cost)) {
          const afterSong = subtractCost(transition.balance, song.cost);
          const futureAfterBuy = simulateCrossSectionReadinessTrial(
            {
              completedConcertIndex: input.concertIndex,
              currentPeriod: input.period,
              currentFirstOfferPeriod: input.firstOfferPeriod,
              balanceBeforeLive: afterSong,
              currentPool: input.currentSongs.filter(
                (candidateSong) => candidateSong.id !== song.id,
              ),
              futureSongs: input.futureSongs,
              totalSongsBeforeNextSection: input.totalSongs + 1,
              riskProfile,
              generationProfile,
              seedKey: `${input.seedKey ?? "terminal-technique"}:${candidate.id}:${song.id}:buy-now`,
            },
            trial,
          );
          if (futureAfterBuy) {
            const purchased = withImmediateSongPurchase({
              result: futureAfterBuy,
              song,
              plan: input.plan,
            });
            const vector = trialVector(purchased);
            if (!bestVector || compareVector(vector, bestVector) > 0) {
              bestResult = purchased;
              bestVector = vector;
            }
          }
        }

        const carry = evaluateExposedCarry({
          concertIndex: input.concertIndex,
          timingMode: "deadline-now",
          tokens: transition.balance,
          song,
          totalSongs: input.totalSongs,
          plan: input.plan,
        });
        if (!carry.valid) continue;
        const future = simulateCrossSectionReadinessTrial(
          {
            completedConcertIndex: input.concertIndex,
            currentPeriod: input.period,
            currentFirstOfferPeriod: input.firstOfferPeriod,
            balanceBeforeLive: transition.balance,
            currentPool: input.currentSongs,
            futureSongs: input.futureSongs,
            totalSongsBeforeNextSection: input.totalSongs,
            carriedSong: song,
            riskProfile,
            generationProfile,
            seedKey: `${input.seedKey ?? "terminal-technique"}:${candidate.id}:${song.id}:carry`,
          },
          trial,
        );
        if (!future) continue;
        const vector = trialVector(future);
        if (!bestVector || compareVector(vector, bestVector) > 0) {
          bestResult = future;
          bestVector = vector;
        }
      }
      if (bestResult) {
        addTrial(
          aggregate,
          bestResult,
          totalCost(candidate.cost) + transition.spent,
        );
      }
    }
  }

  const stop = normalized(stopAggregate, trials);

  return input.candidates.map((candidate) => {
    const push = normalized(
      pushAggregates.get(candidate.id) ?? emptyAggregate(),
      trials,
    );
    const reachState = stateFor(push.completionProbability, threshold);
    const gain = meaningfulGain(stop, push);
    // C1-C4: 16/18 are trajectory indicators, never terminal gates. A push is
    // justified only by a material structural/timing gain and an admissible
    // chance to reach the page.
    const shouldPush = reachState === 2 && gain.gained;
    const reason: Message = shouldPush
      ? { code: "terminal.exposeAndCarry", gain: gain.reason }
      : push.completionProbability < threshold
        ? { code: "terminal.stopNowPageNotReached" }
        : { code: "terminal.stopNow", gain: gain.reason };

    return {
      candidateId: candidate.id,
      applicable: true,
      action: shouldPush ? "expose-and-carry" : "stop-now",
      reason,
      reachProbability: push.completionProbability,
      expectedCommittedCost: push.expectedCommittedCost,
      stopCheckpointProbability: stop.checkpointProbability,
      pushCheckpointProbability: push.checkpointProbability,
      stopTargetProbability: stop.targetProbability,
      pushTargetProbability: push.targetProbability,
      stopFriendship10Probability: stop.friendship10Probability,
      pushFriendship10Probability: push.friendship10Probability,
      stopExpectedFriendshipBonus: stop.expectedFriendshipBonus,
      pushExpectedFriendshipBonus: push.expectedFriendshipBonus,
      stopExpectedStructuralPurchases: stop.expectedStructuralPurchases,
      pushExpectedStructuralPurchases: push.expectedStructuralPurchases,
      decisionVector: [
        shouldPush ? 1 : 0,
        reachState,
        gain.gained ? 1 : 0,
        1,
        push.friendship10Probability,
        push.expectedFriendshipBonus,
        push.targetProbability,
        push.expectedStructuralPurchases,
        -push.expectedCommittedCost,
        push.expectedRetainedTokens,
      ],
    };
  });
};
