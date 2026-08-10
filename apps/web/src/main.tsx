import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, LanguageProvider } from "@glcp/ui";
import "@glcp/ui/styles";
import { configureDecisionLog, readDecisionLog } from "@glcp/core";
import {
  browserDecisionSession,
  browserDecisionSink,
  downloadDecisionLog,
} from "@glcp/core/adapters/browser";
import { APP_VERSION } from "./version.ts";

/**
 * The whole browser surface. Everything visible comes from `@glcp/ui`; this
 * file only decides which adapters the shared shell runs on and who it says it
 * is. Adding a capability here means filling a slot, never forking the shell.
 */
configureDecisionLog({
  appVersion: APP_VERSION,
  sink: browserDecisionSink(),
  session: browserDecisionSession(),
});

const exportDecisionLog = async () => {
  downloadDecisionLog(await readDecisionLog());
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <App
        appVersion={APP_VERSION}
        surfaceName="Web"
        onExportDecisionLog={exportDecisionLog}
      />
    </LanguageProvider>
  </StrictMode>,
);
