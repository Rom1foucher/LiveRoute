import type { Labels } from "./i18n/ui-fr.ts";
import type {
  AnalysisObjective,
  AnalysisResult,
  Balance,
  GenerationProfile,
  Period,
  RiskProfile,
  TechniqueQuickKind,
  TokenKey,
  TokenPressure,
} from "@glcp/core";
import type { TimingMode } from "@glcp/core";
import type { RunPulseEvent } from "@glcp/core";
import type { SongPolicyAction } from "@glcp/core";
import type { SongPriority } from "@glcp/core";

export type SongFilter = "available" | "owned" | "locked";

export type ThemeId =
  "light" | "uma" | "dark" | "dark-uma" | "program" | "academy" | "stage";

export const THEME_IDS: readonly ThemeId[] = [
  "light",
  "uma",
  "dark",
  "dark-uma",
  "program",
  "academy",
  "stage",
];

export const themeLabel = (id: ThemeId, L: Labels): string => {
  const key = id === "dark-uma" ? "darkUma" : id;
  return L.theme[key as keyof Labels["theme"]];
};
export type WorkflowMode = "manual" | "live";
export type SolverMode = "express" | "expert";

export type LiveSnapshot = {
  concertIndex: number;
  techniqueOfferPeriod: Period | null;
  songCycle: number;
  techniquesDone: number;
  songsThisSection: number;
  ownedSongs: string[];
  activeSongIds: string[];
  visibleSongIds: string[];
  carryoverSongIds: string[] | null;
  tokens: Balance;
  runPulseEvents: RunPulseEvent[];
  runPulseStartedAtConcert: number | null;
  timingMode: TimingMode;
  abandonedChaseTargetIds: string[];
};

export type OptionAnalysis = {
  index: number | null;
  cost: Balance;
  result: AnalysisResult;
};

export type QuickTechniqueBuilder = {
  kind: TechniqueQuickKind | null;
  levelIndex: number;
  selectedTokens: TokenKey[];
};

export const TOKEN_META: Record<
  TokenKey,
  { label: string; short: string; icon: string; tone: string }
> = {
  dance: {
    label: "Dance",
    short: "Da",
    icon: "assets/tokens/dance.png",
    tone: "blue",
  },
  passion: {
    label: "Passion",
    short: "Pa",
    icon: "assets/tokens/passion.png",
    tone: "orange",
  },
  vocal: {
    label: "Vocal",
    short: "Vo",
    icon: "assets/tokens/vocal.png",
    tone: "pink",
  },
  visual: {
    label: "Visual",
    short: "Vi",
    icon: "assets/tokens/visual.png",
    tone: "violet",
  },
  mental: {
    label: "Composure",
    short: "Co",
    icon: "assets/tokens/mental.png",
    tone: "green",
  },
};

export const CONCERTS: Array<{ short: string; period: Period }> = [
  { short: "C1", period: "junior" },
  { short: "C2", period: "classic" },
  { short: "C3", period: "classic" },
  { short: "C4", period: "senior" },
  { short: "GL", period: "senior" },
];

export const balance = (partial: Partial<Balance>): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

export const INITIAL_TOKENS: Balance = {
  dance: 10,
  passion: 10,
  vocal: 10,
  visual: 10,
  mental: 10,
};

export const INITIAL_CANDIDATE: Balance = {
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
};

export const INITIAL_OWNED: string[] = [];
export const SESSION_STORAGE_KEY = "gl-live-session-v9";
export const LEGACY_SESSION_STORAGE_KEY = "gl-live-session-v8";
export const PRIORITY_RANK: Record<SongPriority, number> = {
  top: 0,
  high: 1,
  normal: 2,
};

export const emptyBalance = (): Balance => balance({});
export const emptyQuickBuilder = (): QuickTechniqueBuilder => ({
  kind: null,
  levelIndex: 0,
  selectedTokens: [],
});

export const generationLabels = (
  L: Labels,
): Record<GenerationProfile, string> => ({
  "speed-wit": "Speed / Wit dominant",
  "speed-stamina-wit": "Speed / Stamina / Wit",
  "power-present": L.meta.powerPresent,
  balanced: L.meta.equilibre,
});

export const RISK_LABELS: Record<RiskProfile, string> = {
  safe: "Safe",
  standard: "Standard",
  greedy: "Greedy",
};

