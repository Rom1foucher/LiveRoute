import type { Message } from "../i18n/messages.ts";
import {
  acquiredEffectsForSong,
  calculateShadowPrices,
  canAfford,
  effectExposure,
  estimateRemainingTrainingsByFacility,
  immediatePracticeRewards,
  simulateTechniqueTransition,
  subtractCost,
  techniqueSpendMetrics,
  totalCost,
  type Balance,
  type GenerationProfile,
  type Period,
  type RiskProfile,
  type ResourceDemand,
  type SongTarget,
  type TerminalTechniqueDecisionSummary,
  type TokenPressure,
} from "../live-model.ts";
import {
  manualSongsForGreatSuccess,
  techniquesForSongCycle,
} from "../domain/live-rules.ts";
import {
  deriveStrategicPlan,
  isChaseTarget,
  structuralTier,
  type StrategicPlan,
} from "../planner/strategic-plan.ts";
import {
  enumerateExposedPageActions,
  pageActionKey,
  type ExposedPageAction,
} from "./page-actions.ts";
import {
  simulateCrossSectionActionTrial,
  type CrossSectionTrialResult,
} from "./cross-section.ts";
import { drawTransitionSongPage } from "./song-transition.ts";
import { riskCatastropheFloor, riskThreshold } from "./value.ts";
import {
  addPairedDifference,
  canonicalNumberKey,
  createPairedDifferenceStats,
  probabilityEstimateStable,
  pairedMeanInterval,
  wilsonInterval,
  type PairedDifferenceStats,
} from "../monte-carlo.ts";
import {
  pairedUtilityRobustness,
  ROBUSTNESS_BATCH_SIZE,
  ROBUSTNESS_DEFAULT_MAX_SAMPLES,
  ROBUSTNESS_DEFAULT_MIN_SAMPLES,
  ROBUSTNESS_NORMAL_Z,
} from "./robustness.ts";
import {
  compareTerminalLayeredTrialValues,
  decideTerminalLayeredEvidence,
  classifyTerminalLayeredMetric,
  terminalLayeredMetricValue,
  terminalLayeredTrialValue,
  terminalTechniqueDecisionVector,
  TERMINAL_LAYERED_METRIC_ORDER,
  type TerminalLayeredMetricId,
  type TerminalLayeredTrialValue,
} from "./terminal-layered-value.ts";

export type TerminalTechniqueCandidate = {
  id: string;
  cost: Balance;
};

export type TerminalTechniqueOptionAssessment =
  TerminalTechniqueDecisionSummary & {
    candidateId: string;
    decisionVector: TerminalTechniqueDecisionSummary["decisionVector"];
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
  /** Manual songs already bought in the section being closed. */
  songsThisSection: number;
  plan: StrategicPlan;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  /** Shared soft token pressure from the production solver state. */
  tokenPressure?: TokenPressure[];
  /** PR-5 downstream demand vectors shared with technique/song policy. */
  resourceDemands?: readonly ResourceDemand[];
  /** Adaptive upper bound. */
  trials?: number;
  /** Minimum paired trials before convergence may stop the evaluator. */
  minimumSamples?: number;
  /** Hard wall-clock guard for UI responsiveness; adaptive convergence still wins earlier. */
  maxDurationMs?: number;
  seedKey?: string;
};

const wallClockNow = (): number =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

type LayeredPairedStats = Record<TerminalLayeredMetricId, PairedDifferenceStats>;

const createLayeredPairedStats = (): LayeredPairedStats =>
  Object.fromEntries(
    TERMINAL_LAYERED_METRIC_ORDER.map((metric) => [
      metric,
      createPairedDifferenceStats(),
    ]),
  ) as LayeredPairedStats;

const addLayeredPairedDifference = (
  stats: LayeredPairedStats,
  push: TerminalLayeredTrialValue | null,
  stop: TerminalLayeredTrialValue,
): void => {
  for (const metric of TERMINAL_LAYERED_METRIC_ORDER) {
    addPairedDifference(
      stats[metric],
      (push ? terminalLayeredMetricValue(push, metric) : 0) -
        terminalLayeredMetricValue(stop, metric),
    );
  }
};

