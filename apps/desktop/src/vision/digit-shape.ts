import { cropCanvas } from "./image.ts";
import type { NormalizedRect, VisionProfile } from "./types.ts";

export type BinaryGlyphMask = {
  width: number;
  height: number;
  /** 1 = glyph ink, 0 = background. */
  data: Uint8Array;
};

export type AmbiguousDigitShape = {
  digit: 0 | 6 | 9;
  confidence: number;
  holeCenterY: number;
};

type Component = {
  indices: number[];
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBoundary: boolean;
};

const neighbours = (index: number, width: number, height: number): number[] => {
  const x = index % width;
  const y = Math.floor(index / width);
  const result: number[] = [];
  if (x > 0) result.push(index - 1);
  if (x + 1 < width) result.push(index + 1);
  if (y > 0) result.push(index - width);
  if (y + 1 < height) result.push(index + width);
  return result;
};

const componentsFor = (
  mask: BinaryGlyphMask,
  foreground: 0 | 1,
): Component[] => {
  const visited = new Uint8Array(mask.data.length);
  const components: Component[] = [];
  for (let start = 0; start < mask.data.length; start += 1) {
    if (visited[start] || mask.data[start] !== foreground) continue;
    const queue = [start];
    visited[start] = 1;
    const indices: number[] = [];
    let minX = mask.width;
    let minY = mask.height;
    let maxX = 0;
    let maxY = 0;
    let touchesBoundary = false;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      indices.push(index);
      const x = index % mask.width;
      const y = Math.floor(index / mask.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1) {
        touchesBoundary = true;
      }
      for (const next of neighbours(index, mask.width, mask.height)) {
        if (visited[next] || mask.data[next] !== foreground) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    components.push({
      indices,
      area: indices.length,
      minX,
      minY,
      maxX,
      maxY,
      touchesBoundary,
    });
  }
  return components;
};

const dominantGlyph = (mask: BinaryGlyphMask): BinaryGlyphMask | null => {
  const canvasArea = mask.width * mask.height;
  const candidates = componentsFor(mask, 1)
    .filter((component) => {
      const width = component.maxX - component.minX + 1;
      const height = component.maxY - component.minY + 1;
      return (
        component.area >= canvasArea * 0.008 &&
        component.area <= canvasArea * 0.62 &&
        width >= mask.width * 0.08 &&
        height >= mask.height * 0.36
      );
    })
    .sort((left, right) => {
      const leftHeight = left.maxY - left.minY + 1;
      const rightHeight = right.maxY - right.minY + 1;
      return right.area * rightHeight - left.area * leftHeight;
    });
  const best = candidates[0];
  if (!best) return null;
  const padding = 1;
  const minX = Math.max(0, best.minX - padding);
  const minY = Math.max(0, best.minY - padding);
  const maxX = Math.min(mask.width - 1, best.maxX + padding);
  const maxY = Math.min(mask.height - 1, best.maxY + padding);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8Array(width * height);
  for (const sourceIndex of best.indices) {
    const sourceX = sourceIndex % mask.width;
    const sourceY = Math.floor(sourceIndex / mask.width);
    data[(sourceY - minY) * width + sourceX - minX] = 1;
  }
  return { width, height, data };
};

export const classify069Mask = (
  input: BinaryGlyphMask,
): AmbiguousDigitShape | null => {
  const glyph = dominantGlyph(input);
  if (!glyph || glyph.width < 3 || glyph.height < 5) return null;
  const minimumHoleArea = Math.max(2, glyph.width * glyph.height * 0.012);
  const holes = componentsFor(glyph, 0)
    .filter(
      (component) =>
        !component.touchesBoundary && component.area >= minimumHoleArea,
    )
    .sort((left, right) => right.area - left.area);
  if (holes.length !== 1) return null;
  const hole = holes[0];
  const centroidY =
    hole.indices.reduce(
      (sum, index) => sum + Math.floor(index / glyph.width),
      0,
    ) / hole.area;
  const holeCenterY = centroidY / Math.max(1, glyph.height - 1);
  const digit: 0 | 6 | 9 = holeCenterY < 0.44 ? 9 : holeCenterY > 0.56 ? 6 : 0;
  const boundaryDistance =
    digit === 9
      ? 0.44 - holeCenterY
      : digit === 6
        ? holeCenterY - 0.56
        : Math.min(holeCenterY - 0.44, 0.56 - holeCenterY);
  const holeShare = hole.area / Math.max(1, glyph.width * glyph.height);
  const confidence = Math.min(
    0.88,
    0.62 + Math.max(0, boundaryDistance) * 0.85 + Math.min(0.08, holeShare),
  );
  return { digit, confidence, holeCenterY };
};

const otsuThreshold = (luminances: Uint8Array): number => {
  const histogram = new Uint32Array(256);
  let total = 0;
  let weightedTotal = 0;
  for (const luminance of luminances) {
    histogram[luminance] += 1;
    total += 1;
    weightedTotal += luminance;
  }
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let best = 128;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += threshold * histogram[threshold];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = threshold;
    }
  }
  return best;
};

export const classify069Crop = (
  source: HTMLImageElement,
  rect: NormalizedRect,
  profile: VisionProfile,
): AmbiguousDigitShape | null => {
  const canvas = cropCanvas(
    source,
    rect,
    Math.max(144, Math.round(46 * Math.max(3.2, profile.ocr.scale))),
  );
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luminances = new Uint8Array(canvas.width * canvas.height);
  for (let pixel = 0; pixel < luminances.length; pixel += 1) {
    const offset = pixel * 4;
    luminances[pixel] = Math.round(
      rgba[offset] * 0.2126 +
        rgba[offset + 1] * 0.7152 +
        rgba[offset + 2] * 0.0722,
    );
  }
  const threshold = otsuThreshold(luminances);
  const variants = (["light", "dark"] as const).flatMap((variant) => {
    const data = new Uint8Array(luminances.length);
    for (let index = 0; index < luminances.length; index += 1) {
      data[index] =
        variant === "light"
          ? luminances[index] >= threshold
            ? 1
            : 0
          : luminances[index] <= threshold
            ? 1
            : 0;
    }
    const result = classify069Mask({
      width: canvas.width,
      height: canvas.height,
      data,
    });
    return result ? [result] : [];
  });
  variants.sort((left, right) => right.confidence - left.confidence);
  if (variants.length === 0) return null;
  if (
    variants.length > 1 &&
    variants[0].digit !== variants[1].digit &&
    Math.abs(variants[0].confidence - variants[1].confidence) < 0.08
  ) {
    return null;
  }
  return variants[0];
};
