import type { Message } from "./i18n/messages.ts";
import { classifySongRoles, type SongRole } from "./domain/song-catalog.ts";
import {
  isGreatSuccess,
  manualSongsForGreatSuccess,
  techniquesForSongCycle,
} from "./domain/live-rules.ts";
import {
  isChaseTarget,
  isReserveTarget,
  planExitMessage,
  planFallbackMessage,
  planLabelMessage,
  strategicReserveWeight,
  type StrategicPlan,
} from "./planner/strategic-plan.ts";
import { evaluatePageCoverage, type PageCoverage } from "./solver/song-dp.ts";
import { riskThreshold } from "./solver/value.ts";

export const TOKEN_KEYS = [
  "dance",
  "passion",
  "vocal",
  "visual",
  "mental",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Balance = Record<TokenKey, number>;
export type Period = "junior" | "classic" | "senior";
export type TechniqueQuickKind =
  "mono" | "duo-balanced" | "duo-split" | "hint" | "energy";
export type TechniqueLevelOption = {
  label: string;
  effect: string;
  cost: number;
};
export type AnalysisObjective = "carryover" | "any-song" | "priority-song";
export type RiskProfile = "safe" | "standard" | "greedy";
export type GenerationProfile =
  "speed-wit" | "speed-stamina-wit" | "power-present" | "balanced";
export type TrainingFacility =
  "speed" | "stamina" | "power" | "guts" | "wisdom";
export type TrainingStat = TrainingFacility;
export type RemainingTrainingsByFacility = Record<TrainingFacility, number>;
type Category = "status" | "dual" | "skillPt" | "hint" | "rest";

export type Weighted<T> = {
  value: T;
  weight: number;
};

export type AnalysisInput = {
  period: Period;
  /**
   * Pricing/distribution used only for the first unknown offer page.
   * A technique page already displayed before a Live keeps its original prices;
   * only one card can be bought from that page because the shop refreshes after
   * every purchase. Every refresh after that purchase uses `period`.
   */
  firstOfferPeriod?: Period;
  tokens: Balance;
  candidateCost?: Balance;
  techniquesRemaining: number;
  /** Song-cycle number of the page reached after these techniques. */
  nextSongCycle?: number;
  songs?: SongTarget[];
  /** Songs whose vectors should remain protected while choosing techniques. */
  reserveSongs?: SongTarget[];
  objective?: AnalysisObjective;
  strategicPlan?: StrategicPlan;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  seedKey?: string;
  trials?: number;
  /** Optional adaptive floor; production uses a lower floor in express mode. */
  minimumSamples?: number;
  /**
   * Optional per-decision memo shared by sibling candidate analyses. The
   * public result is unchanged; this only avoids regenerating identical
   * technique offers and recomputing identical discrete states.
   */
  techniqueMemo?: TechniqueSimulationMemo;
};

export type SongTarget = {
  id: string;
  name: string;
  cost: Balance;
  priority: boolean;
  roles?: SongRole[];
  utility: number;
  policyValue?: number;
  immediateValue?: number;
  liveValue?: number;
  /** Raw catalogue label retained so state-dependent training value can be recomputed. */
  practiceBonus?: string;
  /** State-dependent structural value of the practice bonus. */
  practiceValue?: number;
};

export type ContextualSongValueInput = {
  practiceBonus: string;
  liveBonusType: "friendship" | "speciality" | "event";
  liveBonusValue: number;
  declaredPriority: "normal" | "high" | "top";
};

export type TokenPressure = {
  key: TokenKey;
  shadowValue: number;
  reserveTarget: number;
  margin: number;
  demandCount: number;
  priorityDemandCount: number;
  reserveReason: Message;
  level: "critical" | "tight" | "useful" | "free";
};

export type TechniqueSpendMetrics = {
  reserveBreachCount: number;
  reserveDeficit: number;
  minimumPostPurchaseMargin: number;
  retainedPostPurchaseMargin: number;
  normalizedReserveDrain: number;
  weightedDemandCost: number;
  totalSpend: number;
};

export type TokenReserveTarget = {
  id: string;
  name: string;
  cost: Balance;
  priority: boolean;
  policyValue: number;
};

export type TokenReservePlan = {
  mode: "none" | "single" | "frontier";
  /** Feasible strategic vectors protected as a set, never merged per colour. */
  targets: TokenReserveTarget[];
  skippedTargets?: Array<{
    id: string;
    name: string;
    reason: Message;
  }>;
};

export type ReserveFeasibilityContext = {
  /** Career section used for technique pricing/patterns. */
  period: Period;
  /** Price period of the currently exposed technique page, if inherited. */
  firstOfferPeriod?: Period;
  concertIndex: number;
  /** Song-cycle number of the next acquisition opportunity. */
  nextSongCycle: number;
  /** Number of technique purchases still required before that opportunity. */
  techniquesToNextSong: number;
  /** Real offers on the current technique page. Only the first step uses them. */
  currentTechniqueOffers?: readonly Balance[];
  /** Real songs already exposed now; they have zero reach cost. */
  visibleSongs?: readonly SongTarget[];
  /** Current-pool songs eligible for hard reserve. Soft pressure may see more. */
  reserveSongIds?: readonly string[];
};

export type TokenReservePlanOptions = {
  tokens?: Balance;
  feasibility?: ReserveFeasibilityContext;
  /** Soft shadow prices used only to break equal structural values. */
  shadowByKey?: Partial<Record<TokenKey, number>>;
};

export type SongOutcome = {
  id: string;
  name: string;
  priority: boolean;
  utility: number;
  appearanceProbability: number;
  affordProbability: number;
  reachAffordAndShownProbability: number;
};

export type TerminalTechniqueDecisionSummary = {
  applicable: true;
  action: "stop-now" | "expose-and-carry";
  reason: Message;
  reachProbability: number;
  expectedCommittedCost: number;
  stopCheckpointProbability: number;
  pushCheckpointProbability: number;
  stopTargetProbability: number;
  pushTargetProbability: number;
  stopFriendship10Probability: number;
  pushFriendship10Probability: number;
  stopExpectedFriendshipBonus: number;
  pushExpectedFriendshipBonus: number;
  stopExpectedStructuralPurchases: number;
  pushExpectedStructuralPurchases: number;
  decisionVector: readonly number[];
};

export type AnalysisResult = {
  valid: boolean;
  objective: AnalysisObjective;
  /** Joint probability P(reach ∧ objective). Kept under the historical name for UI compatibility. */
  goalProbability: number;
  jointGoalProbability: number;
  /** Conditional probability P(objective | reach), diagnostic only. */
  conditionalGoalProbability: number;
  reachProbability: number;
  failProbability: number;
  anySongShownProbability: number;
  prioritySongShownProbability: number;
  reachAnySongAffordableProbability: number;
  reachPrioritySongAffordableProbability: number;
  expectedBestSongUtility: number;
  songOutcomes: SongOutcome[];
  immediateBlockProbability: number;
  lateBlockProbability: number;
  expectedWaste: number;
  conditionalWaste: number;
  averageSuccessSpend: number;
  failureDepth: number[];
  criticalToken: TokenKey | null;
  criticalTokenGain: number;
  /** Actual Monte-Carlo samples consumed after deterministic convergence. */
  trials: number;
  /** Requested upper bound before adaptive convergence. */
  maxTrials: number;
  converged: boolean;
  recommendation: "safe" | "push" | "risky" | "stop" | "invalid";
  planId?: StrategicPlan["id"];
  planLabel?: Message;
  exitCondition?: Message;
  fallback?: Message;
  probabilityScope: "conditional-shop";
  terminalDecision?: TerminalTechniqueDecisionSummary;
};

export type TechniqueTransitionInput = {
  period: Period;
  firstOfferPeriod?: Period;
  tokens: Balance;
  techniquesRemaining: number;
  /** Song-cycle number of the page reached after these techniques. */
  nextSongCycle?: number;
  songs?: SongTarget[];
  reserveSongs?: SongTarget[];
  objective?: AnalysisObjective;
  strategicPlan?: StrategicPlan;
  riskProfile?: RiskProfile;
  generationProfile?: GenerationProfile;
  seedKey: string;
  trialIndex: number;
  memo?: TechniqueSimulationMemo;
};

export type TechniqueTransitionResult = {
  reached: boolean;
  balance: Balance;
  spent: number;
  purchases: number;
  failureDepth: number | null;
};

export type TechniqueSimulationMemoStats = {
  pressureHits: number;
  pressureMisses: number;
  coverageHits: number;
  coverageMisses: number;
  songMetricHits: number;
  songMetricMisses: number;
};

/**
 * Per-analysis memoization for the adaptive technique kernel. The Monte-Carlo
 * revisits many identical discrete balances; recomputing reserve pressure and
 * page coverage for every trial dominated song-page latency.
 */
export type TechniqueSimulationMemo = {
  offers: Map<string, Balance[]>;
  pressure: Map<string, TokenPressure[]>;
  coverage: Map<string, PageCoverage>;
  songMetrics: Map<string, SongBalanceMetrics>;
  stats: TechniqueSimulationMemoStats;
};

export const createTechniqueSimulationMemo = (): TechniqueSimulationMemo => ({
  offers: new Map(),
  pressure: new Map(),
  coverage: new Map(),
  songMetrics: new Map(),
  stats: {
    pressureHits: 0,
    pressureMisses: 0,
    coverageHits: 0,
    coverageMisses: 0,
    songMetricHits: 0,
    songMetricMisses: 0,
  },
});

export type TechniqueStrategyInput = {
  concertIndex: number;
  songsThisSection: number;
  tokens: Balance;
  currentSongs: SongTarget[];
  futureSongs: SongTarget[];
  futureTopCount?: number;
  result: AnalysisResult;
  strategicPlan: StrategicPlan;
};

export type TechniqueStrategy = {
  applies: boolean;
  shouldSave: boolean;
  greatSuccessSecured: boolean;
  currentPriorityCount: number;
  futurePriorityCount: number;
  futureTopCount: number;
  nextPoolSize: number;
  priorityVisibilityBefore: number;
  priorityVisibilityAfterThinning: number;
  priorityVisibilityGain: number;
  topVisibilityBefore: number;
  topVisibilityAfterThinning: number;
  topVisibilityGain: number;
  cheapestCurrentSongCost: number;
  estimatedCommitment: number;
  commitmentShare: number;
};

const zeroBalance = (): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
});

