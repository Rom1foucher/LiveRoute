import {
  TOKEN_KEYS,
  getBaseTechniqueCost,
  getDualTechniqueCost,
  getTechniqueLevelOptions,
} from "@glcp/core";
import type { Balance, Period, TokenKey } from "@glcp/core";
import {
  buildOcrAtlas,
  classifyTokenColour,
  differenceHash,
  hashSimilarity,
  loadImage,
} from "./image.ts";
import type { OcrCrop } from "./image.ts";
import { recognizeAtlas } from "./ocr.ts";
import { isPlausibleTechniqueCost } from "./technique-cost.ts";
import {
  chooseNumericOcrCandidate,
  hasWholeNumberLengthConflict,
  parseOcrNumber,
  shouldDeepRefineTokenNumber,
  shouldUseSingleCharacterRefinement,
} from "./token-candidates.ts";
import type {
  NumericOcrCandidate,
  NumericOcrDecision,
  NumericOcrSource,
} from "./token-candidates.ts";
import { classify069Crop } from "./digit-shape.ts";
import { locateLearnedNumericField } from "./numeric-learning.ts";
import { numericTextMatchesComponentCount } from "./numeric-learning-model.ts";
import {
  shouldPreferLearnedNumericReading,
  type LearnedNumericReading,
  type NumericReading,
} from "./learned-reading.ts";
import { normalizeText, textSimilarity } from "./text.ts";
import type {
  FieldReading,
  OcrProgress,
  RecognitionContext,
  SnapshotPage,
  SongReading,
  TechniqueKind,
  TechniqueReading,
  VisionProfile,
  VisionSnapshot,
  VisionSongReference,
} from "./types.ts";
import { EMPTY_BALANCE } from "./types.ts";

type Readings = Map<string, NumericReading>;
type LearnedReadings = Map<string, LearnedNumericReading>;

const emptyBalance = (): Balance => ({ ...EMPTY_BALANCE });

const parseNumber = (raw: string, maximum: number): number | null => {
  return parseOcrNumber(raw, maximum);
};

const includesAlias = (text: string, aliases: string[]): boolean => {
  const normalized = normalizeText(text);
  return aliases.some((alias) => {
    const candidate = normalizeText(alias);
    return candidate.length > 0 && normalized.includes(candidate);
  });
};

const inferTechniqueKind = (
  text: string,
  cost: Balance,
  period: Period,
  profile: VisionProfile,
): TechniqueKind => {
  const entries = TOKEN_KEYS.filter((key) => cost[key] > 0);
  if (entries.length >= 2) {
    const amounts = entries.map((key) => cost[key]);
    return amounts.every((amount) => amount === amounts[0])
      ? "duo-balanced"
      : "duo-split";
  }
  if (includesAlias(text, profile.techniqueAliases.energy)) return "energy";
  if (includesAlias(text, profile.techniqueAliases.hint)) return "hint";
  if (includesAlias(text, profile.techniqueAliases.mono)) return "mono";
  if (entries.length !== 1) return "unknown";

  const amount = cost[entries[0]];
  if (amount === getBaseTechniqueCost(period)) return "mono";
  const hintCosts = getTechniqueLevelOptions(period, "hint").map(
    (level) => level.cost,
  );
  const energyCosts = getTechniqueLevelOptions(period, "energy").map(
    (level) => level.cost,
  );
  const isHint = hintCosts.includes(amount);
  const isEnergy = energyCosts.includes(amount);
  if (isHint && !isEnergy) return "hint";
  if (isEnergy && !isHint) return "energy";
  if (amount === getDualTechniqueCost(period)) return "duo-balanced";
  return "unknown";
};

const hashPromises = new Map<string, Promise<string>>();

const referenceHash = (reference: VisionSongReference): Promise<string> => {
  const cached = hashPromises.get(reference.image);
  if (cached) return cached;
  const promise = loadImage(reference.image).then((image) =>
    differenceHash(image),
  );
  hashPromises.set(reference.image, promise);
  return promise;
};

