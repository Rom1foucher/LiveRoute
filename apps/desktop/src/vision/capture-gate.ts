export type CaptureGate = {
  begin: () => number | null;
  isCurrent: (generation: number) => boolean;
  finish: (generation: number) => void;
  invalidate: () => void;
};

/**
 * Serializes OCR work and rejects stale completions. Hotkeys, buttons and file
 * imports all share the same gate so the mutable Tesseract worker is never
 * driven by two snapshots concurrently.
 */
export const createCaptureGate = (): CaptureGate => {
  let inFlight = false;
  let generation = 0;
  return {
    begin: () => {
      if (inFlight) return null;
      inFlight = true;
      generation += 1;
      return generation;
    },
    isCurrent: (candidate) => inFlight && candidate === generation,
    finish: (candidate) => {
      if (candidate === generation) inFlight = false;
    },
    invalidate: () => {
      generation += 1;
      inFlight = false;
    },
  };
};