export const checkpointStatusLabels = (L: Labels) => ({
  "secured-now": L.meta.dejaSecurise,
  "closable-before-deadline": L.meta.aFermerAvantLeConcert,
  "reachable-with-future-supply": L.meta.dependDeFutursGains,
  indeterminate: L.meta.indetermine,
  impossible: "Impossible",
});

export const rhythm16StatusLabels = (L: Labels) => ({
  "secured-now": L.meta.dejaSecurise,
  "closable-before-deadline": L.meta.financableMaintenant,
  "reachable-with-future-supply": L.meta.rattrapablePlusTard,
  indeterminate: L.meta.indetermine,
  impossible: L.meta.nonAtteint,
});

export const tokenPressureLabels = (
  L: Labels,
): Record<TokenPressure["level"], string> => ({
  critical: L.meta.reserveManquante,
  tight: L.meta.aProteger,
  useful: L.meta.margeDisponible,
  free: L.meta.sansReserve,
});

export const tokenMarginLabel = (pressure: TokenPressure, L: Labels): string =>
  pressure.reserveTarget <= 0
    ? L.meta.noConstraint
    : pressure.margin < 0
      ? L.meta.missingAmount(Math.abs(pressure.margin))
      : L.meta.localMargin(pressure.margin);

export const policyActionLabel = (
  action: SongPolicyAction,
  L: Labels,
  continuationRecommendation: AnalysisResult["recommendation"] | null = null,
): string =>
  action === "buy-continue"
    ? L.meta.acheterPuisContinuer
    : action === "buy-stop"
      ? continuationRecommendation === "safe" ||
        continuationRecommendation === "push" ||
        continuationRecommendation === "risky"
        ? L.meta.acheterPuisReevaluer
        : L.meta.acheterPuisArreter
      : action === "wait-reserve"
        ? L.meta.reserverLaPageEtAttendre
        : action === "carry-page"
          ? L.meta.porterLaPageAuConcert
          : L.meta.arreterEtConserverToutLe;

export const percent = (value: number, locale = "fr-FR"): string =>
  `${(value * 100).toLocaleString(locale, {
    minimumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
    maximumFractionDigits: 1,
  })} %`;

export const number = (value: number, locale = "fr-FR"): string =>
  value.toLocaleString(locale, { maximumFractionDigits: 1 });

export const pulseScoreLabel = (
  score: number,
  kind: "luck" | "value" | "projection",
  L: Labels,
): string => {
  if (score >= 80) return kind === "luck" ? "High roll" : L.meta.exceptionnelle;
  if (score >= 65) return kind === "luck" ? L.meta.chanceuse : L.meta.tresBonne;
  if (score >= 48) return L.meta.dansLaMoyenne;
  if (score >= 35)
    return kind === "luck" ? L.meta.peuChanceuse : L.meta.fragile;
  return kind === "luck" ? "Low roll" : L.meta.enDifficulte;
};

export const pulseConfidenceLabels = (L: Labels) => ({
  low: L.meta.faible,
  medium: L.meta.moyenne,
  high: L.meta.elevee,
});

export const signatureOf = (
  concertIndex: number,
  techniqueOfferPeriod: Period | null,
  songCycle: number,
  techniquesDone: number,
  tokens: Balance,
  candidates: Balance[],
  objective: AnalysisObjective,
  songIds: string[],
  visibleSongIds: string[],
  songsThisSection: number,
  solverMode: SolverMode,
  riskProfile: RiskProfile,
  generationProfile: GenerationProfile,
  timingMode: TimingMode,
  abandonedChaseTargetIds: string[],
  ownedSongIds: string[],
  activeSongIds: string[],
  carryoverSongIds: string[] | null,
) =>
  JSON.stringify({
    concertIndex,
    techniqueOfferPeriod,
    songCycle,
    techniquesDone,
    tokens,
    candidates,
    objective,
    songIds,
    visibleSongIds,
    songsThisSection,
    solverMode,
    riskProfile,
    generationProfile,
    timingMode,
    abandonedChaseTargetIds: [...abandonedChaseTargetIds].sort(),
    ownedSongIds: [...ownedSongIds].sort(),
    activeSongIds: [...activeSongIds].sort(),
    carryoverSongIds: carryoverSongIds ? [...carryoverSongIds].sort() : null,
  });