const matchSong = async (
  slot: number,
  rawTitle: string,
  titleConfidence: number,
  source: HTMLImageElement,
  profile: VisionProfile,
  references: VisionSongReference[],
): Promise<SongReading> => {
  const currentHash = differenceHash(source, profile.regions.songs[slot].cover);
  const ranked = await Promise.all(
    references.map(async (reference) => {
      const aliases = [
        reference.name,
        ...(reference.aliases ?? []),
        ...(profile.songAliases[reference.id] ?? []),
      ];
      const titleScore = Math.max(
        0,
        ...aliases.map((alias) => textSimilarity(rawTitle, alias)),
      );
      const hashes = [
        await referenceHash(reference),
        ...(profile.learnedSongHashes[reference.id] ?? []),
      ];
      const coverScore = Math.max(
        0,
        ...hashes.map((hash) => hashSimilarity(currentHash, hash)),
      );
      const combined =
        titleScore > 0 && coverScore > 0
          ? titleScore * 0.62 + coverScore * 0.38
          : Math.max(titleScore, coverScore) * 0.92;
      return {
        reference,
        titleScore,
        coverScore,
        confidence:
          combined *
          (titleScore > 0 ? 0.82 + Math.min(0.18, titleConfidence * 0.18) : 1),
      };
    }),
  );
  ranked.sort(
    (left, right) =>
      right.confidence - left.confidence || right.titleScore - left.titleScore,
  );
  const best = ranked[0];
  if (!best) {
    return {
      slot,
      songId: null,
      songName: "",
      confidence: 0,
      titleScore: 0,
      coverScore: 0,
      rawTitle,
    };
  }
  return {
    slot,
    songId:
      best.confidence >= profile.ocr.minSongConfidence
        ? best.reference.id
        : null,
    songName: best.reference.name,
    confidence: best.confidence,
    titleScore: best.titleScore,
    coverScore: best.coverScore,
    rawTitle,
  };
};

const tokenReading = (
  raw: string,
  ocrConfidence: number,
  profile: VisionProfile,
  decision?: NumericOcrDecision,
): FieldReading<number> => {
  const parsed = parseNumber(raw, profile.ocr.maxTokenValue);
  const value = decision ? decision.value : parsed;
  const confidence =
    value === null
      ? (decision?.confidence ?? 0)
      : (decision?.confidence ?? ocrConfidence);
  return {
    value: confidence >= profile.ocr.minTokenConfidence ? value : null,
    confidence,
    raw,
    alternatives: decision?.alternatives,
    ambiguity: decision?.ambiguity ?? undefined,
    diagnostic: decision?.diagnostic,
  };
};

const contentCrops = (
  page: SnapshotPage,
  profile: VisionProfile,
): OcrCrop[] => {
  const crops: OcrCrop[] = TOKEN_KEYS.map((key) => ({
    id: `token.${key}`,
    rect: profile.regions.tokens[key],
    kind: "number",
  }));

  if (page === "techniques") {
    profile.regions.techniques.forEach((card, slot) => {
      card.costSlots.forEach((cost, costIndex) => {
        crops.push({
          id: `technique.${slot}.cost.${costIndex}`,
          rect: cost.rect,
          kind: "number",
        });
      });
    });
  } else {
    profile.regions.songs.forEach((card, slot) => {
      crops.push({
        id: `song.${slot}.title`,
        rect: card.title,
        kind: "text",
      });
    });
  }
  return crops;
};

const techniqueCost = (
  slot: number,
  readings: Readings,
  profile: VisionProfile,
): Balance => {
  const cost = emptyBalance();
  profile.regions.techniques[slot].costSlots.forEach((costSlot, costIndex) => {
    const reading = readings.get(`technique.${slot}.cost.${costIndex}`);
    const amount = parseNumber(reading?.text ?? "", 99);
    if (amount === null || amount === 0 || !costSlot.fixedToken) {
      return;
    }
    cost[costSlot.fixedToken] += amount;
  });
  return cost;
};

const expandRect = (
  rect: VisionProfile["regions"]["tokens"][TokenKey],
): VisionProfile["regions"]["tokens"][TokenKey] => {
  const horizontal = rect.width * 0.1;
  const vertical = rect.height * 0.14;
  const x = Math.max(0, rect.x - horizontal);
  const y = Math.max(0, rect.y - vertical);
  return {
    x,
    y,
    width: Math.min(1 - x, rect.width + horizontal * 2),
    height: Math.min(1 - y, rect.height + vertical * 2),
  };
};

