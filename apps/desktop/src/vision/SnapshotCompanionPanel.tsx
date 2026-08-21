import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { TOKEN_KEYS } from "@glcp/core";
import type { TimingMode } from "@glcp/core";
import type { Language } from "@glcp/core/i18n";
import type {
  AnalysisObjective,
  Balance,
  GenerationProfile,
  Period,
  RiskProfile,
  TokenKey,
} from "@glcp/core";
import {
  captureWindow,
  hideOverlay,
  isDesktopRuntime,
  listCaptureWindows,
  publishOverlay,
  registerCaptureHotkey,
  syncOverlayWindow,
} from "./desktop.ts";
import { classifyTokenColour, loadImage } from "./image.ts";
import {
  calibrationTargetLabel,
  localizeOcrRuntimeText,
  ocrText,
} from "./i18n.ts";
import { fitContainedFrame } from "./preview-geometry.ts";
import type { ContainedFrame } from "./preview-geometry.ts";
import {
  buildCalibrationTargets,
  CALIBRATION_GROUPS,
  cloneVisionProfile,
  DEFAULT_VISION_PROFILE,
  loadVisionProfile,
  normalizeVisionProfile,
  rectToCss,
  saveVisionProfile,
  VISION_WINDOW_STORAGE_KEY,
} from "./profile.ts";
import { recognizeFrame } from "./recognizer.ts";
import { learnNumericField } from "./numeric-learning.ts";
import { terminateOcr, warmupOcr } from "./ocr.ts";
import { createCaptureGate } from "./capture-gate.ts";
import { assessSnapshotReliability } from "./snapshot-validation.ts";
import { isPlausibleTechniqueCost } from "./technique-cost.ts";
import { detectTechniquePeriodDrift } from "./period-drift.ts";
import {
  assessStockContinuity,
  stockContinuityRequiresConfirmation,
} from "./stock-continuity.ts";
import { pendingOverlayPayload, tokenOverlayValues } from "./overlay-state.ts";
import { snapshotRunProgressionAction } from "./snapshot-run-controls.ts";
import type { StockContinuityAssessment } from "./stock-continuity.ts";
import type { DecisionSinkStatus, PipelineTimings } from "@glcp/core";
import type {
  CaptureFrame,
  CaptureWindow,
  NormalizedRect,
  OcrProgress,
  OverlayPayload,
  RecognitionContext,
  SnapshotPage,
  VisionDecision,
  VisionProfile,
  VisionSnapshot,
} from "./types.ts";

type SnapshotDecisionTools = {
  concertIndex: number;
  concerts: Array<{ short: string; title: string; date: string }>;
  concertLabel: string;
  nextConcertLabel: string | null;
  concertPeriod: Period;
  techniqueOfferCarried: boolean;
  songCycle: number;
  techniquesDone: number;
  techniquesTarget: number;
  songsThisSection: number;
  gaugeSongs: number;
  totalSongs: number;
  timingMode: TimingMode;
  dynamicSpending: boolean;
  solverMode: "express" | "expert";
  riskProfile: RiskProfile;
  generationProfile: GenerationProfile;
  analysisObjective: AnalysisObjective;
  forcePushOverride: boolean;
  pipelineTimings: PipelineTimings | null;
  decisionLogStatus: DecisionSinkStatus | null;
  decisionLogError: string | null;
  canAdvanceConcert: boolean;
  postGrandLive: boolean;
  canEnterPostGrandLive: boolean;
  canUndo: boolean;
  automaticCarryoverPage: "songs" | "techniques" | null;
  advanceDisabledReason: string;
  advanceWarning: string;
  onTimingModeChange: (mode: TimingMode) => void;
  onDynamicSpendingChange: (enabled: boolean) => void;
  onSolverModeChange: (mode: "express" | "expert") => void;
  onRiskProfileChange: (profile: RiskProfile) => void;
  onGenerationProfileChange: (profile: GenerationProfile) => void;
  onAnalysisObjectiveChange: (objective: AnalysisObjective) => void;
  onForcePushOverrideChange: (enabled: boolean) => void;
  onExportDecisionLog: () => void;
  onOpenDecisionLogDirectory: () => void;
  onClearDecisionLog: () => void;
  onUndo: () => void;
  onAdvanceConcert: () => boolean;
  onEnterPostGrandLive: () => void;
  /** Clears the run state only. Calibration and learned OCR models survive. */
  onResetRun: () => void;
};

type SnapshotCompanionPanelProps = {
  open: boolean;
  language: Language;
  expectedPage: SnapshotPage;
  context: RecognitionContext;
  availableSongIds: string[];
  decision: VisionDecision;
  decisionTools: SnapshotDecisionTools;
  tokenContinuityBaseline: Balance | null;
  onApply: (snapshot: VisionSnapshot) => void;
  onPipelineTimings: (timings: PipelineTimings) => void;
  onConfirmTechniquePurchase: (slot: number) => boolean;
  onConfirmSongPurchase: (songId: string) => boolean;
  onOpen: () => void;
  onClose: () => void;
};

type PanelTab = "live" | "decision" | "calibration" | "settings";
type PageChoice = "solver" | SnapshotPage;
type DraftBalance = Record<TokenKey, string>;

const TOKEN_LABELS: Record<TokenKey, string> = {
  dance: "Dance",
  passion: "Passion",
  vocal: "Vocal",
  visual: "Visual",
  mental: "Mental",
};

const TOKEN_SHORT: Record<TokenKey, string> = {
  dance: "Da",
  passion: "Pa",
  vocal: "Vo",
  visual: "Vi",
  mental: "Me",
};

const snapshotRiskLabels = (
  language: Language,
): Record<RiskProfile, string> => ({
  safe: ocrText(language, "Sûr", "Safe"),
  standard: "Standard",
  greedy: "Greedy",
});

const snapshotGenerationLabels = (
  language: Language,
): Record<GenerationProfile, string> => ({
  "speed-wit": ocrText(language, "Speed / Wit dominant", "Speed / Wit focused"),
  "speed-stamina-wit": "Speed / Stamina / Wit",
  "power-present": ocrText(language, "Power présent", "Power present"),
  balanced: ocrText(language, "Équilibré", "Balanced"),
});

const snapshotObjectiveLabels = (
  language: Language,
): Record<AnalysisObjective, string> => ({
  carryover: ocrText(
    language,
    "Atteindre la sélection",
    "Reach song selection",
  ),
  "any-song": ocrText(language, "Acheter toute song", "Buy any song"),
  "priority-song": ocrText(
    language,
    "Trouver une priorité",
    "Find a priority song",
  ),
});

const emptyDraftBalance = (): DraftBalance =>
  Object.fromEntries(TOKEN_KEYS.map((key) => [key, ""])) as DraftBalance;

const draftFromBalance = (value: Balance): DraftBalance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => [key, value[key] ? String(value[key]) : "0"]),
  ) as DraftBalance;

const draftBalanceValue = (draft: DraftBalance): Balance =>
  Object.fromEntries(
    TOKEN_KEYS.map((key) => {
      const parsed = Number.parseInt(draft[key], 10);
      return [key, Number.isFinite(parsed) ? Math.max(0, parsed) : 0];
    }),
  ) as Balance;

const draftsFromSnapshot = (snapshot: VisionSnapshot) => ({
  tokens: Object.fromEntries(
    TOKEN_KEYS.map((key) => [
      key,
      snapshot.tokens[key].value === null
        ? ""
        : String(snapshot.tokens[key].value),
    ]),
  ) as DraftBalance,
  techniques: [0, 1, 2].map((slot) => {
    const reading = snapshot.techniques.find((item) => item.slot === slot);
    return reading ? draftFromBalance(reading.cost) : emptyDraftBalance();
  }),
  songs: [0, 1, 2].map(
    (slot) => snapshot.songs.find((item) => item.slot === slot)?.songId ?? null,
  ),
});

const buildAppliedVisionSnapshot = ({
  snapshot,
  page,
  draftTokens,
  draftTechniques,
  draftSongs,
  context,
  language,
  manuallyConfirmed = false,
  extraWarnings = [],
}: {
  snapshot: VisionSnapshot;
  page: SnapshotPage;
  draftTokens: DraftBalance;
  draftTechniques: DraftBalance[];
  draftSongs: Array<string | null>;
  context: RecognitionContext;
  language: Language;
  manuallyConfirmed?: boolean;
  extraWarnings?: string[];
}): VisionSnapshot => {
  const tokens = draftBalanceValue(draftTokens);
  const next: VisionSnapshot = {
    ...snapshot,
    page,
    pageConfidence: 1,
    tokens: Object.fromEntries(
      TOKEN_KEYS.map((key) => {
        const original = snapshot.tokens[key];
        const manuallyChanged = original.value !== tokens[key];
        return [
          key,
          {
            value: draftTokens[key].trim() === "" ? null : tokens[key],
            confidence:
              draftTokens[key].trim() === ""
                ? 0
                : manuallyConfirmed
                  ? 1
                  : original.value === tokens[key]
                    ? original.confidence
                    : 1,
            raw: draftTokens[key],
            alternatives: original.alternatives,
            ambiguity: original.ambiguity,
            diagnostic: manuallyChanged
              ? `${original.diagnostic ?? ocrText(language, "OCR corrigé", "OCR corrected")} · ${ocrText(language, "confirmation manuelle", "manual confirmation")} ${tokens[key]}`
              : original.diagnostic,
          },
        ];
      }),
    ) as VisionSnapshot["tokens"],
    techniques:
      page === "techniques"
        ? draftTechniques.map((draft, slot) => {
            const cost = draftBalanceValue(draft);
            const original = snapshot.techniques.find(
              (item) => item.slot === slot,
            );
            const plausible = isPlausibleTechniqueCost(cost, context.period);
            return {
              slot,
              kind:
                TOKEN_KEYS.filter((key) => cost[key] > 0).length === 2
                  ? ("duo-balanced" as const)
                  : ("unknown" as const),
              cost,
              confidence: plausible
                ? manuallyConfirmed
                  ? 1
                  : Math.max(original?.confidence ?? 0, 0.9)
                : (original?.confidence ?? 0),
              rawText: original?.rawText ?? "",
              warnings: plausible
                ? []
                : [
                    ocrText(
                      language,
                      "vecteur à vérifier",
                      "cost vector requires review",
                    ),
                  ],
            };
          })
        : [],
    songs:
      page === "songs"
        ? draftSongs.map((songId, slot) => {
            const reference = context.songs.find((song) => song.id === songId);
            const original = snapshot.songs.find((song) => song.slot === slot);
            return {
              slot,
              songId,
              songName: reference?.name ?? "",
              confidence: !songId
                ? 0
                : manuallyConfirmed
                  ? 1
                  : songId === original?.songId
                    ? original.confidence
                    : 1,
              titleScore: original?.titleScore ?? 0,
              coverScore: original?.coverScore ?? 0,
              rawTitle: original?.rawTitle ?? "",
            };
          })
        : [],
    warnings: Array.from(new Set(extraWarnings)),
    signature: "",
  };
  next.signature = JSON.stringify({
    page: next.page,
    tokens: TOKEN_KEYS.map((key) => next.tokens[key].value),
    techniques: next.techniques.map((item) =>
      TOKEN_KEYS.map((key) => item.cost[key]),
    ),
    songs: next.songs.map((item) => item.songId),
  });
  return next;
};

const confidenceLabel = (value: number, language: Language): string =>
  value >= 0.8
    ? ocrText(language, "Très fiable", "Very reliable")
    : value >= 0.58
      ? ocrText(language, "Fiable", "Reliable")
      : value > 0
        ? ocrText(language, "À vérifier", "Review")
        : ocrText(language, "Non lu", "Not read");

const stockContinuityWarningText = (
  assessment: StockContinuityAssessment,
  language: Language,
): string => {
  const details = assessment.issues
    .slice(0, 3)
    .map((issue) => {
      const sign = issue.delta > 0 ? "+" : "";
      return `${TOKEN_LABELS[issue.key]} ${issue.expected} → ${issue.observed} (${sign}${issue.delta})`;
    })
    .join(" · ");
  const remainder =
    assessment.issues.length > 3
      ? ` · +${assessment.issues.length - 3} ${ocrText(language, "couleur(s)", "colour(s)")}`
      : "";
  return `${ocrText(language, "Variation de stock inhabituelle", "Unusual stock change")}: ${details}${remainder}.`;
};

const confidenceTone = (value: number): string =>
  value >= 0.8 ? "good" : value >= 0.58 ? "medium" : "bad";

const techniqueLabel = (cost: Balance, language: Language): string => {
  const entries = TOKEN_KEYS.filter((key) => cost[key] > 0);
  if (entries.length === 2) return "Duo";
  if (entries.length === 1)
    return ocrText(language, "Technique simple", "Single technique");
  return ocrText(language, "Coût incomplet", "Incomplete cost");
};