export const contextualSongValues = ({
  practiceBonus,
  liveBonusType,
  liveBonusValue,
  declaredPriority,
}: ContextualSongValueInput): Pick<
  SongTarget,
  | "priority"
  | "roles"
  | "utility"
  | "policyValue"
  | "immediateValue"
  | "liveValue"
  | "practiceValue"
> => {
  const roles = classifySongRoles({
    practiceBonus,
    liveBonusType,
    liveBonusValue,
  });
  const immediateValue = roles.includes("sp3-target")
    ? 3
    : roles.includes("sp2-target")
      ? 2
      : 0;
  const liveValue = roles.includes("friendship-10")
    ? 10
    : roles.includes("friendship-5")
      ? 5
      : roles.includes("specialty-priority")
        ? 1
        : 0;
  const trainingMatch = practiceBonus.match(
    /^(speed|stamina|power|guts|wisdom) training \+(\d+)/i,
  );
  const practiceValue = roles.includes("sp3-target")
    ? 5
    : roles.includes("sp2-target")
      ? 4
      : trainingMatch
        ? Math.max(0, Number.parseInt(trainingMatch[2] ?? "0", 10))
        : /^(speed|stamina|power|guts|wisdom) \+\d+/i.test(practiceBonus)
          ? 0.5
          : /skill pts? \+\d+/i.test(practiceBonus)
            ? 1
            : 0;
  // Ordinal telemetry only. Decision ordering is role/plan based and never
  // adds these heterogeneous values together.
  const policyValue = roles.includes("sp3-target")
    ? 500
    : roles.includes("sp2-target")
      ? 480
      : roles.includes("friendship-10")
        ? 360
        : roles.includes("friendship-5")
          ? 260
          : roles.includes("specialty-priority")
            ? 40
            : 0;
  const structural = roles.some(
    (role) =>
      role === "sp2-target" ||
      role === "sp3-target" ||
      role === "friendship-10" ||
      role === "friendship-5",
  );
  return {
    priority: structural,
    roles,
    utility:
      roles.includes("sp3-target") || roles.includes("sp2-target")
        ? 5
        : roles.includes("friendship-10")
          ? 4
          : roles.includes("friendship-5")
            ? 3
            : roles.includes("specialty-priority") ||
                declaredPriority !== "normal"
              ? 1
              : 0,
    policyValue,
    immediateValue,
    liveValue,
    practiceValue,
  };
};

const TRAINING_FACILITIES: readonly TrainingFacility[] = [
  "speed",
  "stamina",
  "power",
  "guts",
  "wisdom",
];

/**
 * Number of clicks by facility on the reference 45-training horizon.
 * Only `speed-wit` has an in-game calibrated distribution in the August
 * addendum (20/3/4/3/15). We deliberately do not invent distributions for the
 * other GenerationProfiles: they keep the v0.22.18 static filler value until a
 * run-derived mix (or an exact RemainingTrainingsByFacility) is supplied.
 */
const CALIBRATED_FACILITY_CLICK_MIX: Partial<
  Record<GenerationProfile, RemainingTrainingsByFacility>
> = {
  "speed-wit": {
    speed: 20,
    stamina: 3,
    power: 4,
    guts: 3,
    wisdom: 15,
  },
};

/** Exact Grand Live stat-production topology from the calibrated addendum. */
const STAT_PRODUCING_FACILITIES: Record<
  TrainingStat,
  readonly TrainingFacility[]
> = {
  speed: ["speed", "guts", "wisdom"],
  stamina: ["stamina", "power"],
  power: ["speed", "power", "guts"],
  guts: ["stamina", "guts"],
  wisdom: ["wisdom"],
};

const deriveFacilityStatWeights = (
  clicks: RemainingTrainingsByFacility,
): Record<TrainingStat, number> => {
  const produced = Object.fromEntries(
    TRAINING_FACILITIES.map((stat) => [
      stat,
      STAT_PRODUCING_FACILITIES[stat].reduce(
        (sum, facility) => sum + clicks[facility],
        0,
      ),
    ]),
  ) as Record<TrainingStat, number>;
  const speedBaseline = Math.max(1, produced.speed);
  return Object.fromEntries(
    TRAINING_FACILITIES.map((stat) => [stat, produced[stat] / speedBaseline]),
  ) as Record<TrainingStat, number>;
};

/**
 * Relative Training X Gain weights, derived from facility production rather
 * than copied stat-by-stat. For `speed-wit` this yields the calibrated
 * 1.00 / 0.71 / 0.39 / 0.18 / 0.16 vector (Speed/Power/Wit/Stamina/Guts).
 */
export const FACILITY_STAT_WEIGHT: Partial<
  Record<GenerationProfile, Record<TrainingStat, number>>
> = Object.fromEntries(
  (Object.keys(CALIBRATED_FACILITY_CLICK_MIX) as GenerationProfile[]).map(
    (profile) => [
      profile,
      deriveFacilityStatWeights(CALIBRATED_FACILITY_CLICK_MIX[profile]!),
    ],
  ),
) as Partial<Record<GenerationProfile, Record<TrainingStat, number>>>;

// Coarse section horizons explicitly taken from the addendum examples
// (~45 early run, ~30 around C2, ~22 around C3, ~15 in C4). The tracker does
// not collect per-turn clicks, so these remain estimates until exact run-state
// training counts are available.
const TRAINING_HORIZON_BY_CONCERT: readonly [
  number,
  number,
  number,
  number,
  number,
] = [45, 30, 22, 15, 0];

/**
 * Section-level fallback when the UI does not track exact remaining clicks.
 * Returns null for profiles whose click mix is not calibrated in the supplied
 * data; callers then preserve the legacy static filler value instead of
 * fabricating a profile distribution. An exact caller-provided distribution
 * always takes precedence.
 */
export const estimateRemainingTrainingsByFacility = (
  generationProfile: GenerationProfile,
  concertIndex: number,
): RemainingTrainingsByFacility | null => {
  const mix = CALIBRATED_FACILITY_CLICK_MIX[generationProfile];
  if (!mix) return null;
  const horizon =
    TRAINING_HORIZON_BY_CONCERT[
      Math.max(0, Math.min(4, Math.trunc(concertIndex)))
    ];
  const total = TRAINING_FACILITIES.reduce(
    (sum, facility) => sum + mix[facility],
    0,
  );
  return Object.fromEntries(
    TRAINING_FACILITIES.map((facility) => [
      facility,
      total <= 0 ? 0 : (horizon * mix[facility]) / total,
    ]),
  ) as RemainingTrainingsByFacility;
};

/**
 * Exact structural value from the verified formula:
 * V(Training X Gain +N) = N × phi × T_x.
 * Skill Pt training uses every remaining training because every facility
 * produces skill points. Immediate flat-stat bonuses intentionally return 0.
 */
export const structuralTrainingValue = (
  practiceBonus: string,
  remainingTrainingsByFacility: RemainingTrainingsByFacility,
  friendshipSongMultiplier: number,
): number => {
  const phi = Math.max(1, friendshipSongMultiplier);
  const statMatch = practiceBonus.match(
    /^(speed|stamina|power|guts|wisdom) training \+(\d+)/i,
  );
  if (statMatch) {
    const stat = statMatch[1].toLowerCase() as TrainingStat;
    const amount = Math.max(0, Number.parseInt(statMatch[2] ?? "0", 10));
    const producingTrainings = STAT_PRODUCING_FACILITIES[stat].reduce(
      (sum, facility) => sum + remainingTrainingsByFacility[facility],
      0,
    );
    return amount * phi * producingTrainings;
  }
  const skillPointMatch = practiceBonus.match(/^skill pts? training \+(\d+)/i);
  if (skillPointMatch) {
    const amount = Math.max(0, Number.parseInt(skillPointMatch[1] ?? "0", 10));
    const totalTrainings = TRAINING_FACILITIES.reduce(
      (sum, facility) => sum + remainingTrainingsByFacility[facility],
      0,
    );
    return amount * phi * totalTrainings;
  }
  return 0;
};

/** Applies P2 only when a calibrated/exact training horizon is available. */
export const withStructuralTrainingValue = (
  song: SongTarget,
  remainingTrainingsByFacility: RemainingTrainingsByFacility | null,
  friendshipSongMultiplier: number,
): SongTarget => {
  if (!song.practiceBonus || !remainingTrainingsByFacility) return song;
  const roles = song.roles ?? [];
  if (
    roles.some(
      (role) =>
        role === "sp2-target" ||
        role === "sp3-target" ||
        role === "friendship-10" ||
        role === "friendship-5",
    )
  ) {
    // P2 is an intra-filler discriminator only. Structural SP/Friendship tiers
    // keep their existing ordinal ordering and legacy continuation telemetry.
    return song;
  }
  const calculated = structuralTrainingValue(
    song.practiceBonus,
    remainingTrainingsByFacility,
    friendshipSongMultiplier,
  );
  // A calibrated zero is still information. At the Grand Live the remaining
  // training horizon is zero, so retaining the old static `+1/+2` value would
  // resurrect filler value after there are no trainings left to benefit from
  // it. Flat immediate stats do not match either dynamic form and keep their
  // existing telemetry value.
  const isDynamicPracticeBonus =
    /^(speed|stamina|power|guts|wisdom) training \+\d+/i.test(
      song.practiceBonus,
    ) || /^skill pts? training \+\d+/i.test(song.practiceBonus);
  return isDynamicPracticeBonus ? { ...song, practiceValue: calculated } : song;
};

const singleColorCosts = (amount: number): Weighted<Balance>[] =>
  TOKEN_KEYS.map((key) => ({
    value: { ...zeroBalance(), [key]: amount },
    weight: 1,
  }));

const leveledSingleColorCosts = (
  levels: Array<[amount: number, weight: number]>,
): Weighted<Balance>[] =>
  levels.flatMap(([amount, weight]) =>
    TOKEN_KEYS.map((key) => ({
      value: { ...zeroBalance(), [key]: amount },
      weight,
    })),
  );

const SPLIT_DUO_PAIRS: Array<[TokenKey, TokenKey]> = [
  ["dance", "visual"],
  ["passion", "vocal"],
  ["vocal", "mental"],
  ["visual", "dance"],
  ["mental", "passion"],
];