const numericRectForField = (
  id: string,
  profile: VisionProfile,
): VisionProfile["regions"]["tokens"][TokenKey] | null => {
  if (id.startsWith("token.")) {
    const key = id.slice("token.".length) as TokenKey;
    return profile.regions.tokens[key] ?? null;
  }
  const match = /^technique\.(\d+)\.cost\.(\d+)$/.exec(id);
  if (!match) return null;
  const slot = Number(match[1]);
  const costIndex = Number(match[2]);
  return profile.regions.techniques[slot]?.costSlots[costIndex]?.rect ?? null;
};

const retryLearnedNumericFields = async (
  source: HTMLImageElement,
  fieldIds: readonly string[],
  profile: VisionProfile,
  onProgress?: (progress: OcrProgress) => void,
): Promise<LearnedReadings> => {
  const learnedIds = fieldIds.filter((id) => {
    const tuning = profile.numericFieldTuning[id];
    return Boolean(tuning?.ink);
  });
  if (learnedIds.length === 0) return new Map();

  const output: LearnedReadings = new Map();
  for (let index = 0; index < learnedIds.length; index += 1) {
    const id = learnedIds[index];
    const tuning = profile.numericFieldTuning[id];
    const rect = numericRectForField(id, profile);
    if (!rect || !tuning?.ink) continue;
    onProgress?.({
      status: `Lecture numérique apprise ${index + 1}/${learnedIds.length}`,
      progress: index / Math.max(1, learnedIds.length),
    });
    const located = locateLearnedNumericField(
      source,
      rect,
      tuning,
      id.startsWith("token.") ? 3 : 2,
    );
    if (located.text !== null) {
      output.set(id, {
        text: located.text,
        confidence: located.confidence,
        learnedSource: "template",
      });
      continue;
    }
    if (!located.tightRect) continue;

    // The colour model only locates the current glyphs. Tesseract receives a
    // single, tightly cropped, raw greyscale number. A template learned for 8
    // can therefore never force a later 6/9/12 reading.
    const rawProfile: VisionProfile = {
      ...profile,
      ocr: {
        ...profile.ocr,
        threshold: "none",
        scale: 1,
        invert: "never",
      },
    };
    const reading = await recognizeAtlas(
      buildOcrAtlas(
        source,
        [{ id, rect: located.tightRect, kind: "number" }],
        rawProfile,
      ),
      rawProfile,
      onProgress,
      located.componentCount === 1 ? "single-number" : "number-line",
    );
    const value = reading.get(id);
    if (!value) continue;
    if (!numericTextMatchesComponentCount(value.text, located.componentCount)) {
      continue;
    }
    output.set(id, {
      ...value,
      learnedSource: "tesseract",
    });
  }
  onProgress?.({ status: "Lecture numérique apprise terminée", progress: 1 });
  return output;
};

