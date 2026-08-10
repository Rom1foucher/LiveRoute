import { useEffect, useState } from "react";
import type { OverlayPayload } from "./types.ts";
import { isDesktopRuntime } from "./desktop.ts";
import { rectToCss } from "./profile.ts";

const EMPTY_PAYLOAD: OverlayPayload = {
  language: "fr",
  visible: false,
  loading: false,
  page: "unknown",
  headline: "",
  summary: "",
  path: [],
  overrideActive: false,
  confidence: 0,
  boxes: [],
  tokenValues: [],
};

export default function OverlayView() {
  const [payload, setPayload] = useState<OverlayPayload>(EMPTY_PAYLOAD);

  useEffect(() => {
    document.documentElement.dataset.overlay = "true";
    document.body.dataset.overlay = "true";
    if (!isDesktopRuntime()) return undefined;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const [{ listen }, { getCurrentWindow }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/window"),
      ]);
      await getCurrentWindow().setIgnoreCursorEvents(true);
      const stop = await listen<OverlayPayload>(
        "grand-live-vision-overlay",
        (event) => {
          if (!disposed) setPayload(event.payload);
        },
      );
      if (disposed) stop();
      else unlisten = stop;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!payload.visible) return null;

  return (
    <main className="vision-overlay-stage" aria-hidden="true">
      {payload.tokenValues.map((token) => (
        <div
          className={`vision-overlay-token token-${token.token} ${
            token.confidence >= 0.8
              ? "good"
              : token.confidence >= 0.58
                ? "medium"
                : "bad"
          }`}
          style={{
            left: `${(token.rect.x + token.rect.width / 2) * 100}%`,
            top: `${(token.rect.y + token.rect.height + 0.006) * 100}%`,
          }}
          key={token.token}
        >
          <span>OCR</span>
          <strong>{token.value}</strong>
        </div>
      ))}
      {payload.boxes.map((box, index) => (
        <div
          className={`vision-overlay-box ${box.tone}`}
          style={rectToCss(box.rect)}
          key={`${box.tone}-${index}`}
        >
          <span>{box.label}</span>
          {box.detail && <small>{box.detail}</small>}
        </div>
      ))}
      {(payload.headline || payload.summary) && (
        <div
          className={`vision-overlay-message ${
            payload.loading
              ? "loading"
              : payload.overrideActive
                ? "override"
                : ""
          }`}
        >
          <span>
            {payload.loading
              ? payload.language === "fr"
                ? "Solveur"
                : "Solver"
              : payload.overrideActive
                ? payload.language === "fr"
                  ? "Override · push forcé"
                  : "Override · forced push"
                : payload.page === "songs"
                  ? "Song"
                  : payload.language === "fr"
                    ? "Technique"
                    : "Technique"}
          </span>
          <strong className={payload.loading ? "loading-title" : undefined}>
            {payload.loading && (
              <i className="vision-overlay-spinner" aria-hidden="true" />
            )}
            {payload.headline}
          </strong>
          {payload.summary && <p>{payload.summary}</p>}
          {payload.path.length > 0 && (
            <ol>
              {payload.path.slice(0, 3).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          {payload.warning && <em>{payload.warning}</em>}
          {!payload.loading && (
            <small>
              {payload.language === "fr" ? "Confiance OCR" : "OCR confidence"}{" "}
              {Math.round(payload.confidence * 100)} %
            </small>
          )}
        </div>
      )}
    </main>
  );
}