const layeredEvidenceFromStats = (stats: LayeredPairedStats) =>
  TERMINAL_LAYERED_METRIC_ORDER.map((metric) =>
    classifyTerminalLayeredMetric({
      metric,
      mean: stats[metric].mean,
      interval: pairedMeanInterval(stats[metric], ROBUSTNESS_NORMAL_Z),
    }),
  );

type Aggregate = {
  completions: number;
  checkpoints: number;
  targets: number;
  friendship10: number;
  effectiveFriendship10: number;
  friendshipBonus: number;
  friendshipTrainingExposure: number;
  spTrainingExposure: number;
  practiceTrainingExposure: number;
  structuralPurchases: number;
  purchases: number;
  retainedTokens: number;
  committedCost: number;
  weightedCommittedCost: number;
};

const emptyAggregate = (): Aggregate => ({
  completions: 0,
  checkpoints: 0,
  targets: 0,
  friendship10: 0,
  effectiveFriendship10: 0,
  friendshipBonus: 0,
  friendshipTrainingExposure: 0,
  spTrainingExposure: 0,
  practiceTrainingExposure: 0,
  structuralPurchases: 0,
  purchases: 0,
  retainedTokens: 0,
  committedCost: 0,
  weightedCommittedCost: 0,
});

const addTrial = (aggregate: Aggregate, result: CrossSectionTrialResult): void => {
  aggregate.completions += 1;
  aggregate.checkpoints += result.checkpointMet ? 1 : 0;
  aggregate.targets += result.targetAcquired ? 1 : 0;
  aggregate.friendship10 += result.friendship10Acquired ? 1 : 0;
  aggregate.effectiveFriendship10 += result.acquiredEffects.some(
    (effect) =>
      effect.kind === "friendship" &&
      effect.magnitude >= 10 &&
      effect.effectiveTrainingExposure > 0,
  )
    ? 1
    : 0;
  aggregate.friendshipBonus += result.friendshipBonus;
  aggregate.friendshipTrainingExposure += result.friendshipTrainingExposure;
  aggregate.spTrainingExposure += result.spTrainingExposure;
  aggregate.practiceTrainingExposure += result.practiceTrainingExposure;
  aggregate.structuralPurchases += result.structuralPurchases;
  aggregate.purchases += result.purchases;
  aggregate.retainedTokens += totalCost(result.retainedBalance);
};

const normalized = (aggregate: Aggregate, trials: number) => ({
  completionProbability: aggregate.completions / trials,
  checkpointProbability: aggregate.checkpoints / trials,
  targetProbability: aggregate.targets / trials,
  friendship10Probability: aggregate.friendship10 / trials,
  effectiveFriendship10Probability: aggregate.effectiveFriendship10 / trials,
  expectedFriendshipBonus: aggregate.friendshipBonus / trials,
  expectedFriendshipTrainingExposure: aggregate.friendshipTrainingExposure / trials,
  expectedSpTrainingExposure: aggregate.spTrainingExposure / trials,
  expectedPracticeTrainingExposure: aggregate.practiceTrainingExposure / trials,
  expectedStructuralPurchases: aggregate.structuralPurchases / trials,
  expectedPurchases: aggregate.purchases / trials,
  expectedRetainedTokens: aggregate.retainedTokens / trials,
  expectedCommittedCost: aggregate.committedCost / trials,
  expectedWeightedCommittedCost: aggregate.weightedCommittedCost / trials,
});

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
  concertIndex,
  generationProfile,
}: {
  result: CrossSectionTrialResult;
  song: SongTarget;
  plan: StrategicPlan;
  concertIndex: number;
  generationProfile: GenerationProfile;
}): CrossSectionTrialResult => {
  const friendship = friendshipValue(song);
  const structural = structuralTier(song, plan) > 0 ? 1 : 0;
  const immediateEffects = acquiredEffectsForSong({
    song,
    concertIndex,
    remainingTrainingsByFacility: estimateRemainingTrainingsByFacility(
      generationProfile,
      concertIndex,
    ),
  });
  const acquiredEffects = [...result.acquiredEffects, ...immediateEffects];
  return {
    ...result,
    targetAcquired: result.targetAcquired || isChaseTarget(song, plan),
    friendship10Acquired: result.friendship10Acquired || friendship >= 10,
    friendshipBonus: result.friendshipBonus + friendship,
    friendshipPurchases: result.friendshipPurchases + (friendship > 0 ? 1 : 0),
    acquiredEffects,
    friendshipTrainingExposure: effectExposure(acquiredEffects, "friendship"),
    spTrainingExposure: effectExposure(acquiredEffects, "sp-training"),
    practiceTrainingExposure: effectExposure(acquiredEffects, "practice"),
    structuralPurchases: result.structuralPurchases + structural,
    purchases: result.purchases + 1,
    lessonSkillPoints: result.lessonSkillPoints + 25,
  };
};