const refineTokenNumbers = async (
  source: HTMLImageElement,
  readings: Readings,
  learnedReadings: LearnedReadings,
  profile: VisionProfile,
  onProgress?: (progress: OcrProgress) => void,
): Promise<Map<TokenKey, NumericOcrDecision>> => {
  const candidates = new Map<TokenKey, NumericOcrCandidate[]>();
  for (const key of TOKEN_KEYS) {
    const current = readings.get(`token.${key}`);
    const learned = learnedReadings.get(`token.${key}`);
    candidates.set(key, [
      ...(current
        ? [
            {
              text: current.text,
              confidence: current.confidence,
              source: "general" as const,
            },
          ]
        : []),
      ...(learned
        ? [
            {
              text: learned.text,
              confidence: learned.confidence,
              source:
                learned.learnedSource === "template"
                  ? ("learned-template" as const)
                  : ("learned" as const),
            },
          ]
        : []),
    ]);
  }

  const retryProfile = (threshold: "auto" | "none") => ({
    ...profile,
    ocr: {
      ...profile.ocr,
      scale: Math.max(profile.ocr.scale, 4.2),
      threshold,
    },
  });
  const addCandidates = (
    keys: readonly TokenKey[],
    result: Readings,
    sourceName: NumericOcrSource,
  ) => {
    for (const key of keys) {
      const candidate = result.get(`token.${key}`);
      if (!candidate) continue;
      candidates.get(key)?.push({
        text: candidate.text,
        confidence: candidate.confidence,
        source: sourceName,
      });
    }
  };
  const cropsFor = (
    keys: readonly TokenKey[],
    geometry: "wide" | "tight" = "wide",
  ): OcrCrop[] =>
    keys.map((key) => ({
      id: `token.${key}`,
      rect:
        geometry === "wide"
          ? expandRect(profile.regions.tokens[key])
          : profile.regions.tokens[key],
      kind: "number" as const,
    }));

  // Always ask Tesseract to read each balance as one numeric word. The former
  // sparse-text result was the only evidence for most two-digit 0/6/9 values.
  const otsuProfile = retryProfile("auto");
  const wordOtsu = await recognizeAtlas(
    buildOcrAtlas(source, cropsFor(TOKEN_KEYS), otsuProfile),
    otsuProfile,
    onProgress,
    "number-line",
  );
  addCandidates(TOKEN_KEYS, wordOtsu, "word-otsu");

  const deepKeys = TOKEN_KEYS.filter((key) =>
    shouldDeepRefineTokenNumber(
      candidates.get(key) ?? [],
      profile.ocr.maxTokenValue,
      profile.ocr.minTokenConfidence,
    ),
  );
  if (deepKeys.length > 0) {
    const rawProfile = retryProfile("none");
    const wordRaw = await recognizeAtlas(
      buildOcrAtlas(source, cropsFor(deepKeys), rawProfile),
      rawProfile,
      onProgress,
      "number-line",
    );
    addCandidates(deepKeys, wordRaw, "word-raw");

    const lengthConflictKeys = deepKeys.filter((key) =>
      hasWholeNumberLengthConflict(
        candidates.get(key) ?? [],
        profile.ocr.maxTokenValue,
      ),
    );
    if (lengthConflictKeys.length > 0) {
      const tightOtsu = await recognizeAtlas(
        buildOcrAtlas(
          source,
          cropsFor(lengthConflictKeys, "tight"),
          otsuProfile,
        ),
        otsuProfile,
        onProgress,
        "number-line",
      );
      addCandidates(lengthConflictKeys, tightOtsu, "word-tight-otsu");
      const tightRaw = await recognizeAtlas(
        buildOcrAtlas(
          source,
          cropsFor(lengthConflictKeys, "tight"),
          rawProfile,
        ),
        rawProfile,
        onProgress,
        "number-line",
      );
      addCandidates(lengthConflictKeys, tightRaw, "word-tight-raw");
    }

    const singleDigitKeys = deepKeys.filter((key) =>
      shouldUseSingleCharacterRefinement(
        candidates.get(key) ?? [],
        profile.ocr.maxTokenValue,
        profile.ocr.minTokenConfidence,
      ),
    );
    if (singleDigitKeys.length > 0) {
      const charOtsu = await recognizeAtlas(
        buildOcrAtlas(source, cropsFor(singleDigitKeys), otsuProfile),
        otsuProfile,
        onProgress,
        "single-number",
      );
      addCandidates(singleDigitKeys, charOtsu, "char-otsu");
      const charRaw = await recognizeAtlas(
        buildOcrAtlas(source, cropsFor(singleDigitKeys), rawProfile),
        rawProfile,
        onProgress,
        "single-number",
      );
      addCandidates(singleDigitKeys, charRaw, "char-raw");
      for (const key of singleDigitKeys) {
        const shape = classify069Crop(
          source,
          expandRect(profile.regions.tokens[key]),
          profile,
        );
        if (!shape) continue;
        candidates.get(key)?.push({
          text: String(shape.digit),
          confidence: shape.confidence,
          source: "shape",
        });
      }
    }
  }

  const decisions = new Map<TokenKey, NumericOcrDecision>();
  for (const key of TOKEN_KEYS) {
    const decision = chooseNumericOcrCandidate(
      candidates.get(key) ?? [],
      profile.ocr.maxTokenValue,
      profile.ocr.minTokenConfidence,
    );
    readings.set(`token.${key}`, {
      text:
        decision.text ||
        (decision.value === null ? "" : String(decision.value)),
      confidence: decision.confidence,
    });
    decisions.set(key, decision);
  }
  return decisions;
};