const dualStatCosts = (period: Period): Weighted<Balance>[] => {
  if (period === "junior") return [];
  const regular = period === "classic" ? 8 : 12;
  const primary = period === "classic" ? 10 : 14;
  const secondary = period === "classic" ? 6 : 10;
  const pairs: Array<[TokenKey, TokenKey]> = [
    ["dance", "passion"],
    ["dance", "vocal"],
    ["dance", "visual"],
    ["dance", "mental"],
    ["passion", "vocal"],
    ["passion", "visual"],
    ["passion", "mental"],
    ["vocal", "visual"],
    ["vocal", "mental"],
    ["visual", "mental"],
  ];
  const statPairs = pairs.map(([a, b]) => ({
    value: { ...zeroBalance(), [a]: regular, [b]: regular },
    weight: 1,
  }));
  return [
    ...statPairs,
    ...SPLIT_DUO_PAIRS.map(([a, b]) => ({
      value: { ...zeroBalance(), [a]: primary, [b]: secondary },
      weight: 1,
    })),
  ];
};

const TECHNIQUE_POOLS: Record<Period, Record<Category, Weighted<Balance>[]>> = {
  junior: {
    status: singleColorCosts(10),
    dual: [],
    skillPt: singleColorCosts(10),
    // Hint and Energy levels are not progression-locked: all three can appear
    // from the first concert onward. Only the ordinary stat/SP techniques scale
    // with the career period.
    hint: leveledSingleColorCosts([
      [15, 40],
      [25, 30],
      [35, 25],
    ]),
    rest: leveledSingleColorCosts([
      [25, 55],
      [30, 40],
      [35, 5],
    ]),
  },
  classic: {
    status: singleColorCosts(16),
    dual: dualStatCosts("classic"),
    skillPt: singleColorCosts(16),
    hint: leveledSingleColorCosts([
      [15, 40],
      [25, 30],
      [35, 25],
    ]),
    rest: leveledSingleColorCosts([
      [25, 55],
      [30, 40],
      [35, 5],
    ]),
  },
  senior: {
    status: singleColorCosts(24),
    dual: dualStatCosts("senior"),
    skillPt: singleColorCosts(24),
    hint: leveledSingleColorCosts([
      [15, 40],
      [25, 30],
      [35, 25],
    ]),
    rest: leveledSingleColorCosts([
      [25, 55],
      [30, 40],
      [35, 5],
    ]),
  },
};

const CATEGORY_RATES: Record<Period, Array<Array<Weighted<Category>>>> = {
  junior: [
    [
      { value: "status", weight: 80 },
      { value: "skillPt", weight: 6 },
      { value: "hint", weight: 12 },
      { value: "rest", weight: 2 },
    ],
    [
      { value: "status", weight: 23 },
      { value: "skillPt", weight: 2 },
      { value: "hint", weight: 73 },
      { value: "rest", weight: 2 },
    ],
    [
      { value: "status", weight: 55 },
      { value: "skillPt", weight: 7 },
      { value: "hint", weight: 27 },
      { value: "rest", weight: 11 },
    ],
  ],
  classic: [
    [
      { value: "status", weight: 76 },
      { value: "skillPt", weight: 9 },
      { value: "hint", weight: 10 },
      { value: "rest", weight: 5 },
    ],
    [
      { value: "status", weight: 28 },
      { value: "skillPt", weight: 3 },
      { value: "hint", weight: 63 },
      { value: "rest", weight: 6 },
    ],
    [
      { value: "status", weight: 15 },
      { value: "dual", weight: 50 },
      { value: "skillPt", weight: 3 },
      { value: "hint", weight: 20 },
      { value: "rest", weight: 12 },
    ],
  ],
  senior: [
    [
      { value: "status", weight: 76 },
      { value: "skillPt", weight: 9 },
      { value: "hint", weight: 10 },
      { value: "rest", weight: 5 },
    ],
    [
      { value: "status", weight: 28 },
      { value: "skillPt", weight: 3 },
      { value: "hint", weight: 63 },
      { value: "rest", weight: 6 },
    ],
    [
      { value: "status", weight: 15 },
      { value: "dual", weight: 50 },
      { value: "skillPt", weight: 3 },
      { value: "hint", weight: 20 },
      { value: "rest", weight: 12 },
    ],
  ],
};

const isSingleUseCategory = (category: Category) => category !== "status";

export const totalCost = (cost: Balance): number =>
  TOKEN_KEYS.reduce((sum, key) => sum + cost[key], 0);

export const canAfford = (balance: Balance, cost: Balance): boolean =>
  TOKEN_KEYS.every((key) => balance[key] >= cost[key]);

export const subtractCost = (balance: Balance, cost: Balance): Balance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, balance[key] - cost[key]]),
  ) as Balance;

const sampleWeighted = <T>(items: Weighted<T>[], rng: () => number): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return items[items.length - 1].value;
};

const generateTechniqueOffer = (
  period: Period,
  rng: () => number,
): Balance[] => {
  const used = new Set<Category>();
  const offers: Balance[] = [];
  for (let position = 0; position < 3; position += 1) {
    const categories = CATEGORY_RATES[period][position].filter(
      ({ value }) => !used.has(value),
    );
    const category = sampleWeighted(categories, rng);
    if (isSingleUseCategory(category)) used.add(category);
    offers.push(sampleWeighted(TECHNIQUE_POOLS[period][category], rng));
  }
  return offers;
};

const memoizedTechniqueOffer = (
  memo: TechniqueSimulationMemo | undefined,
  period: Period,
  seed: number,
  trialIndex: number,
  step: number,
): Balance[] => {
  if (!memo) {
    return generateTechniqueOffer(
      period,
      mulberry32(hashSeed(`${seed}:${trialIndex}:${step}`)),
    );
  }
  const key = `${period}:${seed}:${trialIndex}:${step}`;
  const cached = memo.offers.get(key);
  if (cached) return cached;
  const generated = generateTechniqueOffer(
    period,
    mulberry32(hashSeed(`${seed}:${trialIndex}:${step}`)),
  );
  memo.offers.set(key, generated);
  return generated;
};

const probabilityCache = new Map<string, number>();

export const exactBlockProbability = (
  period: Period,
  balance: Balance,
): number => {
  const cacheKey = `${period}:${TOKEN_KEYS.map((key) => balance[key]).join(",")}`;
  const cached = probabilityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const visit = (position: number, used: Set<Category>): number => {
    if (position === 3) return 1;
    const categories = CATEGORY_RATES[period][position].filter(
      ({ value }) => !used.has(value),
    );
    const categoryWeight = categories.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    return categories.reduce((categorySum, categoryItem) => {
      const pool = TECHNIQUE_POOLS[period][categoryItem.value];
      const poolWeight = pool.reduce((sum, item) => sum + item.weight, 0);
      const blockedWeight = pool.reduce(
        (sum, item) => sum + (canAfford(balance, item.value) ? 0 : item.weight),
        0,
      );
      if (blockedWeight === 0) return categorySum;
      const nextUsed = new Set(used);
      if (isSingleUseCategory(categoryItem.value)) {
        nextUsed.add(categoryItem.value);
      }
      return (
        categorySum +
        (categoryItem.weight / categoryWeight) *
          (blockedWeight / poolWeight) *
          visit(position + 1, nextUsed)
      );
    }, 0);
  };

  const result = visit(0, new Set<Category>());
  probabilityCache.set(cacheKey, result);
  return result;
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const combinations = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  const reducedK = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= reducedK; index += 1) {
    result = (result * (n - reducedK + index)) / index;
  }
  return result;
};

export const atLeastOneDrawProbability = (
  poolSize: number,
  qualifyingCount: number,
  drawCount = 3,
): number => {
  if (poolSize <= 0 || qualifyingCount <= 0) return 0;
  const draws = Math.min(drawCount, poolSize);
  if (qualifyingCount >= poolSize - draws + 1) return 1;
  return (
    1 -
    combinations(poolSize - qualifyingCount, draws) /
      combinations(poolSize, draws)
  );
};

type SongBalanceMetrics = {
  anyAffordable: number;
  priorityAffordable: number;
  expectedBestUtility: number;
};

const evaluateSongBalance = (
  balance: Balance,
  songs: SongTarget[],
  strategicPlan?: StrategicPlan,
): SongBalanceMetrics => {
  if (songs.length === 0) {
    return {
      anyAffordable: 0,
      priorityAffordable: 0,
      expectedBestUtility: 0,
    };
  }
  const affordable = songs.filter((song) => canAfford(balance, song.cost));
  const priorityAffordable = affordable.filter((song) =>
    strategicPlan ? isChaseTarget(song, strategicPlan) : song.priority,
  );
  const maxUtility = Math.max(0, ...songs.map((song) => song.utility));
  let expectedBestUtility = 0;
  for (let level = 1; level <= maxUtility; level += 1) {
    const qualifying = affordable.filter(
      (song) => song.utility >= level,
    ).length;
    expectedBestUtility += atLeastOneDrawProbability(songs.length, qualifying);
  }
  return {
    anyAffordable: atLeastOneDrawProbability(songs.length, affordable.length),
    priorityAffordable: atLeastOneDrawProbability(
      songs.length,
      priorityAffordable.length,
    ),
    expectedBestUtility,
  };
};

const balanceSignature = (balance: Balance): string =>
  TOKEN_KEYS.map((key) => balance[key]).join(",");

const songSetSignature = (songs: SongTarget[]): string =>
  songs
    .map((song) => song.id)
    .sort()
    .join("|");

const reserveFeasibilitySignature = (
  context: ReserveFeasibilityContext | undefined,
): string => {
  if (!context) return "none";
  const costKey = (cost: Balance): string =>
    TOKEN_KEYS.map((key) => cost[key]).join(",");
  return [
    context.period,
    context.firstOfferPeriod ?? context.period,
    context.concertIndex,
    context.nextSongCycle,
    context.techniquesToNextSong,
    (context.currentTechniqueOffers ?? []).map(costKey).join("/"),
    (context.visibleSongs ?? [])
      .map((song) => song.id)
      .sort()
      .join("/"),
    (context.reserveSongIds ?? []).slice().sort().join("/"),
  ].join(":");
};

