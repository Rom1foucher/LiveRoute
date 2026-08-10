import { useLanguage } from "../i18n/LanguageContext.tsx";
import { CONCERTS } from "../constants.tsx";
import { canAfford } from "@glcp/core";

import { isGreatSuccess } from "@glcp/core";

import { policyActionLabel } from "../constants.tsx";

import { totalCost } from "@glcp/core";

import {
  ActionsView,
  DiagnosticsView,
  DisplayView,
  RunView,
  SettingsView,
  SolverView,
} from "../view-model.ts";

type ProgressPanelProps = {
  actions: ActionsView;
  diagnostics: DiagnosticsView;
  display: DisplayView;
  run: RunView;
  settings: SettingsView;
  solver: SolverView;
};

export function ProgressPanel({
  actions,
  diagnostics,
  display,
  run,
  settings,
  solver,
}: ProgressPanelProps) {
  const { L, t } = useLanguage();
  const {
    advanceConcert,
    buySong,
    recordTechniquePurchase,
    setSongCycle,
    setSongsThisSection,
    setTechniquesDone,
    toggleVisibleSong,
  } = actions;
  const { songChoiceAssessments } = diagnostics;
  const { displayedOverride, displayedSongId, displayedSongPolicy } = display;
  const {
    automaticGaugeSongs,
    availableSongs,
    carryoverPolicy,
    carryoverSongIds,
    concertIndex,
    concertTransitionBlock,
    expectedOfferCount,
    gaugeSongs,
    manualGaugeTarget,
    nextSongCover,
    patternUnsupported,
    remaining,
    selectionSongs,
    shouldCarryVisibleSongPage,
    songCycle,
    songOfferComplete,
    songSelectionOpen,
    songsThisSection,
    target,
    techniquesDone,
    tokens,
    visibleSongIds,
    workflowMode,
  } = run;
  const { dynamicSpending } = settings;
  const { songPolicy } = solver;

  return (
    <section className="panel progress-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{L.progress.progressionStructurelle}</p>
          <h2>{L.meta.concertTitles[concertIndex]}</h2>
        </div>
        <span className="status-pill neutral">
          {L.progress.songCycle(songCycle)}
        </span>
      </div>

      {workflowMode === "manual" ? (
        <div className="cycle-controls">
          <div>
            <span className="control-label">
              {L.progress.songSelectionLabel}
            </span>
            <div className="stepper">
              <button
                type="button"
                onClick={() => {
                  setSongCycle(Math.max(1, songCycle - 1));
                  setTechniquesDone(0);
                }}
              >
                −
              </button>
              <strong>#{songCycle}</strong>
              <button
                type="button"
                onClick={() => {
                  setSongCycle(songCycle + 1);
                  setTechniquesDone(0);
                }}
              >
                +
              </button>
            </div>
          </div>
          <div>
            <span className="control-label">{L.progress.techniquesTaken}</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() =>
                  setTechniquesDone(Math.max(0, techniquesDone - 1))
                }
              >
                −
              </button>
              <strong>
                {patternUnsupported
                  ? L.progress.nonMesure
                  : `${techniquesDone} / ${target}`}
              </strong>
              <button
                type="button"
                onClick={() =>
                  !patternUnsupported &&
                  setTechniquesDone(Math.min(target, techniquesDone + 1))
                }
              >
                +
              </button>
            </div>
          </div>
          <div>
            <span className="control-label">{L.progress.songsThisSection}</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() =>
                  setSongsThisSection(Math.max(0, songsThisSection - 1))
                }
              >
                −
              </button>
              <strong>
                {songsThisSection} / {manualGaugeTarget}
              </strong>
              <button
                type="button"
                onClick={() => setSongsThisSection(songsThisSection + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="live-progress-strip">
          <div>
            <span>{L.progress.cycleActuel}</span>
            <strong>{L.progress.songNumber(songCycle)}</strong>
          </div>
          <div>
            <span>{L.progress.progression}</span>
            <strong>
              {patternUnsupported
                ? L.progress.patternJuniorNonEtabli
                : L.progress.techniqueProgress(techniquesDone, target)}
            </strong>
          </div>
          <div
            className={
              isGreatSuccess(concertIndex, songsThisSection) ? "ready" : ""
            }
          >
            <span>{L.progress.greatSuccess}</span>
            <strong>
              {L.progress.gaugeDetail(
                gaugeSongs,
                songsThisSection,
                automaticGaugeSongs,
              )}
            </strong>
          </div>
          <div className={songSelectionOpen ? "ready" : ""}>
            <span>{L.progress.etat}</span>
            <strong>
              {carryoverSongIds
                ? L.progress.carryoverAAcheter
                : remaining === 0
                  ? L.progress.songDebloquee
                  : L.progress.remainingCount(remaining)}
            </strong>
          </div>
        </div>
      )}

      <div className="lesson-route">
        {Array.from({ length: target }, (_, index) => (
          <div
            className={`route-step ${index < techniquesDone ? "done" : ""} ${index === techniquesDone ? "current" : ""}`}
            key={index}
          >
            <span>{index < techniquesDone ? "✓" : index + 1}</span>
            <small>{L.progress.technique}</small>
          </div>
        ))}
        {patternUnsupported && (
          <div className="route-step current">
            <span>?</span>
            <small>{L.progress.cycleJuniorGt7Non}</small>
          </div>
        )}
        <div className={`route-song ${remaining === 0 ? "reached" : ""}`}>
          <img src={nextSongCover} alt="" />
          <span>
            <small>{L.progress.objectif}</small>
            <strong>{L.progress.selectionSong}</strong>
          </span>
        </div>
      </div>
      <div className="route-summary">
        <strong>
          {carryoverSongIds
            ? L.progress.selectionCarryoverEncoreOuverte
            : remaining === 0
              ? L.progress.selectionAtteinte
              : L.progress.techniquesBeforeSong(remaining)}
        </strong>
        <span>
          {carryoverSongIds
            ? L.progress.acheteLaChansonReserveeAvant
            : L.progress.leCarryoverViseLaSelection}
        </span>
      </div>

      {songSelectionOpen && (
        <div className="song-selection-focus">
          <div className="selection-focus-heading">
            <div>
              <p className="section-kicker">{L.progress.priorityDecision}</p>
              <h3>
                {carryoverSongIds !== null
                  ? L.progress.selectionConservee
                  : workflowMode === "live"
                    ? L.progress.indiqueLesSongsVisibles
                    : L.progress.reconstitueLesTroisChoixVisibles}
              </h3>
            </div>
            <span
              className={`offer-count ${songOfferComplete ? "complete" : ""}`}
            >
              {selectionSongs.length} / {expectedOfferCount}
            </span>
          </div>

          {carryoverSongIds === null && (
            <>
              <p className="selection-help">{L.progress.threeClicks}</p>
              <div className="offer-picker-grid">
                {availableSongs.map((song) => {
                  const selected = visibleSongIds.has(song.id);
                  return (
                    <button
                      type="button"
                      className={`offer-picker ${
                        selected ? "selected" : ""
                      } priority-${song.priority}`}
                      key={song.id}
                      onClick={() => toggleVisibleSong(song.id)}
                      aria-pressed={selected}
                    >
                      <img src={song.image} alt="" />
                      <span>
                        <strong>{song.name}</strong>
                        <small>
                          {song.priorityReason ?? song.practiceBonus}
                        </small>
                      </span>
                      <i>{selected ? "✓" : "+"}</i>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {selectionSongs.length > 0 && (
            <div className="current-song-offers">
              {selectionSongs.map((song) => {
                const bestPolicy = songPolicy?.policies
                  .filter(
                    (policy) =>
                      policy.songId === song.id &&
                      policy.action.startsWith("buy-") &&
                      policy.valid,
                  )
                  .sort((a, b) => b.score - a.score)[0];
                const assessment = songChoiceAssessments.find(
                  (item) => item.songId === song.id,
                );
                const recommended = displayedSongId === song.id;
                return (
                  <div
                    className={`current-song-card ${
                      assessment?.safety === "hard-blocking"
                        ? "blocking"
                        : recommended
                          ? displayedOverride
                            ? "override-recommended"
                            : "recommended"
                          : assessment?.safety === "safe-alternative"
                            ? "safe-alternative-choice"
                            : ""
                    }`}
                    key={song.id}
                  >
                    <img src={song.image} alt="" />
                    <div>
                      <span className="song-offer-label">
                        {assessment?.safety === "hard-blocking"
                          ? recommended
                            ? L.progress.moinsMauvaisChoixBloquant
                            : L.progress.blockingChoice
                          : recommended
                            ? displayedOverride
                              ? L.progress.overridePushForce
                              : L.progress.recommandee
                            : assessment?.safety === "safe-alternative"
                              ? L.progress.alternativeSure
                              : song.priority !== "normal"
                                ? L.progress.priorityChoice
                                : L.progress.choixVisible}
                      </span>
                      <strong>{song.name}</strong>
                      <small>{song.practiceBonus}</small>
                      {bestPolicy && (
                        <em>
                          {policyActionLabel(
                            bestPolicy.action,
                            L,
                            bestPolicy.continuationRecommendation,
                          )}{" "}
                          ·{" "}
                          {L.progress.nextChance(
                            Math.round(bestPolicy.nextSongProbability * 100),
                          )}
                        </em>
                      )}
                      {assessment?.blocking && (
                        <em className="blocking-detail">
                          {t(assessment.blocking.detail)}
                        </em>
                      )}
                    </div>
                    {workflowMode === "live" && (
                      <button
                        type="button"
                        onClick={() => buySong(song)}
                        disabled={
                          dynamicSpending && !canAfford(tokens, song.cost)
                        }
                        title={
                          dynamicSpending && !canAfford(tokens, song.cost)
                            ? L.progress.soldeInsuffisantPourCetteChanson
                            : undefined
                        }
                      >
                        {dynamicSpending
                          ? L.progress.buyFor(totalCost(song.cost))
                          : L.progress.achetee}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {displayedSongPolicy && (
            <div
              className={`focus-recommendation ${displayedOverride ? "override" : ""}`}
            >
              <span>{L.progress.conseil}</span>
              <strong>
                {policyActionLabel(
                  displayedSongPolicy.action,
                  L,
                  displayedSongPolicy.continuationRecommendation,
                )}
                {displayedSongPolicy.action.startsWith("buy-") &&
                  ` · ${displayedSongPolicy.songName}`}
              </strong>
              <small>
                {displayedSongPolicy.reasons.slice(0, 2).join(" · ")}
              </small>
            </div>
          )}
        </div>
      )}

      {workflowMode === "live" && (
        <div className="structural-action">
          <div>
            <strong>
              {songSelectionOpen
                ? L.progress.selectionDeChansonOuverte
                : dynamicSpending
                  ? L.progress.choisisLoptionReellementAchetee
                  : L.progress.tuViensDacheterUneTechnique}
            </strong>
            <small>
              {dynamicSpending
                ? L.progress.leBoutonSeTrouveDans
                : L.progress.aucunCoutASaisirLe}
            </small>
          </div>
          <button
            type="button"
            onClick={() => recordTechniquePurchase()}
            disabled={songSelectionOpen || dynamicSpending}
          >
            {dynamicSpending
              ? L.progress.choisirDansLesOptions
              : L.progress.techniqueAchetee}
            {!dynamicSpending && <span>+1</span>}
          </button>
        </div>
      )}

      {workflowMode === "live" && concertIndex < CONCERTS.length - 1 && (
        <div className="concert-actions">
          <span>
            {remaining === 0
              ? displayedSongPolicy?.action === "stop-and-carry-stock"
                ? L.progress.leConcertArriveAbandonneCette
                : L.progress.leConcertArriveGardeCette
              : L.progress.quandCeConcertEstJoue}
          </span>
          <div className="concert-action-buttons">
            {/*
              v0.22.16 collapsed the two-button model into one. The page that is
              open when the concert is played is the page that gets carried, so
              there is no choice left to offer: a second button could only ask
              the user to discard information the game does not discard.
            */}
            <button
              type="button"
              className={shouldCarryVisibleSongPage ? "carryover-action" : ""}
              onClick={() => advanceConcert()}
              disabled={concertTransitionBlock !== null}
            >
              {remaining === 0
                ? L.progress.concertPlayedTo(CONCERTS[concertIndex + 1].short)
                : L.progress.nextConcert(CONCERTS[concertIndex + 1].short)}
            </button>
            {shouldCarryVisibleSongPage && (
              <div className="carryover-chip">
                <span className="pulse-dot" />
                {L.progress.pageSongsPorteeAutomatiquement(
                  carryoverPolicy?.songName ?? L.progress.chosenTarget,
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