const retryUnreliableTechniqueCosts = async (
  source: HTMLImageElement,
  readings: Readings,
  period: Period,
  profile: VisionProfile,
  onProgress?: (progress: OcrProgress) => void,
): Promise<void> => {
  const unreliableSlots = profile.regions.techniques
    .map((_, slot) => slot)
    .filter(
      (slot) =>
        !isPlausibleTechniqueCost(
          techniqueCost(slot, readings, profile),
          period,
        ),
    );
  if (unreliableSlots.length === 0) return;

  const crops: OcrCrop[] = unreliableSlots.flatMap((slot) =>
    profile.regions.techniques[slot].costSlots.map((costSlot, costIndex) => ({
      id: `technique.${slot}.cost.${costIndex}`,
      rect: costSlot.rect,
      kind: "number" as const,
    })),
  );
  const retry = await recognizeAtlas(
    buildOcrAtlas(source, crops, profile),
    profile,
    onProgress,
    "technique-costs",
  );
  for (const [id, candidate] of retry) {
    const candidateAmount = parseNumber(candidate.text, 99);
    if (candidateAmount === null || candidateAmount === 0) continue;
    const current = readings.get(id);
    const currentAmount = parseNumber(current?.text ?? "", 99);
    if (
      currentAmount === null ||
      currentAmount === 0 ||
      candidate.confidence > (current?.confidence ?? 0)
    ) {
      readings.set(id, candidate);
    }
  }
};

const techniqueReading = (
  slot: number,
  source: HTMLImageElement,
  readings: Readings,
  period: Period,
  profile: VisionProfile,
): TechniqueReading => {
  const card = profile.regions.techniques[slot];
  const text = readings.get(`technique.${slot}.text`)?.text ?? "";
  const warnings: string[] = [];
  const cost = emptyBalance();
  const confidences: number[] = [];

  card.costSlots.forEach((costSlot, costIndex) => {
    const reading = readings.get(`technique.${slot}.cost.${costIndex}`);
    const amount = parseNumber(reading?.text ?? "", 99);
    if (amount === null || amount === 0) return;
    const colour = costSlot.fixedToken
      ? { key: costSlot.fixedToken, confidence: 1 }
      : classifyTokenColour(source, costSlot.rect, profile.palette);
    if (!colour.key) {
      warnings.push(`colonne ${costIndex + 1} sans token fiable`);
      return;
    }
    cost[colour.key] += amount;
    confidences.push(Math.min(reading?.confidence ?? 0, colour.confidence));
  });

  const kind = inferTechniqueKind(text, cost, period, profile);
  const confidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  if (confidence > 0 && confidence < profile.ocr.minTechniqueConfidence) {
    warnings.push("lecture sous le seuil de confiance");
  }
  if (kind === "unknown" && confidence > 0) {
    warnings.push("type ambigu, vecteur de coût exploitable");
  }
  return {
    slot,
    kind,
    cost,
    confidence,
    rawText: text,
    warnings,
  };
};

const snapshotSignature = (
  page: VisionSnapshot["page"],
  tokens: VisionSnapshot["tokens"],
  techniques: TechniqueReading[],
  songs: SongReading[],
): string =>
  JSON.stringify({
    page,
    tokens: TOKEN_KEYS.map((key) => tokens[key].value),
    techniques: techniques.map((reading) =>
      TOKEN_KEYS.map((key) => reading.cost[key]),
    ),
    songs: songs.map((song) => song.songId),
  });