const memoizedTokenPressure = (
  memo: TechniqueSimulationMemo | undefined,
  balance: Balance,
  songs: SongTarget[],
  generationProfile: GenerationProfile,
  strategicPlan?: StrategicPlan,
  reserveFeasibility?: ReserveFeasibilityContext,
): TokenPressure[] => {
  if (!memo)
    return calculateTokenPressure(
      balance,
      songs,
      generationProfile,
      strategicPlan,
      reserveFeasibility,
    );
  const key = `${generationProfile}:${strategicPlan?.id ?? "none"}:${songSetSignature(songs)}:${balanceSignature(balance)}:${reserveFeasibilitySignature(reserveFeasibility)}`;
  const cached = memo.pressure.get(key);
  if (cached) {
    memo.stats.pressureHits += 1;
    return cached;
  }
  memo.stats.pressureMisses += 1;
  const computed = calculateTokenPressure(
    balance,
    songs,
    generationProfile,
    strategicPlan,
    reserveFeasibility,
  );
  memo.pressure.set(key, computed);
  return computed;
};

const memoizedPageCoverage = (
  memo: TechniqueSimulationMemo | undefined,
  balance: Balance,
  songs: SongTarget[],
  plan: StrategicPlan,
): PageCoverage => {
  if (!memo) return evaluatePageCoverage(balance, songs, plan);
  const key = `${plan.id}:${songSetSignature(songs)}:${balanceSignature(balance)}`;
  const cached = memo.coverage.get(key);
  if (cached) {
    memo.stats.coverageHits += 1;
    return cached;
  }
  memo.stats.coverageMisses += 1;
  const computed = evaluatePageCoverage(balance, songs, plan);
  memo.coverage.set(key, computed);
  return computed;
};

const memoizedSongBalance = (
  memo: TechniqueSimulationMemo | undefined,
  balance: Balance,
  songs: SongTarget[],
  plan?: StrategicPlan,
): SongBalanceMetrics => {
  if (!memo) return evaluateSongBalance(balance, songs, plan);
  const key = `${plan?.id ?? "none"}:${songSetSignature(songs)}:${balanceSignature(balance)}`;
  const cached = memo.songMetrics.get(key);
  if (cached) {
    memo.stats.songMetricHits += 1;
    return cached;
  }
  memo.stats.songMetricMisses += 1;
  const computed = evaluateSongBalance(balance, songs, plan);
  memo.songMetrics.set(key, computed);
  return computed;
};

export const chooseSafestTechnique = (
  nextOfferPeriod: Period,
  balance: Balance,
  offers: Balance[],
  lastTechnique: boolean,
  objective: AnalysisObjective,
  songs: SongTarget[],
  pressureSongs: SongTarget[],
  generationProfile: GenerationProfile,
  strategicPlan?: StrategicPlan,
  profile: RiskProfile = "standard",
  memo?: TechniqueSimulationMemo,
  reserveFeasibility?: ReserveFeasibilityContext,
): Balance | null => {
  const affordable = offers.filter((offer) => canAfford(balance, offer));
  if (affordable.length === 0) return null;
  const tokenPressure = memoizedTokenPressure(
    memo,
    balance,
    pressureSongs,
    generationProfile,
    strategicPlan,
    reserveFeasibility,
  );
  return affordable
    .map((cost) => {
      const next = subtractCost(balance, cost);
      const immediateRisk = lastTechnique
        ? 0
        : exactBlockProbability(nextOfferPeriod, next);
      const songMetrics = memoizedSongBalance(memo, next, songs, strategicPlan);
      const coverage = strategicPlan
        ? memoizedPageCoverage(memo, next, songs, strategicPlan)
        : null;
      const targetCoverage =
        coverage?.planTargetProbability ?? songMetrics.priorityAffordable;
      const anyCoverage =
        coverage?.anyAffordableProbability ?? songMetrics.anyAffordable;
      const objectiveCoverage =
        objective === "priority-song"
          ? targetCoverage
          : objective === "any-song"
            ? anyCoverage
            : 1;
      return {
        cost,
        objectiveCoverage,
        immediateRisk,
        total: totalCost(cost),
        retainedTokens: totalCost(next),
        riskAdmissible: immediateRisk <= 1 - riskThreshold(profile) ? 1 : 0,
        targetCoverage,
        targetCount: coverage?.affordablePlanTargetCount ?? 0,
        structuralCoverage: coverage?.bestStructuralTier ?? 0,
        anyCoverage,
      };
    })
    .sort(
      (a, b) =>
        b.riskAdmissible - a.riskAdmissible ||
        b.objectiveCoverage - a.objectiveCoverage ||
        b.targetCoverage - a.targetCoverage ||
        b.targetCount - a.targetCount ||
        b.structuralCoverage - a.structuralCoverage ||
        b.anyCoverage - a.anyCoverage ||
        a.immediateRisk - b.immediateRisk ||
        compareTechniqueSpending(a.cost, b.cost, balance, tokenPressure) ||
        b.retainedTokens - a.retainedTokens ||
        a.total - b.total ||
        TOKEN_KEYS.map((key) => a.cost[key])
          .join(",")
          .localeCompare(TOKEN_KEYS.map((key) => b.cost[key]).join(",")),
    )[0].cost;
};

export const getBaseTechniqueCost = (period: Period): number =>
  period === "junior" ? 10 : period === "classic" ? 16 : 24;

export const getDualTechniqueCost = (period: Period): number =>
  period === "classic" ? 8 : period === "senior" ? 12 : 0;

export const getDualTechniqueSplit = (
  period: Period,
): [number, number] | null =>
  period === "classic" ? [10, 6] : period === "senior" ? [14, 10] : null;

export const getDuoSplitSecondaryToken = (primary: TokenKey): TokenKey =>
  SPLIT_DUO_PAIRS.find(([key]) => key === primary)?.[1] ?? primary;

export const getTechniqueLevelOptions = (
  _period: Period,
  kind: "hint" | "energy",
): TechniqueLevelOption[] => {
  // Unlike ordinary stat/SP techniques, Hint and Energy levels are available
  // throughout the scenario. Their cost does not depend on the concert period.
  const levels = kind === "hint" ? [15, 25, 35] : [25, 30, 35];
  return levels.map((cost, index) => ({
    label: kind === "hint" ? `Lv. ${index + 1}` : `+${20 + index * 10}`,
    effect:
      kind === "hint" ? `Hint Lv. +${index + 1}` : `Energy +${20 + index * 10}`,
    cost,
  }));
};

/**
 * Express mode must resolve the continuation objective identically before
 * and after a song purchase. Keeping this rule in the model prevents the song
 * policy and the technique diagnostic from drifting apart.
 */
export const resolveExpressObjective = (
  songsThisSection: number,
  songs: SongTarget[],
  concertIndex = 1,
): AnalysisObjective =>
  concertIndex === 4 &&
  songsThisSection < manualSongsForGreatSuccess(concertIndex)
    ? "any-song"
    : songs.some((song) => song.priority)
      ? "priority-song"
      : "carryover";

/**
 * Resolves the simple-mode objective from the state that will actually be
 * displayed. Song-page projections and the technique screen both call this
 * helper, so buying a target cannot silently keep the plan that existed
 * before that purchase.
 */
export const resolveStrategicObjective = ({
  plan,
  songsThisSection,
  songs,
}: {
  /** Kept in the contract although unused today: callers pass the full state. */
  plan: StrategicPlan;
  songsThisSection: number;
  totalSongs: number;
  songs: SongTarget[];
}): AnalysisObjective => {
  if (plan.mode === "hunt") return "priority-song";
  if (plan.mode === "convert") {
    // No lesson token has carry value after the Grand Live. Before and after
    // the final gauge closes, every remaining song is an immediate +25 SP
    // conversion target.
    return "any-song";
  }
  if (plan.mode === "hold") return "carryover";
  if (plan.mode === "close") {
    if (plan.id === "close-checkpoint") return "any-song";
    // Promotional Lives optimise song quality and timing, not a raw song count.
    // In particular C4 must not chase fillers merely to approach 18: that
    // number remains a trajectory indicator until the Grand Live itself.
    if (plan.chaseTargets.ids.length > 0) return "priority-song";
    return "carryover";
  }
  if (plan.mode === "accumulate") return "carryover";
  return resolveExpressObjective(songsThisSection, songs, plan.concertIndex);
};

export const resolveEffectiveTechniqueObjective = ({
  solverMode,
  analysisObjective,
  plan,
  songsThisSection,
  totalSongs,
  songs,
}: {
  solverMode: "express" | "expert";
  analysisObjective: AnalysisObjective;
  plan: StrategicPlan;
  songsThisSection: number;
  totalSongs: number;
  songs: SongTarget[];
}): AnalysisObjective => {
  const strategicObjective = resolveStrategicObjective({
    plan,
    songsThisSection,
    totalSongs,
    songs,
  });
  // Final Grand-Live Great-Success conversion is scenario state, not an
  // expert-mode preference. The 18-song counter never becomes an objective.
  const strategicObjectiveIsMandatory =
    plan.mode === "convert" || plan.id === "close-checkpoint";
  return strategicObjectiveIsMandatory
    ? strategicObjective
    : solverMode === "expert"
      ? analysisObjective
      : strategicObjective;
};

export const buildQuickTechniqueCost = (
  period: Period,
  kind: TechniqueQuickKind,
  selectedTokens: TokenKey[],
  levelIndex = 0,
): Balance => {
  const next = zeroBalance();
  if (selectedTokens.length === 0) return next;

  if (kind === "mono") {
    next[selectedTokens[0]] = getBaseTechniqueCost(period);
    return next;
  }

  if (kind === "hint" || kind === "energy") {
    const levels = getTechniqueLevelOptions(period, kind);
    const level = levels[Math.min(Math.max(0, levelIndex), levels.length - 1)];
    if (level) next[selectedTokens[0]] = level.cost;
    return next;
  }

  if (selectedTokens.length < 2 || period === "junior") return next;
  if (kind === "duo-balanced") {
    const amount = getDualTechniqueCost(period);
    next[selectedTokens[0]] = amount;
    next[selectedTokens[1]] = amount;
    return next;
  }

  const split = getDualTechniqueSplit(period);
  if (
    !split ||
    getDuoSplitSecondaryToken(selectedTokens[0]) !== selectedTokens[1]
  ) {
    return next;
  }
  next[selectedTokens[0]] = split[0];
  next[selectedTokens[1]] = split[1];
  return next;
};

