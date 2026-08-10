export type NumericOcrSource =
  | "general"
  | "word-otsu"
  | "word-raw"
  | "word-tight-otsu"
  | "word-tight-raw"
  | "char-otsu"
  | "char-raw"
  | "shape"
  | "learned"
  | "learned-template"
  // Kept for imported v0.18 diagnostics and older tests.
  | "single-otsu"
  | "single-raw";

export type NumericOcrCandidate = {
  text: string;
  confidence: number;
  source: NumericOcrSource;
};

export type NumericOcrDecision = {
  text: string;
  confidence: number;
  value: number | null;
  uncertain: boolean;
  alternatives: number[];
  ambiguity: "0/6/9" | "truncated" | null;
  diagnostic: string;
};

const SOURCE_WEIGHT: Record<NumericOcrSource, number> = {
  general: 0.86,
  "word-otsu": 1,
  "word-raw": 0.98,
  "word-tight-otsu": 1.02,
  "word-tight-raw": 1,
  "char-otsu": 0.94,
  "char-raw": 0.92,
  shape: 1.08,
  learned: 1.04,
  "learned-template": 1.3,
  "single-otsu": 0.94,
  "single-raw": 0.92,
};

const sourceFamily = (source: NumericOcrSource): string => {
  if (source === "general") return "general";
  if (source === "shape") return "shape";
  if (source === "learned" || source === "learned-template") return "learned";
  return source.includes("otsu") ? "otsu" : "raw";
};

export const correctedDigits = (value: string): string =>
  value
    .replace(/[oO]/g, "0")
    .replace(/[iIl|]/g, "1")
    .replace(/[sS]/g, "5")
    // Lowercase b is a much closer OCR substitution for the game's 6.
    .replace(/b/g, "6")
    .replace(/B/g, "8")
    .replace(/[gGqQ]/g, "9");

export const parseOcrNumber = (raw: string, maximum: number): number | null => {
  const candidates =
    correctedDigits(raw)
      .match(/\d{1,3}/g)
      ?.map(Number) ?? [];
  return (
    candidates.find(
      (candidate) =>
        Number.isInteger(candidate) && candidate >= 0 && candidate <= maximum,
    ) ?? null
  );
};

const digitText = (value: string): string =>
  correctedDigits(value).replace(/\D/g, "");

const isWholeNumberSource = (source: NumericOcrSource): boolean =>
  source === "general" ||
  source === "learned" ||
  source === "learned-template" ||
  source.startsWith("word-");

const isStrictTruncation = (shorter: number, longer: number): boolean => {
  const shortText = String(shorter);
  const longText = String(longer);
  return (
    shortText.length < longText.length &&
    (longText.startsWith(shortText) || longText.endsWith(shortText))
  );
};

const cropFamily = (
  source: NumericOcrSource,
): "primary" | "wide" | "tight" | "character" | "shape" | "learned" => {
  if (source === "general") return "primary";
  if (source.startsWith("word-tight-")) return "tight";
  if (source.startsWith("word-")) return "wide";
  if (source === "shape") return "shape";
  if (source === "learned" || source === "learned-template") return "learned";
  return "character";
};

export const shouldRefineAsSingleDigit = (
  candidate: Pick<NumericOcrCandidate, "text" | "confidence"> | undefined,
  maximum: number,
  minimumConfidence: number,
): boolean => {
  if (!candidate) return true;
  const value = parseOcrNumber(candidate.text, maximum);
  const digits = digitText(candidate.text);
  return (
    value === null ||
    value <= 9 ||
    digits.length <= 1 ||
    (digits.length === 0 && candidate.confidence < minimumConfidence)
  );
};

/**
 * SINGLE_CHAR must only see a genuine one-glyph balance. If a whole-number
 * pass has already found two or three digits, applying SINGLE_CHAR to the
 * complete crop merely repeats the first glyph and can outvote the full value
 * (for example 6 against 62, or 9 against 91).
 */
export const shouldUseSingleCharacterRefinement = (
  candidates: NumericOcrCandidate[],
  maximum: number,
  minimumConfidence: number,
): boolean => {
  const wholeNumbers = candidates
    .filter((candidate) => isWholeNumberSource(candidate.source))
    .map((candidate) => ({
      candidate,
      value: parseOcrNumber(candidate.text, maximum),
      digits: digitText(candidate.text),
    }))
    .filter((item) => item.value !== null);
  if (wholeNumbers.some((item) => item.digits.length >= 2)) return false;
  return (
    wholeNumbers.length === 0 ||
    wholeNumbers.some((item) =>
      shouldRefineAsSingleDigit(item.candidate, maximum, minimumConfidence),
    )
  );
};

