export type Rgb = readonly [number, number, number];

export type NumericInkModel = {
  rgb: [number, number, number];
  tolerance: number;
};

export type NumericGlyphTemplate = {
  bits: string;
  samples: number;
};

export type NumericTemplateMap = Partial<
  Record<
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9",
    NumericGlyphTemplate[]
  >
>;

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NumericComponent = PixelRect & {
  area: number;
  indices: number[];
};

export type NumericSegmentation = {
  ink: NumericInkModel;
  components: NumericComponent[];
  union: PixelRect;
  score: number;
};

export type TemplateMatch = {
  text: string | null;
  confidence: number;
  similarities: number[];
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type Digit = (typeof DIGITS)[number];

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const colourDistanceSquared = (
  red: number,
  green: number,
  blue: number,
  rgb: Rgb,
): number => (red - rgb[0]) ** 2 + (green - rgb[1]) ** 2 + (blue - rgb[2]) ** 2;

const quantizedColourCandidates = (image: PixelBuffer): Rgb[] => {
  const buckets = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >();
  const pixelCount = image.width * image.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const alpha = image.data[offset + 3];
    if (alpha < 128) continue;
    const qr = Math.round(red / 16) * 16;
    const qg = Math.round(green / 16) * 16;
    const qb = Math.round(blue / 16) * 16;
    const key = `${qr}:${qg}:${qb}`;
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const minimumCount = Math.max(3, Math.floor(pixelCount * 0.0015));
  return [...buckets.values()]
    .filter((bucket) => bucket.count >= minimumCount)
    .map((bucket) => ({
      ...bucket,
      rgb: [
        Math.round(bucket.red / bucket.count),
        Math.round(bucket.green / bucket.count),
        Math.round(bucket.blue / bucket.count),
      ] as Rgb,
    }))
    .filter(({ rgb }) => {
      const maximum = Math.max(...rgb);
      const minimum = Math.min(...rgb);
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
      const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      // Keep coloured ink, very light ink and very dark ink. Mid-grey flat
      // backgrounds are intentionally omitted.
      return saturation >= 0.12 || luminance >= 205 || luminance <= 70;
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, 28)
    .map((candidate) => candidate.rgb);
};

const buildMask = (image: PixelBuffer, ink: NumericInkModel): Uint8Array => {
  const output = new Uint8Array(image.width * image.height);
  const threshold = ink.tolerance ** 2;
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * 4;
    output[pixel] =
      image.data[offset + 3] >= 128 &&
      colourDistanceSquared(
        image.data[offset],
        image.data[offset + 1],
        image.data[offset + 2],
        ink.rgb,
      ) <= threshold
        ? 1
        : 0;
  }
  return output;
};

const neighbourIndices = (
  index: number,
  width: number,
  height: number,
): number[] => {
  const x = index % width;
  const y = Math.floor(index / width);
  const output: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      output.push(ny * width + nx);
    }
  }
  return output;
};

export const componentsFromMask = (
  mask: Uint8Array,
  width: number,
  height: number,
): NumericComponent[] => {
  const visited = new Uint8Array(mask.length);
  const components: NumericComponent[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || mask[start] === 0) continue;
    const queue = [start];
    visited[start] = 1;
    const indices: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      indices.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const neighbour of neighbourIndices(index, width, height)) {
        if (visited[neighbour] || mask[neighbour] === 0) continue;
        visited[neighbour] = 1;
        queue.push(neighbour);
      }
    }
    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: indices.length,
      indices,
    });
  }
  return components;
};

const digitLikeComponents = (
  components: readonly NumericComponent[],
  image: PixelBuffer,
): NumericComponent[] => {
  const totalArea = image.width * image.height;
  return components
    .filter((component) => {
      const heightRatio = component.height / image.height;
      const widthRatio = component.width / image.width;
      const areaRatio = component.area / totalArea;
      const fill =
        component.area / Math.max(1, component.width * component.height);
      return (
        heightRatio >= 0.28 &&
        heightRatio <= 0.92 &&
        widthRatio >= 0.018 &&
        widthRatio <= 0.52 &&
        areaRatio >= 0.002 &&
        areaRatio <= 0.42 &&
        fill >= 0.08 &&
        fill <= 1
      );
    })
    .sort((left, right) => left.x - right.x);
};