export const recognizeFrame = async (
  dataUrl: string,
  profile: VisionProfile,
  context: RecognitionContext,
  capturedAt: number,
  onProgress: ((progress: OcrProgress) => void) | undefined,
  page: SnapshotPage,
): Promise<VisionSnapshot> => {
  const startedAt = performance.now();
  const decodeStartedAt = performance.now();
  const source = await loadImage(dataUrl);
  const decodeMs = performance.now() - decodeStartedAt;
  const primaryStartedAt = performance.now();
  const readings = await recognizeAtlas(
    buildOcrAtlas(source, contentCrops(page, profile), profile),
    profile,
    onProgress,
  );
  const ocrPrimaryMs = performance.now() - primaryStartedAt;
  const retryStartedAt = performance.now();
  const numericFieldIds = contentCrops(page, profile)
    .filter((crop) => crop.kind === "number")
    .map((crop) => crop.id);
  const learnedReadings = await retryLearnedNumericFields(
    source,
    numericFieldIds,
    profile,
    onProgress,
  );
  const tokenDecisions = await refineTokenNumbers(
    source,
    readings,
    learnedReadings,
    profile,
    onProgress,
  );
  if (page === "techniques") {
    await retryUnreliableTechniqueCosts(
      source,
      readings,
      context.period,
      profile,
      onProgress,
    );
    for (const [id, learned] of learnedReadings) {
      if (!id.startsWith("technique.")) continue;
      const learnedAmount = parseNumber(learned.text, 99);
      if (learnedAmount === null) continue;
      const current = readings.get(id);
      const currentAmount = parseNumber(current?.text ?? "", 99);
      if (
        currentAmount === null ||
        shouldPreferLearnedNumericReading(current, learned)
      ) {
        readings.set(id, {
          id,
          text: learned.text,
          confidence: learned.confidence,
        });
      }
    }
  }
  const ocrRetryMs = performance.now() - retryStartedAt;

  const tokens = Object.fromEntries(
    TOKEN_KEYS.map((key) => {
      const reading = readings.get(`token.${key}`);
      return [
        key,
        tokenReading(
          reading?.text ?? "",
          reading?.confidence ?? 0,
          profile,
          tokenDecisions.get(key),
        ),
      ];
    }),
  ) as VisionSnapshot["tokens"];

  const expectedSongCount = Math.min(
    3,
    Math.max(0, Math.trunc(context.expectedSongCount ?? 3)),
  );
  const techniques =
    page === "techniques"
      ? profile.regions.techniques.map((_, slot) =>
          techniqueReading(slot, source, readings, context.period, profile),
        )
      : [];
  const songs =
    page === "songs"
      ? await Promise.all(
          profile.regions.songs.slice(0, expectedSongCount).map((_, slot) => {
            const reading = readings.get(`song.${slot}.title`);
            return matchSong(
              slot,
              reading?.text ?? "",
              reading?.confidence ?? 0,
              source,
              profile,
              context.songs,
            );
          }),
        )
      : [];

  const usableTechniques = techniques.filter(
    (reading) =>
      reading.confidence >= profile.ocr.minTechniqueConfidence &&
      TOKEN_KEYS.some((key) => reading.cost[key] > 0),
  );
  const usableSongs = songs.filter(
    (reading) =>
      reading.songId && reading.confidence >= profile.ocr.minSongConfidence,
  );
  const pageConfidence =
    page === "techniques"
      ? usableTechniques.length === 0
        ? 0
        : (usableTechniques.reduce(
            (sum, reading) => sum + reading.confidence,
            0,
          ) /
            usableTechniques.length) *
          (0.4 + 0.6 * (usableTechniques.length / 3))
      : expectedSongCount === 0
        ? 1
        : usableSongs.length === 0
          ? 0
          : (usableSongs.reduce((sum, reading) => sum + reading.confidence, 0) /
              usableSongs.length) *
            (0.4 + 0.6 * (usableSongs.length / expectedSongCount));

  const warnings: string[] = [];
  const validTokens = TOKEN_KEYS.filter(
    (key) => tokens[key].value !== null,
  ).length;
  if (validTokens < 5) {
    warnings.push(`${5 - validTokens} solde(s) de tokens incertain(s)`);
  }
  if (page === "techniques" && usableTechniques.length < 3) {
    warnings.push(`${3 - usableTechniques.length} technique(s) à confirmer`);
  } else if (page === "songs" && usableSongs.length < expectedSongCount) {
    warnings.push(
      `${expectedSongCount - usableSongs.length} song(s) à confirmer`,
    );
  }

  const snapshot: VisionSnapshot = {
    page,
    pageConfidence,
    tokens,
    techniques,
    songs,
    signature: "",
    warnings: Array.from(new Set(warnings)),
    capturedAt,
    timings: {
      decodeMs,
      ocrPrimaryMs,
      ocrRetryMs,
      ocrTotalMs: performance.now() - startedAt,
    },
  };
  snapshot.signature = snapshotSignature(page, tokens, techniques, songs);
  return snapshot;
};