const simulateUnknownTechniqueSequence = ({
  period,
  firstOfferPeriod,
  startingBalance,
  techniquesRemaining,
  songs,
  reserveSongs,
  objective,
  strategicPlan,
  riskProfile,
  generationProfile,
  nextSongCycle,
  seed,
  trialIndex,
  initialSpent = 0,
  initialPurchases = 0,
  useFirstOfferPeriod = true,
  memo,
}: {
  period: Period;
  firstOfferPeriod: Period;
  startingBalance: Balance;
  techniquesRemaining: number;
  songs: SongTarget[];
  reserveSongs: SongTarget[];
  objective: AnalysisObjective;
  strategicPlan?: StrategicPlan;
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  nextSongCycle: number;
  seed: number;
  trialIndex: number;
  initialSpent?: number;
  initialPurchases?: number;
  useFirstOfferPeriod?: boolean;
  memo?: TechniqueSimulationMemo;
}): TechniqueTransitionResult => {
  let balance = { ...startingBalance };
  let purchases = initialPurchases;
  let spent = initialSpent;
  const protectedReserveSongs = strategicPlan
    ? reserveSongs.filter((song) => isReserveTarget(song, strategicPlan))
    : reserveSongs;

  for (let step = 0; step < techniquesRemaining; step += 1) {
    const offerPeriod =
      useFirstOfferPeriod && step === 0 ? firstOfferPeriod : period;
    const offers = memoizedTechniqueOffer(
      memo,
      offerPeriod,
      seed,
      trialIndex,
      step,
    );
    const chosen = chooseSafestTechnique(
      period,
      balance,
      offers,
      step === techniquesRemaining - 1,
      objective,
      songs,
      protectedReserveSongs,
      generationProfile,
      strategicPlan,
      riskProfile,
      memo,
      strategicPlan
        ? {
            period,
            firstOfferPeriod: offerPeriod,
            concertIndex: strategicPlan.concertIndex,
            nextSongCycle,
            techniquesToNextSong: techniquesRemaining - step,
            currentTechniqueOffers: offers,
            reserveSongIds: protectedReserveSongs.map((song) => song.id),
          }
        : undefined,
    );
    if (!chosen) {
      return {
        reached: false,
        balance,
        spent,
        purchases,
        failureDepth: purchases,
      };
    }
    balance = subtractCost(balance, chosen);
    spent += totalCost(chosen);
    purchases += 1;
  }

  return {
    reached: true,
    balance,
    spent,
    purchases,
    failureDepth: null,
  };
};

/**
 * Shared transition kernel used by forward song simulations. It applies the
 * same offer generation and adaptive technique choice as `runAnalysis`, and
 * returns the real post-technique balance for one deterministic Monte-Carlo
 * trial.
 */
export const simulateTechniqueTransition = ({
  period,
  firstOfferPeriod = period,
  tokens,
  techniquesRemaining,
  nextSongCycle = 1,
  songs = [],
  reserveSongs = songs,
  objective = "carryover",
  strategicPlan,
  riskProfile = "standard",
  generationProfile = "speed-wit",
  seedKey,
  trialIndex,
  memo,
}: TechniqueTransitionInput): TechniqueTransitionResult =>
  simulateUnknownTechniqueSequence({
    period,
    firstOfferPeriod,
    startingBalance: tokens,
    techniquesRemaining: Math.max(0, Math.trunc(techniquesRemaining)),
    songs,
    reserveSongs,
    objective,
    strategicPlan,
    riskProfile,
    generationProfile,
    nextSongCycle,
    seed: hashSeed(seedKey),
    trialIndex,
    memo,
  });

const wilsonInterval = (
  successes: number,
  samples: number,
  z = 1.96,
): readonly [number, number] => {
  if (samples <= 0) return [0, 1];
  const probability = Math.min(1, Math.max(0, successes / samples));
  const z2 = z * z;
  const denominator = 1 + z2 / samples;
  const centre = probability + z2 / (2 * samples);
  const margin =
    z *
    Math.sqrt((probability * (1 - probability) + z2 / (4 * samples)) / samples);
  return [
    Math.max(0, (centre - margin) / denominator),
    Math.min(1, (centre + margin) / denominator),
  ];
};

const intervalCrosses = (
  interval: readonly [number, number],
  thresholds: readonly number[],
): boolean =>
  thresholds.some(
    (threshold) => interval[0] < threshold && interval[1] >= threshold,
  );

const shouldStopAdaptiveAnalysis = ({
  samples,
  minimumSamples,
  reachSuccesses,
  goalSuccesses,
  objective,
  riskProfile,
}: {
  samples: number;
  minimumSamples: number;
  reachSuccesses: number;
  goalSuccesses: number;
  objective: AnalysisObjective;
  riskProfile: RiskProfile;
}): boolean => {
  if (samples < minimumSamples) return false;
  const reachInterval = wilsonInterval(reachSuccesses, samples);
  const goalInterval = wilsonInterval(goalSuccesses, samples);
  const threshold = riskThreshold(riskProfile);
  const riskyFloor = Math.max(0.65, threshold - 0.2);
  const reachStable = !intervalCrosses(reachInterval, [
    riskyFloor,
    threshold,
    0.985,
  ]);
  const goalStable =
    objective === "carryover" ||
    !intervalCrosses(goalInterval, [Number.EPSILON, 0.5, 0.8]);
  const reachWidth = reachInterval[1] - reachInterval[0];
  const goalWidth = goalInterval[1] - goalInterval[0];
  return reachStable && goalStable && reachWidth <= 0.035 && goalWidth <= 0.035;
};

