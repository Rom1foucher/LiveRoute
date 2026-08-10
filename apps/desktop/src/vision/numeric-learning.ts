import { cropCanvas } from "./image.ts";
import type { NormalizedRect, NumericFieldTuning } from "./types.ts";
import {
  componentTemplate,
  expandedPixelRect,
  learnNumericSegmentation,
  matchComponentsWithTemplates,
  mergeDigitTemplate,
  segmentWithLearnedInk,
  type Digit,
  type PixelBuffer,
  type PixelRect,
} from "./numeric-learning-model.ts";

const canvasPixels = (canvas: HTMLCanvasElement): PixelBuffer => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Canvas 2D indisponible pour l’apprentissage numérique.");
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
};

const normalizedSourceRect = (
  logicalRect: NormalizedRect,
  localRect: PixelRect,
  localWidth: number,
  localHeight: number,
): NormalizedRect => ({
  x:
    logicalRect.x + logicalRect.width * (localRect.x / Math.max(1, localWidth)),
  y:
    logicalRect.y +
    logicalRect.height * (localRect.y / Math.max(1, localHeight)),
  width: logicalRect.width * (localRect.width / Math.max(1, localWidth)),
  height: logicalRect.height * (localRect.height / Math.max(1, localHeight)),
});

export type LearnedNumericSample = {
  tuning: NumericFieldTuning;
  tightRect: NormalizedRect;
  confidence: number;
  componentCount: number;
};

export const learnNumericField = (
  source: HTMLImageElement,
  rect: NormalizedRect,
  expected: number,
  previous?: NumericFieldTuning,
): LearnedNumericSample | null => {
  const expectedText = String(expected);
  const canvas = cropCanvas(source, rect);
  const pixels = canvasPixels(canvas);
  const previousSegmentation = previous?.ink
    ? segmentWithLearnedInk(pixels, previous.ink, expectedText.length)
    : null;
  const discoveredSegmentation = learnNumericSegmentation(pixels, expectedText);
  const segmentation =
    [previousSegmentation, discoveredSegmentation]
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null &&
          candidate.components.length === expectedText.length,
      )
      .sort((left, right) => right.score - left.score)[0] ?? null;
  if (!segmentation || segmentation.components.length !== expectedText.length) {
    return null;
  }

  let templates = previous?.templates ?? {};
  for (let index = 0; index < expectedText.length; index += 1) {
    const digit = expectedText[index] as Digit;
    const encoded = componentTemplate(
      segmentation.components[index],
      pixels.width,
    );
    templates = mergeDigitTemplate(templates, digit, encoded);
  }

  const tightLocal = expandedPixelRect(segmentation.union, pixels, 0.5);
  const confidence = Math.max(0, Math.min(1, 0.58 + segmentation.score * 0.08));
  const previousWeight = Math.max(0, previous?.verifiedSamples ?? 0);
  const mergedInk = previous?.ink
    ? {
        rgb: previous.ink.rgb.map((channel, index) =>
          Math.round(
            (channel * previousWeight + segmentation.ink.rgb[index]) /
              Math.max(1, previousWeight + 1),
          ),
        ) as [number, number, number],
        tolerance: Math.round(
          (previous.ink.tolerance * previousWeight +
            segmentation.ink.tolerance) /
            Math.max(1, previousWeight + 1),
        ),
      }
    : segmentation.ink;
  return {
    tuning: {
      // Retained for backwards-compatible exports only. The live recognizer no
      // longer uses a one-sample threshold/scale choice.
      threshold: "none",
      scale: 1,
      mode: expectedText.length === 1 ? "single-number" : "number-line",
      verifiedSamples: previousWeight + 1,
      lastExpected: expected,
      lastConfidence: confidence,
      ink: mergedInk,
      templates,
    },
    tightRect: normalizedSourceRect(
      rect,
      tightLocal,
      pixels.width,
      pixels.height,
    ),
    confidence,
    componentCount: segmentation.components.length,
  };
};

export type LearnedNumericRecognition = {
  text: string | null;
  confidence: number;
  tightRect: NormalizedRect | null;
  componentCount: number;
  source: "template" | "segmentation" | "none";
};

export const locateLearnedNumericField = (
  source: HTMLImageElement,
  rect: NormalizedRect,
  tuning: NumericFieldTuning,
  maximumDigits = 3,
): LearnedNumericRecognition => {
  if (!tuning.ink) {
    return {
      text: null,
      confidence: 0,
      tightRect: null,
      componentCount: 0,
      source: "none",
    };
  }
  const canvas = cropCanvas(source, rect);
  const pixels = canvasPixels(canvas);
  const segmentation = segmentWithLearnedInk(pixels, tuning.ink, maximumDigits);
  if (!segmentation) {
    return {
      text: null,
      confidence: 0,
      tightRect: null,
      componentCount: 0,
      source: "none",
    };
  }
  const tightLocal = expandedPixelRect(segmentation.union, pixels, 0.5);
  const tightRect = normalizedSourceRect(
    rect,
    tightLocal,
    pixels.width,
    pixels.height,
  );
  const template = matchComponentsWithTemplates(
    segmentation.components,
    pixels.width,
    tuning.templates ?? {},
  );
  if (template.text !== null) {
    return {
      text: template.text,
      confidence: Math.min(0.99, 0.76 + template.confidence * 0.22),
      tightRect,
      componentCount: segmentation.components.length,
      source: "template",
    };
  }
  return {
    text: null,
    confidence: Math.max(
      0.35,
      Math.min(0.72, 0.45 + segmentation.score * 0.05),
    ),
    tightRect,
    componentCount: segmentation.components.length,
    source: "segmentation",
  };
};