const canonicalTechniqueActionKey = (cost: Balance): string =>
  `tech:${canonicalNumberKey([
    cost.dance,
    cost.passion,
    cost.vocal,
    cost.visual,
    cost.mental,
  ])}`;

const assertNever = (value: never): never => {
  throw new Error(`Unhandled terminal page action: ${JSON.stringify(value)}`);
};

type TerminalPageActionTrialEvaluation = {
  action: ExposedPageAction;
  result: CrossSectionTrialResult;
  layered: TerminalLayeredTrialValue;
  committedCost: number;
  weightedCommittedCost: number;
};

type TerminalPageActionTrialInput = {
  action: ExposedPageAction;
  page: readonly SongTarget[];
  transitionBalance: Balance;
  baseCommittedCost: number;
  baseWeightedCommittedCost: number;
  baseTechniquePurchases: number;
  input: TerminalTechniqueOptionsInput;
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  commonShadowPrices: ReturnType<typeof calculateShadowPrices>;
  tokenPressure: TokenPressure[];
  trial: number;
  baseSeed: string;
};

/**
 * Evaluates one exposed-page physical action with the shared cross-section
 * kernel. The exhaustive switch is intentional: adding a fourth page action
 * must fail compilation here until terminal semantics are provided for it.
 */
const evaluateTerminalPageActionTrial = ({
  action,
  page,
  transitionBalance,
  baseCommittedCost,
  baseWeightedCommittedCost,
  baseTechniquePurchases,
  input,
  riskProfile,
  generationProfile,
  commonShadowPrices,
  tokenPressure,
  trial,
  baseSeed,
}: TerminalPageActionTrialInput): TerminalPageActionTrialEvaluation | null => {
  const shared = {
    completedConcertIndex: input.concertIndex,
    currentPeriod: input.period,
    currentFirstOfferPeriod: input.period,
    futureSongs: input.futureSongs,
    riskProfile,
    generationProfile,
    commonShadowPrices,
    seedKey: `${baseSeed}:future`,
  } as const;

  switch (action.kind) {
    case "buy-stop": {
      const song = page.find((candidate) => candidate.id === action.songId);
      if (!song || !canAfford(transitionBalance, song.cost)) return null;
      const afterSong = subtractCost(transitionBalance, song.cost);
      const remainingPool = input.currentSongs.filter(
        (candidate) => candidate.id !== song.id,
      );
      const actionTrial = simulateCrossSectionActionTrial(
        {
          ...shared,
          balanceBeforeLive: afterSong,
          currentPool: remainingPool,
          totalSongsBeforeNextSection: input.totalSongs + 1,
        },
        trial,
      );
      if (!actionTrial) return null;
      const result = withImmediateSongPurchase({
        result: actionTrial.result,
        song,
        plan: input.plan,
        concertIndex: input.concertIndex,
        generationProfile,
      });
      const spend = techniqueSpendMetrics(song.cost, transitionBalance, tokenPressure);
      const immediate = immediatePracticeRewards(song.practiceBonus);
      const currentImmediateSkillPoints =
        baseTechniquePurchases * 5 + 25 + immediate.skillPoints;
      const currentImmediateStatPoints = immediate.statPoints;
      const currentStructuralTier = structuralTier(song, input.plan);
      return {
        action,
        result,
        layered: terminalLayeredTrialValue({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 1,
          currentStructuralTier,
          currentImmediateStatPoints,
          currentImmediateSkillPoints,
          result,
        }),
        committedCost: baseCommittedCost + spend.totalSpend,
        weightedCommittedCost:
          baseWeightedCommittedCost + spend.weightedDemandCost,
      };
    }

    case "buy-continue": {
      const song = page.find((candidate) => candidate.id === action.songId);
      if (!song || !canAfford(transitionBalance, song.cost)) return null;
      const remainingPool = input.currentSongs.filter(
        (candidate) => candidate.id !== song.id,
      );
      if (remainingPool.length === 0) return null;
      const afterSong = subtractCost(transitionBalance, song.cost);
      const nextCycle = (input.nextSongCycle ?? 1) + 1;
      const techniquesToNextSong = techniquesForSongCycle(
        input.concertIndex,
        nextCycle,
      );
      if (techniquesToNextSong === null) return null;
      const songsAfterPurchase = input.songsThisSection + 1;
      const planAfterPurchase = deriveStrategicPlan({
        concertIndex: input.concertIndex,
        timingMode: "deadline-now",
        remainingSongs: remainingPool,
        songsThisSection: songsAfterPurchase,
      });
      const requiredPurchases = Math.max(
        0,
        manualSongsForGreatSuccess(input.concertIndex) - songsAfterPurchase,
      );
      const actionTrial = simulateCrossSectionActionTrial(
        {
          ...shared,
          balanceBeforeLive: afterSong,
          currentPool: remainingPool,
          totalSongsBeforeNextSection: input.totalSongs + 1,
          currentContinuation: {
            plan: planAfterPurchase,
            nextSongCycle: nextCycle,
            techniquesToNextSong,
            pages: Math.max(1, Math.min(3, remainingPool.length)),
            requiredPurchases,
            acquiredPlanTarget: isChaseTarget(song, input.plan),
            continueForStructuralValue: true,
          },
        },
        trial,
      );
      // BUY_CONTINUE must be a real continuation, not an alias for BUY_STOP.
      if (
        !actionTrial ||
        (actionTrial.currentSectionPurchases === 0 &&
          actionTrial.currentSectionTechniquePurchases === 0)
      ) {
        return null;
      }
      const result = withImmediateSongPurchase({
        result: actionTrial.result,
        song,
        plan: input.plan,
        concertIndex: input.concertIndex,
        generationProfile,
      });
      const spend = techniqueSpendMetrics(song.cost, transitionBalance, tokenPressure);
      const immediate = immediatePracticeRewards(song.practiceBonus);
      const currentImmediateSkillPoints =
        baseTechniquePurchases * 5 +
        25 +
        immediate.skillPoints +
        actionTrial.currentSectionPurchases * 25 +
        actionTrial.currentSectionTechniquePurchases * 5 +
        actionTrial.currentSectionImmediateSkillPoints;
      const currentImmediateStatPoints =
        immediate.statPoints + actionTrial.currentSectionImmediateStatPoints;
      const currentStructuralTier = Math.max(
        structuralTier(song, input.plan),
        actionTrial.currentSectionBestStructuralTier,
      );
      const currentSectionPurchases = 1 + actionTrial.currentSectionPurchases;
      return {
        action,
        result,
        layered: terminalLayeredTrialValue({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases,
          currentStructuralTier,
          currentImmediateStatPoints,
          currentImmediateSkillPoints,
          result,
        }),
        committedCost:
          baseCommittedCost +
          spend.totalSpend +
          actionTrial.currentSectionCommittedCost,
        weightedCommittedCost:
          baseWeightedCommittedCost +
          spend.weightedDemandCost +
          actionTrial.currentSectionCommittedCost,
      };
    }

    case "carry-current-page": {
      const actionTrial = simulateCrossSectionActionTrial(
        {
          ...shared,
          balanceBeforeLive: transitionBalance,
          currentPool: input.currentSongs,
          totalSongsBeforeNextSection: input.totalSongs,
          carriedPage: page,
        },
        trial,
      );
      if (!actionTrial) return null;
      const currentImmediateSkillPoints = baseTechniquePurchases * 5;
      return {
        action,
        result: actionTrial.result,
        layered: terminalLayeredTrialValue({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 0,
          currentStructuralTier: 0,
          currentImmediateStatPoints: 0,
          currentImmediateSkillPoints,
          result: actionTrial.result,
        }),
        committedCost: baseCommittedCost,
        weightedCommittedCost: baseWeightedCommittedCost,
      };
    }

    default:
      return assertNever(action);
  }
};

