import type {
  OverlayPayload,
  OverlayTokenValue,
  VisionDecision,
  VisionProfile,
  VisionSnapshot,
} from "./types.ts";
import { TOKEN_KEYS } from "@glcp/core";
import type { Language } from "@glcp/core/i18n";

export const tokenOverlayValues = (
  snapshot: Pick<VisionSnapshot, "tokens">,
  regions: VisionProfile["regions"]["tokens"],
): OverlayTokenValue[] =>
  TOKEN_KEYS.map((token) => ({
    token,
    rect: regions[token],
    value:
      snapshot.tokens[token].value === null
        ? "?"
        : String(snapshot.tokens[token].value),
    confidence: snapshot.tokens[token].confidence,
  }));

/**
 * Builds the two decision-independent overlay states. Keeping this pure makes
 * the crucial OCR -> loading transition testable without mounting the TSX UI.
 */
export const pendingOverlayPayload = (
  snapshot: Pick<VisionSnapshot, "page" | "pageConfidence">,
  decision: Pick<VisionDecision, "loading" | "stale" | "headline" | "summary">,
  language: Language,
): OverlayPayload | null => {
  if (decision.loading) {
    return {
      language,
      visible: true,
      loading: true,
      page: snapshot.page,
      headline: decision.headline,
      summary: decision.summary,
      path: [],
      overrideActive: false,
      confidence: snapshot.pageConfidence,
      boxes: [],
      tokenValues: [],
    };
  }
  if (decision.stale) {
    return {
      language,
      visible: false,
      loading: false,
      page: snapshot.page,
      headline: "",
      summary: "",
      path: [],
      overrideActive: false,
      confidence: snapshot.pageConfidence,
      boxes: [],
      tokenValues: [],
    };
  }
  return null;
};