const unionRect = (components: readonly NumericComponent[]): PixelRect => {
  const left = Math.min(...components.map((component) => component.x));
  const top = Math.min(...components.map((component) => component.y));
  const right = Math.max(
    ...components.map((component) => component.x + component.width),
  );
  const bottom = Math.max(
    ...components.map((component) => component.y + component.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const scoreComponentGroup = (
  group: readonly NumericComponent[],
  image: PixelBuffer,
): number => {
  const heights = group.map((component) => component.height);
  const bottoms = group.map((component) => component.y + component.height);
  const meanHeight =
    heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const heightSpread =
    Math.max(...heights.map((height) => Math.abs(height - meanHeight))) /
    Math.max(1, meanHeight);
  const meanBottom =
    bottoms.reduce((sum, value) => sum + value, 0) / bottoms.length;
  const baselineSpread =
    Math.max(...bottoms.map((bottom) => Math.abs(bottom - meanBottom))) /
    Math.max(1, meanHeight);
  const union = unionRect(group);
  const rightBias = (union.x + union.width) / image.width;
  const verticalCenter = (union.y + union.height / 2) / image.height;
  const relativeHeight = union.height / image.height;
  const gapPenalty = group.slice(1).reduce((sum, component, index) => {
    const previous = group[index];
    const gap = component.x - (previous.x + previous.width);
    return sum + Math.max(0, gap / Math.max(1, meanHeight) - 0.55);
  }, 0);
  const area = group.reduce((sum, component) => sum + component.area, 0);
  const fill = area / Math.max(1, union.width * union.height);

  const heightFitness = clamp(1 - Math.abs(relativeHeight - 0.55) * 2.6, 0, 1);
  return (
    heightFitness * 3.2 +
    rightBias * 0.8 +
    clamp(1 - Math.abs(verticalCenter - 0.56) * 2, 0, 1) * 0.7 +
    clamp(fill, 0, 0.55) * 0.7 -
    heightSpread * 2.6 -
    baselineSpread * 2.6 -
    gapPenalty * 1.5
  );
};

const contiguousGroups = <T>(values: readonly T[], length: number): T[][] => {
  const output: T[][] = [];
  for (let start = 0; start + length <= values.length; start += 1) {
    output.push(values.slice(start, start + length));
  }
  return output;
};

const bestGroup = (
  components: readonly NumericComponent[],
  image: PixelBuffer,
  expectedLength: number,
): { components: NumericComponent[]; score: number } | null => {
  if (components.length < expectedLength) return null;
  const ranked = contiguousGroups(components, expectedLength)
    .map((group) => ({ group, score: scoreComponentGroup(group, image) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  return best ? { components: best.group, score: best.score } : null;
};

const refinedInk = (
  image: PixelBuffer,
  components: readonly NumericComponent[],
  seed: Rgb,
): NumericInkModel => {
  const pixels = components.flatMap((component) => component.indices);
  const colours = pixels.map((pixel) => {
    const offset = pixel * 4;
    return [
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
    ] as Rgb;
  });
  const median = (channel: 0 | 1 | 2): number => {
    const values = colours
      .map((colour) => colour[channel])
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? seed[channel];
  };
  const rgb: [number, number, number] = [median(0), median(1), median(2)];
  const distances = colours
    .map((colour) =>
      Math.sqrt(colourDistanceSquared(colour[0], colour[1], colour[2], rgb)),
    )
    .sort((a, b) => a - b);
  const percentile = distances[Math.floor(distances.length * 0.92)] ?? 32;
  return {
    rgb,
    tolerance: clamp(Math.round(percentile + 18), 24, 96),
  };
};

const dominanceMask = (
  image: PixelBuffer,
  channel: 0 | 1 | 2,
  margin: number,
): Uint8Array => {
  const output = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * 4;
    const channels = [
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
    ];
    const otherMaximum = Math.max(
      channels[(channel + 1) % 3],
      channels[(channel + 2) % 3],
    );
    output[pixel] = channels[channel] - otherMaximum >= margin ? 1 : 0;
  }
  return output;
};

const luminanceMask = (
  image: PixelBuffer,
  threshold: number,
  light: boolean,
): Uint8Array => {
  const output = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * 4;
    const luminance =
      image.data[offset] * 0.2126 +
      image.data[offset + 1] * 0.7152 +
      image.data[offset + 2] * 0.0722;
    output[pixel] = light
      ? luminance >= threshold
        ? 1
        : 0
      : luminance <= threshold
        ? 1
        : 0;
  }
  return output;
};

const segmentationCandidateFromMask = (
  image: PixelBuffer,
  mask: Uint8Array,
  expectedLength: number,
  seed: Rgb,
  penalty = 0,
): NumericSegmentation | null => {
  const components = digitLikeComponents(
    componentsFromMask(mask, image.width, image.height),
    image,
  );
  const group = bestGroup(components, image, expectedLength);
  if (!group) return null;
  const union = unionRect(group.components);
  const coverage =
    group.components.reduce((sum, component) => sum + component.area, 0) /
    Math.max(1, image.width * image.height);
  if (coverage > 0.5) return null;
  return {
    ink: refinedInk(image, group.components, seed),
    components: group.components,
    union,
    score: group.score - Math.max(0, coverage - 0.2) * 4 - penalty,
  };
};

export const learnNumericSegmentation = (
  image: PixelBuffer,
  expectedText: string,
): NumericSegmentation | null => {
  const expectedLength = expectedText.length;
  if (expectedLength < 1 || expectedLength > 3 || !/^\d+$/.test(expectedText)) {
    return null;
  }
  const candidates: NumericSegmentation[] = [];

  // Chrominance is used only as a locator. It is especially effective for the
  // purple lesson digits while excluding the green label in the same cell.
  for (const channel of [0, 1, 2] as const) {
    for (const margin of [12, 20, 28, 36, 48]) {
      const mask = dominanceMask(image, channel, margin);
      const seed: Rgb =
        channel === 0
          ? [220, 80, 80]
          : channel === 1
            ? [80, 220, 80]
            : [80, 80, 220];
      const candidate = segmentationCandidateFromMask(
        image,
        mask,
        expectedLength,
        seed,
        margin < 20 ? 0.18 : 0,
      );
      if (candidate) candidates.push(candidate);
    }
  }

  // White-on-dark counters and dark-on-light variants.
  for (const threshold of [175, 195, 215, 232]) {
    const candidate = segmentationCandidateFromMask(
      image,
      luminanceMask(image, threshold, true),
      expectedLength,
      [245, 245, 245],
      threshold < 195 ? 0.16 : 0,
    );
    if (candidate) candidates.push(candidate);
  }
  for (const threshold of [35, 55, 75, 95]) {
    const candidate = segmentationCandidateFromMask(
      image,
      luminanceMask(image, threshold, false),
      expectedLength,
      [20, 20, 20],
      threshold > 75 ? 0.16 : 0,
    );
    if (candidate) candidates.push(candidate);
  }

  // Generic colour-distance fallback for fields whose ink is neither strongly
  // chromatic nor close to white/black.
  const colours = quantizedColourCandidates(image);
  const tolerances = [18, 26, 36, 48, 64, 82];
  for (const colour of colours) {
    for (const tolerance of tolerances) {
      const seed: NumericInkModel = {
        rgb: [colour[0], colour[1], colour[2]],
        tolerance,
      };
      const candidate = segmentationCandidateFromMask(
        image,
        buildMask(image, seed),
        expectedLength,
        colour,
        tolerance / 120,
      );
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || best.score < 1.15) return null;
  return best;
};

export const segmentWithLearnedInk = (
  image: PixelBuffer,
  ink: NumericInkModel,
  maximumDigits = 3,
): NumericSegmentation | null => {
  const components = digitLikeComponents(
    componentsFromMask(buildMask(image, ink), image.width, image.height),
    image,
  );
  if (components.length === 0) return null;
  const candidates: NumericSegmentation[] = [];
  for (
    let length = 1;
    length <= Math.min(maximumDigits, components.length);
    length += 1
  ) {
    for (const group of contiguousGroups(components, length)) {
      const score = scoreComponentGroup(group, image) + group.length * 0.65;
      candidates.push({
        ink,
        components: group,
        union: unionRect(group),
        score,
      });
    }
  }
  const plausible = candidates.filter((candidate) => candidate.score >= 1.05);
  plausible.sort(
    (left, right) =>
      right.components.length - left.components.length ||
      right.score - left.score,
  );
  return plausible[0] ?? null;
};

const templateDimensions = { width: 16, height: 24 } as const;

const normalizedTemplateData = (
  component: NumericComponent,
  sourceWidth: number,
): Uint8Array => {
  const source = new Uint8Array(component.width * component.height);
  for (const index of component.indices) {
    const x = index % sourceWidth;
    const y = Math.floor(index / sourceWidth);
    const localX = x - component.x;
    const localY = y - component.y;
    if (
      localX >= 0 &&
      localY >= 0 &&
      localX < component.width &&
      localY < component.height
    ) {
      source[localY * component.width + localX] = 1;
    }
  }
  const output = new Uint8Array(
    templateDimensions.width * templateDimensions.height,
  );
  const availableWidth = templateDimensions.width - 4;
  const availableHeight = templateDimensions.height - 4;
  const scale = Math.min(
    availableWidth / Math.max(1, component.width),
    availableHeight / Math.max(1, component.height),
  );
  const renderedWidth = Math.max(1, Math.round(component.width * scale));
  const renderedHeight = Math.max(1, Math.round(component.height * scale));
  const offsetX = Math.floor((templateDimensions.width - renderedWidth) / 2);
  const offsetY = Math.floor((templateDimensions.height - renderedHeight) / 2);
  for (let y = 0; y < renderedHeight; y += 1) {
    for (let x = 0; x < renderedWidth; x += 1) {
      const sourceX = clamp(
        Math.floor(((x + 0.5) / renderedWidth) * component.width),
        0,
        component.width - 1,
      );
      const sourceY = clamp(
        Math.floor(((y + 0.5) / renderedHeight) * component.height),
        0,
        component.height - 1,
      );
      output[(offsetY + y) * templateDimensions.width + offsetX + x] =
        source[sourceY * component.width + sourceX];
    }
  }
  return output;
};

const encodeBits = (bits: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    let value = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      value = (value << 1) | (bits[index + offset] ?? 0);
    }
    output += value.toString(16);
  }
  return output;
};

const decodeBits = (encoded: string): Uint8Array | null => {
  if (!/^[0-9a-f]{96}$/i.test(encoded)) return null;
  const output = new Uint8Array(
    templateDimensions.width * templateDimensions.height,
  );
  let cursor = 0;
  for (const character of encoded) {
    const value = Number.parseInt(character, 16);
    for (let shift = 3; shift >= 0; shift -= 1) {
      output[cursor] = (value >> shift) & 1;
      cursor += 1;
    }
  }
  return output;
};

export const componentTemplate = (
  component: NumericComponent,
  sourceWidth: number,
): string => encodeBits(normalizedTemplateData(component, sourceWidth));

const shiftedSimilarity = (
  left: Uint8Array,
  right: Uint8Array,
  dx: number,
  dy: number,
): number => {
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < templateDimensions.height; y += 1) {
    for (let x = 0; x < templateDimensions.width; x += 1) {
      const leftValue = left[y * templateDimensions.width + x];
      const rx = x + dx;
      const ry = y + dy;
      const rightValue =
        rx >= 0 &&
        ry >= 0 &&
        rx < templateDimensions.width &&
        ry < templateDimensions.height
          ? right[ry * templateDimensions.width + rx]
          : 0;
      if (leftValue || rightValue) union += 1;
      if (leftValue && rightValue) intersection += 1;
    }
  }
  return union === 0 ? 0 : intersection / union;
};

export const templateSimilarity = (
  leftEncoded: string,
  rightEncoded: string,
): number => {
  const left = decodeBits(leftEncoded);
  const right = decodeBits(rightEncoded);
  if (!left || !right) return 0;
  let best = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      best = Math.max(best, shiftedSimilarity(left, right, dx, dy));
    }
  }
  return best;
};

