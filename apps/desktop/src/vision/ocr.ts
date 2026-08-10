import type { Worker } from "tesseract.js";
import type { OcrProgress, VisionProfile } from "./types.ts";
import type { AtlasPlacement, OcrAtlas } from "./image.ts";
import {
  segmentationIntentForAtlas,
  type AtlasRecognitionMode,
} from "./ocr-mode.ts";

export type { AtlasRecognitionMode } from "./ocr-mode.ts";

export type AtlasReading = {
  id: string;
  text: string;
  confidence: number;
};

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

const progressListeners = new Set<(value: OcrProgress) => void>();
let workerPromise: Promise<Worker> | null = null;
let tesseractPromise: Promise<typeof import("tesseract.js")> | null = null;

/** Keep the OCR runtime out of the initial desktop bundle until Live OCR opens. */
const getTesseract = () => {
  if (!tesseractPromise) {
    tesseractPromise = import("tesseract.js").catch((error) => {
      tesseractPromise = null;
      throw error;
    });
  }
  return tesseractPromise;
};

const notify = (value: OcrProgress) => {
  for (const listener of progressListeners) listener(value);
};

const getWorker = (): Promise<Worker> => {
  if (!workerPromise) {
    const initialization = getTesseract().then(
      async ({ createWorker, OEM, PSM }) => {
        const worker = await createWorker("eng", OEM.LSTM_ONLY, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          workerBlobURL: false,
          gzip: true,
          logger: (message) =>
            notify({
              status: message.status,
              progress: message.progress,
            }),
          errorHandler: (error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            notify({ status: `OCR error: ${message}`, progress: 0 });
          },
        });
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
          user_defined_dpi: "180",
        });
        return worker;
      },
    );
    const recoverableInitialization = initialization.catch((error) => {
      // A rejected cached promise would make every subsequent snapshot fail
      // until reload. Drop it so the next attempt can recreate the worker.
      workerPromise = null;
      throw error;
    });
    workerPromise = recoverableInitialization;
    return recoverableInitialization;
  }
  return workerPromise;
};

export const warmupOcr = async (): Promise<void> => {
  await getWorker();
};

const flattenBlockWords = (
  blocks: Awaited<ReturnType<Worker["recognize"]>>["data"]["blocks"],
): OcrWord[] =>
  (blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) =>
        line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        })),
      ),
    ),
  );

const parseTsvWords = (tsv: string | null): OcrWord[] => {
  if (!tsv) return [];
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 12 && columns[0] === "5")
    .map((columns) => {
      const left = Number.parseInt(columns[6] || "0", 10);
      const top = Number.parseInt(columns[7] || "0", 10);
      const width = Number.parseInt(columns[8] || "0", 10);
      const height = Number.parseInt(columns[9] || "0", 10);
      return {
        text: columns.slice(11).join("\t").trim(),
        confidence: Number.parseFloat(columns[10] || "0"),
        bbox: {
          x0: left,
          y0: top,
          x1: left + width,
          y1: top + height,
        },
      };
    })
    .filter((word) => word.text.length > 0);
};

const containsCentre = (placement: AtlasPlacement, word: OcrWord): boolean => {
  const x = (word.bbox.x0 + word.bbox.x1) / 2;
  const y = (word.bbox.y0 + word.bbox.y1) / 2;
  return (
    x >= placement.x &&
    x <= placement.x + placement.width &&
    y >= placement.y &&
    y <= placement.y + placement.height
  );
};

const readingForPlacement = (
  placement: AtlasPlacement,
  words: OcrWord[],
  minimumConfidence: number,
): AtlasReading => {
  const selected = words
    .filter(
      (word) =>
        word.confidence >= minimumConfidence && containsCentre(placement, word),
    )
    .sort((left, right) => {
      const leftY = (left.bbox.y0 + left.bbox.y1) / 2;
      const rightY = (right.bbox.y0 + right.bbox.y1) / 2;
      const lineThreshold =
        Math.max(left.bbox.y1 - left.bbox.y0, right.bbox.y1 - right.bbox.y0) *
        0.55;
      return Math.abs(leftY - rightY) <= lineThreshold
        ? left.bbox.x0 - right.bbox.x0
        : leftY - rightY;
    });
  const characterCount = selected.reduce(
    (sum, word) => sum + Math.max(1, word.text.length),
    0,
  );
  const confidence =
    characterCount === 0
      ? 0
      : selected.reduce(
          (sum, word) => sum + word.confidence * Math.max(1, word.text.length),
          0,
        ) /
        characterCount /
        100;
  return {
    id: placement.id,
    text: selected
      .map((word) => word.text)
      .join(" ")
      .trim(),
    confidence,
  };
};

export type AtlasWordRecognizer = (input: {
  atlas: OcrAtlas;
  segmentation: ReturnType<typeof segmentationIntentForAtlas>;
  numericMode: boolean;
}) => Promise<OcrWord[]>;

const recognizeWordsWithTesseract: AtlasWordRecognizer = async ({
  atlas,
  segmentation,
  numericMode,
}) => {
  const [worker, { PSM }] = await Promise.all([getWorker(), getTesseract()]);
  await worker.setParameters({
    tessedit_pageseg_mode:
      segmentation === "single-block"
        ? PSM.SINGLE_BLOCK
        : segmentation === "single-word"
          ? PSM.SINGLE_WORD
          : segmentation === "single-char"
            ? PSM.SINGLE_CHAR
            : PSM.SPARSE_TEXT,
    tessedit_char_whitelist: numericMode ? "0123456789" : "",
  });
  const result = await worker.recognize(
    atlas.canvas,
    {},
    { text: true, blocks: true, tsv: true },
  );
  const fromBlocks = flattenBlockWords(result.data.blocks);
  return fromBlocks.length > 0 ? fromBlocks : parseTsvWords(result.data.tsv);
};

export const recognizeAtlas = async (
  atlas: OcrAtlas,
  profile: VisionProfile,
  onProgress?: (value: OcrProgress) => void,
  mode: AtlasRecognitionMode = "mixed",
  wordRecognizer: AtlasWordRecognizer = recognizeWordsWithTesseract,
): Promise<Map<string, AtlasReading>> => {
  if (onProgress) progressListeners.add(onProgress);
  try {
    const numericMode = mode !== "mixed";
    const segmentation = segmentationIntentForAtlas(
      mode,
      atlas.placements.length,
    );
    const words = await wordRecognizer({ atlas, segmentation, numericMode });
    return new Map(
      atlas.placements.map((placement) => {
        const reading = readingForPlacement(
          placement,
          words,
          mode === "single-number"
            ? Math.min(profile.ocr.minWordConfidence, 5)
            : mode === "number-line"
              ? Math.min(profile.ocr.minWordConfidence, 5)
              : mode === "technique-costs"
                ? Math.min(profile.ocr.minWordConfidence, 18)
                : profile.ocr.minWordConfidence,
        );
        return [placement.id, reading];
      }),
    );
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
};

export const terminateOcr = async (): Promise<void> => {
  const pendingWorker = workerPromise;
  workerPromise = null;
  if (!pendingWorker) return;
  try {
    const worker = await pendingWorker;
    await worker.terminate();
  } catch {
    // A failed initialization is already recoverable; teardown must never
    // create an unhandled rejection while the panel is unmounting.
  }
};
