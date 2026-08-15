import type { Balance, Period, TokenKey } from "@glcp/core";
import type { Language } from "@glcp/core/i18n";

export type SnapshotPage = "techniques" | "songs";
export type DetectedPage = SnapshotPage | "unknown";
export type TechniqueKind =
  "mono" | "duo-balanced" | "duo-split" | "hint" | "energy" | "unknown";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CostSlotProfile = {
  rect: NormalizedRect;
  /**
   * Optional escape hatch for a crop that only contains a number. When null,
   * the token is inferred from the configured colour palette.
   */
  fixedToken: TokenKey | null;
};

export type TechniqueCardProfile = {
  card: NormalizedRect;
  text: NormalizedRect;
  /**
   * The game always renders Da/Pa/Vo/Vi/Me in fixed columns, including zeroes.
   * Five fixed slots are more reliable than trying to infer a colour from one
   * large crop.
   */
  costSlots: [
    CostSlotProfile,
    CostSlotProfile,
    CostSlotProfile,
    CostSlotProfile,
    CostSlotProfile,
  ];
};

export type SongCardProfile = {
  card: NormalizedRect;
  cover: NormalizedRect;
  title: NormalizedRect;
};

export type TokenPalette = Record<TokenKey, string[]>;

export type NumericFieldTuning = {
  /** Legacy v0.21 settings, kept only for profile migration. */
  threshold: "auto" | "none";
  scale: number;
  mode: "number-line" | "single-number";
  verifiedSamples: number;
  lastExpected: number;
  lastConfidence: number;
  /** Colour model used only to locate the glyphs in the logical field. */
  ink: {
    rgb: [number, number, number];
    tolerance: number;
  } | null;
  /** Supervised, per-digit examples. A confirmation adds samples; it never replaces earlier digits. */
  templates: Partial<
    Record<
      "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9",
      Array<{ bits: string; samples: number }>
    >
  >;
};

export type VisionProfile = {
  schemaVersion: 6;
  id: string;
  name: string;
  windowTitlePattern: string;
  capture: {
    hotkey: string;
  };
  ocr: {
    scale: number;
    minWordConfidence: number;
    minTokenConfidence: number;
    minTechniqueConfidence: number;
    minSongConfidence: number;
    maxTokenValue: number;
    threshold: "auto" | "none";
    invert: "auto" | "never" | "always";
  };
  automation: {
    overlayEnabled: boolean;
  };
  overlayGeometry: {
    offsetX: number;
    offsetY: number;
    widthDelta: number;
    heightDelta: number;
  };
  palette: TokenPalette;
  regions: {
    tokens: Record<TokenKey, NormalizedRect>;
    techniques: [
      TechniqueCardProfile,
      TechniqueCardProfile,
      TechniqueCardProfile,
    ];
    songs: [SongCardProfile, SongCardProfile, SongCardProfile];
  };
  techniqueAliases: Record<"mono" | "hint" | "energy", string[]>;
  songAliases: Record<string, string[]>;
  learnedSongHashes: Record<string, string[]>;
  /** Per-field OCR settings learned from user-confirmed numeric values. */
  numericFieldTuning: Record<string, NumericFieldTuning>;
};

export type CaptureWindow = {
  key: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
};

export type CaptureFrame = {
  window: CaptureWindow;
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
  capturedAt: number;
  timings?: {
    decodeMs: number;
    ocrPrimaryMs: number;
    ocrRetryMs: number;
    ocrTotalMs: number;
  };
};

export type FieldReading<T> = {
  value: T | null;
  confidence: number;
  raw: string;
  /** Ranked numeric alternatives kept for fast manual correction. */
  alternatives?: number[];
  /** Explicitly marks the glyph family that Tesseract commonly confuses. */
  ambiguity?: "0/6/9" | "truncated";
  diagnostic?: string;
};

export type TechniqueReading = {
  slot: number;
  kind: TechniqueKind;
  cost: Balance;
  confidence: number;
  rawText: string;
  warnings: string[];
};

export type SongReading = {
  slot: number;
  songId: string | null;
  songName: string;
  confidence: number;
  titleScore: number;
  coverScore: number;
  rawTitle: string;
};

export type VisionSnapshot = {
  page: DetectedPage;
  pageConfidence: number;
  tokens: Record<TokenKey, FieldReading<number>>;
  techniques: TechniqueReading[];
  songs: SongReading[];
  signature: string;
  warnings: string[];
  capturedAt: number;
  timings?: {
    decodeMs: number;
    ocrPrimaryMs: number;
    ocrRetryMs: number;
    ocrTotalMs: number;
  };
};

export type VisionSongReference = {
  id: string;
  name: string;
  image: string;
  cost?: Balance;
  aliases?: string[];
};

export type RecognitionContext = {
  period: Period;
  songs: VisionSongReference[];
  /** Number of actual song cards on a mixed 3-slot lesson offer. */
  expectedSongCount?: number;
};

export type OcrProgress = {
  status: string;
  progress: number;
};

export type OverlayBox = {
  rect: NormalizedRect;
  tone: "primary" | "alternative" | "secondary" | "blocking" | "uncertain";
  label: string;
  detail?: string;
};

export type OverlayTokenValue = {
  token: TokenKey;
  rect: NormalizedRect;
  value: string;
  confidence: number;
};

export type OverlayPayload = {
  language: Language;
  visible: boolean;
  loading: boolean;
  page: DetectedPage;
  headline: string;
  summary: string;
  path: string[];
  warning?: string;
  overrideActive: boolean;
  confidence: number;
  boxes: OverlayBox[];
  tokenValues: OverlayTokenValue[];
};

export type VisionChoiceDiagnostic = {
  id: string;
  safety: "recommended" | "safe-alternative" | "secondary" | "hard-blocking";
  reason?: string;
};

export type VisionDecisionMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "neutral" | "warning" | "danger";
};

export type VisionDecisionCandidate = {
  id: string;
  label: string;
  safety: VisionChoiceDiagnostic["safety"];
  recommended: boolean;
  action: string;
  summary?: string;
  cost?: Balance;
  metrics: VisionDecisionMetric[];
};

export type VisionDecisionPlan = {
  label: string;
  detail: string;
  fallback?: string;
};

export type VisionDecision = {
  bestTechniqueIndex: number | null;
  alternativeTechniqueIndex: number | null;
  recommendedSongId: string | null;
  alternativeSongId: string | null;
  techniqueDiagnostics: VisionChoiceDiagnostic[];
  songDiagnostics: VisionChoiceDiagnostic[];
  headline: string;
  summary: string;
  path: string[];
  plan: VisionDecisionPlan | null;
  reasons: string[];
  metrics: VisionDecisionMetric[];
  candidates: VisionDecisionCandidate[];
  warning?: string;
  overrideActive: boolean;
  stale: boolean;
  loading: boolean;
};

export const EMPTY_BALANCE: Balance = {
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
};
