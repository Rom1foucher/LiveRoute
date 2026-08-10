export type NumericReading = {
  text: string;
  confidence: number;
};

export type LearnedNumericReading = NumericReading & {
  learnedSource: "template" | "tesseract";
};

export const shouldPreferLearnedNumericReading = (
  current: NumericReading | undefined,
  learned: LearnedNumericReading,
): boolean => {
  if (learned.learnedSource === "template" && learned.confidence >= 0.92) {
    return true;
  }
  return !current || learned.confidence > current.confidence;
};
