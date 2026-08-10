import { useLabels } from "../i18n/LanguageContext.tsx";
import { TOKEN_KEYS } from "@glcp/core";
import { MiniTokenCost } from "./TokenWidgets.tsx";
import { CONCERTS, type SongFilter, type WorkflowMode } from "../constants.tsx";

import { Song, UnlockPhase } from "@glcp/core";

type SongsPanelProps = {
  availableSongs: Song[];
  carryoverSongIds: string[] | null;
  concert: (typeof CONCERTS)[number];
  lockedSongs: Song[];
  ownedBonusTotals: { friendship: number; speciality: number; event: number };
  ownedSongs: Set<string>;
  ownedUnlockedSongs: Song[];
  pendingBonusCount: number;
  phaseUnlock: UnlockPhase;
  rollNote: string;
  setSongFilter: (value: SongFilter) => void;
  skipEmptySongSelection: () => void;
  songFilter: SongFilter;
  songSelectionOpen: boolean;
  songsToRender: Song[];
  toggleSong: (id: string) => void;
  unlockedSongs: Song[];
  workflowMode: WorkflowMode;
};

export function SongsPanel({
  availableSongs,
  carryoverSongIds,
  concert,
  lockedSongs,
  ownedBonusTotals,
  ownedSongs,
  ownedUnlockedSongs,
  pendingBonusCount,
  phaseUnlock,
  rollNote,
  setSongFilter,
  skipEmptySongSelection,
  songFilter,
  songSelectionOpen,
  songsToRender,
  toggleSong,
  unlockedSongs,
  workflowMode,
}: SongsPanelProps) {
  const L = useLabels();
  return (
    <section className="panel songs-panel">
      <div className="panel-heading song-heading">
        <div>
          <p className="section-kicker">
            {songSelectionOpen
              ? L.songs.poolReference(concert.short)
              : L.songs.dynamicPool(concert.short)}
          </p>
          <h2>
            {songSelectionOpen
              ? L.songs.catalogueDesChansons
              : L.songs.chansonsDuConcert}
          </h2>
        </div>
        <span
          className={`status-pill ${
            songSelectionOpen ? "selection-ready" : "neutral"
          }`}
        >
          {songSelectionOpen
            ? carryoverSongIds
              ? L.songs.carryover
              : L.songs.lectureSeule
            : L.songs.ownedCount(
                ownedUnlockedSongs.length,
                unlockedSongs.length,
              )}
        </span>
      </div>

      <div className="automatic-effect">
        <span className="effect-cover">MD</span>
        <div>
          <strong>{L.songs.makeDebutEffetAutomatique}</strong>
          <small>{L.songs.startingGift}</small>
        </div>
        <span className="live-bonus-chip">{L.songs.afterActivation}</span>
      </div>

      <div className="bonus-totals">
        <div>
          <span>{L.songs.friendshipAcquis}</span>
          <strong>+{ownedBonusTotals.friendship}%</strong>
        </div>
        <div>
          <span>{L.songs.specialityAcquis}</span>
          <strong>+{ownedBonusTotals.speciality}</strong>
          <small>{L.songs.makeDebutInclus}</small>
        </div>
        <div>
          <span>{L.songs.eventChainAcquis}</span>
          <strong>+{ownedBonusTotals.event}</strong>
        </div>
        <p>
          {L.songs.bonusTiming}
          {pendingBonusCount > 0 &&
            ` ${L.songs.pendingBonuses(pendingBonusCount)}`}
        </p>
      </div>

      <div className="pool-summary">
        <div className="pool-stat">
          <span>{L.songs.debloquees}</span>
          <strong>{unlockedSongs.length}</strong>
          <small>{L.songs.sur21Chansons}</small>
        </div>
        <div className="pool-stat">
          <span>{L.songs.dejaAchetees}</span>
          <strong>{ownedUnlockedSongs.length}</strong>
          <small>{L.songs.retireesDeLaPool}</small>
        </div>
        <div className="pool-stat accent">
          <span>{L.songs.encoreDansLaPool}</span>
          <strong>{availableSongs.length}</strong>
          <small>{L.songs.tirablesMaintenant}</small>
        </div>
        <p className="pool-roll-note">{rollNote}</p>
      </div>

      {songSelectionOpen ? (
        <div className="selection-callout">
          <div>
            <strong>{L.songs.poolCompleteEnReference}</strong>
            <span>{L.songs.gridHint}</span>
          </div>
          <span>{L.songs.remainingCount(availableSongs.length)}</span>
        </div>
      ) : (
        <div
          className="song-filters"
          role="group"
          aria-label={L.songs.filtrerLesChansons}
        >
          <button
            type="button"
            className={`song-filter ${songFilter === "available" ? "active" : ""}`}
            onClick={() => setSongFilter("available")}
          >
            {L.songs.filterInPool} <span>{availableSongs.length}</span>
          </button>
          <button
            type="button"
            className={`song-filter ${songFilter === "owned" ? "active" : ""}`}
            onClick={() => setSongFilter("owned")}
          >
            {L.songs.filterOwned} <span>{ownedUnlockedSongs.length}</span>
          </button>
          <button
            type="button"
            className={`song-filter ${songFilter === "locked" ? "active" : ""}`}
            onClick={() => setSongFilter("locked")}
          >
            {L.songs.filterLocked} <span>{lockedSongs.length}</span>
          </button>
        </div>
      )}

      {songsToRender.length > 0 ? (
        <div className="song-grid">
          {songsToRender.map((song) => {
            const owned = ownedSongs.has(song.id);
            const locked = song.unlockPhase > phaseUnlock;
            return (
              <button
                type="button"
                className={`song-card priority-${song.priority} ${
                  owned ? "owned" : ""
                } ${locked ? "locked" : ""}`}
                key={song.id}
                onClick={() => {
                  if (
                    workflowMode === "manual" &&
                    !locked &&
                    !songSelectionOpen
                  ) {
                    toggleSong(song.id);
                  }
                }}
                aria-pressed={
                  workflowMode === "manual" && !locked && !songSelectionOpen
                    ? owned
                    : undefined
                }
                disabled={
                  locked || workflowMode === "live" || songSelectionOpen
                }
              >
                <img src={song.image} alt="" />
                <span className="song-overlay" />
                <span className="song-state">
                  {locked ? "⌁" : owned ? "✓" : "+"}
                </span>
                {song.priority !== "normal" && (
                  <span className={`priority-badge ${song.priority}`}>
                    {song.priority === "top"
                      ? L.songs.topPriorite
                      : L.songs.priority}
                  </span>
                )}
                <span className="song-copy">
                  <strong>{song.name}</strong>
                  {song.priorityReason && (
                    <small className="priority-reason">
                      {song.priorityReason}
                    </small>
                  )}
                  <span className="song-bonus practice">
                    <em>{L.songs.aLachat}</em>
                    {song.practiceBonus}
                  </span>
                  <span className="song-bonus live">
                    <em>{L.songs.apresConcert}</em>
                    {song.liveBonus}
                  </span>
                  <span className="song-costs">
                    {TOKEN_KEYS.map((key) => (
                      <MiniTokenCost
                        key={key}
                        tokenKey={key}
                        value={song.cost[key]}
                      />
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-pool">
          <strong>{L.songs.aucuneChansonIci}</strong>
          <span>
            {workflowMode === "live" && songSelectionOpen
              ? L.songs.laPoolDeChansonsDe
              : L.songs.changeDeFiltreOuAvance}
          </span>
          {workflowMode === "live" && songSelectionOpen && (
            <button type="button" onClick={skipEmptySongSelection}>
              {L.songs.continueCycle}
            </button>
          )}
        </div>
      )}

      <p className="songs-note">
        {workflowMode === "manual"
          ? songSelectionOpen
            ? L.songs.cetteGrilleEstEnLecture
            : L.songs.cliqueUneChansonPourReconstruire
          : songSelectionOpen
            ? L.songs.cetteGrilleEstEnLecture2
            : L.songs.laPoolEstEnLecture}
      </p>
    </section>
  );
}
