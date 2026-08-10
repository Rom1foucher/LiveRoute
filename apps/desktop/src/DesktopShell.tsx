import { useState } from "react";
import { App, LanguageProvider, type UiSlots } from "@glcp/ui";
import { SnapshotSlot } from "./SnapshotSlot.tsx";

type DesktopShellProps = {
  appVersion: string;
  onExportDecisionLog: () => Promise<void>;
};

/**
 * `SnapshotCompanionPanel` renders nothing while closed, so the button that
 * opens it cannot live inside the same slot as the panel — the two need to be
 * mounted independently (`topBarActions` and `decisionAside`) while sharing
 * one open/closed state. This component is that shared state, and nothing
 * else: it owns no run data, only whether the cockpit is visible.
 *
 * "Live OCR" is left untranslated on purpose, matching the original desktop
 * build: it names a feature, not a sentence.
 */
export function DesktopShell({
  appVersion,
  onExportDecisionLog,
}: DesktopShellProps) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  const slots: UiSlots = {
    topBarActions: ({ run }) => (
      <button
        type="button"
        className="snapshot-launch-button"
        onClick={() => setSnapshotOpen(true)}
      >
        <span className="snapshot-launch-icon" aria-hidden="true">
          ◎
        </span>
        <span className="snapshot-launch-text">
          <strong>Live OCR</strong>
          <small>{run.songSelectionOpen ? "Songs" : "Techniques"}</small>
        </span>
      </button>
    ),
    decisionAside: (context) => (
      <SnapshotSlot
        {...context}
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
      />
    ),
  };

  return (
    <LanguageProvider>
      <App
        appVersion={appVersion}
        surfaceName="Desktop"
        onExportDecisionLog={onExportDecisionLog}
        slots={slots}
      />
    </LanguageProvider>
  );
}