export const runAnalysis = ({
  period,
  firstOfferPeriod = period,
  tokens,
  candidateCost = zeroBalance(),
  techniquesRemaining,
  nextSongCycle = 1,
  songs = [],
  reserveSongs = songs,
  objective = "carryover",
  strategicPlan,
  riskProfile = "standard",
  generationProfile = "speed-wit",
  seedKey,
  trials = 24000,
  minimumSamples: requestedMinimumSamples,
  techniqueMemo,
}: AnalysisInput): AnalysisResult => {
  const prioritySongShownProbability = atLeastOneDrawProbability(
    songs.length,
    songs.filter((song) =>
      strategicPlan ? isChaseTarget(song, strategicPlan) : song.priority,
    ).length,
  );
  const anySongShownProbability = songs.length > 0 ? 1 : 0;
  const hasCandidate = techniquesRemaining > 0 && totalCost(candidateCost) > 0;
  const candidateCount = hasCandidate ? 1 : 0;
  const remainingAfterCandidate = Math.max(
    0,
    techniquesRemaining - candidateCount,
  );
  const valid =
    techniquesRemaining === 0 ||
    !hasCandidate ||
    canAfford(tokens, candidateCost);

  if (!valid) {
    return {
      valid: false,
      objective,
      goalProbability: 0,
      jointGoalProbability: 0,
      conditionalGoalProbability: 0,
      reachProbability: 0,
      failProbability: 1,
      anySongShownProbability,
      prioritySongShownProbability,
      reachAnySongAffordableProbability: 0,
      reachPrioritySongAffordableProbability: 0,
      expectedBestSongUtility: 0,
      songOutcomes: songs.map((song) => ({
        id: song.id,
        name: song.name,
        priority: strategicPlan
          ? isChaseTarget(song, strategicPlan)
          : song.priority,
        utility: song.utility,
        appearanceProbability:
          songs.length === 0 ? 0 : Math.min(3, songs.length) / songs.length,
        affordProbability: 0,
        reachAffordAndShownProbability: 0,
      })),
      immediateBlockProbability: 1,
      lateBlockProbability: 0,
      expectedWaste: 0,
      conditionalWaste: 0,
      averageSuccessSpend: 0,
      failureDepth: Array.from({ length: techniquesRemaining + 1 }, () => 0),
      criticalToken: null,
      criticalTokenGain: 0,
      trials,
      maxTrials: trials,
      converged: true,
      recommendation: "invalid",
      planId: strategicPlan?.id,
      planLabel: strategicPlan && planLabelMessage(strategicPlan),
      exitCondition: strategicPlan && planExitMessage(strategicPlan),
      fallback: strategicPlan && planFallbackMessage(strategicPlan),
      probabilityScope: "conditional-shop",
    };
  }

  const startingBalance = hasCandidate
    ? subtractCost(tokens, candidateCost)
    : tokens;

  const immediateBlockProbability =
    remainingAfterCandidate === 0
      ? 0
      : exactBlockProbability(
          hasCandidate ? period : firstOfferPeriod,
          startingBalance,
        );
  const seed = hashSeed(
    seedKey ??
      `${period}:${firstOfferPeriod}:${objective}:${techniquesRemaining}:${songs
        .map((song) => song.id)
        .join(",")}:${TOKEN_KEYS.map(
        (key) => `${tokens[key]}-${candidateCost[key]}`,
      ).join(":")}`,
  );
  const failureDepth = Array.from({ length: techniquesRemaining + 1 }, () => 0);
  let successes = 0;
  let failedWasteTotal = 0;
  let successSpendTotal = 0;
  let lateFailures = 0;
  let anyAffordableTotal = 0;
  let priorityAffordableTotal = 0;
  let expectedBestUtilityTotal = 0;
  const songAffordableCounts = new Map(songs.map((song) => [song.id, 0]));
  const simulationMemo = techniqueMemo ?? createTechniqueSimulationMemo();
  const maxTrials = Math.max(1, Math.trunc(trials));
  const defaultMinimumSamples = Math.min(
    maxTrials,
    maxTrials <= 600 ? maxTrials : maxTrials <= 8000 ? 768 : 1024,
  );
  const minimumSamples = Math.min(
    maxTrials,
    Math.max(1, Math.trunc(requestedMinimumSamples ?? defaultMinimumSamples)),
  );
  const convergenceBatch = 128;
  let actualTrials = 0;
  let goalSuccessesForConvergence = 0;

  for (let trial = 0; trial < maxTrials; trial += 1) {
    const transition = simulateUnknownTechniqueSequence({
      period,
      firstOfferPeriod,
      startingBalance,
      techniquesRemaining: remainingAfterCandidate,
      songs,
      reserveSongs,
      objective,
      strategicPlan,
      riskProfile,
      generationProfile,
      nextSongCycle,
      seed,
      trialIndex: trial,
      initialSpent: hasCandidate ? totalCost(candidateCost) : 0,
      initialPurchases: candidateCount,
      useFirstOfferPeriod: !hasCandidate,
      memo: simulationMemo,
    });

    actualTrials = trial + 1;
    if (!transition.reached) {
      const depth = transition.failureDepth ?? transition.purchases;
      failureDepth[depth] += 1;
      failedWasteTotal += transition.spent;
      if (depth === techniquesRemaining - 1) lateFailures += 1;
    } else {
      successes += 1;
      successSpendTotal += transition.spent;
      const songMetrics = memoizedSongBalance(
        simulationMemo,
        transition.balance,
        songs,
        strategicPlan,
      );
      anyAffordableTotal += songMetrics.anyAffordable;
      priorityAffordableTotal += songMetrics.priorityAffordable;
      expectedBestUtilityTotal += songMetrics.expectedBestUtility;
      const goalSample =
        objective === "priority-song"
          ? songMetrics.priorityAffordable
          : objective === "any-song"
            ? songMetrics.anyAffordable
            : 1;
      goalSuccessesForConvergence += goalSample;
      for (const song of songs) {
        if (canAfford(transition.balance, song.cost)) {
          songAffordableCounts.set(
            song.id,
            (songAffordableCounts.get(song.id) ?? 0) + 1,
          );
        }
      }
    }

    if (
      actualTrials % convergenceBatch === 0 &&
      shouldStopAdaptiveAnalysis({
        samples: actualTrials,
        minimumSamples,
        reachSuccesses: successes,
        goalSuccesses: goalSuccessesForConvergence,
        objective,
        riskProfile,
      })
    ) {
      break;
    }
  }

  const denominator = Math.max(1, actualTrials);
  const reachProbability = successes / denominator;
  const reachAnySongAffordableProbability = anyAffordableTotal / denominator;
  const reachPrioritySongAffordableProbability =
    priorityAffordableTotal / denominator;
  const expectedBestSongUtility = expectedBestUtilityTotal / denominator;
  const failProbability = 1 - reachProbability;
  const conditionalWaste =
    successes === denominator
      ? 0
      : failedWasteTotal / (denominator - successes);
  const expectedWaste = failedWasteTotal / denominator;
  const lateBlockProbability = lateFailures / denominator;
  const averageSuccessSpend =
    successes === 0 ? 0 : successSpendTotal / successes;

  let criticalToken: TokenKey | null = null;
  let criticalTokenGain = 0;
  const baseSongMetrics = memoizedSongBalance(
    simulationMemo,
    startingBalance,
    songs,
    strategicPlan,
  );
  for (const key of TOKEN_KEYS) {
    const boosted = { ...startingBalance, [key]: startingBalance[key] + 6 };
    const blockImprovement =
      immediateBlockProbability -
      exactBlockProbability(hasCandidate ? period : firstOfferPeriod, boosted);
    const boostedSongMetrics = evaluateSongBalance(
      boosted,
      songs,
      strategicPlan,
    );
    const songImprovement =
      objective === "priority-song"
        ? boostedSongMetrics.priorityAffordable -
          baseSongMetrics.priorityAffordable
        : objective === "any-song"
          ? boostedSongMetrics.anyAffordable - baseSongMetrics.anyAffordable
          : 0;
    const improvement = Math.max(0, blockImprovement) + songImprovement;
    if (improvement > criticalTokenGain) {
      criticalTokenGain = improvement;
      criticalToken = key;
    }
  }

  const goalProbability = clamp01(
    Math.min(
      reachProbability,
      objective === "priority-song"
        ? reachPrioritySongAffordableProbability
        : objective === "any-song"
          ? reachAnySongAffordableProbability
          : reachProbability,
    ),
  );
  const conditionalGoalProbability =
    reachProbability <= 0 ? 0 : clamp01(goalProbability / reachProbability);

  const threshold = riskThreshold(riskProfile);
  const committedFinalStep =
    hasCandidate &&
    techniquesRemaining === 1 &&
    reachProbability === 1 &&
    reachAnySongAffordableProbability > 0;
  const terminalLessonConversion = strategicPlan?.id === "convert-final";
  const terminalProgressAvailable =
    hasCandidate ||
    goalProbability > 0 ||
    expectedWaste > 0 ||
    averageSuccessSpend > 0;
  const recommendation: AnalysisResult["recommendation"] =
    strategicPlan?.mode === "hold"
      ? "stop"
      : terminalLessonConversion
        ? terminalProgressAvailable
          ? reachProbability >= 0.985 && goalProbability >= 0.8
            ? "safe"
            : "push"
          : "stop"
        : reachProbability >= threshold &&
            (objective === "carryover" ||
              goalProbability >= 0.5 ||
              committedFinalStep)
          ? reachProbability >= 0.985 &&
            (objective === "carryover" || goalProbability >= 0.8)
            ? "safe"
            : "push"
          : reachProbability >= Math.max(0.65, threshold - 0.2) &&
              (objective === "carryover" ||
                goalProbability > 0 ||
                committedFinalStep)
            ? "risky"
            : "stop";

  const appearanceProbability =
    songs.length === 0 ? 0 : Math.min(3, songs.length) / songs.length;
  const songOutcomes = songs
    .map((song): SongOutcome => {
      const affordableCount = songAffordableCounts.get(song.id) ?? 0;
      return {
        id: song.id,
        name: song.name,
        priority: strategicPlan
          ? isChaseTarget(song, strategicPlan)
          : song.priority,
        utility: song.utility,
        appearanceProbability,
        affordProbability: successes === 0 ? 0 : affordableCount / successes,
        reachAffordAndShownProbability:
          (affordableCount / denominator) * appearanceProbability,
      };
    })
    .sort(
      (a, b) =>
        b.reachAffordAndShownProbability - a.reachAffordAndShownProbability ||
        b.utility - a.utility,
    );

  return {
    valid: true,
    objective,
    goalProbability,
    jointGoalProbability: goalProbability,
    conditionalGoalProbability,
    reachProbability,
    failProbability,
    anySongShownProbability,
    prioritySongShownProbability,
    reachAnySongAffordableProbability,
    reachPrioritySongAffordableProbability,
    expectedBestSongUtility,
    songOutcomes,
    immediateBlockProbability,
    lateBlockProbability,
    expectedWaste,
    conditionalWaste,
    averageSuccessSpend,
    failureDepth: failureDepth.map((count) => count / denominator),
    criticalToken,
    criticalTokenGain,
    trials: denominator,
    maxTrials,
    converged: denominator < maxTrials,
    recommendation,
    planId: strategicPlan?.id,
    planLabel: strategicPlan && planLabelMessage(strategicPlan),
    exitCondition: strategicPlan && planExitMessage(strategicPlan),
    fallback: strategicPlan && planFallbackMessage(strategicPlan),
    probabilityScope: "conditional-shop",
  };
};

export const evaluateTechniqueStrategy = ({
  concertIndex,
  songsThisSection,
  tokens,
  currentSongs,
  futureSongs,
  futureTopCount: explicitFutureTopCount,
  result,
  strategicPlan,
}: TechniqueStrategyInput): TechniqueStrategy => {
  const greatSuccessSecured = isGreatSuccess(concertIndex, songsThisSection);
  const currentPriorityCount = currentSongs.filter((song) =>
    isChaseTarget(song, strategicPlan),
  ).length;
  const futurePriorityCount = futureSongs.filter((song) =>
    isChaseTarget(song, strategicPlan),
  ).length;
  const inferredTopThreshold =
    Math.max(0, ...futureSongs.map((song) => song.policyValue ?? 0)) * 0.82;
  const futureTopCount =
    explicitFutureTopCount ??
    futureSongs.filter(
      (song) =>
        (song.policyValue ?? 0) > 0 &&
        (song.policyValue ?? 0) >= inferredTopThreshold,
    ).length;
  const nextPoolSize = currentSongs.length + futureSongs.length;
  const thinnedPoolSize = Math.max(0, nextPoolSize - 1);
  const priorityVisibilityBefore = atLeastOneDrawProbability(
    nextPoolSize,
    futurePriorityCount,
  );
  const priorityVisibilityAfterThinning = atLeastOneDrawProbability(
    thinnedPoolSize,
    futurePriorityCount,
  );
  const topVisibilityBefore = atLeastOneDrawProbability(
    nextPoolSize,
    futureTopCount,
  );
  const topVisibilityAfterThinning = atLeastOneDrawProbability(
    thinnedPoolSize,
    futureTopCount,
  );
  const cheapestCurrentSongCost =
    currentSongs.length === 0
      ? 0
      : Math.min(...currentSongs.map((song) => totalCost(song.cost)));
  const estimatedCommitment =
    result.averageSuccessSpend + cheapestCurrentSongCost;
  const tokenTotal = Math.max(1, totalCost(tokens));
  const commitmentShare = estimatedCommitment / tokenTotal;
  const applies =
    strategicPlan.mode === "accumulate" || strategicPlan.mode === "hold";
  const shouldSave =
    result.recommendation !== "invalid" &&
    (strategicPlan.mode === "accumulate" || strategicPlan.mode === "hold");

  return {
    applies,
    shouldSave,
    greatSuccessSecured,
    currentPriorityCount,
    futurePriorityCount,
    futureTopCount,
    nextPoolSize,
    priorityVisibilityBefore,
    priorityVisibilityAfterThinning,
    priorityVisibilityGain:
      priorityVisibilityAfterThinning - priorityVisibilityBefore,
    topVisibilityBefore,
    topVisibilityAfterThinning,
    topVisibilityGain: topVisibilityAfterThinning - topVisibilityBefore,
    cheapestCurrentSongCost,
    estimatedCommitment,
    commitmentShare,
  };
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const GENERATION_SUPPLY: Record<GenerationProfile, Balance> = {
  "speed-wit": {
    dance: 1.25,
    passion: 0.7,
    vocal: 0.78,
    visual: 1.25,
    mental: 0.9,
  },
  "speed-stamina-wit": {
    dance: 1.15,
    passion: 1,
    vocal: 0.82,
    visual: 1.12,
    mental: 1.02,
  },
  "power-present": {
    dance: 0.95,
    passion: 1,
    vocal: 1.18,
    visual: 0.88,
    mental: 0.9,
  },
  balanced: {
    dance: 1,
    passion: 1,
    vocal: 1,
    visual: 1,
    mental: 1,
  },
};

const songPolicyValue = (song: SongTarget): number =>
  song.policyValue ?? song.utility * 20;

const sameCostVector = (left: Balance, right: Balance): boolean =>
  TOKEN_KEYS.every((key) => left[key] === right[key]);

const addCosts = (
  targets: readonly Pick<TokenReserveTarget, "cost">[],
): Balance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => [
      key,
      targets.reduce((sum, target) => sum + target.cost[key], 0),
    ]),
  ) as Balance;

