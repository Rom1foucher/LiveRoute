import { useLabels } from "../i18n/LanguageContext.tsx";
import {
  CONCERTS,
  pulseConfidenceLabels,
  pulseScoreLabel,
} from "../constants.tsx";

import {
  PulseConcertEvent,
  PulseOfferEvent,
  PulsePurchaseEvent,
  RunPulseEvent,
  RunPulseSummary,
} from "@glcp/core";

type RunPulsePanelProps = {
  latestPulseConcert: PulseConcertEvent | undefined;
  latestPulseOffer: PulseOfferEvent | undefined;
  latestPulsePurchase: PulsePurchaseEvent | undefined;
  runPulseBeta: boolean;
  runPulseEvents: RunPulseEvent[];
  runPulseSummary: RunPulseSummary;
};

export function RunPulsePanel({
  latestPulseConcert,
  latestPulseOffer,
  latestPulsePurchase,
  runPulseBeta,
  runPulseEvents,
  runPulseSummary,
}: RunPulsePanelProps) {
  const L = useLabels();
  if (!runPulseBeta) return null;
  return (
    <section className="run-pulse-panel">
      <div className="run-pulse-heading">
        <div>
          <span className="beta-badge">{L.pulse.betaBadge}</span>
          <div>
            <strong>{L.pulse.runPulse}</strong>
            <small>{L.pulse.lede}</small>
          </div>
        </div>
        <span
          className={`pulse-confidence confidence-${runPulseSummary.confidence}`}
        >
          {L.pulse.confidence(
            pulseConfidenceLabels(L)[runPulseSummary.confidence],
          )}
        </span>
      </div>

      <div className="run-pulse-metrics">
        <div className="pulse-metric luck">
          <span>{L.pulse.luckObservee}</span>
          <strong>{runPulseSummary.luck}</strong>
          <small>{pulseScoreLabel(runPulseSummary.luck, "luck", L)}</small>
        </div>
        <div className="pulse-metric value">
          <span>{L.pulse.runValue}</span>
          <strong>{runPulseSummary.value}</strong>
          <small>{pulseScoreLabel(runPulseSummary.value, "value", L)}</small>
        </div>
        <div className="pulse-metric projection">
          <span>{L.pulse.projection}</span>
          <strong>{runPulseSummary.projection}</strong>
          <small>
            {pulseScoreLabel(runPulseSummary.projection, "projection", L)}
          </small>
        </div>
        <div className="pulse-sample">
          <span>{L.pulse.donneesObservees}</span>
          <strong>
            {L.pulse.sampleCounts(
              runPulseSummary.observedOffers,
              runPulseSummary.trackedPurchases,
            )}
          </strong>
          <small>{L.pulse.regression}</small>
        </div>
      </div>

      <div className="run-pulse-insights">
        {latestPulseOffer ? (
          <p>
            <span>{L.pulse.dernierTirage}</span>
            <strong>
              {latestPulseOffer.bestSongName} ·{" "}
              {L.pulse.percentile(
                Math.round(latestPulseOffer.percentile * 100),
              )}
            </strong>
          </p>
        ) : (
          <p>
            <span>{L.pulse.enAttente}</span>
            <strong>{L.pulse.empty}</strong>
          </p>
        )}
        {latestPulsePurchase?.isSkillPointSong && (
          <p>
            <span>{L.pulse.timingSp}</span>
            <strong>
              {latestPulsePurchase.songName} ·{" "}
              {latestPulsePurchase.timing === "early"
                ? L.pulse.obtenueTot
                : latestPulsePurchase.timing === "late"
                  ? L.pulse.obtainedLate
                  : latestPulsePurchase.timing === "carryover"
                    ? L.pulse.acheteeEnCarryover
                    : L.pulse.averageTiming}
            </strong>
          </p>
        )}
        {latestPulseConcert && (
          <p>
            <span>{L.pulse.dernierConcert}</span>
            <strong>
              {L.pulse.songCount(latestPulseConcert.songsBought)} ·{" "}
              {latestPulseConcert.greatSuccess
                ? L.pulse.greatSuccess
                : L.pulse.successStandard}
            </strong>
          </p>
        )}
      </div>

      {runPulseEvents.length > 0 && (
        <details className="run-pulse-timeline">
          <summary>{L.pulse.timeline(runPulseEvents.length)}</summary>
          <div>
            {[...runPulseEvents]
              .reverse()
              .slice(0, 10)
              .map((event) => (
                <p key={event.id}>
                  <span>
                    {CONCERTS[event.concertIndex]?.short ??
                      `C${event.concertIndex + 1}`}
                  </span>
                  <strong>
                    {event.type === "song-offer"
                      ? `${L.pulse.selectionNo(event.songCycle)} · ${L.pulse.percentile(
                          Math.round(event.percentile * 100),
                        )}`
                      : event.type === "song-purchase"
                        ? L.pulse.purchaseOf(event.songName)
                        : `${L.pulse.songCount(event.songsBought)} · ${
                            event.greatSuccess
                              ? L.pulse.greatSuccess
                              : L.pulse.success
                          }`}
                  </strong>
                </p>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}
