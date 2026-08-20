import type { Message } from "../i18n/messages.ts";
import {
  acquiredEffectsForSong,
  calculateShadowPrices,
  canAfford,
  effectExposure,
  estimateRemainingTrainingsByFacility,
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
  wilsonInterval,
  type PairedDifferenceStats,
} from "../monte-carlo.ts";
import {
  compareTerminalCompatUtilityAssessments,
  terminalCompatBreakpointsFromLinearTerms,
  type TerminalCompatLinearTerms,
  type TerminalCompatParameterId,
  type TerminalCompatUtilityAssessment,
} from "./terminal-compat-utility.ts";
import {
  calibrationSensitive,
  coRecommendationReason,
  pairedUtilityRobustness,
  stableCoRecommendationPrimary,
  ROBUSTNESS_BATCH_SIZE,
  ROBUSTNESS_DEFAULT_MAX_SAMPLES,
  ROBUSTNESS_DEFAULT_MIN_SAMPLES,
  ROBUSTNESS_NORMAL_Z,
} from "./robustness.ts";
import { terminalUtilityFromTrial } from "./terminal-outcome.ts";

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

const UTILITY_PARAMETER_IDS: readonly TerminalCompatParameterId[] = [
  "FRIENDSHIP_EXPOSURE_STAT_RATE",
  "SKILL_POINT_UTILITY",
  "SCENARIO_SKILL_UTILITY",
  "SCENARIO_EVENT_UTILITY",
];

type UtilityLinearAggregate = {
  fixedStatPoints: number;
  coefficients: Record<TerminalCompatParameterId, number>;
};

const emptyUtilityLinearAggregate = (): UtilityLinearAggregate => ({
  fixedStatPoints: 0,
  coefficients: {
    FRIENDSHIP_EXPOSURE_STAT_RATE: 0,
    SKILL_POINT_UTILITY: 0,
    SCENARIO_SKILL_UTILITY: 0,
    SCENARIO_EVENT_UTILITY: 0,
  },
});

const addUtilityLinearTerms = (
  aggregate: UtilityLinearAggregate,
  assessment: TerminalCompatUtilityAssessment | null,
): void => {
  if (!assessment) return;
  aggregate.fixedStatPoints += assessment.linearTerms.fixedStatPoints;
  for (const parameter of UTILITY_PARAMETER_IDS) {
    aggregate.coefficients[parameter] +=
      assessment.linearTerms.coefficients[parameter];
  }
};

const normalizedUtilityLinearTerms = (
  aggregate: UtilityLinearAggregate,
  samples: number,
): TerminalCompatLinearTerms => ({
  fixedStatPoints: aggregate.fixedStatPoints / Math.max(1, samples),
  coefficients: Object.fromEntries(
    UTILITY_PARAMETER_IDS.map((parameter) => [
      parameter,
      aggregate.coefficients[parameter] / Math.max(1, samples),
    ]),
  ) as Record<TerminalCompatParameterId, number>,
});

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
  utility: TerminalCompatUtilityAssessment;
  committedCost: number;
  weightedCommittedCost: number;
};