const balanceCovers = (balance: Balance, required: Balance): boolean =>
  TOKEN_KEYS.every((key) => balance[key] >= required[key]);

const uniqueBalances = (items: readonly Balance[]): Balance[] => {
  const bySignature = new Map<string, Balance>();
  for (const item of items) {
    bySignature.set(TOKEN_KEYS.map((key) => item[key]).join(","), item);
  }
  return [...bySignature.values()];
};

const deterministicTechniqueCostCache = new Map<Period, Balance[]>();

/**
 * Existence kernel for an unknown future technique refresh. Probabilities are
 * deliberately absent: every returned vector has non-zero offer probability.
 * Componentwise-dominated costs are removed because only affordability matters
 * for this predicate, never the technique effect itself.
 */
const deterministicTechniqueCosts = (period: Period): Balance[] => {
  const cached = deterministicTechniqueCostCache.get(period);
  if (cached) return cached;
  const all = Object.values(TECHNIQUE_POOLS[period]).flatMap((pool) =>
    pool.map((item) => item.value),
  );
  const unique = uniqueBalances(all);
  const minimal = unique.filter(
    (candidate, candidateIndex) =>
      !unique.some(
        (other, otherIndex) =>
          otherIndex !== candidateIndex &&
          TOKEN_KEYS.every((key) => other[key] <= candidate[key]) &&
          TOKEN_KEYS.some((key) => other[key] < candidate[key]),
      ),
  );
  deterministicTechniqueCostCache.set(period, minimal);
  return minimal;
};

const minimumMonoTechniqueCost = (period: Period): Record<TokenKey, number> =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => {
      const minimum = deterministicTechniqueCosts(period)
        .filter(
          (cost) =>
            cost[key] > 0 &&
            TOKEN_KEYS.every((other) => other === key || cost[other] === 0),
        )
        .reduce(
          (best, cost) => Math.min(best, cost[key]),
          Number.POSITIVE_INFINITY,
        );
      return [key, minimum];
    }),
  ) as Record<TokenKey, number>;

const canPayUnknownTechniques = (
  slack: Balance,
  count: number,
  period: Period,
): boolean => {
  const required = Math.max(0, Math.trunc(count));
  if (required === 0) return true;
  const mono = minimumMonoTechniqueCost(period);
  const capacity = TOKEN_KEYS.reduce((sum, key) => {
    const unit = mono[key];
    return (
      sum +
      (Number.isFinite(unit) && unit > 0 ? Math.floor(slack[key] / unit) : 0)
    );
  }, 0);
  return capacity >= required;
};

const subtractIfAffordable = (
  balance: Balance,
  cost: Balance,
): Balance | null =>
  canAfford(balance, cost) ? subtractCost(balance, cost) : null;

const futureTechniqueCount = (
  concertIndex: number,
  firstCycle: number,
  acquisitions: number,
): number | null => {
  let total = 0;
  let cycle = Math.max(1, Math.trunc(firstCycle));
  for (let index = 0; index < acquisitions; index += 1, cycle += 1) {
    const count = techniquesForSongCycle(concertIndex, cycle);
    if (count === null) return null;
    total += count;
  }
  return total;
};

const canPayUnknownSchedule = (
  slack: Balance,
  count: number,
  period: Period,
  firstOfferPeriod: Period,
): boolean => {
  const required = Math.max(0, Math.trunc(count));
  if (required === 0) return true;
  if (firstOfferPeriod === period) {
    return canPayUnknownTechniques(slack, required, period);
  }
  // Only the first inherited refresh may use an older price law. A favorable
  // witness can choose any minimum mono colour from that real period, then the
  // remaining refreshes use the current section's law.
  const firstMono = minimumMonoTechniqueCost(firstOfferPeriod);
  return TOKEN_KEYS.some((key) => {
    const cost = zeroBalance();
    cost[key] = firstMono[key];
    const after = subtractIfAffordable(slack, cost);
    return (
      after !== null && canPayUnknownTechniques(after, required - 1, period)
    );
  });
};

export const reachAndAffordReserveTargets = (
  tokens: Balance,
  targets: readonly TokenReserveTarget[],
  context: ReserveFeasibilityContext,
): boolean => {
  if (targets.length === 0) return true;
  const reserve = addCosts(targets);
  if (!balanceCovers(tokens, reserve)) return false;

  // Buying a protected target subtracts exactly the same vector from balance
  // and from the remaining reserve, so the slack stays unchanged. Feasibility
  // therefore reduces to whether that slack can pay the real path needed to
  // expose |S| acquisition opportunities. Unknown future offers are favorable
  // by definition; the cheapest feasible witness is a mono technique in any
  // colour, while the currently observed page remains fully constrained.
  const slack = Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, tokens[key] - reserve[key]]),
  ) as Balance;
  const targetIds = new Set(targets.map((target) => target.id));
  const cycle = Math.max(1, Math.trunc(context.nextSongCycle));
  const currentTechniques = Math.max(
    0,
    Math.trunc(context.techniquesToNextSong),
  );

  if (currentTechniques === 0) {
    const visibleSongs = context.visibleSongs ?? [];
    const hasRealVisiblePage = visibleSongs.length > 0;
    const visibleProtected = visibleSongs.some((song) =>
      targetIds.has(song.id),
    );
    if (hasRealVisiblePage && !visibleProtected) {
      const later = futureTechniqueCount(
        context.concertIndex,
        cycle + 1,
        targets.length,
      );
      if (later === null) return false;
      return visibleSongs.some((bridge) => {
        if (targetIds.has(bridge.id)) return false;
        const afterBridge = subtractIfAffordable(slack, bridge.cost);
        return (
          afterBridge !== null &&
          canPayUnknownTechniques(afterBridge, later, context.period)
        );
      });
    }

    // visible(t) => reachCost(t)=0. With no concrete page supplied, the
    // feasibility phase may likewise assume a favorable target draw.
    const remainingTargets = Math.max(0, targets.length - 1);
    const later = futureTechniqueCount(
      context.concertIndex,
      cycle + 1,
      remainingTargets,
    );
    return (
      later !== null && canPayUnknownTechniques(slack, later, context.period)
    );
  }

  const later = futureTechniqueCount(
    context.concertIndex,
    cycle + 1,
    Math.max(0, targets.length - 1),
  );
  if (later === null) return false;

  const observedOffers = (context.currentTechniqueOffers ?? []).filter(
    (cost) => totalCost(cost) > 0,
  );
  if (observedOffers.length > 0) {
    const unknownAfterObserved = Math.max(0, currentTechniques - 1) + later;
    return observedOffers.some((offer) => {
      const afterObserved = subtractIfAffordable(slack, offer);
      return (
        afterObserved !== null &&
        canPayUnknownTechniques(
          afterObserved,
          unknownAfterObserved,
          context.period,
        )
      );
    });
  }

  return canPayUnknownSchedule(
    slack,
    currentTechniques + later,
    context.period,
    context.firstOfferPeriod ?? context.period,
  );
};

export const calculateTokenReservePlan = (
  songs: SongTarget[],
  strategicPlan?: StrategicPlan,
  options: TokenReservePlanOptions = {},
): TokenReservePlan => {
  const valueOf = (song: SongTarget): number =>
    strategicPlan
      ? strategicReserveWeight(song, strategicPlan)
      : songPolicyValue(song);
  const reserveIds = options.feasibility?.reserveSongIds
    ? new Set(options.feasibility.reserveSongIds)
    : null;
  const weightedDemandCost = (song: SongTarget): number =>
    TOKEN_KEYS.reduce(
      (sum, key) =>
        sum + song.cost[key] * (1 + (options.shadowByKey?.[key] ?? 0) * 4),
      0,
    );
  const ranked = [...songs]
    .filter(
      (song) =>
        valueOf(song) > 0 &&
        (!strategicPlan || isReserveTarget(song, strategicPlan)) &&
        (!reserveIds || reserveIds.has(song.id)),
    )
    .sort(
      (a, b) =>
        valueOf(b) - valueOf(a) ||
        weightedDemandCost(a) - weightedDemandCost(b) ||
        totalCost(a.cost) - totalCost(b.cost) ||
        a.name.localeCompare(b.name),
    );

  if (ranked.length === 0) {
    return { mode: "none", targets: [] };
  }

  if (!options.tokens || !options.feasibility) {
    const bestValue = valueOf(ranked[0]);
    const equivalentFloor = bestValue - Math.max(3, bestValue * 0.08);
    const staticTargets: TokenReserveTarget[] = [];
    for (const song of ranked) {
      if (valueOf(song) < equivalentFloor) break;
      if (
        staticTargets.some((target) => sameCostVector(target.cost, song.cost))
      ) {
        continue;
      }
      staticTargets.push({
        id: song.id,
        name: song.name,
        cost: song.cost,
        priority: song.priority,
        policyValue: valueOf(song),
      });
    }
    return {
      mode: staticTargets.length > 1 ? "frontier" : "single",
      targets: staticTargets,
    };
  }

  const targets: TokenReserveTarget[] = [];
  const skippedTargets: NonNullable<TokenReservePlan["skippedTargets"]> = [];
  for (const song of ranked) {
    const candidate: TokenReserveTarget = {
      id: song.id,
      name: song.name,
      cost: song.cost,
      priority: song.priority,
      policyValue: valueOf(song),
    };
    // v0.24: feasibility scale. Skip an impossible high-value target and keep
    // scanning lower-value songs instead of freezing around an impossible
    // frontier. Without state context, retain the conservative static list for
    // isolated callers/tests; production paths provide the context below.
    if (
      options.tokens &&
      options.feasibility &&
      !reachAndAffordReserveTargets(
        options.tokens,
        [...targets, candidate],
        options.feasibility,
      )
    ) {
      skippedTargets.push({
        id: song.id,
        name: song.name,
        reason: {
          code: "reserve.infeasibleChaseTarget",
          songName: song.name,
        },
      });
      continue;
    }
    targets.push(candidate);
  }

  return {
    mode:
      targets.length === 0
        ? "none"
        : targets.length > 1
          ? "frontier"
          : "single",
    targets,
    skippedTargets,
  };
};

