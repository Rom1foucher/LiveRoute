import type { TokenKey } from "@glcp/core";
import type { NormalizedRect, TokenPalette, VisionProfile } from "./types.ts";

export type OcrCrop = {
  id: string;
  rect: NormalizedRect;
  kind: "number" | "text";
};

export type AtlasPlacement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrAtlas = {
  canvas: HTMLCanvasElement;
  placements: AtlasPlacement[];
};

export const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Impossible de décoder l’image capturée."));
    image.src = source;
  });

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const rectPixels = (
  image: Pick<HTMLImageElement, "naturalWidth" | "naturalHeight">,
  value: NormalizedRect,
) => {
  const x = Math.round(clamp(value.x, 0, 1) * image.naturalWidth);
  const y = Math.round(clamp(value.y, 0, 1) * image.naturalHeight);
  const width = Math.max(
    1,
    Math.round(
      clamp(value.width, 0, 1 - clamp(value.x, 0, 1)) * image.naturalWidth,
    ),
  );
  const height = Math.max(
    1,
    Math.round(
      clamp(value.height, 0, 1 - clamp(value.y, 0, 1)) * image.naturalHeight,
    ),
  );
  return { x, y, width, height };
};

export const cropCanvas = (
  image: HTMLImageElement,
  value: NormalizedRect,
  targetHeight?: number,
): HTMLCanvasElement => {
  const source = rectPixels(image, value);
  const scale = targetHeight ? targetHeight / source.height : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas 2D indisponible.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
};

