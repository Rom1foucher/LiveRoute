import { useLabels } from "../i18n/LanguageContext.tsx";
import { type LiveSnapshot, type WorkflowMode } from "../constants.tsx";

type WorkflowBarProps = {
  concertIndex: number;
  enterPostGrandLive: () => void;
  history: LiveSnapshot[];
  postGrandLive: boolean;
  postGrandLiveBlocked: boolean;
  resetRun: () => void;
  runPulseBeta: boolean;
  runPulseStartedAtConcert: number | null;
  setRunPulseBeta: (value: boolean) => void;
  setRunPulseStartedAtConcert: (value: number | null) => void;
  setWorkflowMode: (value: WorkflowMode) => void;
  undoLastLiveAction: () => void;
  workflowMode: WorkflowMode;
};

export function WorkflowBar({
  concertIndex,
  enterPostGrandLive,
  history,
  postGrandLive,
  postGrandLiveBlocked,
  resetRun,
  runPulseBeta,
  runPulseStartedAtConcert,
  setRunPulseBeta,
  setRunPulseStartedAtConcert,
  setWorkflowMode,
  undoLastLiveAction,
  workflowMode,
}: WorkflowBarProps) {
  const L = useLabels();
  return (
    <section className="workflow-bar" aria-label={L.workflow.modeDeSuivi}>
      <div className="workflow-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={workflowMode === "live"}
          className={workflowMode === "live" ? "active" : ""}
          onClick={() => setWorkflowMode("live")}
        >
          <span>●</span>
          {L.workflow.live}
          <small>{L.workflow.lesAchatsFontAvancerLa}</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workflowMode === "manual"}
          className={workflowMode === "manual" ? "active" : ""}
          onClick={() => setWorkflowMode("manual")}
        >
          <span>⌁</span>
          {L.workflow.manual}
          <small>{L.workflow.reconstituerUnPointPrecis}</small>
        </button>
      </div>
      <div className="workflow-actions">
        <label
          className={`beta-feature-toggle ${runPulseBeta ? "active" : ""}`}
        >
          <input
            type="checkbox"
            checked={runPulseBeta}
            onChange={(event) => {
              const enabled = event.target.checked;
              setRunPulseBeta(enabled);
              if (enabled && runPulseStartedAtConcert === null) {
                setRunPulseStartedAtConcert(concertIndex);
              }
            }}
          />
          <span>{L.workflow.beta}</span>
          <strong>{L.workflow.runPulse}</strong>
          <i aria-hidden="true" />
        </label>
        <button
          type="button"
          className="utility-button"
          disabled={history.length === 0}
          onClick={undoLastLiveAction}
        >
          {L.workflow.undo}
        </button>
        {postGrandLive ? (
          <span className="utility-button active">
            {L.workflow.postGrandLiveActive}
          </span>
        ) : (
          <button
            type="button"
            className="utility-button"
            disabled={postGrandLiveBlocked}
            onClick={enterPostGrandLive}
            title={L.workflow.postGrandLiveHint}
          >
            {L.workflow.postGrandLive}
          </button>
        )}
        <button type="button" className="utility-button" onClick={resetRun}>
          {L.workflow.reset}
        </button>
      </div>
    </section>
  );
}