export const hasWholeNumberLengthConflict = (
  candidates: NumericOcrCandidate[],
  maximum: number,
): boolean => {
  const lengths = new Set(
    candidates
      .filter((candidate) => isWholeNumberSource(candidate.source))
      .flatMap((candidate) => {
        const value = parseOcrNumber(candidate.text, maximum);
        const digits = digitText(candidate.text);
        return value === null || digits.length === 0 ? [] : [digits.length];
      }),
  );
  return lengths.size > 1;
};

/**
 * A second whole-number pass is useful beyond one-digit values: 60/66/69/90
 * were previously trusted after the generic sparse-text pass alone.
 */
export const shouldDeepRefineTokenNumber = (
  candidates: NumericOcrCandidate[],
  maximum: number,
  minimumConfidence: number,
): boolean => {
  if (candidates.length === 0) return true;
  const parsed = candidates
    .map((candidate) => ({
      value: parseOcrNumber(candidate.text, maximum),
      confidence: candidate.confidence,
      digits: digitText(candidate.text),
    }))
    .filter((candidate) => candidate.value !== null);
  if (parsed.length === 0) return true;
  if (
    parsed.some((candidate) => candidate.confidence < minimumConfidence + 0.12)
  ) {
    return true;
  }
  if (new Set(parsed.map((candidate) => candidate.value)).size > 1) return true;
  return parsed.some(
    (candidate) =>
      candidate.digits.length <= 1 || /[069]/.test(candidate.digits),
  );
};

const differsOnlyInside069 = (left: number, right: number): boolean => {
  const leftText = String(left);
  const rightText = String(right);
  if (leftText.length !== rightText.length || leftText === rightText) {
    return false;
  }
  let changed = false;
  for (let index = 0; index < leftText.length; index += 1) {
    if (leftText[index] === rightText[index]) continue;
    changed = true;
    if (!"069".includes(leftText[index]) || !"069".includes(rightText[index])) {
      return false;
    }
  }
  return changed;
};

/**
 * Reconciles independent whole-word, single-character and glyph-shape passes.
 *
 * 0/6/9 disagreements deliberately require a wider lead. A low-confidence
 * blank is preferable to silently feeding a wrong balance to the solver; the
 * review UI then exposes the ranked alternatives as one-click corrections.
 */