/**
 * Compares STOP_NOW with EXPOSE_AND_CARRY at a terminal technique screen.
 * Every exposed-page action is valued through the same T1a/T1b path. The only
 * C4-specific rule left is its documented catastrophe-floor admission policy;
 * there is no C4-specific value/economy function.
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

  const maxTrials = Math.max(
    80,
    Math.trunc(input.trials ?? ROBUSTNESS_DEFAULT_MAX_SAMPLES),
  );
  const minimumSamples = Math.min(
    maxTrials,
    Math.max(
      1,
      Math.trunc(
        input.minimumSamples ??
          (maxTrials <= 128 ? maxTrials : ROBUSTNESS_DEFAULT_MIN_SAMPLES),
      ),
    ),
  );
  const convergenceBatch = ROBUSTNESS_BATCH_SIZE;
  const startedAt = wallClockNow();
  const maxDurationMs =
    input.maxDurationMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, input.maxDurationMs);
  let timeBudgetExceeded = false;
  const riskProfile = input.riskProfile ?? "standard";
  const generationProfile = input.generationProfile ?? "speed-wit";
  const tokenPressure = input.tokenPressure ?? [];
  const resourceDemands = input.resourceDemands ?? [];
  const commonShadowPrices = calculateShadowPrices(
    input.tokens,
    resourceDemands,
    generationProfile,
  );
  const threshold = riskThreshold(riskProfile);
  const catastropheFloor = riskCatastropheFloor(riskProfile);
  const admissionThreshold = input.concertIndex === 3 ? catastropheFloor : threshold;
  const baseSeed = `${input.seedKey ?? "terminal-technique"}:crn`;
  const stopAggregate = emptyAggregate();

  const candidateKeyById = new Map<string, string>();
  const uniqueCandidates = new Map<string, TerminalTechniqueCandidate>();
  for (const candidate of input.candidates) {
    const key = canonicalTechniqueActionKey(candidate.cost);
    candidateKeyById.set(candidate.id, key);
    if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, candidate);
  }
  const pushAggregates = new Map(
    [...uniqueCandidates.keys()].map((key) => [key, emptyAggregate()]),
  );
  const layeredPairedStats = new Map<string, LayeredPairedStats>(
    [...uniqueCandidates.keys()].map((key) => [key, createLayeredPairedStats()]),
  );

  const candidateStable = (key: string, samples: number): boolean => {
    if (samples < minimumSamples) return false;
    const aggregate = pushAggregates.get(key) ?? emptyAggregate();
    const reachStable = probabilityEstimateStable({
      successes: aggregate.completions,
      samples,
      thresholds: [admissionThreshold, 0.985],
      maxWidth: 0.05,
      z: ROBUSTNESS_NORMAL_Z,
    });
    const layeredStats = layeredPairedStats.get(key) ?? createLayeredPairedStats();
    const layeredDecision = decideTerminalLayeredEvidence(
      layeredEvidenceFromStats(layeredStats),
    );
    const layeredStable =
      layeredDecision.separated ||
      layeredDecision.reason === "no-material-difference";
    return reachStable && layeredStable;
  };

  let actualTrials = 0;
  for (let trial = 0; trial < maxTrials; trial += 1) {
    const stopActionTrial = simulateCrossSectionActionTrial(
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
        commonShadowPrices,
        seedKey: `${baseSeed}:future`,
      },
      trial,
    );
    const stopResult = stopActionTrial?.result ?? null;
    const stopLayered = stopResult
      ? terminalLayeredTrialValue({
          tieId: "stop-now",
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 0,
          currentStructuralTier: 0,
          currentImmediateStatPoints: 0,
          currentImmediateSkillPoints: 0,
          result: stopResult,
        })
      : null;
    if (stopResult) addTrial(stopAggregate, stopResult);

    for (const [actionKey, candidate] of uniqueCandidates) {
      const aggregate = pushAggregates.get(actionKey);
      const layeredStats = layeredPairedStats.get(actionKey);
      if (!aggregate || !layeredStats || !stopLayered || !stopResult) continue;

      let bestEvaluation: TerminalPageActionTrialEvaluation | null = null;
      let candidateCommittedCost = 0;
      let candidateWeightedCommittedCost = 0;
      let attemptedTechniquePurchases = 0;
      const candidateAffordable = canAfford(input.tokens, candidate.cost);

      if (candidateAffordable) {
        const candidateSpend = techniqueSpendMetrics(
          candidate.cost,
          input.tokens,
          tokenPressure,
        );
        const afterCandidate = subtractCost(input.tokens, candidate.cost);
        const transition = simulateTechniqueTransition({
          period: input.period,
          firstOfferPeriod: input.period,
          tokens: afterCandidate,
          techniquesRemaining: Math.max(0, input.techniquesRemaining - 1),
          nextSongCycle: input.nextSongCycle ?? 1,
          songs: input.currentSongs,
          reserveSongs: [...input.currentSongs, ...(input.futureSongs ?? [])],
          resourceDemands,
          objective: "carryover",
          strategicPlan: input.plan,
          riskProfile,
          generationProfile,
          seedKey: `${baseSeed}:tech`,
          trialIndex: trial,
        });

        candidateCommittedCost = candidateSpend.totalSpend + transition.spent;
        candidateWeightedCommittedCost =
          candidateSpend.weightedDemandCost + transition.spent;
        attemptedTechniquePurchases = 1 + transition.purchases;

        if (transition.reached) {
          const page = drawTransitionSongPage(
            input.currentSongs,
            `${baseSeed}:page:${trial}`,
          );
          const pageActions = enumerateExposedPageActions({
            tokens: transition.balance,
            visibleSongs: page,
            timingMode: "deadline-now",
            concertIndex: input.concertIndex,
          });

          for (const action of pageActions) {
            const evaluation = evaluateTerminalPageActionTrial({
              action,
              page,
              transitionBalance: transition.balance,
              baseCommittedCost: candidateCommittedCost,
              baseWeightedCommittedCost: candidateWeightedCommittedCost,
              baseTechniquePurchases: 1 + transition.purchases,
              input,
              riskProfile,
              generationProfile,
              commonShadowPrices,
              tokenPressure,
              trial,
              baseSeed,
            });
            if (!evaluation) continue;
            if (
              !bestEvaluation ||
              compareTerminalLayeredTrialValues(
                evaluation.layered,
                bestEvaluation.layered,
              ) > 0
            ) {
              bestEvaluation = evaluation;
            }
          }
        }
      }

      // A miss is not a zeroed world. Existing gates remain secured and any
      // Techniques physically bought before the miss keep their immediate
      // reward. Reuse STOP's downstream projection only to keep unchanged T2
      // context neutral; no structural acquisition is invented on the miss.
      const attemptedLayered = bestEvaluation?.layered ??
        terminalLayeredTrialValue({
          tieId: `${actionKey}:no-page`,
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 0,
          currentStructuralTier: 0,
          currentImmediateStatPoints: 0,
          currentImmediateSkillPoints: candidateAffordable
            ? attemptedTechniquePurchases * 5
            : 0,
          result: stopResult,
        });
      addLayeredPairedDifference(layeredStats, attemptedLayered, stopLayered);

      aggregate.committedCost +=
        bestEvaluation?.committedCost ?? candidateCommittedCost;
      aggregate.weightedCommittedCost +=
        bestEvaluation?.weightedCommittedCost ?? candidateWeightedCommittedCost;
      if (bestEvaluation) addTrial(aggregate, bestEvaluation.result);
    }

    actualTrials = trial + 1;
    if (actualTrials % convergenceBatch === 0) {
      if (wallClockNow() - startedAt >= maxDurationMs) {
        timeBudgetExceeded = true;
        break;
      }
      if (
        [...uniqueCandidates.keys()].every((key) =>
          candidateStable(key, actualTrials),
        )
      ) {
        break;
      }
    }
  }

  const trials = Math.max(1, actualTrials);
  const stop = normalized(stopAggregate, trials);

  return input.candidates.map((candidate) => {
    const actionKey =
      candidateKeyById.get(candidate.id) ?? canonicalTechniqueActionKey(candidate.cost);
    const aggregate = pushAggregates.get(actionKey) ?? emptyAggregate();
    const push = normalized(aggregate, trials);
    const layeredStats =
      layeredPairedStats.get(actionKey) ?? createLayeredPairedStats();
    const layeredEvidence = layeredEvidenceFromStats(layeredStats);
    const layeredDecision = decideTerminalLayeredEvidence(layeredEvidence);
    const decisiveMetric = layeredDecision.metric ?? "mechanical-reward";
    const decisiveEvidence =
      layeredEvidence.find((item) => item.metric === decisiveMetric) ??
      layeredEvidence[0]!;
    const reachInterval = wilsonInterval(
      aggregate.completions,
      trials,
      ROBUSTNESS_NORMAL_Z,
    );
    const reachLowerBound = reachInterval[0];
    const safetyAdmissible = reachLowerBound >= admissionThreshold;
    const riskClearlyBelow = reachInterval[1] < admissionThreshold;
    const riskNotSeparated = !safetyAdmissible && !riskClearlyBelow;
    const pairedRobustness = pairedUtilityRobustness({
      stats: layeredStats[decisiveMetric],
      minimumSamples,
      maxSamples: maxTrials,
      couplingKey: `${baseSeed}:future:${decisiveMetric}`,
      timeBudgetExceeded,
      riskSeparated: !riskNotSeparated,
    });
    const layeredNotSeparated =
      !layeredDecision.separated || riskNotSeparated;
    // Below the gate/structural layers, PUSH has a real resource trade-off:
    // it spends tokens that STOP preserves. We deliberately do not invent a
    // token-to-stat exchange rate to let immediate/T2 rewards settle that
    // trade-off. Keep STOP as the stable primary and surface PUSH as a genuine
    // alternative instead.
    const resourceTradeoff =
      layeredDecision.separated &&
      layeredDecision.action === "expose-and-carry" &&
      (layeredDecision.layer === "mechanical" || layeredDecision.layer === "t2") &&
      push.expectedCommittedCost > 0;
    const coReason =
      !riskClearlyBelow && resourceTradeoff
        ? ("resource-tradeoff" as const)
        : !riskClearlyBelow && layeredNotSeparated
          ? ("monte-carlo-not-separated" as const)
          : null;
    const shouldPush =
      safetyAdmissible &&
      !coReason &&
      layeredDecision.action === "expose-and-carry";
    const reason: Message =
      input.concertIndex === 3 && riskClearlyBelow
        ? {
            code: "terminal.stopNowCatastropheFloorLayered",
            reachLowerBound,
            catastropheFloor,
          }
        : coReason
          ? {
              code: "terminal.stopNowNotSeparated",
              coRecommendationReason: coReason,
            }
          : !safetyAdmissible
            ? { code: "terminal.stopNowPageNotReached" }
            : shouldPush
              ? {
                  code: "terminal.exposeAndCarryLayered",
                  layer: layeredDecision.layer === "none" ? "t2" : layeredDecision.layer,
                  metric: decisiveMetric,
                  delta: decisiveEvidence.mean,
                  reachLowerBound,
                  catastropheFloor,
                }
              : {
                  code: "terminal.stopNowLayered",
                  layer: layeredDecision.layer === "none" ? "t2" : layeredDecision.layer,
                  metric: decisiveMetric,
                  delta: decisiveEvidence.mean,
                  reachLowerBound,
                  catastropheFloor,
                };
    const converged = candidateStable(actionKey, trials);
    const uncertainAtBudgetLimit =
      !converged && (trials >= maxTrials || timeBudgetExceeded);
    const decisionLayer = !safetyAdmissible
      ? ("risk" as const)
      : layeredDecision.layer;
    const decisionMetric = !safetyAdmissible
      ? "reach-admission"
      : layeredDecision.metric;
    const decisionDelta = !safetyAdmissible
      ? reachLowerBound - admissionThreshold
      : decisiveEvidence.mean;
    const decisionInterval = !safetyAdmissible
      ? ([
          reachInterval[0] - admissionThreshold,
          reachInterval[1] - admissionThreshold,
        ] as const)
      : decisiveEvidence.interval;

    return {
      candidateId: candidate.id,
      applicable: true,
      action: shouldPush ? "expose-and-carry" : "stop-now",
      reason,
      trials,
      maxTrials,
      converged,
      uncertainAtBudgetLimit,
      coRecommended: coReason
        ? ([shouldPush ? "stop-now" : "expose-and-carry"] as const)
        : ([] as const),
      coRecommendationReason: coReason,
      calibrationSensitiveParameters: [],
      calibrationBreakpoints: [],
      decisionLayer,
      decisionMetric,
      decisionDelta,
      decisionInterval,
      pairedUtility: pairedRobustness,
      timeBudgetExceeded,
      seedKey: baseSeed,
      canonicalActionKey: actionKey,
      reachProbability: push.completionProbability,
      expectedCommittedCost: push.expectedCommittedCost,
      expectedWeightedCommittedCost: push.expectedWeightedCommittedCost,
      expectedOpportunityCost: 0,
      riskThreshold: threshold,
      catastropheFloor,
      admissionThreshold,
      reachConfidenceInterval: [reachInterval[0], reachInterval[1]] as const,
      reachConfidenceLowerBound: reachLowerBound,
      grossValue: 0,
      riskPenalty: 0,
      netValue: 0,
      stopCheckpointProbability: stop.checkpointProbability,
      pushCheckpointProbability: push.checkpointProbability,
      stopTargetProbability: stop.targetProbability,
      pushTargetProbability: push.targetProbability,
      stopFriendship10Probability: stop.friendship10Probability,
      pushFriendship10Probability: push.friendship10Probability,
      stopEffectiveFriendship10Probability:
        stop.effectiveFriendship10Probability,
      pushEffectiveFriendship10Probability:
        push.effectiveFriendship10Probability,
      stopExpectedFriendshipBonus: stop.expectedFriendshipBonus,
      pushExpectedFriendshipBonus: push.expectedFriendshipBonus,
      stopExpectedFriendshipTrainingExposure:
        stop.expectedFriendshipTrainingExposure,
      pushExpectedFriendshipTrainingExposure:
        push.expectedFriendshipTrainingExposure,
      stopExpectedSpTrainingExposure: stop.expectedSpTrainingExposure,
      pushExpectedSpTrainingExposure: push.expectedSpTrainingExposure,
      stopExpectedPracticeTrainingExposure:
        stop.expectedPracticeTrainingExposure,
      pushExpectedPracticeTrainingExposure:
        push.expectedPracticeTrainingExposure,
      stopExpectedStructuralPurchases: stop.expectedStructuralPurchases,
      pushExpectedStructuralPurchases: push.expectedStructuralPurchases,
      // Terminal technique ranking consumes the same layered contract as the
      // PUSH-vs-STOP decision. No compatibility scalar, gate-18 projection or
      // Friendship-exposure conversion is allowed back in through this vector.
      decisionVector: terminalTechniqueDecisionVector({
        pushRecommended: shouldPush,
        riskState: safetyAdmissible ? 2 : riskNotSeparated ? 1 : 0,
        layeredState: layeredDecision.separated
          ? layeredDecision.action === "expose-and-carry" && !resourceTradeoff
            ? 2
            : layeredDecision.action === "stop-now"
              ? 0
              : 1
          : 1,
        metricMeans: Object.fromEntries(
          TERMINAL_LAYERED_METRIC_ORDER.map((metric) => [
            metric,
            layeredStats[metric].mean,
          ]),
        ) as Record<TerminalLayeredMetricId, number>,
      }),
    };
  });
};
