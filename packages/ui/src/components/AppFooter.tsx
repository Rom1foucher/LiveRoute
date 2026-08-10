import { useLabels } from "../i18n/LanguageContext.tsx";
import { clearDecisionLog, type DecisionSinkStatus } from "@glcp/core";

/**
 * Shared between the browser build and the desktop build, so neither the
 * application version nor the surface name is baked in: both arrive as props.
 * Exporting is likewise injected, because the two surfaces write the log to
 * different places.
 */
type AppFooterProps = {
  appVersion: string;
  surfaceName: string;
  onExport: () => Promise<void>;
  decisionLogError: string | null;
  decisionLogStatus: DecisionSinkStatus | null;
  setDecisionLogError: (value: string | null) => void;
  setDecisionLogStatus: (value: DecisionSinkStatus | null) => void;
};

export function AppFooter({
  appVersion,
  surfaceName,
  onExport,
  decisionLogError,
  decisionLogStatus,
  setDecisionLogError,
  setDecisionLogStatus,
}: AppFooterProps) {
  const L = useLabels();
  return (
    <footer className="app-footer">
      <div>
        <strong>{L.footer.productVersion(appVersion, surfaceName)}</strong>
        <span>{L.footer.localSansCompteDonneesConservees}</span>
        <span>{L.intro.credits}</span>
      </div>
      <div
        className="footer-diagnostics"
        aria-label={L.footer.journalDeDecisions}
      >
        <span>
          {L.footer.logCount(
            decisionLogStatus?.entryCount ?? 0,
            decisionLogStatus?.maximumEntries ?? 500,
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            void onExport().catch((error: unknown) => {
              setDecisionLogError(
                error instanceof Error ? error.message : String(error),
              );
            });
          }}
          disabled={(decisionLogStatus?.entryCount ?? 0) === 0}
        >
          {L.footer.export}
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            void clearDecisionLog()
              .then((status) => {
                setDecisionLogStatus(status);
                setDecisionLogError(null);
              })
              .catch((error: unknown) => {
                setDecisionLogError(
                  error instanceof Error ? error.message : String(error),
                );
              });
          }}
          disabled={(decisionLogStatus?.entryCount ?? 0) === 0}
        >
          {L.footer.clear}
        </button>
      </div>
      {decisionLogError && (
        <p className="decision-log-error">{decisionLogError}</p>
      )}
      <p>{L.footer.disclaimer}</p>
    </footer>
  );
}