const weightedSongReadiness = (
  balance: Balance,
  songs: SongTarget[],
  strategicPlan?: StrategicPlan,
): number => {
  if (songs.length === 0) return 0;
  const valueOf = (song: SongTarget): number =>
    strategicPlan
      ? strategicReserveWeight(song, strategicPlan)
      : songPolicyValue(song);
  const weightedSongs = songs.filter((song) => valueOf(song) > 0);
  if (weightedSongs.length === 0) return 0;
  const affordable = weightedSongs.filter((song) =>
    canAfford(balance, song.cost),
  );
  if (affordable.length === 0) return 0;
  const levels = Array.from(new Set(affordable.map(valueOf))).sort(
    (a, b) => a - b,
  );
  const maximum = Math.max(...weightedSongs.map(valueOf), 1);
  let expectedBest = 0;
  let previous = 0;
  for (const level of levels) {
    const qualifying = affordable.filter(
      (song) => valueOf(song) >= level,
    ).length;
    expectedBest +=
      (level - previous) *
      atLeastOneDrawProbability(weightedSongs.length, qualifying);
    previous = level;
  }
  return clamp01(expectedBest / maximum);
};

export const calculateTokenPressure = (
  tokens: Balance,
  songs: SongTarget[],
  generationProfile: GenerationProfile = "speed-wit",
  strategicPlan?: StrategicPlan,
  reserveFeasibility?: ReserveFeasibilityContext,
): TokenPressure[] => {
  const valueOf = (song: SongTarget): number => {
    const base = strategicPlan
      ? strategicReserveWeight(song, strategicPlan)
      : songPolicyValue(song);
    // P2 only enriches soft colour pressure. Hard reserve/frontier selection
    // still uses calculateTokenReservePlan and therefore the ordinal tier.
    return base + Math.max(0, song.practiceValue ?? 0);
  };
  const relevant = songs
    .filter((song) => valueOf(song) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a));
  if (relevant.length === 0) {
    return TOKEN_KEYS.map((key) => ({
      key,
      shadowValue: 0,
      reserveTarget: 0,
      margin: tokens[key],
      demandCount: 0,
      priorityDemandCount: 0,
      reserveReason: { code: "reserve.noNearbyTarget" },
      level: "free" as const,
    }));
  }

  const supply = GENERATION_SUPPLY[generationProfile];
  const baseline = weightedSongReadiness(tokens, relevant, strategicPlan);
  const totalDemand = TOKEN_KEYS.reduce(
    (sum, key) =>
      sum +
      relevant.reduce(
        (tokenSum, song) => tokenSum + song.cost[key] * valueOf(song),
        0,
      ),
    0,
  );

  const shadowByKey = Object.fromEntries(
    TOKEN_KEYS.map((key) => {
      const reduced = {
        ...tokens,
        [key]: Math.max(0, tokens[key] - 5),
      };
      const marginalDrop =
        baseline - weightedSongReadiness(reduced, relevant, strategicPlan);
      const weightedDemand =
        relevant.reduce(
          (sum, song) => sum + song.cost[key] * valueOf(song),
          0,
        ) / Math.max(0.4, supply[key]);
      const demandShare = totalDemand === 0 ? 0 : weightedDemand / totalDemand;
      return [key, Math.max(0, marginalDrop * 4 + demandShare)];
    }),
  ) as Record<TokenKey, number>;

  const reservePlan = calculateTokenReservePlan(songs, strategicPlan, {
    tokens,
    feasibility: reserveFeasibility,
    shadowByKey,
  });

  const raw = TOKEN_KEYS.map((key) => {
    const shadowValue = shadowByKey[key];

    // Hard reserve comes from the feasible protected set. Lower-value targets
    // may take over when a higher target is arithmetically unreachable, but a
    // protected song always contributes its complete vector cost.
    const frontierRequiring = reservePlan.targets.filter(
      (target) => target.cost[key] > 0,
    );
    const reserveTarget = frontierRequiring.reduce(
      (sum, song) => sum + song.cost[key],
      0,
    );
    const margin = tokens[key] - reserveTarget;
    const priorityDemandCount = relevant.filter(
      (song) => song.priority && song.cost[key] > 0,
    ).length;
    const demandCount = relevant.filter((song) => song.cost[key] > 0).length;
    const anchorNames = frontierRequiring.map((song) => song.name);
    const skippedNames = (reservePlan.skippedTargets ?? [])
      .filter(
        (skipped) => songs.find((song) => song.id === skipped.id)?.cost[key],
      )
      .map((skipped) => skipped.name);
    const baseReserveReason: Message =
      anchorNames.length > 0
        ? { code: "reserve.feasibleScale", anchors: anchorNames }
        : demandCount > 0
          ? { code: "reserve.softPressure" }
          : { code: "reserve.noNearbyTarget" };
    const reserveReason: Message =
      skippedNames.length > 0
        ? {
            code: "reserve.skippedInfeasibleChase",
            base: baseReserveReason,
            skipped: skippedNames.slice(0, 2),
          }
        : baseReserveReason;

    return {
      key,
      shadowValue,
      reserveTarget,
      margin,
      demandCount,
      priorityDemandCount,
      reserveReason,
    };
  });

  return raw
    .map((item): TokenPressure => {
      const level: TokenPressure["level"] =
        item.reserveTarget <= 0
          ? item.shadowValue >= 0.18
            ? "useful"
            : "free"
          : item.margin < 0
            ? "critical"
            : item.margin <= 10
              ? "tight"
              : "useful";
      return { ...item, level };
    })
    .sort(
      (a, b) =>
        ({ critical: 3, tight: 2, useful: 1, free: 0 })[b.level] -
          { critical: 3, tight: 2, useful: 1, free: 0 }[a.level] ||
        b.shadowValue - a.shadowValue ||
        TOKEN_KEYS.indexOf(a.key) - TOKEN_KEYS.indexOf(b.key),
    );
};

export const techniqueSpendMetrics = (
  cost: Balance,
  tokens: Balance,
  pressure: TokenPressure[],
): TechniqueSpendMetrics => {
  const byKey = new Map(pressure.map((item) => [item.key, item]));
  const spentKeys = TOKEN_KEYS.filter((key) => cost[key] > 0);
  if (spentKeys.length === 0) {
    return {
      reserveBreachCount: 0,
      reserveDeficit: 0,
      minimumPostPurchaseMargin: Number.POSITIVE_INFINITY,
      retainedPostPurchaseMargin: Number.POSITIVE_INFINITY,
      normalizedReserveDrain: 0,
      weightedDemandCost: 0,
      totalSpend: 0,
    };
  }

  const afterMargins = spentKeys.map((key) => {
    const reserveTarget = byKey.get(key)?.reserveTarget ?? 0;
    return tokens[key] - cost[key] - reserveTarget;
  });
  const reserveDeficits = afterMargins.map((margin) => Math.max(0, -margin));
  const normalizedReserveDrain = spentKeys.reduce((sum, key) => {
    const reserveTarget = byKey.get(key)?.reserveTarget ?? 0;
    const spendableBefore = Math.max(1, tokens[key] - reserveTarget);
    return sum + cost[key] / spendableBefore;
  }, 0);
  const weightedDemandCost = spentKeys.reduce(
    (sum, key) =>
      sum +
      // Pressure matters, but it must not make a technique almost twice as
      // expensive look cheaper merely because it spends a low-demand colour.
      // A ×4 premium preserves colour discipline while keeping raw cost
      // economically meaningful (the previous ×8 caused the 16 vs 30 replay).
      cost[key] * (1 + (byKey.get(key)?.shadowValue ?? 0) * 4),
    0,
  );

  return {
    reserveBreachCount: reserveDeficits.filter((deficit) => deficit > 0).length,
    reserveDeficit: reserveDeficits.reduce((sum, deficit) => sum + deficit, 0),
    minimumPostPurchaseMargin: Math.min(...afterMargins),
    retainedPostPurchaseMargin: afterMargins.reduce(
      (sum, margin) => sum + margin,
      0,
    ),
    normalizedReserveDrain,
    weightedDemandCost,
    totalSpend: spentKeys.reduce((sum, key) => sum + cost[key], 0),
  };
};

/**
 * Shared tie-breaker for visible and simulated technique offers. Lower means
 * the left cost is the safer spend. A real reserve breach is resolved before theoretical demand;
 * otherwise future demand pressure wins before raw absolute surplus. This
 * prevents a large but strategically required colour from being spent merely
 * because its current balance is numerically the highest.
 */
/**
 * Deterministic reserve protection only. This is intentionally separated from
 * the softer spending comparator so small Monte-Carlo differences can never
 * justify crossing a known reserve vector. Lower means the left spend is safer.
 */
export const compareTechniqueReserveSafety = (
  left: Balance,
  right: Balance,
  tokens: Balance,
  pressure: TokenPressure[],
): number => {
  const a = techniqueSpendMetrics(left, tokens, pressure);
  const b = techniqueSpendMetrics(right, tokens, pressure);
  return (
    a.reserveBreachCount - b.reserveBreachCount ||
    a.reserveDeficit - b.reserveDeficit
  );
};

export const compareTechniqueSpending = (
  left: Balance,
  right: Balance,
  tokens: Balance,
  pressure: TokenPressure[],
): number => {
  const a = techniqueSpendMetrics(left, tokens, pressure);
  const b = techniqueSpendMetrics(right, tokens, pressure);
  return (
    a.reserveBreachCount - b.reserveBreachCount ||
    a.reserveDeficit - b.reserveDeficit ||
    a.weightedDemandCost - b.weightedDemandCost ||
    a.totalSpend - b.totalSpend ||
    a.normalizedReserveDrain - b.normalizedReserveDrain ||
    b.minimumPostPurchaseMargin - a.minimumPostPurchaseMargin ||
    b.retainedPostPurchaseMargin - a.retainedPostPurchaseMargin
  );
};