type TerminalPageActionTrialInput = {
  action: ExposedPageAction;
  page: readonly SongTarget[];
  transitionBalance: Balance;
  baseCommittedCost: number;
  baseWeightedCommittedCost: number;
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
      return {
        action,
        result,
        utility: terminalUtilityFromTrial({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 1,
          result,
          couplingKey: `${baseSeed}:future`,
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
      return {
        action,
        result,
        utility: terminalUtilityFromTrial({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 1 + actionTrial.currentSectionPurchases,
          result,
          couplingKey: `${baseSeed}:future`,
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
      return {
        action,
        result: actionTrial.result,
        utility: terminalUtilityFromTrial({
          tieId: pageActionKey(action),
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 0,
          result: actionTrial.result,
          couplingKey: `${baseSeed}:future`,
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
  const stopUtilityLinear = emptyUtilityLinearAggregate();
  let stopUtilityTotal = 0;

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
  const pushUtilityTotals = new Map(
    [...uniqueCandidates.keys()].map((key) => [key, 0]),
  );
  const pushUtilityLinear = new Map(
    [...uniqueCandidates.keys()].map((key) => [
      key,
      emptyUtilityLinearAggregate(),
    ]),
  );
  const pairedUtilityStats = new Map<string, PairedDifferenceStats>(
    [...uniqueCandidates.keys()].map((key) => [
      key,
      createPairedDifferenceStats(),
    ]),
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
    const paired = pairedUtilityRobustness({
      stats: pairedUtilityStats.get(key) ?? createPairedDifferenceStats(),
      minimumSamples,
      maxSamples: maxTrials,
      couplingKey: `${baseSeed}:future`,
    });
    return reachStable && paired.separation !== "not-separated";
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
    const stopUtilityAssessment = stopResult
      ? terminalUtilityFromTrial({
          tieId: "stop-now",
          concertIndex: input.concertIndex,
          songsThisSection: input.songsThisSection,
          currentSectionPurchases: 0,
          result: stopResult,
          couplingKey: `${baseSeed}:future`,
        })
      : null;
    const stopUtility = stopUtilityAssessment?.nominalStatPoints ?? 0;
    stopUtilityTotal += stopUtility;
    addUtilityLinearTerms(stopUtilityLinear, stopUtilityAssessment);
    if (stopResult) addTrial(stopAggregate, stopResult);

    for (const [actionKey, candidate] of uniqueCandidates) {
      const aggregate = pushAggregates.get(actionKey);
      const pairedUtility = pairedUtilityStats.get(actionKey);
      if (!aggregate || !pairedUtility) continue;

      let bestEvaluation: TerminalPageActionTrialEvaluation | null = null;
      let candidateCommittedCost = 0;
      let candidateWeightedCommittedCost = 0;

      if (canAfford(input.tokens, candidate.cost)) {
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
              compareTerminalCompatUtilityAssessments(
                evaluation.utility,
                bestEvaluation.utility,
              ) > 0
            ) {
              bestEvaluation = evaluation;
            }
          }
        }
      }

      const pushUtility = bestEvaluation?.utility.nominalStatPoints ?? 0;
      pushUtilityTotals.set(
        actionKey,
        (pushUtilityTotals.get(actionKey) ?? 0) + pushUtility,
      );
      const linearAggregate = pushUtilityLinear.get(actionKey);
      if (linearAggregate) {
        addUtilityLinearTerms(linearAggregate, bestEvaluation?.utility ?? null);
      }
      addPairedDifference(pairedUtility, pushUtility - stopUtility);

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
  const stopUtilityStatPoints = stopUtilityTotal / trials;

  return input.candidates.map((candidate) => {
    const actionKey =
      candidateKeyById.get(candidate.id) ?? canonicalTechniqueActionKey(candidate.cost);
    const aggregate = pushAggregates.get(actionKey) ?? emptyAggregate();
    const push = normalized(aggregate, trials);
    const pushUtilityStatPoints = (pushUtilityTotals.get(actionKey) ?? 0) / trials;
    const paired =
      pairedUtilityStats.get(actionKey) ?? createPairedDifferenceStats();
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
      stats: paired,
      minimumSamples,
      maxSamples: maxTrials,
      couplingKey: `${baseSeed}:future`,
      timeBudgetExceeded,
      riskSeparated: !riskNotSeparated,
    });
    const utilityDeltaInterval = pairedRobustness.interval;
    const utilityDeltaStatPoints = pairedRobustness.mean;
    const pushLinearTerms = normalizedUtilityLinearTerms(
      pushUtilityLinear.get(actionKey) ?? emptyUtilityLinearAggregate(),
      trials,
    );
    const stopLinearTerms = normalizedUtilityLinearTerms(
      stopUtilityLinear,
      trials,
    );
    const calibrationBreakpoints =
      riskClearlyBelow
        ? []
        : terminalCompatBreakpointsFromLinearTerms({
            leftId: "expose-and-carry",
            rightId: "stop-now",
            left: pushLinearTerms,
            right: stopLinearTerms,
          });
    const calibrationIsSensitive = calibrationSensitive(calibrationBreakpoints);
    const monteCarloNotSeparated =
      riskNotSeparated || pairedRobustness.separation === "not-separated";
    const coReason = coRecommendationReason({
      monteCarloNotSeparated,
      calibrationSensitive: calibrationIsSensitive,
    });
    // Co-recommended actions are deliberately not called equivalent. A true
    // Monte-Carlo not-separation uses the versioned STOP-first stable primary
    // because another seed/sample can reverse the sample mean. Calibration
    // sensitivity is systematic instead: under the nominal fixed policy the
    // primary stays the nominal utility winner while the alternative remains
    // explicitly co-recommended.
    const nominalShouldPush = safetyAdmissible && utilityDeltaStatPoints > 0;
    const robustPrimary = monteCarloNotSeparated
      ? stableCoRecommendationPrimary(
          ["stop-now", "expose-and-carry"] as const,
          ["stop-now", "expose-and-carry"] as const,
        )
      : null;
    const shouldPush = monteCarloNotSeparated
      ? robustPrimary === "expose-and-carry"
      : nominalShouldPush;
    const reason: Message =
      monteCarloNotSeparated
        ? {
            code: "terminal.stopNowNotSeparated",
            coRecommendationReason: coReason ?? "monte-carlo-not-separated",
          }
        : input.concertIndex === 3 && reachLowerBound < catastropheFloor
          ? {
              code: "terminal.stopNowCatastropheFloor",
              grossValue: pushUtilityStatPoints,
              opportunityCost: stopUtilityStatPoints,
              riskPenalty: 0,
              netValue: utilityDeltaStatPoints,
              reachLowerBound,
              catastropheFloor,
            }
          : !safetyAdmissible
            ? { code: "terminal.stopNowPageNotReached" }
            : shouldPush
            ? {
                code: "terminal.exposeAndCarryValue",
                grossValue: pushUtilityStatPoints,
                opportunityCost: stopUtilityStatPoints,
                riskPenalty: 0,
                netValue: utilityDeltaStatPoints,
                reachLowerBound,
                catastropheFloor,
              }
            : {
                code: "terminal.stopNowValue",
                grossValue: pushUtilityStatPoints,
                opportunityCost: stopUtilityStatPoints,
                riskPenalty: 0,
                netValue: utilityDeltaStatPoints,
                reachLowerBound,
                catastropheFloor,
              };
    const converged = candidateStable(actionKey, trials);
    const uncertainAtBudgetLimit =
      !converged && (trials >= maxTrials || timeBudgetExceeded);

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
      calibrationSensitiveParameters: calibrationBreakpoints.map(
        (breakpoint) => breakpoint.parameter,
      ),
      calibrationBreakpoints: calibrationBreakpoints.map((breakpoint) => ({
        ...breakpoint,
      })),
      pairedUtility: pairedRobustness,
      timeBudgetExceeded,
      seedKey: baseSeed,
      canonicalActionKey: actionKey,
      reachProbability: push.completionProbability,
      expectedCommittedCost: push.expectedCommittedCost,
      expectedWeightedCommittedCost: push.expectedWeightedCommittedCost,
      expectedOpportunityCost: stopUtilityStatPoints,
      riskThreshold: threshold,
      catastropheFloor,
      admissionThreshold,
      reachConfidenceInterval: [reachInterval[0], reachInterval[1]] as const,
      reachConfidenceLowerBound: reachLowerBound,
      grossValue: pushUtilityStatPoints,
      riskPenalty: 0,
      netValue: utilityDeltaStatPoints,
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
      decisionVector: [
        shouldPush ? 1 : 0,
        safetyAdmissible ? 2 : push.completionProbability > 0 ? 1 : 0,
        utilityDeltaStatPoints > 0 ? 1 : 0,
        pushUtilityStatPoints,
        utilityDeltaStatPoints,
        utilityDeltaInterval[0],
        utilityDeltaInterval[1],
        push.completionProbability,
        push.targetProbability,
        push.expectedFriendshipTrainingExposure,
        push.expectedSpTrainingExposure,
        push.expectedPracticeTrainingExposure,
      ],
    };
  });
};
