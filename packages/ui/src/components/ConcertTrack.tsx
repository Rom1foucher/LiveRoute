import { useLabels } from "../i18n/LanguageContext.tsx";
import { CONCERTS, type WorkflowMode } from "../constants.tsx";

type ConcertTrackProps = {
  chooseConcert: (index: number) => void;
  concertIndex: number;
  workflowMode: WorkflowMode;
};

export function ConcertTrack({
  chooseConcert,
  concertIndex,
  workflowMode,
}: ConcertTrackProps) {
  const L = useLabels();
  return (
    <nav className="concert-track" aria-label={L.track.progressionDesConcerts}>
      <div className="track-line" />
      {CONCERTS.map((item, index) => {
        const active = index === concertIndex;
        const done = index < concertIndex;
        return (
          <button
            className={`concert-node ${active ? "active" : ""} ${done ? "done" : ""}`}
            type="button"
            key={item.short}
            onClick={() => chooseConcert(index)}
            disabled={workflowMode === "live"}
            title={
              workflowMode === "live"
                ? L.track.leConcertAvanceViaLes
                : undefined
            }
          >
            <span className="node-dot">{done ? "✓" : item.short}</span>
            <strong>{L.meta.concertTitles[index]}</strong>
            <small>{L.meta.concertDates[index]}</small>
          </button>
        );
      })}
    </nav>
  );
}