export const chooseNumericOcrCandidate = (
  candidates: NumericOcrCandidate[],
  maximum: number,
  minimumConfidence: number,
): NumericOcrDecision => {
  const valid = candidates
    .map((candidate) => ({
      ...candidate,
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
      value: parseOcrNumber(candidate.text, maximum),
    }))
    .filter(
      (candidate): candidate is NumericOcrCandidate & { value: number } =>
        candidate.value !== null,
    );
  const trustedLearned = valid.filter(
    (candidate) =>
      candidate.source === "learned-template" &&
      candidate.confidence >= Math.max(0.92, minimumConfidence + 0.08),
  );
  const trustedValues = [
    ...new Set(trustedLearned.map((candidate) => candidate.value)),
  ];
  if (trustedValues.length === 1) {
    const value = trustedValues[0];
    const confidence = Math.max(
      ...trustedLearned
        .filter((candidate) => candidate.value === value)
        .map((candidate) => candidate.confidence),
    );
    const alternatives = [
      value,
      ...valid
        .filter((candidate) => candidate.value !== value)
        .sort((left, right) => right.confidence - left.confidence)
        .map((candidate) => candidate.value),
    ]
      .filter((candidate, index, values) => values.indexOf(candidate) === index)
      .slice(0, 3);
    return {
      text: String(value),
      confidence,
      value,
      uncertain: false,
      alternatives,
      ambiguity: null,
      diagnostic: "Modèle appris confirmé sur les glyphes segmentés",
    };
  }

  if (valid.length === 0) {
    return {
      text: "",
      confidence: 0,
      value: null,
      uncertain: true,
      alternatives: [],
      ambiguity: null,
      diagnostic: "Aucune passe numérique exploitable",
    };
  }

  const grouped = new Map<
    number,
    Array<NumericOcrCandidate & { value: number }>
  >();
  for (const candidate of valid) {
    const group = grouped.get(candidate.value) ?? [];
    group.push(candidate);
    grouped.set(candidate.value, group);
  }

  const ranked = Array.from(grouped.entries())
    .map(([value, group]) => {
      const sorted = [...group].sort(
        (left, right) => right.confidence - left.confidence,
      );
      const families = new Set(
        sorted.map((candidate) => sourceFamily(candidate.source)),
      );
      const weightedConfidence = sorted.reduce(
        (sum, candidate) =>
          sum + candidate.confidence * SOURCE_WEIGHT[candidate.source],
        0,
      );
      return {
        value,
        group: sorted,
        families,
        support: weightedConfidence + Math.max(0, families.size - 1) * 0.14,
        bestConfidence: sorted[0]?.confidence ?? 0,
        averageConfidence:
          sorted.reduce((sum, candidate) => sum + candidate.confidence, 0) /
          Math.max(1, sorted.length),
      };
    })
    .sort(
      (left, right) =>
        right.support - left.support ||
        right.families.size - left.families.size ||
        right.group.length - left.group.length ||
        right.bestConfidence - left.bestConfidence ||
        left.value - right.value,
    );

  // A longer whole-number result may lose the raw vote count because several
  // correlated passes truncated the same trailing glyph. Accept the longer
  // result only when two crop geometries independently contain it. Otherwise
  // keep the field manual instead of silently accepting the short prefix.
  const truncationWinner = ranked
    .filter((candidate) => {
      const wholeNumberCandidates = candidate.group.filter((item) =>
        isWholeNumberSource(item.source),
      );
      const cropFamilies = new Set(
        wholeNumberCandidates.map((item) => cropFamily(item.source)),
      );
      const hasShorterCounterpart = ranked.some(
        (other) =>
          other.value !== candidate.value &&
          isStrictTruncation(other.value, candidate.value),
      );
      const hasIncompatibleCounterpart = ranked.some(
        (other) =>
          other.value !== candidate.value &&
          String(other.value).length < String(candidate.value).length &&
          !isStrictTruncation(other.value, candidate.value),
      );
      return (
        String(candidate.value).length >= 2 &&
        wholeNumberCandidates.length >= 2 &&
        cropFamilies.has("wide") &&
        cropFamilies.has("tight") &&
        candidate.bestConfidence >= minimumConfidence &&
        hasShorterCounterpart &&
        !hasIncompatibleCounterpart
      );
    })
    .sort(
      (left, right) =>
        String(right.value).length - String(left.value).length ||
        right.averageConfidence - left.averageConfidence ||
        left.value - right.value,
    )[0];

  if (truncationWinner) {
    const shorterAlternatives = ranked
      .filter((candidate) =>
        isStrictTruncation(candidate.value, truncationWinner.value),
      )
      .map((candidate) => candidate.value);
    const alternatives = [
      truncationWinner.value,
      ...shorterAlternatives,
      ...ranked.map((candidate) => candidate.value),
    ]
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 3);
    return {
      text: String(truncationWinner.value),
      confidence: Math.min(
        1,
        truncationWinner.averageConfidence +
          Math.min(0.1, truncationWinner.group.length * 0.025),
      ),
      value: truncationWinner.value,
      uncertain: false,
      alternatives,
      ambiguity: null,
      diagnostic: `Nombre entier confirmé sur crops large et serré · lecture courte ${shorterAlternatives.join(" / ")}`,
    };
  }

  const best = ranked[0];
  const runnerUp = ranked[1];
  const supportLead = best.support - (runnerUp?.support ?? 0);
  const ambiguousLength = Boolean(
    runnerUp &&
    (isStrictTruncation(best.value, runnerUp.value) ||
      isStrictTruncation(runnerUp.value, best.value)),
  );
  const ambiguous069 = Boolean(
    runnerUp && differsOnlyInside069(best.value, runnerUp.value),
  );
  const requiredLead = ambiguousLength
    ? Number.POSITIVE_INFINITY
    : ambiguous069
      ? 0.16
      : 0.08;
  const independentConsensus =
    best.group.length >= 2 && best.families.size >= 2;
  const has069Countercheck = best.group.some(
    (candidate) =>
      candidate.source === "word-raw" ||
      candidate.source === "char-raw" ||
      candidate.source === "single-raw" ||
      candidate.source === "shape",
  );
  const accepted = independentConsensus
    ? !runnerUp || supportLead >= requiredLead
    : best.bestConfidence >= minimumConfidence + 0.2 &&
      (!runnerUp || supportLead >= (ambiguous069 ? 0.28 : 0.2));
  const safelyAccepted =
    accepted && !ambiguousLength && (!ambiguous069 || has069Countercheck);
  const confidence = safelyAccepted
    ? Math.min(
        1,
        best.averageConfidence +
          Math.max(0, best.families.size - 1) * 0.06 +
          Math.min(0.08, Math.max(0, supportLead) * 0.08),
      )
    : Math.min(best.bestConfidence, Math.max(0, minimumConfidence - 0.01));
  const alternatives = ranked.slice(0, 3).map((candidate) => candidate.value);

  return {
    text: String(best.value),
    confidence,
    value: safelyAccepted ? best.value : null,
    uncertain: !safelyAccepted,
    alternatives,
    ambiguity: ambiguousLength ? "truncated" : ambiguous069 ? "0/6/9" : null,
    diagnostic: safelyAccepted
      ? `Consensus ${best.families.size} prétraitements · ${best.group.length} passes`
      : ambiguousLength
        ? `Conflit de longueur : ${alternatives.join(" / ")}`
        : ambiguous069
          ? `Conflit 0/6/9 : ${alternatives.join(" / ")}`
          : `Passes OCR en désaccord : ${alternatives.join(" / ")}`,
  };
};