const otsuThreshold = (values: Uint8ClampedArray): number => {
  const histogram = new Uint32Array(256);
  let total = 0;
  let weightedTotal = 0;
  for (let index = 0; index < values.length; index += 4) {
    const red = values[index];
    const green = values[index + 1];
    const blue = values[index + 2];
    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
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

const preprocessCrop = (
  canvas: HTMLCanvasElement,
  profile: VisionProfile,
): HTMLCanvasElement => {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const threshold = otsuThreshold(image.data);
  let luminanceSum = 0;

  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = Math.round(
      0.2126 * image.data[index] +
        0.7152 * image.data[index + 1] +
        0.0722 * image.data[index + 2],
    );
    luminanceSum += luminance;
  }
  const mean = luminanceSum / Math.max(1, image.data.length / 4);
  const invert =
    profile.ocr.invert === "always" ||
    (profile.ocr.invert === "auto" && mean < 128);

  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = Math.round(
      0.2126 * image.data[index] +
        0.7152 * image.data[index + 1] +
        0.0722 * image.data[index + 2],
    );
    let value =
      profile.ocr.threshold === "auto"
        ? luminance >= threshold
          ? 255
          : 0
        : luminance;
    if (invert) value = 255 - value;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
};

export const buildOcrAtlas = (
  source: HTMLImageElement,
  crops: OcrCrop[],
  profile: VisionProfile,
): OcrAtlas => {
  const prepared = crops.map((crop) => {
    const baseHeight =
      crop.kind === "number"
        ? Math.round(42 * profile.ocr.scale)
        : Math.round(58 * profile.ocr.scale);
    const native = rectPixels(source, crop.rect);
    const targetHeight =
      crop.kind === "number" ? Math.max(native.height, baseHeight) : baseHeight;
    const canvas = preprocessCrop(
      cropCanvas(source, crop.rect, targetHeight),
      profile,
    );
    const maximumWidth = Math.round(720 * profile.ocr.scale);
    if (canvas.width <= maximumWidth) return { crop, canvas };
    const resized = document.createElement("canvas");
    resized.width = maximumWidth;
    resized.height = Math.max(
      1,
      Math.round(canvas.height * (maximumWidth / canvas.width)),
    );
    resized
      .getContext("2d")
      ?.drawImage(canvas, 0, 0, resized.width, resized.height);
    return { crop, canvas: resized };
  });

  const gutter = Math.round(22 * profile.ocr.scale);
  const horizontalPadding = Math.round(16 * profile.ocr.scale);
  const width = Math.max(
    320,
    ...prepared.map(({ canvas }) => canvas.width + horizontalPadding * 2),
  );
  const height =
    prepared.reduce(
      (sum, { canvas }) => sum + canvas.height + gutter,
      gutter,
    ) || 1;
  const atlas = document.createElement("canvas");
  atlas.width = width;
  atlas.height = height;
  const context = atlas.getContext("2d");
  if (!context) throw new Error("Canvas OCR indisponible.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);

  let y = gutter;
  const placements: AtlasPlacement[] = [];
  for (const { crop, canvas } of prepared) {
    context.drawImage(canvas, horizontalPadding, y);
    placements.push({
      id: crop.id,
      x: horizontalPadding,
      y,
      width: canvas.width,
      height: canvas.height,
    });
    y += canvas.height + gutter;
  }
  return { canvas: atlas, placements };
};

const parseHex = (value: string): [number, number, number] | null => {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const saturation = (red: number, green: number, blue: number): number => {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return maximum === 0 ? 0 : (maximum - minimum) / maximum;
};

export const classifyTokenColour = (
  source: HTMLImageElement,
  value: NormalizedRect,
  palette: TokenPalette,
): { key: TokenKey | null; confidence: number } => {
  const canvas = cropCanvas(source, value);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) return { key: null, confidence: 0 };
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const candidates = Object.entries(palette).flatMap(([key, colours]) =>
    colours
      .map(parseHex)
      .filter((colour): colour is [number, number, number] => colour !== null)
      .map((colour) => ({ key: key as TokenKey, colour })),
  );
  if (candidates.length === 0) return { key: null, confidence: 0 };

  const evidence = new Map<TokenKey, number[]>();
  for (let index = 0; index < data.length; index += 16) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (saturation(red, green, blue) < 0.2) continue;
    for (const candidate of candidates) {
      const distance = Math.sqrt(
        (red - candidate.colour[0]) ** 2 +
          (green - candidate.colour[1]) ** 2 +
          (blue - candidate.colour[2]) ** 2,
      );
      const values = evidence.get(candidate.key) ?? [];
      values.push(distance);
      evidence.set(candidate.key, values);
    }
  }

  const ranked = Array.from(evidence.entries())
    .map(([key, distances]) => {
      distances.sort((a, b) => a - b);
      const sampleCount = Math.max(
        3,
        Math.min(distances.length, Math.ceil(distances.length * 0.08)),
      );
      const score =
        distances.slice(0, sampleCount).reduce((sum, item) => sum + item, 0) /
        sampleCount;
      return { key, score };
    })
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (!best || !Number.isFinite(best.score)) {
    return { key: null, confidence: 0 };
  }
  const second = ranked[1]?.score ?? 441;
  const absolute = clamp(1 - best.score / 190, 0, 1);
  const margin = clamp((second - best.score) / 110, 0, 1);
  const confidence = 0.72 * absolute + 0.28 * margin;
  return {
    key: confidence >= 0.3 ? best.key : null,
    confidence,
  };
};

export const differenceHash = (
  source: HTMLImageElement,
  value?: NormalizedRect,
): string => {
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) return "";
  if (value) {
    const crop = rectPixels(source, value);
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      9,
      8,
    );
  } else {
    context.drawImage(source, 0, 0, 9, 8);
  }
  const data = context.getImageData(0, 0, 9, 8).data;
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = (y * 9 + x) * 4;
      const right = left + 4;
      const leftValue =
        data[left] * 0.299 + data[left + 1] * 0.587 + data[left + 2] * 0.114;
      const rightValue =
        data[right] * 0.299 + data[right + 1] * 0.587 + data[right + 2] * 0.114;
      bits += leftValue > rightValue ? "1" : "0";
    }
  }
  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    output += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return output;
};

export const hashSimilarity = (left: string, right: string): number => {
  if (left.length !== 16 || right.length !== 16) return 0;
  let different = 0;
  for (let index = 0; index < 16; index += 1) {
    const xor =
      Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    different += xor.toString(2).replaceAll("0", "").length;
  }
  return 1 - different / 64;
};
