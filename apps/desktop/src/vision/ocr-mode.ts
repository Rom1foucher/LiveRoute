export type AtlasRecognitionMode =
  "mixed" | "technique-costs" | "number-line" | "single-number";

export type AtlasSegmentationIntent =
  "sparse-text" | "single-block" | "single-word" | "single-char";

/**
 * SINGLE_WORD and SINGLE_CHAR describe the entire input image, not each crop
 * embedded in an OCR atlas. When an atlas contains several placements, those
 * modes can return no word at all. Multi-crop numeric atlases therefore use
 * sparse segmentation; the original strict mode is kept once only one learned
 * crop is retried later.
 */
export const segmentationIntentForAtlas = (
  mode: AtlasRecognitionMode,
  placementCount: number,
): AtlasSegmentationIntent => {
  if (mode === "mixed") return "sparse-text";
  if (mode === "technique-costs") return "single-block";
  if (placementCount > 1) return "sparse-text";
  return mode === "single-number" ? "single-char" : "single-word";
};
