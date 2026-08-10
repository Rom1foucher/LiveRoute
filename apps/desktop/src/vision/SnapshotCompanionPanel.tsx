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
import { assessStockContinuity } from "./stock-continuity.ts";
import { pendingOverlayPayload, tokenOverlayValues } from "./overlay-state.ts";
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

const SNAPSHOT_RISK_LABELS: Record<RiskProfile, string> = {
  safe: "Sûr",
  standard: "Standard",
  greedy: "Greedy",
};

const SNAPSHOT_GENERATION_LABELS: Record<GenerationProfile, string> = {
  "speed-wit": "Speed / Wit dominant",
  "speed-stamina-wit": "Speed / Stamina / Wit",
  "power-present": "Power présent",
  balanced: "Équilibré",
};

const SNAPSHOT_OBJECTIVE_LABELS: Record<AnalysisObjective, string> = {
  carryover: "Atteindre la sélection",
  "any-song": "Acheter toute song",
  "priority-song": "Trouver une priorité",
};

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
  manuallyConfirmed = false,
  extraWarnings = [],
}: {
  snapshot: VisionSnapshot;
  page: SnapshotPage;
  draftTokens: DraftBalance;
  draftTechniques: DraftBalance[];
  draftSongs: Array<string | null>;
  context: RecognitionContext;
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
              ? `${original.diagnostic ?? "OCR corrigé"} · confirmation manuelle ${tokens[key]}`
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
              warnings: plausible ? [] : ["vecteur à vérifier"],
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

const confidenceLabel = (value: number): string =>
  value >= 0.8
    ? "Très fiable"
    : value >= 0.58
      ? "Fiable"
      : value > 0
        ? "À vérifier"
        : "Non lu";

const stockContinuityWarningText = (
  assessment: StockContinuityAssessment,
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
      ? ` · +${assessment.issues.length - 3} couleur(s)`
      : "";
  return `Variation de stock inhabituelle : ${details}${remainder}.`;
};

const confidenceTone = (value: number): string =>
  value >= 0.8 ? "good" : value >= 0.58 ? "medium" : "bad";

const techniqueLabel = (cost: Balance): string => {
  const entries = TOKEN_KEYS.filter((key) => cost[key] > 0);
  if (entries.length === 2) return "Duo";
  if (entries.length === 1) return "Technique simple";
  return "Coût incomplet";
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

const fileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
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

const calibrationHelp = (id: string): { title: string; body: string } => {
  if (id.startsWith("token.")) {
    return {
      title: "Valeur de token",
      body: "Encadre uniquement le nombre. N’inclus ni l’icône colorée, ni la valeur voisine, ni le bandeau Performance Points.",
    };
  }
  if (id.includes(".cost.")) {
    return {
      title: "Chiffre de coût",
      body: "Encadre un seul nombre dans sa colonne Da/Pa/Vo/Vi/Me. Le zéro doit rester dans la zone : les cinq colonnes sont lues séparément.",
    };
  }
  if (id.startsWith("technique.") && id.endsWith(".text")) {
    return {
      title: "Texte de technique",
      body: "Encadre les lignes qui décrivent le type et le niveau de la technique. Cette zone distingue notamment Mono, Duo, Hint et Energy.",
    };
  }
  if (id.endsWith(".card")) {
    return {
      title: "Contour de carte",
      body: "Encadre toute la carte, bord extérieur compris. Cette zone ne sert qu’au highlight de l’overlay.",
    };
  }
  if (id.endsWith(".cover")) {
    return {
      title: "Pochette de song",
      body: "Encadre l’image seule, sans sa bordure ni le texte voisin. Son empreinte visuelle complète la lecture du titre.",
    };
  }
  return {
    title: "Titre de song",
    body: "Encadre uniquement la ligne du titre. Exclue le badge Songs, la pochette et les deux lignes de bonus.",
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [message, setMessage] = useState(
    "Choisis la fenêtre du jeu, puis prends un snapshot.",
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
          : "Impossible de lister les fenêtres.",
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
          `${tokenCount}/5 tokens et ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} offres fiables. Analyse automatique…`,
        );
      } else {
        const issueCount =
          reliability.missing.length + reliability.uncertain.length;
        setMessage(
          `${tokenCount}/5 tokens et ${contentCount}/${next.page === "songs" ? expectedSongCount : 3} offres lus · ${issueCount} champ(s) à vérifier. Corrige puis appuie de nouveau pour analyser.`,
        );
      }
      return { drafts, reliability };
    },
    [availableSongIds, context, expectedSongCount],
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
      setProgress({ status: "Préparation OCR", progress: 0 });
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
          const applied = buildAppliedVisionSnapshot({
            snapshot: next,
            page,
            draftTokens: accepted.drafts.tokens,
            draftTechniques: accepted.drafts.techniques,
            draftSongs: accepted.drafts.songs,
            context,
            extraWarnings: continuity
              ? [stockContinuityWarningText(continuity)]
              : [],
          });
          setOverlayDismissed(false);
          setAppliedFrame(nextFrame);
          setAppliedSnapshot(applied);
          onApply(applied);
          setMessage(
            continuity
              ? "Snapshot appliqué. Vérifie l’écart de stock signalé si la run n’a pas évolué hors OCR."
              : "Snapshot fiable : appliqué et analysé automatiquement.",
          );
        }
        setTab("live");
      } catch (reason) {
        if (!captureGateRef.current.isCurrent(generation)) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "La reconnaissance du snapshot a échoué.",
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
        "Aucune fenêtre n’est sélectionnée. Ouvre le panneau et actualise la liste.",
      );
      captureGateRef.current.finish(generation);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("Capture de la fenêtre…");
    try {
      const captureStartedAt = performance.now();
      const nextFrame = await captureWindow(selected);
      const captureMs = performance.now() - captureStartedAt;
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
            ? reason.message
            : "La capture Windows a échoué.",
        );
      }
    } finally {
      captureGateRef.current.finish(generation);
    }
  }, [onOpen, recognizeCapturedFrame]);

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
            ? `Hotkey invalide : ${reason.message}`
            : "Impossible d’enregistrer la hotkey.",
        );
      });
    return () => {
      disposed = true;
      if (unregister) void unregister();
    };
  }, [desktop, profile.capture.hotkey, profileReady]);

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
    const next = buildAppliedVisionSnapshot({
      snapshot,
      page: resolvedPage,
      draftTokens,
      draftTechniques,
      draftSongs,
      context,
      manuallyConfirmed: true,
      extraWarnings: stockContinuity
        ? [stockContinuityWarningText(stockContinuity)]
        : [],
    });
    setOverlayDismissed(false);
    setAppliedFrame(frame);
    setAppliedSnapshot(next);
    onApply(next);
    setMessage(
      stockContinuity
        ? "Snapshot validé avec un écart de stock non bloquant."
        : "Snapshot validé. Le solver calcule la recommandation et l’overlay se met à jour.",
    );
  };

  const importScreenshot = async (file: File | undefined) => {
    if (!file) return;
    const generation = captureGateRef.current.begin();
    if (generation === null) {
      setMessage("Une capture OCR est déjà en cours.");
      return;
    }
    try {
      const dataUrl = await fileAsDataUrl(file);
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
            ? reason.message
            : "Le screenshot ne peut pas être importé.",
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
        `Indique une valeur entière entre 0 et ${maximum}.`,
      );
      return;
    }
    setCalibrationLearning(true);
    setCalibrationLearningResult("");
    setError("");
    try {
      setProgress({
        status: "Localisation des glyphes numériques",
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
          `Aucun groupe de ${String(expected).length} glyphe(s) cohérent n’a été isolé. Aucun réglage existant ni aucune zone n’a été modifié.`,
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
        `Échantillon ajouté et appliqué au snapshot courant : ${expected} · ${sample.componentCount} glyphe(s) isolé(s) · modèles ajoutés pour ${learnedDigits}. La zone logique reste inchangée.`,
      );
      setMessage(
        `${activeCalibrationTarget.label} utilise maintenant la valeur ${expected}; les prochains snapshots emploieront immédiatement ce modèle.`,
      );
    } catch (reason) {
      setCalibrationLearningResult(
        reason instanceof Error
          ? reason.message
          : "L’apprentissage OCR a échoué.",
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
      `Apprentissage OCR oublié pour ${activeCalibrationTarget.label}. La zone reste inchangée.`,
    );
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<VisionProfile>;
      setProfile(normalizeVisionProfile(parsed));
      setMessage("Profil OCR importé.");
    } catch {
      setError("Ce fichier n’est pas un profil OCR JSON valide.");
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
      ? "Valider et analyser"
      : "Compléter les champs"
    : busy
      ? "Lecture…"
      : "Capturer maintenant";

  const handlePrimarySnapshotAction = () => {
    if (pendingReview) {
      if (!resultReady) {
        setError(
          techniqueVectorsValid
            ? `Complète les 5 tokens et les ${requiredOfferCount} offres avant l’analyse.`
            : "Au moins un coût de technique est incomplet ou impossible pour cette période.",
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
        "Le solver ne peut pas enregistrer cet achat dans son état actuel.",
      );
      return;
    }
    clearAfterPurchase(
      "Technique enregistrée. Affiche l’offre suivante puis reprends un snapshot.",
    );
  };

  const confirmSongPurchase = (songId: string | null) => {
    if (!songId || !purchaseReady || !onConfirmSongPurchase(songId)) {
      setError(
        "Le solver ne peut pas enregistrer cette song dans son état actuel.",
      );
      return;
    }
    clearAfterPurchase(
      "Song enregistrée. Le cycle suivant est prêt pour un nouveau snapshot.",
    );
  };
  const advanceConcertFromSnapshot = () => {
    if (!decisionTools.canAdvanceConcert || !decisionTools.onAdvanceConcert()) {
      setError(
        decisionTools.advanceDisabledReason ||
          "Le concert ne peut pas encore être enregistré.",
      );
      return;
    }
    clearAfterPurchase(
      decisionTools.nextConcertLabel
        ? `Concert enregistré. ${decisionTools.nextConcertLabel} est prêt.`
        : "Concert enregistré.",
    );
  };
  const undoFromSnapshot = () => {
    if (!decisionTools.canUndo) return;
    decisionTools.onUndo();
    clearAfterPurchase(
      "Dernière action annulée. Reprends un snapshot de la page actuellement affichée.",
    );
  };
  const help = calibrationHelp(activeCalibrationTarget.id);

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
              Companion de run · capture locale
            </span>
            <h2>Live OCR</h2>
          </div>
          <nav aria-label="Sections du snapshot">
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
              Décision
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
              Réglages
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
              title="Masquer l’overlay jusqu’au prochain snapshot appliqué"
            >
              Overlay ×
            </button>
          )}
          <button
            className="snapshot-close"
            type="button"
            onClick={onClose}
            aria-label="Fermer"
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
                  aria-label="Fenêtre à capturer"
                >
                  {windows.length === 0 && (
                    <option value="">Aucune fenêtre détectée</option>
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
                  ↻ Fenêtres
                </button>
              </>
            ) : (
              <label className="snapshot-file-button">
                Importer un screenshot
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
                    Reprendre
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
                      ? "Vérification manuelle"
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
          <strong>{busy && progress ? progress.status : message}</strong>
          {busy && progress && <em>{Math.round(progress.progress * 100)} %</em>}
        </div>

        {techniquePeriodMismatch && (
          <div className="snapshot-alert warning snapshot-period-drift">
            {decisionTools.techniqueOfferCarried &&
            techniquePeriodMismatch.detected === decisionTools.concertPeriod ? (
              <div>
                <strong>
                  Page de techniques portée probablement consommée
                </strong>
                <span>
                  La run est bien en {decisionTools.concertPeriod}.
                  L’application attend encore la page portée au tarif{" "}
                  {techniquePeriodMismatch.expected}, mais les trois coûts lus
                  correspondent déjà au tarif courant. Vérifie que l’achat de la
                  technique portée a bien été confirmé dans l’application.
                </span>
              </div>
            ) : (
              <>
                <div>
                  <strong>
                    {techniquePeriodMismatch.direction === "state-ahead"
                      ? "État probablement un concert en avance"
                      : "État probablement un concert en retard"}
                  </strong>
                  <span>
                    Les trois coûts sont cohérents avec le barème{" "}
                    {techniquePeriodMismatch.detected}, pas avec le barème{" "}
                    {techniquePeriodMismatch.expected} utilisé par
                    l’application.
                  </span>
                </div>
                {techniquePeriodMismatch.direction === "state-ahead" &&
                decisionTools.canUndo ? (
                  <button type="button" onClick={decisionTools.onUndo}>
                    Annuler le dernier concert
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        <div className="snapshot-run-cockpit">
          <ol
            className="snapshot-concert-timeline"
            aria-label="Progression des concerts"
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
            <span>État courant</span>
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
                Jauge <b>{decisionTools.gaugeSongs}/3</b>
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
              ↶ Annuler
            </button>
            <button
              type="button"
              className="snapshot-next-concert"
              onClick={() => advanceConcertFromSnapshot()}
              disabled={!decisionTools.canAdvanceConcert}
              title={
                decisionTools.canAdvanceConcert
                  ? decisionTools.advanceWarning
                  : decisionTools.advanceDisabledReason
              }
            >
              <span>Concert joué</span>
              <strong>
                {decisionTools.nextConcertLabel
                  ? `Continuer vers ${decisionTools.nextConcertLabel}`
                  : "Grand Live · fin de run"}
              </strong>
            </button>
            <small className={decisionTools.advanceWarning ? "warning" : ""}>
              {decisionTools.canAdvanceConcert
                ? decisionTools.advanceWarning ||
                  (decisionTools.automaticCarryoverPage === "songs"
                    ? "La page de songs visible sera portée automatiquement."
                    : decisionTools.automaticCarryoverPage === "techniques"
                      ? "La page de techniques visible sera portée automatiquement avec ses coûts actuels jusqu’au premier achat."
                      : "Cap et +10 seront appliqués à la transition.")
                : decisionTools.advanceDisabledReason}
            </small>
          </div>
        </div>

        {tab === "live" && (
          <div className="snapshot-live-controls">
            <div className="snapshot-timing-control compact">
              <span>Moment de la section</span>
              <div role="group" aria-label="Moment de la section">
                <button
                  type="button"
                  className={
                    decisionTools.timingMode === "section-open" ? "active" : ""
                  }
                  onClick={() =>
                    decisionTools.onTimingModeChange("section-open")
                  }
                >
                  <strong>Milieu</strong>
                  <small>Des gains restent possibles</small>
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
                  <strong>Fin</strong>
                  <small>Plus aucun gain avant live</small>
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
                <span>Déduire les achats confirmés</span>
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
                <span>Push forcé / override</span>
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
                aria-label="Mode du solveur"
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
                    <span>Risque</span>
                    <select
                      value={decisionTools.riskProfile}
                      onChange={(event) =>
                        decisionTools.onRiskProfileChange(
                          event.target.value as RiskProfile,
                        )
                      }
                    >
                      {Object.entries(SNAPSHOT_RISK_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Génération</span>
                    <select
                      value={decisionTools.generationProfile}
                      onChange={(event) =>
                        decisionTools.onGenerationProfileChange(
                          event.target.value as GenerationProfile,
                        )
                      }
                    >
                      {Object.entries(SNAPSHOT_GENERATION_LABELS).map(
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
                      <span>Objectif</span>
                      <select
                        value={decisionTools.analysisObjective}
                        onChange={(event) =>
                          decisionTools.onAnalysisObjectiveChange(
                            event.target.value as AnalysisObjective,
                          )
                        }
                      >
                        {Object.entries(SNAPSHOT_OBJECTIVE_LABELS).map(
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
                  ? "Analyse en cours…"
                  : decision.stale
                    ? "Aucune analyse active"
                    : "Comprendre le choix"}
              </span>
              <strong>Voir les détails →</strong>
            </button>
          </div>
        )}

        {tab === "live" && (
          <div className="snapshot-main-grid">
            <div className="snapshot-preview-panel">
              <div className="snapshot-section-heading">
                <div>
                  <span>Capture courante</span>
                  <strong>
                    {frame
                      ? `${frame.imageWidth}×${frame.imageHeight}`
                      : "En attente"}
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
                    Masquer maintenant
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
                    <img src={frame.dataUrl} alt="Snapshot du jeu" />
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
                  <strong>Aucun snapshot</strong>
                  <p>
                    Affiche Lessons dans le jeu puis utilise le bouton ou la
                    hotkey globale.
                  </p>
                </div>
              )}
              <div className="snapshot-read-summary">
                <span>
                  Tokens prêts <strong>{draftTokenCount}/5</strong>
                </span>
                <span>
                  Lus sans correction <strong>{tokenReadCount}/5</strong>
                </span>
                <span>
                  Offres{" "}
                  <strong>
                    {recognizedOfferCount}/
                    {resolvedPage === "songs" ? expectedSongCount : 3}
                  </strong>
                </span>
                <span>
                  Mode{" "}
                  <strong>
                    {resolvedPage === "techniques" ? "Techniques" : "Songs"}
                  </strong>
                </span>
              </div>
            </div>

            <div className="snapshot-review-panel">
              <div className="snapshot-section-heading">
                <div>
                  <span>Validation rapide</span>
                  <strong>Corrige seulement ce qui est faux</strong>
                </div>
                {snapshot && (
                  <span
                    className={`snapshot-confidence ${confidenceTone(
                      snapshot.pageConfidence,
                    )}`}
                  >
                    {confidenceLabel(snapshot.pageConfidence)}
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
                              ? "Confirmé manuellement"
                              : "Conflit 0 / 6 / 9"
                            : confidenceLabel(reading?.confidence ?? 0)}
                        </small>
                      </label>
                      {reading?.ambiguity && !ambiguityResolved && (
                        <div className="snapshot-digit-suggestions">
                          <span>Choisir</span>
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
                            OCR « {reading.raw || "—"} » · {reading.diagnostic}
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
                      <strong>Variation de stock inhabituelle</strong>
                      <span>{stockContinuityWarningText(stockContinuity)}</span>
                      <small>
                        {stockContinuity.broadStateDrift
                          ? "Plusieurs couleurs ont changé : c’est probablement normal si tu as joué plusieurs tours ou modifié la run hors OCR."
                          : stockContinuity.strongOcrSignal
                            ? "Une troncature OCR est plausible. Corrige uniquement le chiffre concerné si la variation n’est pas volontaire."
                            : "Cela peut être normal après des achats, des gains de tokens ou une saisie manuelle hors OCR."}{" "}
                        La validation reste autorisée.
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedStockContinuity(stockContinuity.fingerprint)
                      }
                    >
                      C’est volontaire
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
                            <strong>{techniqueLabel(cost)}</strong>
                            <small>
                              {plausible
                                ? "Vecteur cohérent"
                                : "Vérifie les chiffres"}
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
                                ? `Moins mauvais choix · BLOQUANT · ${diagnostic?.reason ?? "contrainte perdue"}`
                                : `Bloquant · ${diagnostic?.reason ?? "contrainte perdue"}`
                              : recommended
                                ? decision.overrideActive
                                  ? "Override · meilleur push non bloquant"
                                  : "Choix recommandé"
                                : alternative
                                  ? "Alternative sûre"
                                  : !affordable
                                    ? "Tokens insuffisants"
                                    : purchaseReady
                                      ? "Second choix"
                                      : "Applique le snapshot d’abord"}
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
                            J’ai acheté
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
                          <span>Song reconnue</span>
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
                            <option value="">À sélectionner…</option>
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
                                  : " · hors pool courante"}
                              </option>
                            ))}
                          </select>
                          <small>
                            OCR « {reading?.rawTitle || "—"} » · titre{" "}
                            {Math.round((reading?.titleScore ?? 0) * 100)}% ·
                            pochette{" "}
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
                              ? "J’ai acheté · moins mauvais choix bloquant"
                              : "J’ai acheté malgré le blocage"
                            : recommended
                              ? decision.overrideActive
                                ? "J’ai acheté · override"
                                : "J’ai acheté · recommandé"
                              : alternative
                                ? "J’ai acheté · alternative sûre"
                                : !songAffordable
                                  ? "Tokens insuffisants"
                                  : "J’ai acheté"}
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
                        ? "Au moins un coût de technique est incomplet ou impossible pour cette période."
                        : `Complète les 5 tokens et les ${requiredOfferCount} offres avant l’analyse.`
                      : decision.loading
                        ? "Analyse en cours…"
                        : decision.stale
                          ? "Recommandation en attente"
                          : decision.headline || decision.summary}
                  </strong>
                  <small>
                    {profile.automation.overlayEnabled
                      ? "Le meilleur choix sera entouré sur le jeu pendant 30 secondes."
                      : "Overlay désactivé dans les réglages."}
                  </small>
                </div>
                <div className="snapshot-apply-actions">
                  <button
                    type="button"
                    className="snapshot-secondary"
                    onClick={() => setTab("decision")}
                    disabled={decision.stale || decision.loading}
                  >
                    Voir les détails
                  </button>
                  <button
                    type="button"
                    className="snapshot-primary apply"
                    onClick={applySnapshot}
                    disabled={!snapshot || !resultReady || busy}
                  >
                    Valider et analyser
                    <small>Met à jour la décision sans fermer</small>
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
                    ? "Solveur en cours"
                    : decision.stale
                      ? "Analyse en attente"
                      : decision.overrideActive
                        ? "Override actif"
                        : decision.warning
                          ? "Décision sous contrainte"
                          : "Décision recommandée"}
                </span>
                <h3>{decision.headline}</h3>
                <p>{decision.summary}</p>
                {decision.warning && <em>{decision.warning}</em>}
              </div>
              <button type="button" onClick={() => setTab("live")}>
                {decision.stale ? "Prendre un snapshot" : "Retour au live"}
                <small>Capture et confirmation des achats</small>
              </button>
            </section>

            {!decision.stale && !decision.loading && (
              <>
                <div className="snapshot-decision-summary-grid">
                  <section className="snapshot-decision-plan">
                    <span>Plan actif</span>
                    <strong>
                      {decision.plan?.label ?? "Plan déterministe"}
                    </strong>
                    <p>{decision.plan?.detail ?? decision.summary}</p>
                    {decision.plan?.fallback && (
                      <small>Repli · {decision.plan.fallback}</small>
                    )}
                  </section>

                  <section className="snapshot-decision-metrics">
                    <span>Indicateurs décisifs</span>
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
                    <span>Pourquoi</span>
                    <ul>
                      {decision.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="snapshot-decision-path">
                    <span>Chemin retenu</span>
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
                      <span>Comparaison complète</span>
                      <strong>Choix visibles et option de conservation</strong>
                    </div>
                    <small>
                      {decision.candidates.length} politique(s) comparée(s)
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
                              ? "Recommandée"
                              : candidate.safety === "safe-alternative"
                                ? "Alternative sûre"
                                : candidate.safety === "hard-blocking"
                                  ? "Bloquante"
                                  : "Secondaire"}
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
                <span>Pipeline du dernier snapshot</span>
                {decisionTools.pipelineTimings ? (
                  <div>
                    <small>
                      Capture{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.captureMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      OCR principal{" "}
                      <strong>
                        {Math.round(
                          decisionTools.pipelineTimings.ocrPrimaryMs ?? 0,
                        )}{" "}
                        ms
                      </strong>
                    </small>
                    <small>
                      Consensus chiffres{" "}
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
                    Les durées apparaîtront après le prochain snapshot.
                  </small>
                )}
              </div>
              <p>
                Les détails restent disponibles ici après l’analyse ; il n’est
                plus nécessaire de fermer l’interface OCR pour consulter le
                plan, les probabilités ou les alternatives.
              </p>
            </section>
          </div>
        )}

        {tab === "calibration" && (
          <div className="snapshot-calibration">
            <aside>
              <div className="snapshot-section-heading">
                <div>
                  <span>Toutes les zones OCR</span>
                  <strong>Tokens, textes, coûts et songs</strong>
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
                        {target.label}
                      </button>
                    ))}
                </div>
              ))}
            </aside>

            <div className="snapshot-calibration-workspace">
              <div className="snapshot-calibration-toolbar">
                <span>
                  <strong>{activeCalibrationTarget.label}</strong>
                  <small>
                    Trace un rectangle directement sur le screenshot.
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
                  aria-label="Zoom de calibration"
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
                  Ajuster
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
                      alt="Calibration OCR"
                      ref={calibrationImageRef}
                      draggable={false}
                    />
                    <span
                      className="snapshot-calibration-selection"
                      style={rectToCss(activeCalibrationRect)}
                    >
                      {activeCalibrationTarget.label}
                    </span>
                  </div>
                ) : (
                  <div className="snapshot-empty-preview">
                    <span>⌗</span>
                    <strong>Capture requise</strong>
                    <p>
                      Prends d’abord un snapshot Techniques ou Songs. La même
                      image servira à placer toutes les zones.
                    </p>
                  </div>
                )}
              </div>

              {activeCalibrationIsNumeric && (
                <div className="snapshot-calibration-learning">
                  <div>
                    <span>Calibrage assisté</span>
                    <strong>Indique la valeur réellement affichée</strong>
                    <p>
                      La couleur sert à relocaliser les glyphes dans la zone
                      logique à chaque capture. La confirmation ajoute des
                      modèles de chiffres sans déplacer la zone ni remplacer les
                      exemples précédents.
                    </p>
                  </div>
                  <label>
                    <span>Valeur réelle</span>
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
                    {calibrationLearning ? "Analyse…" : "Ajouter cet exemple"}
                  </button>
                  {activeCalibrationTuning?.ink && (
                    <div className="snapshot-calibration-learned">
                      <small>
                        Apprentissage actif ·{" "}
                        {activeCalibrationTuning.verifiedSamples}{" "}
                        confirmation(s) · dernière valeur{" "}
                        {activeCalibrationTuning.lastExpected} ·{" "}
                        {
                          Object.keys(activeCalibrationTuning.templates ?? {})
                            .length
                        }
                        /10 chiffres couverts.
                      </small>
                      <button type="button" onClick={forgetNumericCalibration}>
                        Oublier cet apprentissage
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
                <span>Ce qui est attendu</span>
                <strong>{help.title}</strong>
                <p>{help.body}</p>
                <small>
                  Les coordonnées sont normalisées : elles restent valides
                  lorsque la fenêtre change de taille sans changer de ratio
                  interne.
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
                  <span>Utilisation</span>
                  <strong>Snapshot manuel</strong>
                </div>
              </div>
              <label>
                <span>Hotkey globale</span>
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
                  Format Tauri, par exemple CommandOrControl+Shift+Space.
                </small>
              </label>
              <label>
                <span>Fenêtre recherchée</span>
                <input
                  type="text"
                  value={profile.windowTitlePattern}
                  onChange={(event) =>
                    updateProfile((draft) => {
                      draft.windowTitlePattern = event.target.value;
                    })
                  }
                />
                <small>Expression régulière insensible à la casse.</small>
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
                  <strong>Overlay de recommandation</strong>
                  <small>
                    Fenêtre transparente, always-on-top et traversable par les
                    clics.
                  </small>
                </span>
              </label>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>OCR ciblé</span>
                  <strong>Qualité / coût</strong>
                </div>
              </div>
              <label>
                <span>Échelle OCR · {profile.ocr.scale.toFixed(1)}×</span>
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
                  2,4× convient généralement à une fenêtre 2048×1152.
                </small>
              </label>
              <label>
                <span>
                  Seuil tokens ·{" "}
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
                  Seuil songs ·{" "}
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
                  <strong>Consensus numérique renforcé</strong>
                  <small>
                    Lecture mot entier Otsu + brut, passes caractère pour les
                    valeurs courtes et contrôle de la position du trou. Un
                    conflit reste volontairement à confirmer.
                  </small>
                </div>
              </div>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>Diagnostic</span>
                  <strong>Journal des décisions</strong>
                </div>
              </div>
              <p className="snapshot-log-path">
                {decisionTools.decisionLogStatus
                  ? `Fichier actif (${decisionTools.decisionLogStatus.storage === "portable" ? "près de l’exécutable" : "AppData"}) : ${decisionTools.decisionLogStatus.path}`
                  : "Mode navigateur : journal local exportable en NDJSON."}
              </p>
              {decisionTools.decisionLogStatus && (
                <small>
                  {decisionTools.decisionLogStatus.sizeBytes.toLocaleString(
                    "fr-FR",
                  )}{" "}
                  octets · fichier créé dès le démarrage
                </small>
              )}
              {decisionTools.decisionLogError && (
                <p className="snapshot-warning">
                  Écriture du journal en échec :{" "}
                  {decisionTools.decisionLogError}
                </p>
              )}
              <small>
                Chaque analyse écrit l’état, son hash stable, les candidats, les
                raisons, la recommandation normale, l’override, les timings
                détaillés et le choix confirmé dans une ligne liée.
              </small>
              <div className="snapshot-profile-actions">
                <button
                  type="button"
                  onClick={decisionTools.onOpenDecisionLogDirectory}
                >
                  Ouvrir le dossier
                </button>
                <button
                  type="button"
                  onClick={decisionTools.onExportDecisionLog}
                >
                  Exporter le log
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={decisionTools.onClearDecisionLog}
                >
                  Vider le log
                </button>
              </div>
            </section>

            <section>
              <div className="snapshot-section-heading">
                <div>
                  <span>Alignement overlay</span>
                  <strong>Correction en pixels</strong>
                </div>
              </div>
              <div className="snapshot-geometry-grid">
                {(
                  [
                    ["offsetX", "Décalage X"],
                    ["offsetY", "Décalage Y"],
                    ["widthDelta", "Largeur ±"],
                    ["heightDelta", "Hauteur ±"],
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
                  Exporter le profil
                </button>
                <label>
                  Importer un profil
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
                    setMessage("Profil OCR réinitialisé.");
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
