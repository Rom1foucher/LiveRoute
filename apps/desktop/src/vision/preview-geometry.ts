export type ContainedFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Computes the exact box occupied by an object-fit: contain image.
 * Calibration rectangles can then use this box as their own coordinate space
 * instead of the letterboxed preview container.
 */
export const fitContainedFrame = (
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ContainedFrame => {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
};