export const mergeDigitTemplate = (
  templates: NumericTemplateMap,
  digit: Digit,
  encoded: string,
): NumericTemplateMap => {
  const next: NumericTemplateMap = JSON.parse(
    JSON.stringify(templates ?? {}),
  ) as NumericTemplateMap;
  const existing = [...(next[digit] ?? [])];
  const closeIndex = existing.findIndex(
    (template) => templateSimilarity(template.bits, encoded) >= 0.9,
  );
  if (closeIndex >= 0) {
    existing[closeIndex] = {
      bits: existing[closeIndex].bits,
      samples: existing[closeIndex].samples + 1,
    };
  } else {
    existing.push({ bits: encoded, samples: 1 });
  }
  existing.sort((left, right) => right.samples - left.samples);
  next[digit] = existing.slice(0, 6);
  return next;
};

export const matchComponentsWithTemplates = (
  components: readonly NumericComponent[],
  sourceWidth: number,
  templates: NumericTemplateMap,
): TemplateMatch => {
  if (components.length === 0)
    return { text: null, confidence: 0, similarities: [] };
  const output: string[] = [];
  const similarities: number[] = [];
  const coveredDigitCount = DIGITS.filter(
    (digit) => (templates[digit]?.length ?? 0) > 0,
  ).length;
  const minimumSimilarity =
    coveredDigitCount >= 4 ? 0.78 : coveredDigitCount >= 2 ? 0.85 : 0.93;
  for (const component of components) {
    const encoded = componentTemplate(component, sourceWidth);
    const ranked = DIGITS.map((digit) => ({
      digit,
      similarity: Math.max(
        0,
        ...(templates[digit] ?? []).map((template) =>
          templateSimilarity(template.bits, encoded),
        ),
      ),
    })).sort((left, right) => right.similarity - left.similarity);
    const best = ranked[0];
    const second = ranked[1];
    if (
      !best ||
      best.similarity < minimumSimilarity ||
      best.similarity - (second?.similarity ?? 0) < 0.045
    ) {
      return { text: null, confidence: 0, similarities };
    }
    output.push(best.digit);
    similarities.push(best.similarity);
  }
  const confidence =
    similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  return { text: output.join(""), confidence, similarities };
};

export const expandedPixelRect = (
  rect: PixelRect,
  image: Pick<PixelBuffer, "width" | "height">,
  marginRatio = 0.5,
): PixelRect => {
  const margin = Math.round(rect.height * marginRatio);
  const x = Math.max(0, rect.x - margin);
  const y = Math.max(0, rect.y - margin);
  const right = Math.min(image.width, rect.x + rect.width + margin);
  const bottom = Math.min(image.height, rect.y + rect.height + margin);
  return { x, y, width: right - x, height: bottom - y };
};

export const numericTextMatchesComponentCount = (
  raw: string,
  componentCount: number,
): boolean => raw.replace(/\D/g, "").length === componentCount;
