import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@glcp/ui/styles";
import { configureDecisionLog, readDecisionLog } from "@glcp/core";
import { browserDecisionSession } from "@glcp/core/adapters/browser";
import {
  downloadDecisionLog,
  tauriDecisionSink,
} from "./adapters/tauri-decision-sink.ts";
import OverlayView from "./vision/OverlayView.tsx";
import { DesktopShell } from "./DesktopShell.tsx";
import "./vision/snapshot.css";
import { APP_VERSION } from "./version.ts";

/**
 * Same shell as the browser build. The desktop differs by exactly two things:
 * the sink it writes the decision log to, and the OCR cockpit it drops into
 * two slots (`DesktopShell`). Nothing here re-implements a screen.
 */
configureDecisionLog({
  appVersion: APP_VERSION,
  sink: tauriDecisionSink(),
  session: browserDecisionSession(),
});

const exportDecisionLog = async () => {
  downloadDecisionLog(await readDecisionLog());
};

/** The capture overlay is a separate window, so it bypasses the shell. */
const overlayMode =
  new URLSearchParams(window.location.search).get("overlay") === "1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {overlayMode ? (
      <OverlayView />
    ) : (
      <DesktopShell
        appVersion={APP_VERSION}
        onExportDecisionLog={exportDecisionLog}
      />
    )}
  </StrictMode>,
);
