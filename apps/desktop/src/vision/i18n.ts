import type { Language } from "@glcp/core/i18n";

/** Small desktop-only catalogue helper. OCR copy does not belong to the shared web UI. */
export const ocrText = (
  language: Language,
  french: string,
  english: string,
): string => (language === "fr" ? french : english);

const ENGLISH_RUNTIME_COPY = new Map<string, string>([
  ["Préparation OCR", "Preparing OCR"],
  ["Localisation des glyphes numériques", "Locating numeric glyphs"],
  ["Lecture numérique apprise terminée", "Learned numeric reading complete"],
  [
    "lecture sous le seuil de confiance",
    "reading below the confidence threshold",
  ],
  [
    "type ambigu, vecteur de coût exploitable",
    "ambiguous type, usable cost vector",
  ],
  ["vecteur à vérifier", "cost vector requires review"],
  [
    "Modèle appris confirmé sur les glyphes segmentés",
    "Learned model confirmed on segmented glyphs",
  ],
  ["Aucune passe numérique exploitable", "No usable numeric OCR pass"],
  [
    "La capture de fenêtre est disponible dans l’application desktop.",
    "Window capture is available in the desktop application.",
  ],
  [
    "La capture de fenêtre Live OCR est disponible sous Windows.",
    "Live OCR window capture is available on Windows.",
  ],
  [
    "Impossible de décoder l’image capturée.",
    "Could not decode the captured image.",
  ],
  [
    "Canvas 2D indisponible pour l’apprentissage numérique.",
    "2D canvas is unavailable for numeric learning.",
  ],
  ["Canvas 2D indisponible.", "2D canvas is unavailable."],
  ["Canvas OCR indisponible.", "OCR canvas is unavailable."],
  [
    "Initialisation OCR expirée. Les ressources Tesseract locales sont peut-être absentes ou bloquées.",
    "OCR initialization timed out. The local Tesseract assets may be missing or blocked.",
  ],
  [
    "Reconnaissance OCR expirée. Le worker Tesseract sera recréé à la prochaine capture.",
    "OCR recognition timed out. The Tesseract worker will be restarted on the next capture.",
  ],
]);

/**
 * Recognition diagnostics are produced below React and are intentionally terse.
 * Localise them at the UI boundary so changing the display language also covers
 * progress, warnings and per-field diagnostics without coupling OCR algorithms
 * to the application language provider.
 */
export const localizeOcrRuntimeText = (
  language: Language,
  value: string,
): string => {
  if (language === "fr" || !value) return value;
  const exact = ENGLISH_RUNTIME_COPY.get(value);
  if (exact) return exact;

  const replacements: Array<[RegExp, string]> = [
    [/^Lecture numérique apprise (\d+\/\d+)$/, "Learned numeric reading $1"],
    [/^colonne (\d+) sans token fiable$/, "column $1 has no reliable token"],
    [
      /^(\d+) solde\(s\) de tokens incertain\(s\)$/,
      "$1 uncertain token balance(s)",
    ],
    [/^(\d+) technique\(s\) à confirmer$/, "$1 technique(s) to confirm"],
    [/^(\d+) song\(s\) à confirmer$/, "$1 song(s) to confirm"],
    [
      /^Consensus (\d+) prétraitements · (\d+) passes$/,
      "Consensus across $1 preprocessings · $2 passes",
    ],
    [/^Conflit de longueur : (.+)$/, "Length conflict: $1"],
    [/^Passes OCR en désaccord : (.+)$/, "OCR passes disagree: $1"],
    [
      /^Nombre entier confirmé sur crops large et serré · lecture courte (.+)$/,
      "Whole number confirmed on wide and tight crops · shorter reading $1",
    ],
    [
      /^Capture refusée par Windows ou le client graphique : (.+)$/,
      "Capture rejected by Windows or the graphics client: $1",
    ],
    [/^Erreur OCR : (.+)$/, "OCR error: $1"],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
};

export const calibrationTargetLabel = (
  language: Language,
  id: string,
  fallback: string,
): string => {
  if (language === "fr") return fallback;
  const token = /^token\.(.+)$/.exec(id);
  if (token) return `Lessons · ${token[1]}`;
  const technique = /^technique\.(\d+)\.(card|text)$/.exec(id);
  if (technique) {
    return `Technique ${Number(technique[1]) + 1} · ${technique[2] === "card" ? "card" : "effects"}`;
  }
  const cost = /^technique\.(\d+)\.cost\.(\d+)$/.exec(id);
  if (cost) {
    const tokenNames = ["dance", "passion", "vocal", "visual", "mental"];
    return `Technique ${Number(cost[1]) + 1} · ${tokenNames[Number(cost[2])] ?? "cost"} cost`;
  }
  const song = /^song\.(\d+)\.(card|cover|title)$/.exec(id);
  if (song) {
    return `Song ${Number(song[1]) + 1} · ${song[2]}`;
  }
  return fallback;
};