const overlayPayload = (
  snapshot: VisionSnapshot,
  profile: VisionProfile,
  decision: VisionDecision,
  language: Language,
): OverlayPayload => {
  const tokenValues = tokenOverlayValues(snapshot, profile.regions.tokens);
  const pending = pendingOverlayPayload(snapshot, decision, language);
  if (pending) {
    return {
      ...pending,
      visible: pending.visible || tokenValues.length > 0,
      tokenValues,
    };
  }

  if (snapshot.page === "techniques") {
    const boxes: OverlayPayload["boxes"] = [];
    for (const diagnostic of decision.techniqueDiagnostics) {
      const slot = Number.parseInt(diagnostic.id, 10);
      const region = profile.regions.techniques[slot];
      if (!region) continue;
      if (diagnostic.safety === "hard-blocking") {
        boxes.push({
          rect: region.card,
          tone: "blocking",
          label: language === "fr" ? "Bloquant" : "Blocking",
          detail: diagnostic.reason,
        });
      }
    }
    const primaryTechniqueDiagnostic = decision.techniqueDiagnostics.find(
      (diagnostic) => diagnostic.id === String(decision.bestTechniqueIndex),
    );
    if (
      decision.bestTechniqueIndex !== null &&
      primaryTechniqueDiagnostic?.safety !== "hard-blocking" &&
      profile.regions.techniques[decision.bestTechniqueIndex]
    ) {
      boxes.push({
        rect: profile.regions.techniques[decision.bestTechniqueIndex].card,
        tone: "primary",
        label: decision.overrideActive
          ? "Override"
          : language === "fr"
            ? "Recommandée"
            : "Recommended",
      });
    }
    if (
      decision.alternativeTechniqueIndex !== null &&
      decision.alternativeTechniqueIndex !== decision.bestTechniqueIndex &&
      profile.regions.techniques[decision.alternativeTechniqueIndex]
    ) {
      boxes.push({
        rect: profile.regions.techniques[decision.alternativeTechniqueIndex]
          .card,
        tone: "alternative",
        label: language === "fr" ? "Alternative sûre" : "Safe alternative",
      });
    }
    return {
      language,
      visible: boxes.length > 0 || decision.headline.length > 0,
      loading: false,
      page: snapshot.page,
      headline: decision.headline,
      summary: decision.summary,
      path: decision.path,
      warning: decision.warning,
      overrideActive: decision.overrideActive,
      confidence: snapshot.pageConfidence,
      boxes,
      tokenValues,
    };
  }

  const slotForSong = (songId: string | null): number | undefined =>
    snapshot.songs.find((song) => song.songId === songId)?.slot;
  const primarySlot = slotForSong(decision.recommendedSongId);
  const alternativeSlot = slotForSong(decision.alternativeSongId);
  const boxes: OverlayPayload["boxes"] = [];
  for (const diagnostic of decision.songDiagnostics) {
    if (diagnostic.safety !== "hard-blocking") continue;
    const slot = slotForSong(diagnostic.id);
    if (slot === undefined) continue;
    boxes.push({
      rect: profile.regions.songs[slot].card,
      tone: "blocking",
      label: language === "fr" ? "Bloquante" : "Blocking",
      detail: diagnostic.reason,
    });
  }
  const primarySongDiagnostic = decision.songDiagnostics.find(
    (diagnostic) => diagnostic.id === decision.recommendedSongId,
  );
  if (
    primarySlot !== undefined &&
    primarySongDiagnostic?.safety !== "hard-blocking"
  ) {
    boxes.push({
      rect: profile.regions.songs[primarySlot].card,
      tone: "primary",
      label: decision.overrideActive
        ? "Override"
        : language === "fr"
          ? "Recommandée"
          : "Recommended",
    });
  }
  if (alternativeSlot !== undefined && alternativeSlot !== primarySlot) {
    boxes.push({
      rect: profile.regions.songs[alternativeSlot].card,
      tone: "alternative",
      label: language === "fr" ? "Alternative sûre" : "Safe alternative",
    });
  }
  return {
    language,
    visible: boxes.length > 0 || decision.headline.length > 0,
    loading: false,
    page: snapshot.page,
    headline: decision.headline,
    summary: decision.summary,
    path: decision.path,
    warning: decision.warning,
    overrideActive: decision.overrideActive,
    confidence: snapshot.pageConfidence,
    boxes,
    tokenValues,
  };
};

const fileAsDataUrl = (file: File, language: Language): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new Error(
          ocrText(
            language,
            "Lecture du fichier impossible.",
            "Could not read the file.",
          ),
        ),
      );
    reader.readAsDataURL(file);
  });

const profileDownload = (profile: VisionProfile) => {
  const blob = new Blob([JSON.stringify(profile, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "vision-profile-snapshots.json";
  anchor.click();
  URL.revokeObjectURL(url);
};

const calibrationHelp = (
  id: string,
  language: Language,
): { title: string; body: string } => {
  if (id.startsWith("token.")) {
    return {
      title: ocrText(language, "Valeur de token", "Token value"),
      body: ocrText(
        language,
        "Encadre uniquement le nombre. N’inclus ni l’icône colorée, ni la valeur voisine, ni le bandeau Performance Points.",
        "Draw the box around the number only. Exclude the coloured icon, adjacent value and Performance Points banner.",
      ),
    };
  }
  if (id.includes(".cost.")) {
    return {
      title: ocrText(language, "Chiffre de coût", "Cost number"),
      body: ocrText(
        language,
        "Encadre un seul nombre dans sa colonne Da/Pa/Vo/Vi/Me. Le zéro doit rester dans la zone : les cinq colonnes sont lues séparément.",
        "Draw the box around one number in its Da/Pa/Vo/Vi/Me column. Keep zero inside the region: all five columns are read separately.",
      ),
    };
  }
  if (id.startsWith("technique.") && id.endsWith(".text")) {
    return {
      title: ocrText(language, "Texte de technique", "Technique text"),
      body: ocrText(
        language,
        "Encadre les lignes qui décrivent le type et le niveau de la technique. Cette zone distingue notamment Mono, Duo, Hint et Energy.",
        "Draw the box around the lines describing the technique type and level. This region distinguishes Mono, Duo, Hint and Energy.",
      ),
    };
  }
  if (id.endsWith(".card")) {
    return {
      title: ocrText(language, "Contour de carte", "Card outline"),
      body: ocrText(
        language,
        "Encadre toute la carte, bord extérieur compris. Cette zone ne sert qu’au highlight de l’overlay.",
        "Draw the box around the entire card, including its outer border. This region is used only for the overlay highlight.",
      ),
    };
  }
  if (id.endsWith(".cover")) {
    return {
      title: ocrText(language, "Pochette de song", "Song cover"),
      body: ocrText(
        language,
        "Encadre l’image seule, sans sa bordure ni le texte voisin. Son empreinte visuelle complète la lecture du titre.",
        "Draw the box around the image only, excluding its border and adjacent text. Its visual fingerprint complements title recognition.",
      ),
    };
  }
  return {
    title: ocrText(language, "Titre de song", "Song title"),
    body: ocrText(
      language,
      "Encadre uniquement la ligne du titre. Exclue le badge Songs, la pochette et les deux lignes de bonus.",
      "Draw the box around the title line only. Exclude the Songs badge, cover and two bonus lines.",
    ),
  };
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export default function SnapshotCompanionPanel({
  open,
  language,
  expectedPage,
  context,
  availableSongIds,
  decision,
  decisionTools,
  tokenContinuityBaseline,
  onApply,
  onPipelineTimings,
  onConfirmTechniquePurchase,
  onConfirmSongPurchase,
  onOpen,
  onClose,
}: SnapshotCompanionPanelProps) {
  const desktop = isDesktopRuntime();
  const text = (french: string, english: string) =>
    ocrText(language, french, english);
  const runtimeText = (value: string) =>
    localizeOcrRuntimeText(language, value);
  const [tab, setTab] = useState<PanelTab>("live");
  const [profile, setProfile] = useState<VisionProfile>(() =>
    cloneVisionProfile(DEFAULT_VISION_PROFILE),
  );
  const [profileReady, setProfileReady] = useState(false);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [windowKey, setWindowKey] = useState("");
  const [pageChoice, setPageChoice] = useState<PageChoice>("solver");
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [snapshot, setSnapshot] = useState<VisionSnapshot | null>(null);
  const [appliedFrame, setAppliedFrame] = useState<CaptureFrame | null>(null);
  const [appliedSnapshot, setAppliedSnapshot] = useState<VisionSnapshot | null>(
    null,
  );
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [draftTokens, setDraftTokens] =
    useState<DraftBalance>(emptyDraftBalance);
  const [draftTechniques, setDraftTechniques] = useState<DraftBalance[]>([
    emptyDraftBalance(),
    emptyDraftBalance(),
    emptyDraftBalance(),
  ]);
  const [draftSongs, setDraftSongs] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);
  const techniquePeriodMismatch = useMemo(
    () =>
      expectedPage === "techniques"
        ? detectTechniquePeriodDrift(
            draftTechniques.map((draft) => draftBalanceValue(draft)),
            context.period,
          )
        : null,
    [context.period, draftTechniques, expectedPage],
  );
  const [continuityBaselineAtCapture, setContinuityBaselineAtCapture] =
    useState<Balance | null>(null);
  const stockContinuity = useMemo(() => {
    if (
      !snapshot ||
      !continuityBaselineAtCapture ||
      TOKEN_KEYS.some((key) => draftTokens[key].trim() === "")
    ) {
      return null;
    }
    return assessStockContinuity(
      continuityBaselineAtCapture,
      draftBalanceValue(draftTokens),
    );
  }, [continuityBaselineAtCapture, draftTokens, snapshot]);
  const [dismissedStockContinuity, setDismissedStockContinuity] = useState("");
  const stockContinuityBlocked = Boolean(
    stockContinuity &&
    stockContinuityRequiresConfirmation(stockContinuity) &&
    dismissedStockContinuity !== stockContinuity.fingerprint,
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [message, setMessage] = useState(() =>
    ocrText(
      language,
      "Choisis la fenêtre du jeu, puis prends un snapshot.",
      "Select the game window, then take a snapshot.",
    ),
  );
  const [error, setError] = useState("");
  const [calibrationTargetId, setCalibrationTargetId] = useState("token.dance");
  const [calibrationExpected, setCalibrationExpected] = useState("");
  const [calibrationLearning, setCalibrationLearning] = useState(false);
  const [calibrationLearningResult, setCalibrationLearningResult] =
    useState("");
  const [previewZoom, setPreviewZoom] = useState(0.55);
  const [previewBounds, setPreviewBounds] = useState<ContainedFrame | null>(
    null,
  );
  const [dragRect, setDragRect] = useState<NormalizedRect | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const calibrationImageRef = useRef<HTMLImageElement | null>(null);
  const calibrationViewportRef = useRef<HTMLDivElement | null>(null);
  const snapshotPreviewRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<() => void>(() => undefined);
  const captureGateRef = useRef(createCaptureGate());
  const profileRef = useRef(profile);
  const windowKeyRef = useRef(windowKey);
  const resolvedPage = pageChoice === "solver" ? expectedPage : pageChoice;
  const resolvedPageRef = useRef<SnapshotPage>(resolvedPage);

  const calibrationTargets = useMemo(() => buildCalibrationTargets(), []);
  const activeCalibrationTarget =
    calibrationTargets.find((target) => target.id === calibrationTargetId) ??
    calibrationTargets[0];
  const activeCalibrationRect =
    dragRect ?? activeCalibrationTarget.get(profile);
  const activeCalibrationIsNumeric =
    activeCalibrationTarget.id.startsWith("token.") ||
    /^technique\.\d+\.cost\.\d+$/.test(activeCalibrationTarget.id);
  const activeCalibrationTuning =
    profile.numericFieldTuning[activeCalibrationTarget.id];
  const availableSongSet = useMemo(
    () => new Set(availableSongIds),
    [availableSongIds],
  );
  const expectedSongCount = Math.min(3, availableSongIds.length);

  useEffect(() => {
    if (open || snapshot || frame) return;
    setMessage(
      ocrText(
        language,
        "Choisis la fenêtre du jeu, puis prends un snapshot.",
        "Select the game window, then take a snapshot.",
      ),
    );
    setError("");
    setCalibrationLearningResult("");
  }, [frame, language, open, snapshot]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    windowKeyRef.current = windowKey;
  }, [windowKey]);
  useEffect(() => {
    resolvedPageRef.current = resolvedPage;
  }, [resolvedPage]);

  useEffect(() => {
    const preview = snapshotPreviewRef.current;
    if (!preview || !frame || tab !== "live") {
      setPreviewBounds(null);
      return undefined;
    }
    const update = () => {
      const next = fitContainedFrame(
        preview.clientWidth,
        preview.clientHeight,
        frame.imageWidth,
        frame.imageHeight,
      );
      setPreviewBounds((current) =>
        current &&
        Math.abs(current.width - next.width) < 0.25 &&
        Math.abs(current.height - next.height) < 0.25
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [frame, tab]);

  useEffect(() => {
    let disposed = false;
    void loadVisionProfile().then((loaded) => {
      if (disposed) return;
      setProfile(cloneVisionProfile(loaded));
      setProfileReady(true);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    saveVisionProfile(profile);
  }, [profile, profileReady]);

  const refreshWindows = useCallback(async () => {
    if (!desktop) return;
    try {
      const items = await listCaptureWindows();
      setWindows(items);
      const stored =
        window.localStorage.getItem(VISION_WINDOW_STORAGE_KEY) ?? "";
      const current = windowKeyRef.current;
      const existing = items.find(
        (item) => item.key === current || item.key === stored,
      );
      let pattern: RegExp | null = null;
      try {
        pattern = new RegExp(profileRef.current.windowTitlePattern, "i");
      } catch {
        pattern = null;
      }
      const matching = pattern
        ? items.find((item) => pattern?.test(item.title))
        : null;
      const selected = existing ?? matching ?? items[0];
      if (selected) {
        setWindowKey(selected.key);
        window.localStorage.setItem(VISION_WINDOW_STORAGE_KEY, selected.key);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : text(
              "Impossible de lister les fenêtres.",
              "Could not list windows.",
            ),
      );
    }
  }, [desktop]);

  useEffect(() => {
    void refreshWindows();
  }, [refreshWindows]);

  const acceptRecognition = useCallback(
    (next: VisionSnapshot, nextFrame: CaptureFrame) => {
      const drafts = draftsFromSnapshot(next);
      const reliability = assessSnapshotReliability({
        snapshot: next,
        page: resolvedPageRef.current,
        profile: profileRef.current,
        context,
        availableSongIds,
        expectedSongCount,
      });
      setSnapshot(next);
      setFrame(nextFrame);
      setAppliedFrame(null);
      setAppliedSnapshot(null);
      setOverlayDismissed(false);
      setDraftTokens(drafts.tokens);
      setDraftTechniques(drafts.techniques);
      setDraftSongs(drafts.songs);
      const tokenCount = TOKEN_KEYS.filter(
        (key) => next.tokens[key].value !== null,
      ).length;
      const contentCount =
        next.page === "techniques"
          ? next.techniques.filter((item) =>
              TOKEN_KEYS.some((key) => item.cost[key] > 0),
            ).length
          : next.songs.filter((item) => item.songId).length;
      if (reliability.reliable) {
        setMessage(
          text(
            `${tokenCount}/5 tokens et ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} offres fiables. Analyse automatique…`,
            `${tokenCount}/5 tokens and ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} reliable offers. Automatic analysis…`,
          ),
        );
      } else {
        const issueCount =
          reliability.missing.length + reliability.uncertain.length;
        setMessage(
          text(
            `${tokenCount}/5 tokens et ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} offres lus · ${issueCount} champ(s) à vérifier. Corrige puis appuie de nouveau pour analyser.`,
            `${tokenCount}/5 tokens and ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} offers read · ${issueCount} field(s) to review. Correct them, then press again to analyse.`,
          ),
        );
      }
      return { drafts, reliability };
    },
    [availableSongIds, context, expectedSongCount, language],
  );

  const recognizeCapturedFrame = useCallback(
    async (
      nextFrame: CaptureFrame,
      page: SnapshotPage,
      generation: number,
      captureMs = 0,
    ) => {
      setBusy(true);
      setError("");
      setProgress({
        status: text("Préparation OCR", "Preparing OCR"),
        progress: 0,
      });
      await hideOverlay();
      try {
        const continuityBaseline = tokenContinuityBaseline
          ? { ...tokenContinuityBaseline }
          : null;
        setContinuityBaselineAtCapture(continuityBaseline);
        setDismissedStockContinuity("");
        const next = await recognizeFrame(
          nextFrame.dataUrl,
          profileRef.current,
          context,
          nextFrame.capturedAt,
          setProgress,
          page,
        );
        if (!captureGateRef.current.isCurrent(generation)) return;
        const timings: PipelineTimings = {
          captureMs,
          decodeMs: next.timings?.decodeMs,
          ocrPrimaryMs: next.timings?.ocrPrimaryMs,
          ocrRetryMs: next.timings?.ocrRetryMs,
          ocrTotalMs: next.timings?.ocrTotalMs,
          totalMs: captureMs + (next.timings?.ocrTotalMs ?? 0),
        };
        onPipelineTimings(timings);
        const accepted = acceptRecognition(next, nextFrame);
        if (accepted.reliability.reliable) {
          const continuity = continuityBaseline
            ? assessStockContinuity(
                continuityBaseline,
                draftBalanceValue(accepted.drafts.tokens),
              )
            : null;
          if (stockContinuityRequiresConfirmation(continuity)) {
            // Do not let a high-confidence but obviously truncated token value
            // (e.g. 263 -> 6) reach the solver automatically. The drafts stay
            // editable; correction or an explicit "Intentional" acknowledgement
            // is required before apply.
            setMessage(
              text(
                "Snapshot OCR fiable, mais un écart de stock fortement suspect doit être corrigé ou confirmé avant l’analyse.",
                "OCR snapshot is reliable, but a strongly suspicious stock change must be corrected or confirmed before analysis.",
              ),
            );
          } else {
            const applied = buildAppliedVisionSnapshot({
              snapshot: next,
              page,
              draftTokens: accepted.drafts.tokens,
              draftTechniques: accepted.drafts.techniques,
              draftSongs: accepted.drafts.songs,
              context,
              language,
              extraWarnings: continuity
                ? [stockContinuityWarningText(continuity, language)]
                : [],
            });
            setOverlayDismissed(false);
            setAppliedFrame(nextFrame);
            setAppliedSnapshot(applied);
            onApply(applied);
            setMessage(
              continuity
                ? text(
                    "Snapshot appliqué. Vérifie l’écart de stock signalé si la run n’a pas évolué hors OCR.",
                    "Snapshot applied. Review the reported stock difference if the run did not change outside OCR.",
                  )
                : text(
                    "Snapshot fiable : appliqué et analysé automatiquement.",
                    "Reliable snapshot: applied and analysed automatically.",
                  ),
            );
          }
        }
        setTab("live");
      } catch (reason) {
        if (!captureGateRef.current.isCurrent(generation)) return;
        setError(
          reason instanceof Error
            ? runtimeText(reason.message)
            : text(
                "La reconnaissance du snapshot a échoué.",
                "Snapshot recognition failed.",
              ),
        );
      } finally {
        if (captureGateRef.current.isCurrent(generation)) {
          setBusy(false);
          setProgress(null);
        }
      }
    },
    [
      acceptRecognition,
      context,
      language,
      onApply,
      onPipelineTimings,
      tokenContinuityBaseline,
    ],
  );

  const takeSnapshot = useCallback(async () => {
    const generation = captureGateRef.current.begin();
    if (generation === null) return;
    onOpen();
    const selected = windowKeyRef.current;
    if (!selected) {
      setError(
        text(
          "Aucune fenêtre n’est sélectionnée. Ouvre le panneau et actualise la liste.",
          "No window is selected. Open the panel and refresh the list.",
        ),
      );
      captureGateRef.current.finish(generation);
      return;
    }
    setBusy(true);
    setError("");
    setMessage(text("Capture de la fenêtre…", "Capturing window…"));
    // The overlay belongs to the previous accepted snapshot. It must be hidden
    // before the native window capture starts, otherwise an always-on-top
    // overlay can become part of the pixels sent to OCR. Clearing the applied
    // frame also prevents the overlay effect from re-showing it mid-capture.
    setAppliedFrame(null);
    setAppliedSnapshot(null);
    setOverlayDismissed(false);
    try {
      await hideOverlay();
      const captureStartedAt = performance.now();
      const nextFrame = await captureWindow(selected);
      const captureMs = performance.now() - captureStartedAt;

      // Commit the native frame immediately. Capture and OCR are two separate
      // pipeline stages: a slow or failed OCR must never make a successful
      // Windows capture look as if it never happened.
      setFrame(nextFrame);
      setTab("live");
      onPipelineTimings({ captureMs, totalMs: captureMs });
      setMessage(
        text(
          `Capture OK · ${nextFrame.imageWidth}×${nextFrame.imageHeight}. OCR en cours…`,
          `Capture OK · ${nextFrame.imageWidth}×${nextFrame.imageHeight}. OCR running…`,
        ),
      );

      await recognizeCapturedFrame(
        nextFrame,
        resolvedPageRef.current,
        generation,
        captureMs,
      );
    } catch (reason) {
      if (captureGateRef.current.isCurrent(generation)) {
        setBusy(false);
        setProgress(null);
        setError(
          reason instanceof Error
            ? runtimeText(reason.message)
            : typeof reason === "string"
              ? runtimeText(reason)
              : text("La capture Windows a échoué.", "Windows capture failed."),
        );
      }
    } finally {
      captureGateRef.current.finish(generation);
    }
  }, [language, onOpen, onPipelineTimings, recognizeCapturedFrame]);

  useEffect(() => {
    captureRef.current = () => {
      void takeSnapshot();
    };
  }, [takeSnapshot]);

  useEffect(() => {
    if (!open || !profileReady) return;
    void warmupOcr().catch(() => undefined);
  }, [open, profileReady]);

  useEffect(() => {
    if (!profileReady || !desktop) return undefined;
    let disposed = false;
    let unregister: (() => Promise<void>) | null = null;
    void registerCaptureHotkey(profile.capture.hotkey, () => {
      captureRef.current();
    })
      .then((cleanup) => {
        if (disposed) void cleanup();
        else unregister = cleanup;
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? text(
                `Hotkey invalide : ${reason.message}`,
                `Invalid hotkey: ${reason.message}`,
              )
            : text(
                "Impossible d’enregistrer la hotkey.",
                "Could not register the hotkey.",
              ),
        );
      });
    return () => {
      disposed = true;
      if (unregister) void unregister();
    };
  }, [desktop, language, profile.capture.hotkey, profileReady]);

  useEffect(() => {
    if (
      !appliedFrame ||
      !appliedSnapshot ||
      !profile.automation.overlayEnabled ||
      overlayDismissed
    ) {
      void hideOverlay();
      return;
    }
    const payload = overlayPayload(
      appliedSnapshot,
      profile,
      decision,
      language,
    );
    if (!payload.visible) {
      void hideOverlay();
      return;
    }
    let disposed = false;
    let hideTimer: number | null = null;
    void (async () => {
      await syncOverlayWindow(appliedFrame, true, profile.overlayGeometry);
      await publishOverlay(payload);
      // A long calculation must keep its loading state visible. The result
      // replaces it through this effect and then regains the normal timeout.
      if (!disposed && !payload.loading) {
        hideTimer = window.setTimeout(() => {
          void hideOverlay();
        }, 30_000);
      }
    })();
    return () => {
      disposed = true;
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [
    appliedFrame,
    appliedSnapshot,
    decision,
    language,
    profile,
    overlayDismissed,
  ]);

  const applySnapshot = () => {
    if (!snapshot || !frame) return;
    if (stockContinuityBlocked) {
      setError(
        text(
          "Corrige l’écart de stock suspect ou confirme « C’est volontaire » avant d’appliquer le snapshot.",
          "Correct the suspicious stock change or confirm ‘Intentional’ before applying the snapshot.",
        ),
      );
      return;
    }
    const next = buildAppliedVisionSnapshot({
      snapshot,
      page: resolvedPage,
      draftTokens,
      draftTechniques,
      draftSongs,
      context,
      language,
      manuallyConfirmed: true,
      extraWarnings: stockContinuity
        ? [stockContinuityWarningText(stockContinuity, language)]
        : [],
    });
    setOverlayDismissed(false);
    setAppliedFrame(frame);
    setAppliedSnapshot(next);
    onApply(next);
    setMessage(
      stockContinuity
        ? text(
            "Snapshot validé avec l’écart de stock confirmé.",
            "Snapshot validated with the stock change confirmed.",
          )
        : text(
            "Snapshot validé. Le solver calcule la recommandation et l’overlay se met à jour.",
            "Snapshot validated. The solver is calculating the recommendation and updating the overlay.",
          ),
    );
  };

  const importScreenshot = async (file: File | undefined) => {
    if (!file) return;
    const generation = captureGateRef.current.begin();
    if (generation === null) {
      setMessage(
        text(
          "Une capture OCR est déjà en cours.",
          "An OCR capture is already running.",
        ),
      );
      return;
    }
    try {
      const dataUrl = await fileAsDataUrl(file, language);
      const image = await loadImage(dataUrl);
      const nextFrame: CaptureFrame = {
        window: {
          key: `file:${file.name}`,
          title: file.name,
          x: 0,
          y: 0,
          width: image.naturalWidth,
          height: image.naturalHeight,
          minimized: false,
        },
        dataUrl,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        capturedAt: Date.now(),
      };
      setFrame(nextFrame);
      await recognizeCapturedFrame(nextFrame, resolvedPage, generation);
    } catch (reason) {
      if (captureGateRef.current.isCurrent(generation)) {
        setError(
          reason instanceof Error
            ? runtimeText(reason.message)
            : text(
                "Le screenshot ne peut pas être importé.",
                "The screenshot could not be imported.",
              ),
        );
      }
    } finally {
      captureGateRef.current.finish(generation);
    }
  };

  const updateProfile = (mutate: (draft: VisionProfile) => void) => {
    setProfile((current) => {
      const draft = cloneVisionProfile(current);
      mutate(draft);
      return draft;
    });
  };

  const pointInCalibration = (event: ReactPointerEvent<HTMLDivElement>) => {
    const image = calibrationImageRef.current;
    if (!image) return null;
    const bounds = image.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const updateDragRect = (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    setDragRect({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    });
  };

  const finishCalibrationDrag = () => {
    const next = dragRect;
    dragStartRef.current = null;
    if (!next || next.width < 0.001 || next.height < 0.001) {
      setDragRect(null);
      return;
    }
    setProfile((current) => activeCalibrationTarget.set(current, next));
    setDragRect(null);
  };

  const fitCalibration = () => {
    if (!frame || !calibrationViewportRef.current) return;
    const available = calibrationViewportRef.current.clientWidth - 32;
    setPreviewZoom(clamp(available / Math.max(1, frame.imageWidth), 0.25, 3));
  };

  const learnNumericCalibration = async () => {
    if (!frame || !activeCalibrationIsNumeric || calibrationLearning) return;
    const expected = Number.parseInt(calibrationExpected, 10);
    const maximum = activeCalibrationTarget.id.startsWith("token.")
      ? profile.ocr.maxTokenValue
      : 99;
    if (!Number.isInteger(expected) || expected < 0 || expected > maximum) {
      setCalibrationLearningResult(
        text(
          `Indique une valeur entière entre 0 et ${maximum}.`,
          `Enter an integer between 0 and ${maximum}.`,
        ),
      );
      return;
    }
    setCalibrationLearning(true);
    setCalibrationLearningResult("");
    setError("");
    try {
      setProgress({
        status: text(
          "Localisation des glyphes numériques",
          "Locating numeric glyphs",
        ),
        progress: 0.2,
      });
      const source = await loadImage(frame.dataUrl);
      const currentProfile = profileRef.current;
      const sample = learnNumericField(
        source,
        activeCalibrationTarget.get(currentProfile),
        expected,
        currentProfile.numericFieldTuning[activeCalibrationTarget.id],
      );
      if (!sample) {
        setCalibrationLearningResult(
          text(
            `Aucun groupe de ${String(expected).length} glyphe(s) cohérent n’a été isolé. Aucun réglage existant ni aucune zone n’a été modifié.`,
            `No consistent group of ${String(expected).length} glyph(s) could be isolated. No existing setting or region was changed.`,
          ),
        );
        return;
      }
      const nextProfile = cloneVisionProfile(profileRef.current);
      nextProfile.numericFieldTuning[activeCalibrationTarget.id] =
        sample.tuning;
      // The hotkey path reads profileRef directly. Synchronise it before the
      // next React render so a capture triggered immediately after learning
      // cannot reuse the previous profile.
      profileRef.current = nextProfile;
      setProfile(nextProfile);

      const tokenMatch = /^token\.(dance|passion|vocal|visual|mental)$/.exec(
        activeCalibrationTarget.id,
      );
      if (tokenMatch) {
        const key = tokenMatch[1] as TokenKey;
        setDraftTokens((current) => ({
          ...current,
          [key]: String(expected),
        }));
      } else {
        const techniqueMatch = /^technique\.(\d+)\.cost\.(\d+)$/.exec(
          activeCalibrationTarget.id,
        );
        if (techniqueMatch) {
          const slot = Number(techniqueMatch[1]);
          const costIndex = Number(techniqueMatch[2]);
          const costSlot =
            nextProfile.regions.techniques[slot]?.costSlots[costIndex];
          const tokenKey =
            costSlot?.fixedToken ??
            (costSlot
              ? classifyTokenColour(source, costSlot.rect, nextProfile.palette)
                  .key
              : null);
          if (tokenKey) {
            setDraftTechniques((current) =>
              current.map((draft, index) =>
                index === slot
                  ? { ...draft, [tokenKey]: String(expected) }
                  : draft,
              ),
            );
          }
        }
      }
      setAppliedFrame(null);
      setAppliedSnapshot(null);

      const learnedDigits = [...new Set(String(expected).split(""))].join(", ");
      setCalibrationLearningResult(
        text(
          `Échantillon ajouté et appliqué au snapshot courant : ${expected} · ${sample.componentCount} glyphe(s) isolé(s) · modèles ajoutés pour ${learnedDigits}. La zone logique reste inchangée.`,
          `Sample added and applied to the current snapshot: ${expected} · ${sample.componentCount} isolated glyph(s) · models added for ${learnedDigits}. The logical region is unchanged.`,
        ),
      );
      setMessage(
        text(
          `${activeCalibrationTarget.label} utilise maintenant la valeur ${expected}; les prochains snapshots emploieront immédiatement ce modèle.`,
          `${calibrationTargetLabel(language, activeCalibrationTarget.id, activeCalibrationTarget.label)} now uses value ${expected}; subsequent snapshots will use this model immediately.`,
        ),
      );
    } catch (reason) {
      setCalibrationLearningResult(
        reason instanceof Error
          ? runtimeText(reason.message)
          : text("L’apprentissage OCR a échoué.", "OCR learning failed."),
      );
    } finally {
      setCalibrationLearning(false);
      setProgress(null);
    }
  };

  const forgetNumericCalibration = () => {
    if (!activeCalibrationIsNumeric) return;
    setProfile((current) => {
      const next = cloneVisionProfile(current);
      delete next.numericFieldTuning[activeCalibrationTarget.id];
      return next;
    });
    setCalibrationLearningResult(
      text(
        `Apprentissage OCR oublié pour ${activeCalibrationTarget.label}. La zone reste inchangée.`,
        `OCR learning cleared for ${calibrationTargetLabel(language, activeCalibrationTarget.id, activeCalibrationTarget.label)}. The region is unchanged.`,
      ),
    );
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<VisionProfile>;
      setProfile(normalizeVisionProfile(parsed));
      setMessage(text("Profil OCR importé.", "OCR profile imported."));
    } catch {
      setError(
        text(
          "Ce fichier n’est pas un profil OCR JSON valide.",
          "This file is not a valid OCR JSON profile.",
        ),
      );
    }
  };

  useEffect(
    () => () => {
      captureGateRef.current.invalidate();
      void terminateOcr();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    const body = document.body;
    root.classList.add("snapshot-modal-open");
    body.classList.add("snapshot-modal-open");

    return () => {
      root.classList.remove("snapshot-modal-open");
      body.classList.remove("snapshot-modal-open");
    };
  }, [open]);

  if (!open) return null;

  const tokenReadCount = snapshot
    ? TOKEN_KEYS.filter((key) => snapshot.tokens[key].value !== null).length
    : 0;
  const draftTokenCount = TOKEN_KEYS.filter(
    (key) => draftTokens[key].trim() !== "",
  ).length;
  const recognizedOfferCount =
    resolvedPage === "techniques"
      ? draftTechniques.filter((draft) =>
          TOKEN_KEYS.some((key) => draftBalanceValue(draft)[key] > 0),
        ).length
      : new Set(
          draftSongs.filter(
            (songId): songId is string =>
              Boolean(songId) &&
              (availableSongSet.size === 0 ||
                availableSongSet.has(songId as string)),
          ),
        ).size;
  const requiredOfferCount =
    resolvedPage === "techniques" ? 3 : expectedSongCount;
  const techniqueVectorsValid =
    resolvedPage !== "techniques" ||
    draftTechniques.every((draft) =>
      isPlausibleTechniqueCost(draftBalanceValue(draft), context.period),
    );
  const resultReady =
    draftTokenCount === 5 &&
    requiredOfferCount > 0 &&
    recognizedOfferCount === requiredOfferCount &&
    techniqueVectorsValid;
  const draftSignature = JSON.stringify({
    page: resolvedPage,
    tokens: TOKEN_KEYS.map((key) =>
      draftTokens[key].trim() === ""
        ? null
        : draftBalanceValue(draftTokens)[key],
    ),
    techniques:
      resolvedPage === "techniques"
        ? draftTechniques.map((draft) => {
            const cost = draftBalanceValue(draft);
            return TOKEN_KEYS.map((key) => cost[key]);
          })
        : [],
    songs: resolvedPage === "songs" ? draftSongs : [],
  });
  const purchaseReady =
    !decision.stale &&
    !decision.loading &&
    appliedSnapshot?.signature === draftSignature;
  const pendingReview = Boolean(
    snapshot && appliedSnapshot?.signature !== draftSignature,
  );
  const primaryActionLabel = pendingReview
    ? resultReady
      ? text("Valider et analyser", "Validate and analyse")
      : text("Compléter les champs", "Complete the fields")
    : busy
      ? text("Lecture…", "Reading…")
      : text("Capturer maintenant", "Capture now");
  const progressionAction = snapshotRunProgressionAction({
    nextConcertLabel: decisionTools.nextConcertLabel,
    postGrandLive: decisionTools.postGrandLive,
  });

  const handlePrimarySnapshotAction = () => {
    if (pendingReview) {
      if (!resultReady) {
        setError(
          techniqueVectorsValid
            ? text(
                `Complète les 5 tokens et les ${requiredOfferCount} offres avant l’analyse.`,
                `Complete all 5 tokens and ${requiredOfferCount} offers before analysis.`,
              )
            : text(
                "Au moins un coût de technique est incomplet ou impossible pour cette période.",
                "At least one technique cost is incomplete or impossible for this period.",
              ),
        );
        return;
      }
      if (stockContinuityBlocked) {
        setError(
          text(
            "Corrige l’écart de stock suspect ou confirme « C’est volontaire » avant l’analyse.",
            "Correct the suspicious stock change or confirm ‘Intentional’ before analysis.",
          ),
        );
        return;
      }
      setError("");
      applySnapshot();
      return;
    }
    void takeSnapshot();
  };

  const clearAfterPurchase = (message: string) => {
    setFrame(null);
    setSnapshot(null);
    setAppliedFrame(null);
    setAppliedSnapshot(null);
    setDraftTokens(emptyDraftBalance());
    setDraftTechniques([
      emptyDraftBalance(),
      emptyDraftBalance(),
      emptyDraftBalance(),
    ]);
    setDraftSongs([null, null, null]);
    setContinuityBaselineAtCapture(null);
    setDismissedStockContinuity("");
    setPageChoice("solver");
    setTab("live");
    setError("");
    setMessage(message);
    void hideOverlay();
  };

  const confirmTechniquePurchase = (slot: number) => {
    if (!purchaseReady || !onConfirmTechniquePurchase(slot)) {
      setError(
        text(
          "Le solver ne peut pas enregistrer cet achat dans son état actuel.",
          "The solver cannot record this purchase in its current state.",
        ),
      );
      return;
    }
    clearAfterPurchase(
      text(
        "Technique enregistrée. Affiche l’offre suivante puis reprends un snapshot.",
        "Technique recorded. Display the next offer, then take another snapshot.",
      ),
    );
  };

  const confirmSongPurchase = (songId: string | null) => {
    if (!songId || !purchaseReady || !onConfirmSongPurchase(songId)) {
      setError(
        text(
          "Le solver ne peut pas enregistrer cette song dans son état actuel.",
          "The solver cannot record this song in its current state.",
        ),
      );
      return;
    }
    clearAfterPurchase(
      text(
        "Song enregistrée. Le cycle suivant est prêt pour un nouveau snapshot.",
        "Song recorded. The next cycle is ready for a new snapshot.",
      ),
    );
  };
  const advanceConcertFromSnapshot = () => {
    if (!decisionTools.canAdvanceConcert || !decisionTools.onAdvanceConcert()) {
      setError(
        decisionTools.advanceDisabledReason ||
          text(
            "Le concert ne peut pas encore être enregistré.",
            "The concert cannot be recorded yet.",
          ),
      );
      return;
    }
    clearAfterPurchase(
      decisionTools.nextConcertLabel
        ? text(
            `Concert enregistré. ${decisionTools.nextConcertLabel} est prêt.`,
            `Concert recorded. ${decisionTools.nextConcertLabel} is ready.`,
          )
        : text("Concert enregistré.", "Concert recorded."),
    );
  };
  const enterPostGrandLiveFromSnapshot = () => {
    if (!decisionTools.canEnterPostGrandLive) return;
    decisionTools.onEnterPostGrandLive();
    clearAfterPurchase(
      text(
        "Grand Live enregistré. La phase finale est prête : aucune nouvelle page de songs ne sera proposée.",
        "Grand Live recorded. The final phase is ready: no new song page will be offered.",
      ),
    );
  };
  const resetRunFromSnapshot = () => {
    const confirmed = window.confirm(
      text(
        "Repartir sur une nouvelle run ? L’état de la run en cours sera effacé. Le calibrage et l’apprentissage OCR sont conservés.",
        "Start a new run? The current run state will be cleared. Calibration and learned OCR models are preserved.",
      ),
    );
    if (!confirmed) return;
    decisionTools.onResetRun();
    clearAfterPurchase(
      text(
        "Nouvelle run prête. Prends un snapshot de la première page.",
        "New run ready. Take a snapshot of the first page.",
      ),
    );
  };
  const undoFromSnapshot = () => {
    if (!decisionTools.canUndo) return;
    decisionTools.onUndo();
    clearAfterPurchase(
      text(
        "Dernière action annulée. Reprends un snapshot de la page actuellement affichée.",
        "Last action undone. Take another snapshot of the page currently displayed.",
      ),
    );
  };
  const help = calibrationHelp(activeCalibrationTarget.id, language);

  return (
    <div className="snapshot-companion-backdrop">
      <section
        className="snapshot-companion"
        role="dialog"
        aria-modal="true"
        aria-label="Live OCR"
      >
        <header className="snapshot-companion-header">
          <div>
            <span className="snapshot-companion-kicker">
              {text(
                "Companion de run · capture locale",
                "Run companion · local capture",
              )}
            </span>
            <h2>Live OCR</h2>
          </div>
          <nav aria-label={text("Sections du snapshot", "Snapshot sections")}>
            <button
              type="button"
              className={tab === "live" ? "active" : ""}
              onClick={() => setTab("live")}
            >
              Live
            </button>
            <button
              type="button"
              className={tab === "decision" ? "active" : ""}
              onClick={() => setTab("decision")}
            >
              {text("Décision", "Decision")}
            </button>
            <button
              type="button"
              className={tab === "calibration" ? "active" : ""}
              onClick={() => setTab("calibration")}
            >
              Calibration
            </button>
            <button
              type="button"
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              {text("Réglages", "Settings")}
            </button>
          </nav>
          {desktop && profile.automation.overlayEnabled && (
            <button
              type="button"
              className="snapshot-overlay-dismiss"
              onClick={() => {
                setOverlayDismissed(true);
                void hideOverlay();
              }}
              title={text(
                "Masquer l’overlay jusqu’au prochain snapshot appliqué",
                "Hide the overlay until the next applied snapshot",
              )}
            >
              Overlay ×
            </button>
          )}
          <button
            className="snapshot-close"
            type="button"
            onClick={onClose}
            aria-label={text("Fermer", "Close")}
          >
            ×
          </button>
        </header>

        {(tab === "live" || tab === "calibration") && (
          <div className="snapshot-capture-bar">
            {desktop ? (
              <>
                <select
                  value={windowKey}
                  onChange={(event) => {
                    setWindowKey(event.target.value);
                    window.localStorage.setItem(
                      VISION_WINDOW_STORAGE_KEY,
                      event.target.value,
                    );
                  }}
                  aria-label={text("Fenêtre à capturer", "Window to capture")}
                >
                  {windows.length === 0 && (
                    <option value="">
                      {text("Aucune fenêtre détectée", "No window detected")}
                    </option>
                  )}
                  {windows.map((item) => (
                    <option value={item.key} key={item.key}>
                      {item.title} · {item.width}×{item.height}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="snapshot-secondary"
                  onClick={() => void refreshWindows()}
                >
                  ↻ {text("Fenêtres", "Windows")}
                </button>
              </>
            ) : (
              <label className="snapshot-file-button">
                {text("Importer un screenshot", "Import a screenshot")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    void importScreenshot(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            )}

            <div className="snapshot-page-choice">
              <button
                type="button"
                className={pageChoice === "solver" ? "active" : ""}
                onClick={() => setPageChoice("solver")}
              >
                Solver ·{" "}
                {expectedPage === "techniques" ? "Techniques" : "Songs"}
              </button>
              <button
                type="button"
                className={pageChoice === "techniques" ? "active" : ""}
                onClick={() => setPageChoice("techniques")}
              >
                Techniques
              </button>
              <button
                type="button"
                className={pageChoice === "songs" ? "active" : ""}
                onClick={() => setPageChoice("songs")}
              >
                Songs
              </button>
            </div>

            {desktop && (
              <>
                {pendingReview && (
                  <button
                    type="button"
                    className="snapshot-secondary"
                    onClick={() => void takeSnapshot()}
                    disabled={busy || !windowKey}
                  >
                    {text("Reprendre", "Retake")}
                  </button>
                )}
                <button
                  type="button"
                  className="snapshot-primary"
                  onClick={handlePrimarySnapshotAction}
                  disabled={
                    busy ||
                    (!pendingReview && !windowKey) ||
                    (pendingReview && !resultReady)
                  }
                >
                  {primaryActionLabel}
                  <small>
                    {pendingReview
                      ? text("Vérification manuelle", "Manual review")
                      : profile.capture.hotkey}
                  </small>
                </button>
              </>
            )}
          </div>
        )}

        {error && <div className="snapshot-alert error">{error}</div>}
        <div className="snapshot-status">
          <span className={busy ? "working" : snapshot ? "ready" : ""} />
          <strong>
            {busy && progress ? runtimeText(progress.status) : message}
          </strong>
          {busy && progress && <em>{Math.round(progress.progress * 100)} %</em>}
        </div>

        {techniquePeriodMismatch && (
          <div className="snapshot-alert warning snapshot-period-drift">
            {decisionTools.techniqueOfferCarried &&
            techniquePeriodMismatch.detected === decisionTools.concertPeriod ? (
              <div>
                <strong>
                  {text(
                    "Page de techniques portée probablement consommée",
                    "Carried technique page was probably consumed",
                  )}
                </strong>
                <span>
                  {text(
                    `La run est bien en ${decisionTools.concertPeriod}. L’application attend encore la page portée au tarif ${techniquePeriodMismatch.expected}, mais les trois coûts lus correspondent déjà au tarif courant. Vérifie que l’achat de la technique portée a bien été confirmé dans l’application.`,
                    `The run is correctly set to ${decisionTools.concertPeriod}. The application still expects the carried page at ${techniquePeriodMismatch.expected} prices, but all three read costs already match the current prices. Check that the carried technique purchase was confirmed in the application.`,
                  )}
                </span>
              </div>
            ) : (
              <>
                <div>
                  <strong>
                    {techniquePeriodMismatch.direction === "state-ahead"
                      ? text(
                          "État probablement un concert en avance",
                          "State is probably one concert ahead",
                        )
                      : text(
                          "État probablement un concert en retard",
                          "State is probably one concert behind",
                        )}
                  </strong>
                  <span>
                    {text(
                      `Les trois coûts sont cohérents avec le barème ${techniquePeriodMismatch.detected}, pas avec le barème ${techniquePeriodMismatch.expected} utilisé par l’application.`,
                      `All three costs match the ${techniquePeriodMismatch.detected} price table, not the ${techniquePeriodMismatch.expected} table used by the application.`,
                    )}
                  </span>
                </div>
                {techniquePeriodMismatch.direction === "state-ahead" &&
                decisionTools.canUndo ? (
                  <button type="button" onClick={decisionTools.onUndo}>
                    {text(
                      "Annuler le dernier concert",
                      "Undo the last concert",
                    )}
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        <div className="snapshot-run-cockpit">
          <ol
            className="snapshot-concert-timeline"
            aria-label={text("Progression des concerts", "Concert progress")}
          >
            {decisionTools.concerts.map((item, index) => (
              <li
                className={
                  index < decisionTools.concertIndex
                    ? "done"
                    : index === decisionTools.concertIndex
                      ? "current"
                      : "future"
                }
                key={item.short}
                title={`${item.title} · ${item.date}`}
              >
                <span>
                  {index < decisionTools.concertIndex ? "✓" : index + 1}
                </span>
                <strong>{item.short}</strong>
              </li>
            ))}
          </ol>
          <div className="snapshot-current-state">
            <span>{text("État courant", "Current state")}</span>
            <strong>{decisionTools.concertLabel}</strong>
            <div>
              <small>
                Song <b>#{decisionTools.songCycle}</b>
              </small>
              <small>
                Techniques{" "}
                <b>
                  {decisionTools.techniquesDone}/
                  {decisionTools.techniquesTarget}
                </b>
              </small>
              <small>
                {text("Jauge", "Gauge")} <b>{decisionTools.gaugeSongs}/3</b>
              </small>
              <small>
                Total <b>{decisionTools.totalSongs}/18</b>
              </small>
            </div>
          </div>
          <div className="snapshot-run-actions">
            <button
              type="button"
              className="snapshot-undo-action"
              onClick={undoFromSnapshot}
              disabled={!decisionTools.canUndo}
            >
              ↶ {text("Annuler", "Undo")}
            </button>
            <button
              type="button"
              className="snapshot-reset-run"
              onClick={resetRunFromSnapshot}
              title={text(
                "Le calibrage et l’apprentissage OCR sont conservés.",
                "Calibration and learned OCR models are preserved.",
              )}
            >
              {text("Nouvelle run", "New run")}
            </button>
            <button
              type="button"
              className={`snapshot-next-concert ${
                progressionAction === "post-grand-live-active" ? "active" : ""
              }`}
              onClick={() => {
                if (progressionAction === "advance-concert") {
                  advanceConcertFromSnapshot();
                } else if (progressionAction === "enter-post-grand-live") {
                  enterPostGrandLiveFromSnapshot();
                }
              }}
              disabled={
                progressionAction === "post-grand-live-active" ||
                (progressionAction === "advance-concert"
                  ? !decisionTools.canAdvanceConcert
                  : !decisionTools.canEnterPostGrandLive)
              }
              title={
                progressionAction === "advance-concert"
                  ? decisionTools.canAdvanceConcert
                    ? decisionTools.advanceWarning
                    : decisionTools.advanceDisabledReason
                  : text(
                      "Passer en phase finale : techniques uniquement, sauf page de songs déjà portée.",
                      "Enter the final phase: techniques only, except for an already carried song page.",
                    )
              }
            >
              <span>
                {progressionAction === "advance-concert"
                  ? text("Concert joué", "Concert played")
                  : text("Grand Live joué", "Grand Live played")}
              </span>
              <strong>
                {progressionAction === "post-grand-live-active"
                  ? text("Phase post-Grand Live", "Post-Grand-Live phase")
                  : progressionAction === "enter-post-grand-live"
                    ? text(
                        "Passer en phase post-Grand Live",
                        "Enter post-Grand-Live phase",
                      )
                    : decisionTools.nextConcertLabel
                      ? text(
                          `Continuer vers ${decisionTools.nextConcertLabel}`,
                          `Continue to ${decisionTools.nextConcertLabel}`,
                        )
                      : null}
              </strong>
            </button>
            <small
              className={
                progressionAction === "advance-concert" &&
                decisionTools.advanceWarning
                  ? "warning"
                  : ""
              }
            >
              {progressionAction === "post-grand-live-active"
                ? text(
                    "Aucune nouvelle page de songs ; une page déjà portée reste achetable.",
                    "No new song page; an already carried page remains purchasable.",
                  )
                : progressionAction === "enter-post-grand-live"
                  ? text(
                      "Termine le Grand Live puis active la phase finale, comme dans le mode Web.",
                      "Finish the Grand Live, then enter the final phase, as in Web mode.",
                    )
                  : decisionTools.canAdvanceConcert
                    ? decisionTools.advanceWarning ||
                      (decisionTools.automaticCarryoverPage === "songs"
                        ? text(
                            "La page de songs visible sera portée automatiquement.",
                            "The visible song page will be carried automatically.",
                          )
                        : decisionTools.automaticCarryoverPage === "techniques"
                          ? text(
                              "La page de techniques visible sera portée automatiquement avec ses coûts actuels jusqu’au premier achat.",
                              "The visible technique page will be carried automatically at its current costs until the first purchase.",
                            )
                          : text(
                              "Cap et +10 seront appliqués à la transition.",
                              "The cap and +10 will be applied at the transition.",
                            ))
                    : decisionTools.advanceDisabledReason}
            </small>
          </div>
        </div>

        {tab === "live" && (
          <div className="snapshot-live-controls">
            <div className="snapshot-timing-control compact">
              <span>{text("Moment de la section", "Section timing")}</span>
              <div
                role="group"
                aria-label={text("Moment de la section", "Section timing")}
              >
                <button
                  type="button"
                  className={
                    decisionTools.timingMode === "section-open" ? "active" : ""
                  }
                  onClick={() =>
                    decisionTools.onTimingModeChange("section-open")
                  }
                >
                  <strong>{text("Milieu", "Mid-section")}</strong>
                  <small>
                    {text(
                      "Des gains restent possibles",
                      "Further gains are possible",
                    )}
                  </small>
                </button>
                <button
                  type="button"
                  className={
                    decisionTools.timingMode === "deadline-now" ? "active" : ""
                  }
                  onClick={() =>
                    decisionTools.onTimingModeChange("deadline-now")
                  }
                >
                  <strong>{text("Fin", "End")}</strong>
                  <small>
                    {text(
                      "Plus aucun gain avant live",
                      "No further gains before live",
                    )}
                  </small>
                </button>
              </div>
            </div>
            <div className="snapshot-live-toggles">
              <label className="snapshot-spending-toggle">
                <input
                  type="checkbox"
                  checked={decisionTools.dynamicSpending}
                  onChange={(event) =>
                    decisionTools.onDynamicSpendingChange(event.target.checked)
                  }
                />
                <span>
                  {text(
                    "Déduire les achats confirmés",
                    "Deduct confirmed purchases",
                  )}
                </span>
              </label>
              <label
                className={`snapshot-spending-toggle override ${decisionTools.forcePushOverride ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={decisionTools.forcePushOverride}
                  onChange={(event) =>
                    decisionTools.onForcePushOverrideChange(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  {text("Push forcé / override", "Forced push / override")}
                </span>
              </label>
            </div>
            <details className="snapshot-policy-control compact">
              <summary>
                Profil{" "}
                {decisionTools.solverMode === "express" ? "Auto" : "Expert"}
              </summary>
              <div
                className="snapshot-mode-tabs"
                role="group"
                aria-label={text("Mode du solveur", "Solver mode")}
              >
                <button
                  type="button"
                  className={
                    decisionTools.solverMode === "express" ? "active" : ""
                  }
                  onClick={() => decisionTools.onSolverModeChange("express")}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={
                    decisionTools.solverMode === "expert" ? "active" : ""
                  }
                  onClick={() => decisionTools.onSolverModeChange("expert")}
                >
                  Expert
                </button>
              </div>
              {decisionTools.solverMode === "expert" && (
                <div className="snapshot-policy-fields">
                  <label>
                    <span>{text("Risque", "Risk")}</span>
                    <select
                      value={decisionTools.riskProfile}
                      onChange={(event) =>
                        decisionTools.onRiskProfileChange(
                          event.target.value as RiskProfile,
                        )
                      }
                    >
                      {Object.entries(snapshotRiskLabels(language)).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>{text("Génération", "Generation")}</span>
                    <select
                      value={decisionTools.generationProfile}
                      onChange={(event) =>
                        decisionTools.onGenerationProfileChange(
                          event.target.value as GenerationProfile,
                        )
                      }
                    >
                      {Object.entries(snapshotGenerationLabels(language)).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {resolvedPage === "techniques" && (
                    <label>
                      <span>{text("Objectif", "Objective")}</span>
                      <select
                        value={decisionTools.analysisObjective}
                        onChange={(event) =>
                          decisionTools.onAnalysisObjectiveChange(
                            event.target.value as AnalysisObjective,
                          )
                        }
                      >
                        {Object.entries(snapshotObjectiveLabels(language)).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </details>
            <button
              type="button"
              className="snapshot-open-decision"
              onClick={() => setTab("decision")}
            >
              <span>
                {decision.loading
                  ? text("Analyse en cours…", "Analysis in progress…")
                  : decision.stale
                    ? text("Aucune analyse active", "No active analysis")
                    : text("Comprendre le choix", "Understand the choice")}
              </span>
              <strong>{text("Voir les détails →", "View details →")}</strong>
            </button>
          </div>
        )}

        {tab === "live" && (
          <div className="snapshot-main-grid">
            <div className="snapshot-preview-panel">
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("Capture courante", "Current capture")}</span>
                  <strong>
                    {frame
                      ? `${frame.imageWidth}×${frame.imageHeight}`
                      : text("En attente", "Waiting")}
                  </strong>
                </div>
                {profile.automation.overlayEnabled && (
                  <button
                    type="button"
                    className="snapshot-link-button"
                    onClick={() => {
                      setOverlayDismissed(true);
                      void hideOverlay();
                    }}
                  >
                    {text("Masquer maintenant", "Hide now")}
                  </button>
                )}
              </div>
              {frame ? (
                <div className="snapshot-preview" ref={snapshotPreviewRef}>
                  <div
                    className="snapshot-preview-frame"
                    style={
                      previewBounds
                        ? {
                            width: `${previewBounds.width}px`,
                            height: `${previewBounds.height}px`,
                          }
                        : {
                            width: "100%",
                            aspectRatio: `${frame.imageWidth} / ${frame.imageHeight}`,
                          }
                    }
                  >
                    <img
                      src={frame.dataUrl}
                      alt={text("Snapshot du jeu", "Game snapshot")}
                    />
                    {(
                      Object.values(profile.regions.tokens) as NormalizedRect[]
                    ).map((rect, index) => (
                      <span
                        className="snapshot-region token"
                        style={rectToCss(rect)}
                        key={`token-${index}`}
                      />
                    ))}
                    {(resolvedPage === "techniques"
                      ? profile.regions.techniques
                      : profile.regions.songs
                    ).map((item, index) => (
                      <span
                        className="snapshot-region card"
                        style={rectToCss(item.card)}
                        key={`card-${index}`}
                      >
                        {index + 1}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="snapshot-empty-preview">
                  <span>◎</span>
                  <strong>{text("Aucun snapshot", "No snapshot")}</strong>
                  <p>
                    {text(
                      "Affiche Lessons dans le jeu puis utilise le bouton ou la hotkey globale.",
                      "Open Lessons in the game, then use the button or global hotkey.",
                    )}
                  </p>
                </div>
              )}
              <div className="snapshot-read-summary">
                <span>
                  {text("Tokens prêts", "Tokens ready")}{" "}
                  <strong>{draftTokenCount}/5</strong>
                </span>
                <span>
                  {text("Lus sans correction", "Read without correction")}{" "}
                  <strong>{tokenReadCount}/5</strong>
                </span>
                <span>
                  {text("Offres", "Offers")}{" "}
                  <strong>
                    {recognizedOfferCount}/
                    {resolvedPage === "songs" ? expectedSongCount : 3}
                  </strong>
                </span>
                <span>
                  {text("Mode", "Mode")}{" "}
                  <strong>
                    {resolvedPage === "techniques" ? "Techniques" : "Songs"}
                  </strong>
                </span>
              </div>
            </div>

            <div className="snapshot-review-panel">
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("Validation rapide", "Quick validation")}</span>
                  <strong>
                    {text(
                      "Corrige seulement ce qui est faux",
                      "Correct only what is wrong",
                    )}
                  </strong>
                </div>
                {snapshot && (
                  <span
                    className={`snapshot-confidence ${confidenceTone(
                      snapshot.pageConfidence,
                    )}`}
                  >
                    {confidenceLabel(snapshot.pageConfidence, language)}
                  </span>
                )}
              </div>

              <div className="snapshot-token-grid">
                {TOKEN_KEYS.map((key) => {
                  const reading = snapshot?.tokens[key];
                  const ambiguityResolved = Boolean(
                    reading?.ambiguity &&
                    appliedSnapshot?.signature === draftSignature &&
                    appliedSnapshot.tokens[key].confidence === 1,
                  );
                  return (
                    <div
                      className={`snapshot-token-field ${reading?.ambiguity ? "ambiguous-digit" : ""} ${ambiguityResolved ? "resolved" : ""}`}
                      key={key}
                    >
                      <label>
                        <span>{TOKEN_LABELS[key]}</span>
                        <input
                          type="number"
                          min="0"
                          max={profile.ocr.maxTokenValue}
                          value={draftTokens[key]}
                          onChange={(event) =>
                            setDraftTokens((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                        <small
                          className={confidenceTone(reading?.confidence ?? 0)}
                        >
                          {reading?.ambiguity
                            ? ambiguityResolved
                              ? text(
                                  "Confirmé manuellement",
                                  "Manually confirmed",
                                )
                              : text("Conflit 0 / 6 / 9", "0 / 6 / 9 conflict")
                            : confidenceLabel(
                                reading?.confidence ?? 0,
                                language,
                              )}
                        </small>
                      </label>
                      {reading?.ambiguity && !ambiguityResolved && (
                        <div className="snapshot-digit-suggestions">
                          <span>{text("Choisir", "Choose")}</span>
                          {reading.alternatives?.map((value) => (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftTokens((current) => ({
                                  ...current,
                                  [key]: String(value),
                                }))
                              }
                              key={value}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      )}
                      {reading?.diagnostic &&
                        (reading.ambiguity ||
                          reading.confidence <
                            profile.ocr.minTokenConfidence) && (
                          <em className="snapshot-token-diagnostic">
                            OCR “{reading.raw || "—"}” ·{" "}
                            {runtimeText(reading.diagnostic)}
                          </em>
                        )}
                    </div>
                  );
                })}
              </div>

              {stockContinuity &&
                dismissedStockContinuity !== stockContinuity.fingerprint && (
                  <div className="snapshot-stock-continuity" role="status">
                    <div>
                      <strong>
                        {text(
                          "Variation de stock inhabituelle",
                          "Unusual stock change",
                        )}
                      </strong>
                      <span>
                        {stockContinuityWarningText(stockContinuity, language)}
                      </span>
                      <small>
                        {stockContinuity.broadStateDrift
                          ? text(
                              "Plusieurs couleurs ont changé : c’est probablement normal si tu as joué plusieurs tours ou modifié la run hors OCR.",
                              "Several colours changed: this is probably normal if you played several turns or changed the run outside OCR.",
                            )
                          : stockContinuity.strongOcrSignal
                            ? text(
                                "Une troncature OCR est plausible. Corrige uniquement le chiffre concerné si la variation n’est pas volontaire.",
                                "OCR truncation is plausible. Correct only the affected number if the change was not intentional.",
                              )
                            : text(
                                "Cela peut être normal après des achats, des gains de tokens ou une saisie manuelle hors OCR.",
                                "This may be normal after purchases, token gains or manual input outside OCR.",
                              )}{" "}
                        {stockContinuityRequiresConfirmation(stockContinuity)
                          ? text(
                              "La validation est bloquée jusqu’à correction ou confirmation explicite.",
                              "Validation is blocked until correction or explicit confirmation.",
                            )
                          : text(
                              "La validation reste autorisée.",
                              "Validation remains available.",
                            )}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedStockContinuity(stockContinuity.fingerprint)
                      }
                    >
                      {text("C’est volontaire", "Intentional")}
                    </button>
                  </div>
                )}

              {resolvedPage === "techniques" ? (
                <div className="snapshot-offer-list">
                  {draftTechniques.map((draft, slot) => {
                    const cost = draftBalanceValue(draft);
                    const reading = snapshot?.techniques.find(
                      (item) => item.slot === slot,
                    );
                    const plausible = isPlausibleTechniqueCost(
                      cost,
                      context.period,
                    );
                    const currentTokens = draftBalanceValue(draftTokens);
                    const affordable = TOKEN_KEYS.every(
                      (key) => currentTokens[key] >= cost[key],
                    );
                    const diagnostic = decision.techniqueDiagnostics.find(
                      (item) => item.id === String(slot),
                    );
                    const recommended =
                      purchaseReady && decision.bestTechniqueIndex === slot;
                    const alternative =
                      purchaseReady &&
                      decision.alternativeTechniqueIndex === slot;
                    const blocking =
                      purchaseReady && diagnostic?.safety === "hard-blocking";
                    return (
                      <article
                        className={`snapshot-technique ${
                          plausible ? "valid" : "invalid"
                        } ${
                          blocking
                            ? "blocking"
                            : recommended
                              ? decision.overrideActive
                                ? "override-recommended"
                                : "recommended"
                              : alternative
                                ? "alternative"
                                : ""
                        }`}
                        key={slot}
                      >
                        <div>
                          <span className="snapshot-slot">{slot + 1}</span>
                          <span>
                            <strong>{techniqueLabel(cost, language)}</strong>
                            <small>
                              {plausible
                                ? text("Vecteur cohérent", "Consistent vector")
                                : text(
                                    "Vérifie les chiffres",
                                    "Review the numbers",
                                  )}
                            </small>
                          </span>
                          <em
                            className={confidenceTone(reading?.confidence ?? 0)}
                          >
                            {Math.round((reading?.confidence ?? 0) * 100)}%
                          </em>
                        </div>
                        <div className="snapshot-cost-grid">
                          {TOKEN_KEYS.map((key) => (
                            <label key={key}>
                              <span>{TOKEN_SHORT[key]}</span>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={draft[key]}
                                onChange={(event) =>
                                  setDraftTechniques((current) =>
                                    current.map((item, index) =>
                                      index === slot
                                        ? {
                                            ...item,
                                            [key]: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <div className="snapshot-purchase-row">
                          <span>
                            {blocking
                              ? recommended
                                ? text(
                                    `Moins mauvais choix · BLOQUANT · ${diagnostic?.reason ?? "contrainte perdue"}`,
                                    `Least bad choice · BLOCKING · ${diagnostic?.reason ?? "constraint lost"}`,
                                  )
                                : text(
                                    `Bloquant · ${diagnostic?.reason ?? "contrainte perdue"}`,
                                    `Blocking · ${diagnostic?.reason ?? "constraint lost"}`,
                                  )
                              : recommended
                                ? decision.overrideActive
                                  ? text(
                                      "Override · meilleur push non bloquant",
                                      "Override · best non-blocking push",
                                    )
                                  : text(
                                      "Choix recommandé",
                                      "Recommended choice",
                                    )
                                : alternative
                                  ? text("Alternative sûre", "Safe alternative")
                                  : !affordable
                                    ? text(
                                        "Tokens insuffisants",
                                        "Insufficient tokens",
                                      )
                                    : purchaseReady
                                      ? text("Second choix", "Second choice")
                                      : text(
                                          "Applique le snapshot d’abord",
                                          "Apply the snapshot first",
                                        )}
                          </span>
                          <button
                            type="button"
                            className={
                              blocking
                                ? "blocking"
                                : recommended
                                  ? decision.overrideActive
                                    ? "override"
                                    : "primary"
                                  : alternative
                                    ? "alternative"
                                    : ""
                            }
                            disabled={
                              !purchaseReady || !plausible || !affordable
                            }
                            onClick={() => confirmTechniquePurchase(slot)}
                          >
                            {text("J’ai acheté", "I bought it")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="snapshot-song-list">
                  {[0, 1, 2].map((slot) => {
                    const reading = snapshot?.songs.find(
                      (item) => item.slot === slot,
                    );
                    const selected = context.songs.find(
                      (song) => song.id === draftSongs[slot],
                    );
                    const diagnostic = decision.songDiagnostics.find(
                      (item) => item.id === draftSongs[slot],
                    );
                    const recommended =
                      purchaseReady &&
                      decision.recommendedSongId === draftSongs[slot];
                    const alternative =
                      purchaseReady &&
                      decision.alternativeSongId === draftSongs[slot];
                    const blocking =
                      purchaseReady && diagnostic?.safety === "hard-blocking";
                    const songAffordable =
                      !selected?.cost ||
                      TOKEN_KEYS.every(
                        (key) =>
                          draftBalanceValue(draftTokens)[key] >=
                          (selected.cost?.[key] ?? 0),
                      );
                    return (
                      <article
                        className={`${
                          blocking
                            ? "blocking"
                            : recommended
                              ? decision.overrideActive
                                ? "override-recommended"
                                : "recommended"
                              : alternative
                                ? "alternative"
                                : ""
                        }`}
                        key={slot}
                      >
                        <span className="snapshot-slot">{slot + 1}</span>
                        {selected?.image ? (
                          <img src={selected.image} alt="" />
                        ) : (
                          <span className="snapshot-song-placeholder">?</span>
                        )}
                        <label>
                          <span>
                            {text("Song reconnue", "Recognised song")}
                          </span>
                          <select
                            value={draftSongs[slot] ?? ""}
                            onChange={(event) =>
                              setDraftSongs((current) =>
                                current.map((item, index) =>
                                  index === slot
                                    ? event.target.value || null
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">
                              {text("À sélectionner…", "Select…")}
                            </option>
                            {context.songs.map((song) => (
                              <option
                                value={song.id}
                                key={song.id}
                                disabled={
                                  availableSongSet.size > 0 &&
                                  !availableSongSet.has(song.id)
                                }
                              >
                                {song.name}
                                {availableSongSet.has(song.id)
                                  ? ""
                                  : text(
                                      " · hors pool courante",
                                      " · outside current pool",
                                    )}
                              </option>
                            ))}
                          </select>
                          <small>
                            OCR “{reading?.rawTitle || "—"}” ·{" "}
                            {text("titre", "title")}{" "}
                            {Math.round((reading?.titleScore ?? 0) * 100)}% ·
                            {text("pochette", "cover")}{" "}
                            {Math.round((reading?.coverScore ?? 0) * 100)}%
                          </small>
                          {blocking && diagnostic?.reason && (
                            <small className="blocking-detail">
                              {diagnostic.reason}
                            </small>
                          )}
                        </label>
                        <button
                          type="button"
                          className={`snapshot-song-purchase ${
                            blocking
                              ? "blocking"
                              : recommended
                                ? decision.overrideActive
                                  ? "override"
                                  : "primary"
                                : alternative
                                  ? "alternative"
                                  : ""
                          }`}
                          disabled={
                            !purchaseReady ||
                            !draftSongs[slot] ||
                            !songAffordable
                          }
                          onClick={() => confirmSongPurchase(draftSongs[slot])}
                        >
                          {blocking
                            ? recommended
                              ? text(
                                  "J’ai acheté · moins mauvais choix bloquant",
                                  "I bought it · least bad blocking choice",
                                )
                              : text(
                                  "J’ai acheté malgré le blocage",
                                  "I bought it despite the block",
                                )
                            : recommended
                              ? decision.overrideActive
                                ? text(
                                    "J’ai acheté · override",
                                    "I bought it · override",
                                  )
                                : text(
                                    "J’ai acheté · recommandé",
                                    "I bought it · recommended",
                                  )
                              : alternative
                                ? text(
                                    "J’ai acheté · alternative sûre",
                                    "I bought it · safe alternative",
                                  )
                                : !songAffordable
                                  ? text(
                                      "Tokens insuffisants",
                                      "Insufficient tokens",
                                    )
                                  : text("J’ai acheté", "I bought it")}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="snapshot-apply-row">
                <div>
                  <strong>
                    {snapshot && !resultReady
                      ? !techniqueVectorsValid
                        ? text(
                            "Au moins un coût de technique est incomplet ou impossible pour cette période.",
                            "At least one technique cost is incomplete or impossible for this period.",
                          )
                        : text(
                            `Complète les 5 tokens et les ${requiredOfferCount} offres avant l’analyse.`,
                            `Complete all 5 tokens and ${requiredOfferCount} offers before analysis.`,
                          )
                      : decision.loading
                        ? text("Analyse en cours…", "Analysis in progress…")
                        : decision.stale
                          ? text(
                              "Recommandation en attente",
                              "Recommendation pending",
                            )
                          : decision.headline || decision.summary}
                  </strong>
                  <small>
                    {profile.automation.overlayEnabled
                      ? text(
                          "Le meilleur choix sera entouré sur le jeu pendant 30 secondes.",
                          "The best choice will be highlighted on the game for 30 seconds.",
                        )
                      : text(
                          "Overlay désactivé dans les réglages.",
                          "Overlay disabled in settings.",
                        )}
                  </small>
                </div>
                <div className="snapshot-apply-actions">
                  <button
                    type="button"
                    className="snapshot-secondary"
                    onClick={() => setTab("decision")}
                    disabled={decision.stale || decision.loading}
                  >
                    {text("Voir les détails", "View details")}
                  </button>
                  <button
                    type="button"
                    className="snapshot-primary apply"
                    onClick={applySnapshot}
                    disabled={
                      !snapshot ||
                      !resultReady ||
                      busy ||
                      stockContinuityBlocked
                    }
                  >
                    {text("Valider et analyser", "Validate and analyse")}
                    <small>
                      {text(
                        "Met à jour la décision sans fermer",
                        "Updates the decision without closing",
                      )}
                    </small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "decision" && (
          <div className="snapshot-decision-view">
            <section
              className={`snapshot-decision-hero ${
                decision.overrideActive
                  ? "override"
                  : decision.loading
                    ? "loading"
                    : decision.warning
                      ? "warning"
                      : decision.stale
                        ? "stale"
                        : ""
              }`}
              aria-live="polite"
            >
              <div>
                <span>
                  {decision.loading
                    ? text("Solveur en cours", "Solver running")
                    : decision.stale
                      ? text("Analyse en attente", "Analysis pending")
                      : decision.overrideActive
                        ? text("Override actif", "Override active")
                        : decision.warning
                          ? text(
                              "Décision sous contrainte",
                              "Constrained decision",
                            )
                          : text(
                              "Décision recommandée",
                              "Recommended decision",
                            )}
                </span>
                <h3>{decision.headline}</h3>
                <p>{decision.summary}</p>
                {decision.warning && <em>{decision.warning}</em>}
              </div>
              <button type="button" onClick={() => setTab("live")}>
                {decision.stale
                  ? text("Prendre un snapshot", "Take a snapshot")
                  : text("Retour au live", "Back to live")}
                <small>
                  {text(
                    "Capture et confirmation des achats",
                    "Capture and purchase confirmation",
                  )}
                </small>
              </button>
            </section>

            {!decision.stale && !decision.loading && (
              <>
                <div className="snapshot-decision-summary-grid">
                  <section className="snapshot-decision-plan">
                    <span>{text("Plan actif", "Active plan")}</span>
                    <strong>
                      {decision.plan?.label ??
                        text("Plan déterministe", "Deterministic plan")}
                    </strong>
                    <p>{decision.plan?.detail ?? decision.summary}</p>
                    {decision.plan?.fallback && (
                      <small>
                        {text("Repli", "Fallback")} · {decision.plan.fallback}
                      </small>
                    )}
                  </section>

                  <section className="snapshot-decision-metrics">
                    <span>
                      {text("Indicateurs décisifs", "Decisive metrics")}
                    </span>
                    <div>
                      {decision.metrics.map((metric) => (
                        <article
                          className={metric.tone ?? "neutral"}
                          key={`${metric.label}-${metric.value}`}
                        >
                          <small>{metric.label}</small>
                          <strong>{metric.value}</strong>
                          {metric.detail && <em>{metric.detail}</em>}
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="snapshot-decision-reasons">
                    <span>{text("Pourquoi", "Why")}</span>
                    <ul>
                      {decision.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="snapshot-decision-path">
                    <span>{text("Chemin retenu", "Selected path")}</span>
                    <ol>
                      {decision.path.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </section>
                </div>

                <section className="snapshot-candidate-comparison">
                  <div className="snapshot-section-heading">
                    <div>
                      <span>
                        {text("Comparaison complète", "Full comparison")}
                      </span>
                      <strong>
                        {text(
                          "Choix visibles et option de conservation",
                          "Visible choices and hold option",
                        )}
                      </strong>
                    </div>
                    <small>
                      {decision.candidates.length}{" "}
                      {text("politique(s) comparée(s)", "policies compared")}
                    </small>
                  </div>
                  <div className="snapshot-candidate-grid">
                    {decision.candidates.map((candidate) => (
                      <article
                        className={`${candidate.safety} ${candidate.recommended ? "recommended" : ""}`}
                        key={candidate.id}
                      >
                        <header>
                          <span>
                            {candidate.recommended
                              ? text("Recommandée", "Recommended")
                              : candidate.safety === "safe-alternative"
                                ? text("Alternative sûre", "Safe alternative")
                                : candidate.safety === "hard-blocking"
                                  ? text("Bloquante", "Blocking")
                                  : text("Secondaire", "Secondary")}
                          </span>
                          <strong>{candidate.label}</strong>
                          <small>{candidate.action}</small>
                        </header>
                        {candidate.summary && <p>{candidate.summary}</p>}
                        {candidate.cost && (
                          <div className="snapshot-candidate-cost">
                            {TOKEN_KEYS.filter(
                              (key) => (candidate.cost?.[key] ?? 0) > 0,
                            ).map((key) => (
                              <span className={key} key={key}>
                                {TOKEN_SHORT[key]}{" "}
                                <b>{candidate.cost?.[key]}</b>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="snapshot-candidate-metrics">
                          {candidate.metrics.map((metric) => (
                            <span key={`${candidate.id}-${metric.label}`}>
                              {metric.label} <b>{metric.value}</b>
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            <section className="snapshot-decision-diagnostics">
              <div>
                <span>
                  {text(
                    "Pipeline du dernier snapshot",
                    "Latest snapshot pipeline",
                  )}
                </span>
                {decisionTools.pipelineTimings ? (
                  <div>
                    <small>
                      {text("Capture", "Capture")}{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.captureMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      {text("OCR principal", "Main OCR")}{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.ocrPrimaryMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      {text("Consensus chiffres", "Numeric consensus")}{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.ocrRetryMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      Solver{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.solverMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      Total{" "}
                      <strong>
                        {Math.round(decisionTools.pipelineTimings.totalMs ?? 0)}{" "}
                        ms
                      </strong>
                    </small>
                  </div>
                ) : (
                  <small>
                    {text(
                      "Les durées apparaîtront après le prochain snapshot.",
                      "Timings will appear after the next snapshot.",
                    )}
                  </small>
                )}
              </div>
              <p>
                {text(
                  "Les détails restent disponibles ici après l’analyse ; il n’est plus nécessaire de fermer l’interface OCR pour consulter le plan, les probabilités ou les alternatives.",
                  "Details remain available here after analysis; you no longer need to close the OCR interface to view the plan, probabilities or alternatives.",
                )}
              </p>
            </section>
          </div>
        )}

        {tab === "calibration" && (
          <div className="snapshot-calibration">
            <aside>
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("Toutes les zones OCR", "All OCR regions")}</span>
                  <strong>
                    {text(
                      "Tokens, textes, coûts et songs",
                      "Tokens, text, costs and songs",
                    )}
                  </strong>
                </div>
              </div>
              {CALIBRATION_GROUPS.map((group) => (
                <div className="snapshot-calibration-group" key={group}>
                  <strong>
                    {group === "Tokens" ? "Tokens · Lessons" : group}
                  </strong>
                  {calibrationTargets
                    .filter((target) => target.group === group)
                    .map((target) => (
                      <button
                        type="button"
                        className={
                          target.id === activeCalibrationTarget.id
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          setCalibrationTargetId(target.id);
                          setDragRect(null);
                          setCalibrationExpected("");
                          setCalibrationLearningResult("");
                        }}
                        key={target.id}
                      >
                        {calibrationTargetLabel(
                          language,
                          target.id,
                          target.label,
                        )}
                      </button>
                    ))}
                </div>
              ))}
            </aside>

            <div className="snapshot-calibration-workspace">
              <div className="snapshot-calibration-toolbar">
                <span>
                  <strong>
                    {calibrationTargetLabel(
                      language,
                      activeCalibrationTarget.id,
                      activeCalibrationTarget.label,
                    )}
                  </strong>
                  <small>
                    {text(
                      "Trace un rectangle directement sur le screenshot.",
                      "Draw a rectangle directly on the screenshot.",
                    )}
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewZoom((current) => clamp(current - 0.15, 0.25, 3))
                  }
                >
                  −
                </button>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  value={previewZoom}
                  onChange={(event) =>
                    setPreviewZoom(Number(event.target.value))
                  }
                  aria-label={text("Zoom de calibration", "Calibration zoom")}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPreviewZoom((current) => clamp(current + 0.15, 0.25, 3))
                  }
                >
                  +
                </button>
                <button type="button" onClick={fitCalibration}>
                  {text("Ajuster", "Fit")}
                </button>
                <strong>{Math.round(previewZoom * 100)} %</strong>
              </div>

              <div
                className="snapshot-calibration-viewport"
                ref={calibrationViewportRef}
              >
                {frame ? (
                  <div
                    className="snapshot-calibration-canvas"
                    style={{
                      width: `${frame.imageWidth * previewZoom}px`,
                      height: `${frame.imageHeight * previewZoom}px`,
                    }}
                    onPointerDown={(event) => {
                      const point = pointInCalibration(event);
                      if (!point) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragStartRef.current = point;
                      updateDragRect(point, point);
                    }}
                    onPointerMove={(event) => {
                      const start = dragStartRef.current;
                      const point = pointInCalibration(event);
                      if (start && point) updateDragRect(start, point);
                    }}
                    onPointerUp={finishCalibrationDrag}
                    onPointerCancel={() => {
                      dragStartRef.current = null;
                      setDragRect(null);
                    }}
                  >
                    <img
                      src={frame.dataUrl}
                      alt={text("Calibration OCR", "OCR calibration")}
                      ref={calibrationImageRef}
                      draggable={false}
                    />
                    <span
                      className="snapshot-calibration-selection"
                      style={rectToCss(activeCalibrationRect)}
                    >
                      {calibrationTargetLabel(
                        language,
                        activeCalibrationTarget.id,
                        activeCalibrationTarget.label,
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="snapshot-empty-preview">
                    <span>⌗</span>
                    <strong>
                      {text("Capture requise", "Capture required")}
                    </strong>
                    <p>
                      {text(
                        "Prends d’abord un snapshot Techniques ou Songs. La même image servira à placer toutes les zones.",
                        "First take a Techniques or Songs snapshot. The same image will be used to position every region.",
                      )}
                    </p>
                  </div>
                )}
              </div>

              {activeCalibrationIsNumeric && (
                <div className="snapshot-calibration-learning">
                  <div>
                    <span>
                      {text("Calibrage assisté", "Assisted calibration")}
                    </span>
                    <strong>
                      {text(
                        "Indique la valeur réellement affichée",
                        "Enter the value actually displayed",
                      )}
                    </strong>
                    <p>
                      {text(
                        "La couleur sert à relocaliser les glyphes dans la zone logique à chaque capture. La confirmation ajoute des modèles de chiffres sans déplacer la zone ni remplacer les exemples précédents.",
                        "Colour is used to relocate glyphs inside the logical region on every capture. Confirmation adds digit models without moving the region or replacing previous examples.",
                      )}
                    </p>
                  </div>
                  <label>
                    <span>{text("Valeur réelle", "Actual value")}</span>
                    <input
                      type="number"
                      min="0"
                      max={
                        activeCalibrationTarget.id.startsWith("token.")
                          ? profile.ocr.maxTokenValue
                          : 99
                      }
                      value={calibrationExpected}
                      onChange={(event) =>
                        setCalibrationExpected(event.target.value)
                      }
                      placeholder="Ex. 62"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void learnNumericCalibration()}
                    disabled={
                      !frame ||
                      calibrationLearning ||
                      calibrationExpected.trim() === ""
                    }
                  >
                    {calibrationLearning
                      ? text("Analyse…", "Analysing…")
                      : text("Ajouter cet exemple", "Add this example")}
                  </button>
                  {activeCalibrationTuning?.ink && (
                    <div className="snapshot-calibration-learned">
                      <small>
                        {text("Apprentissage actif", "Learning active")} ·{" "}
                        {activeCalibrationTuning.verifiedSamples}{" "}
                        {text(
                          "confirmation(s) · dernière valeur",
                          "confirmation(s) · latest value",
                        )}{" "}
                        {activeCalibrationTuning.lastExpected} ·{" "}
                        {
                          Object.keys(activeCalibrationTuning.templates ?? {})
                            .length
                        }
                        /10 {text("chiffres couverts.", "digits covered.")}
                      </small>
                      <button type="button" onClick={forgetNumericCalibration}>
                        {text(
                          "Oublier cet apprentissage",
                          "Clear this learning",
                        )}
                      </button>
                    </div>
                  )}
                  {calibrationLearningResult && (
                    <p className="snapshot-calibration-learning-result">
                      {calibrationLearningResult}
                    </p>
                  )}
                </div>
              )}

              <div className="snapshot-calibration-help">
                <span>{text("Ce qui est attendu", "Expected region")}</span>
                <strong>{help.title}</strong>
                <p>{help.body}</p>
                <small>
                  {text(
                    "Les coordonnées sont normalisées : elles restent valides lorsque la fenêtre change de taille sans changer de ratio interne.",
                    "Coordinates are normalised: they remain valid when the window is resized without changing its internal aspect ratio.",
                  )}
                </small>
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="snapshot-settings">
            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("Utilisation", "Usage")}</span>
                  <strong>{text("Snapshot manuel", "Manual snapshot")}</strong>
                </div>
              </div>
              <label>
                <span>{text("Hotkey globale", "Global hotkey")}</span>
                <input
                  type="text"
                  value={profile.capture.hotkey}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.capture.hotkey = event.target.value;
                    })
                  }
                />
                <small>
                  {text(
                    "Format Tauri, par exemple CommandOrControl+Shift+Space.",
                    "Tauri format, for example CommandOrControl+Shift+Space.",
                  )}
                </small>
              </label>
              <label>
                <span>{text("Fenêtre recherchée", "Window pattern")}</span>
                <input
                  type="text"
                  value={profile.windowTitlePattern}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.windowTitlePattern = event.target.value;
                    })
                  }
                />
                <small>
                  {text(
                    "Expression régulière insensible à la casse.",
                    "Case-insensitive regular expression.",
                  )}
                </small>
              </label>
              <label className="snapshot-toggle">
                <input
                  type="checkbox"
                  checked={profile.automation.overlayEnabled}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.automation.overlayEnabled = event.target.checked;
                    })
                  }
                />
                <span>
                  <strong>
                    {text(
                      "Overlay de recommandation",
                      "Recommendation overlay",
                    )}
                  </strong>
                  <small>
                    {text(
                      "Fenêtre transparente, always-on-top et traversable par les clics.",
                      "Transparent, always-on-top window that ignores clicks.",
                    )}
                  </small>
                </span>
              </label>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("OCR ciblé", "Targeted OCR")}</span>
                  <strong>{text("Qualité / coût", "Quality / cost")}</strong>
                </div>
              </div>
              <label>
                <span>
                  {text("Échelle OCR", "OCR scale")} ·{" "}
                  {profile.ocr.scale.toFixed(1)}×
                </span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={profile.ocr.scale}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.ocr.scale = Number(event.target.value);
                    })
                  }
                />
                <small>
                  {text(
                    "2,4× convient généralement à une fenêtre 2048×1152.",
                    "2.4× generally works well for a 2048×1152 window.",
                  )}
                </small>
              </label>
              <label>
                <span>
                  {text("Seuil tokens", "Token threshold")} ·{" "}
                  {Math.round(profile.ocr.minTokenConfidence * 100)} %
                </span>
                <input
                  type="range"
                  min="0.2"
                  max="0.95"
                  step="0.01"
                  value={profile.ocr.minTokenConfidence}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.ocr.minTokenConfidence = Number(event.target.value);
                    })
                  }
                />
              </label>
              <label>
                <span>
                  {text("Seuil songs", "Song threshold")} ·{" "}
                  {Math.round(profile.ocr.minSongConfidence * 100)} %
                </span>
                <input
                  type="range"
                  min="0.2"
                  max="0.95"
                  step="0.01"
                  value={profile.ocr.minSongConfidence}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.ocr.minSongConfidence = Number(event.target.value);
                    })
                  }
                />
              </label>
              <div className="snapshot-ocr-consensus-info">
                <span>0 · 6 · 9</span>
                <div>
                  <strong>
                    {text(
                      "Consensus numérique renforcé",
                      "Enhanced numeric consensus",
                    )}
                  </strong>
                  <small>
                    {text(
                      "Lecture mot entier Otsu + brut, passes caractère pour les valeurs courtes et contrôle de la position du trou. Un conflit reste volontairement à confirmer.",
                      "Whole-word Otsu and raw readings, character passes for short values and hole-position checks. Conflicts deliberately remain subject to confirmation.",
                    )}
                  </small>
                </div>
              </div>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>Diagnostic</span>
                  <strong>
                    {text("Journal des décisions", "Decision log")}
                  </strong>
                </div>
              </div>
              <p className="snapshot-log-path">
                {decisionTools.decisionLogStatus
                  ? text(
                      `Fichier actif (${decisionTools.decisionLogStatus.storage === "portable" ? "près de l’exécutable" : "AppData"}) : ${decisionTools.decisionLogStatus.path}`,
                      `Active file (${decisionTools.decisionLogStatus.storage === "portable" ? "next to the executable" : "AppData"}): ${decisionTools.decisionLogStatus.path}`,
                    )
                  : text(
                      "Mode navigateur : journal local exportable en NDJSON.",
                      "Browser mode: local log can be exported as NDJSON.",
                    )}
              </p>
              {decisionTools.decisionLogStatus && (
                <small>
                  {decisionTools.decisionLogStatus.sizeBytes.toLocaleString(
                    language === "fr" ? "fr-FR" : "en-GB",
                  )}{" "}
                  {text(
                    "octets · fichier créé dès le démarrage",
                    "bytes · file created at startup",
                  )}
                </small>
              )}
              {decisionTools.decisionLogError && (
                <p className="snapshot-warning">
                  {text("Écriture du journal en échec", "Log write failed")}:{" "}
                  {decisionTools.decisionLogError}
                </p>
              )}
              <small>
                {text(
                  "Chaque analyse écrit l’état, son hash stable, les candidats, les raisons, la recommandation normale, l’override, les timings détaillés et le choix confirmé dans une ligne liée.",
                  "Each analysis writes the state, its stable hash, candidates, reasons, normal recommendation, override, detailed timings and confirmed choice in a linked line.",
                )}
              </small>
              <div className="snapshot-profile-actions">
                <button
                  type="button"
                  onClick={decisionTools.onOpenDecisionLogDirectory}
                >
                  {text("Ouvrir le dossier", "Open folder")}
                </button>
                <button
                  type="button"
                  onClick={decisionTools.onExportDecisionLog}
                >
                  {text("Exporter le log", "Export log")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={decisionTools.onClearDecisionLog}
                >
                  {text("Vider le log", "Clear log")}
                </button>
              </div>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>{text("Alignement overlay", "Overlay alignment")}</span>
                  <strong>
                    {text("Correction en pixels", "Pixel correction")}
                  </strong>
                </div>
              </div>
              <div className="snapshot-geometry-grid">
                {(
                  [
                    ["offsetX", text("Décalage X", "X offset")],
                    ["offsetY", text("Décalage Y", "Y offset")],
                    ["widthDelta", text("Largeur ±", "Width ±")],
                    ["heightDelta", text("Hauteur ±", "Height ±")],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      value={profile.overlayGeometry[key]}
                      onChange={(event) =>
                        updateProfile((draft) => {
                          draft.overlayGeometry[key] =
                            Number.parseInt(event.target.value, 10) || 0;
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="snapshot-profile-actions">
                <button type="button" onClick={() => profileDownload(profile)}>
                  {text("Exporter le profil", "Export profile")}
                </button>
                <label>
                  {text("Importer un profil", "Import profile")}
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      void importProfile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    const next = cloneVisionProfile(DEFAULT_VISION_PROFILE);
                    setProfile(next);
                    setMessage(
                      text("Profil OCR réinitialisé.", "OCR profile reset."),
                    );
                  }}
                >
                  {text("Réinitialiser", "Reset")}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
