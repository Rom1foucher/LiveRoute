import { useLanguage } from "../i18n/LanguageContext.tsx";
import { emptyQuickBuilder } from "../constants.tsx";
import { canAfford } from "@glcp/core";
import {
  getBaseTechniqueCost,
  getDualTechniqueCost,
  getDualTechniqueSplit,
  getDuoSplitSecondaryToken,
  getTechniqueLevelOptions,
} from "@glcp/core";

import { GenerationProfile, RiskProfile } from "@glcp/core";
import {
  generationLabels,
  RISK_LABELS,
  TOKEN_META,
  tokenPressureLabels,
  tokenMarginLabel,
} from "../constants.tsx";
import { TokenInput, TokenReservePlanCard } from "./TokenWidgets.tsx";

import { TOKEN_KEYS, type TokenKey } from "@glcp/core";

import {
  ActionsView,
  DiagnosticsView,
  DisplayView,
  RunView,
  SettingsView,
  SolverView,
  TechniqueEntryView,
} from "../view-model.ts";

type DecisionColumnProps = {
  actions: ActionsView;
  diagnostics: DiagnosticsView;
  display: DisplayView;
  entry: TechniqueEntryView;
  run: RunView;
  settings: SettingsView;
  solver: SolverView;
};

export function DecisionColumn({
  actions,
  diagnostics,
  display,
  entry,
  run,
  settings,
  solver,
}: DecisionColumnProps) {
  const { L, t } = useLanguage();
  const {
    changeForcePushOverride,
    recordTechniquePurchase,
    runCurrentAnalysis,
    setAnalysisOpen,
    setTokenValue,
  } = actions;
  const { techniqueChoiceAssessments } = diagnostics;
  const {
    analysisOpen,
    displayedOverride,
    displayedTechniqueIndex,
    forcePushOverride,
  } = display;
  const {
    candidateCosts,
    candidateTotals,
    commitQuickBuilder,
    cycleTechniqueKind,
    hasIncompleteQuickOption,
    quickBuilders,
    resetTechniqueOptions,
    setCandidateValue,
    toggleTechniqueToken,
  } = entry;
  const {
    automaticGaugeSongs,
    availableSongs,
    expectedOfferCount,
    gaugeSongs,
    ownedSongs,
    remaining,
    selectionSongs,
    songOfferComplete,
    songSelectionOpen,
    songsThisSection,
    techniqueInputPeriod,
    timingMode,
    tokenCap,
    tokens,
  } = run;
  const {
    analysisObjective,
    dynamicSpending,
    generationProfile,
    riskProfile,
    setAnalysisObjective,
    setDynamicSpending,
    setGenerationProfile,
    setRiskProfile,
    setSolverMode,
    setTimingMode,
    solverMode,
  } = settings;
  const { isAnalyzing, isStale, pressurePreview, reservePlanPreview, result } =
    solver;

  return !analysisOpen ? (
    <section className="panel decision-entry">
      <div>
        <span className="decision-icon">?</span>
        <div>
          <p className="section-kicker">{L.decision.analyseFacultative}</p>
          <h2>{L.decision.unDouteSurLaMarche}</h2>
          <p>{L.decision.manualLede}</p>
        </div>
      </div>
      <button type="button" onClick={() => setAnalysisOpen(true)}>
        {L.decision.analyseThisPush}
        <span>→</span>
      </button>
    </section>
  ) : (
    <section className="panel decision-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{L.decision.analysisKicker}</p>
          <h2>
            {songSelectionOpen
              ? L.decision.comparerLesPolitiques
              : L.decision.comparerLesTechniques}
          </h2>
        </div>
        <button
          type="button"
          className="close-analysis"
          onClick={() => setAnalysisOpen(false)}
        >
          {L.decision.close}
        </button>
      </div>

      <label
        className={`dynamic-spending-card ${dynamicSpending ? "active" : ""}`}
      >
        <input
          type="checkbox"
          checked={dynamicSpending}
          onChange={(event) => setDynamicSpending(event.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true">
          <i />
        </span>
        <span>
          <strong>{L.decision.deduireAutomatiquementLesAchats}</strong>
          <small>{L.decision.dynamicSpendingHint}</small>
        </span>
      </label>

      <div className="timing-mode-card">
        <div>
          <strong>{L.decision.horizonDeSupply}</strong>
          <small>{L.decision.timingHint}</small>
        </div>
        <div
          className="timing-mode-tabs"
          role="group"
          aria-label={L.decision.echeance}
        >
          <button
            type="button"
            className={timingMode === "section-open" ? "active" : ""}
            onClick={() => setTimingMode("section-open")}
          >
            <strong>{L.decision.sectionOuverte}</strong>
            <small>{L.decision.waitReserveAutorise}</small>
          </button>
          <button
            type="button"
            className={timingMode === "deadline-now" ? "active" : ""}
            onClick={() => setTimingMode("deadline-now")}
          >
            <strong>{L.decision.echeanceMaintenant}</strong>
            <small>{L.decision.aucunFuturGain}</small>
          </button>
        </div>
      </div>

      <div className="solver-mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={solverMode === "express"}
          className={solverMode === "express" ? "active" : ""}
          onClick={() => setSolverMode("express")}
        >
          <strong>{L.decision.express}</strong>
          <small>{L.decision.expressHint}</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={solverMode === "expert"}
          className={solverMode === "expert" ? "active" : ""}
          onClick={() => setSolverMode("expert")}
        >
          <strong>{L.decision.expert}</strong>
          <small>{L.decision.hypothesesAjustables}</small>
        </button>
      </div>

      {solverMode === "express" ? (
        <div className="express-summary">
          <span>{L.decision.auto}</span>
          <p>{L.decision.profileHint}</p>
        </div>
      ) : (
        <div className="expert-settings">
          {!songSelectionOpen && (
            <div
              className="objective-tabs"
              role="group"
              aria-label={L.decision.objectiveLabel}
            >
              <button
                type="button"
                className={analysisObjective === "carryover" ? "active" : ""}
                onClick={() => setAnalysisObjective("carryover")}
              >
                <strong>{L.decision.atteindre}</strong>
                <small>{L.decision.carryover}</small>
              </button>
              <button
                type="button"
                className={analysisObjective === "any-song" ? "active" : ""}
                onClick={() => setAnalysisObjective("any-song")}
              >
                <strong>{L.decision.acheter}</strong>
                <small>{L.decision.touteSong}</small>
              </button>
              <button
                type="button"
                className={
                  analysisObjective === "priority-song" ? "active" : ""
                }
                onClick={() => setAnalysisObjective("priority-song")}
              >
                <strong>{L.decision.priorite}</strong>
                <small>{L.decision.visibleAchetable}</small>
              </button>
            </div>
          )}
          <div className="expert-grid">
            <label>
              <span>{L.decision.generation}</span>
              <select
                value={generationProfile}
                onChange={(event) =>
                  setGenerationProfile(event.target.value as GenerationProfile)
                }
              >
                {Object.entries(generationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{L.decision.risque}</span>
              <select
                value={riskProfile}
                onChange={(event) =>
                  setRiskProfile(event.target.value as RiskProfile)
                }
              >
                {Object.entries(RISK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="snapshot-heading">
        <div>
          <strong>{L.decision.tokensActuels}</strong>
          <small>
            {dynamicSpending
              ? L.decision.trackedBalanceCap(tokenCap)
              : L.decision.oneOffCap(tokenCap)}
          </small>
        </div>
        <span className={`status-pill ${dynamicSpending ? "live" : "manual"}`}>
          {dynamicSpending ? L.decision.soldeActif : L.decision.oneOff}
        </span>
      </div>
      <div className="token-grid">
        {TOKEN_KEYS.map((key) => (
          <TokenInput
            key={key}
            tokenKey={key}
            value={tokens[key]}
            maximum={tokenCap}
            onChange={(value) => setTokenValue(key, value)}
          />
        ))}
      </div>

      <div className="token-pressure-strip">
        {pressurePreview.map((pressure) => (
          <div className={`pressure-${pressure.level}`} key={pressure.key}>
            <img src={TOKEN_META[pressure.key].icon} alt="" />
            <span className="pressure-heading">
              <strong>{TOKEN_META[pressure.key].short}</strong>
              <small>{tokenPressureLabels(L)[pressure.level]}</small>
            </span>
            <span className="pressure-amount">
              <strong>
                {L.decision.reserveAtLeast(pressure.reserveTarget)}
              </strong>
              <em>{tokenMarginLabel(pressure, L)}</em>
            </span>
            <p>{t(pressure.reserveReason)}</p>
          </div>
        ))}
      </div>
      <TokenReservePlanCard plan={reservePlanPreview} />
      <p className="reserve-method-note">
        <strong>{L.decision.marginNote}</strong> {L.decision.costHint}{" "}
        {L.decision.marginNoteTail}
      </p>

      {!songSelectionOpen && (
        <>
          <div className="snapshot-heading offers-heading">
            <div>
              <strong>{L.decision.troisTechniquesAffichees}</strong>
              <small>{L.decision.pickKind}</small>
            </div>
            <div className="offers-heading-actions">
              <span>{L.decision.beforeSong(remaining)}</span>
              <button
                type="button"
                onClick={resetTechniqueOptions}
                disabled={
                  candidateTotals.every((value) => value === 0) &&
                  quickBuilders.every((builder) => !builder.kind)
                }
              >
                {L.decision.resetThree}
              </button>
            </div>
          </div>

          <div className="technique-options">
            {candidateCosts.map((cost, optionIndex) => {
              const builder = quickBuilders[optionIndex];
              const choiceAssessment = techniqueChoiceAssessments.find(
                (assessment) => assessment.index === optionIndex,
              );
              const displayedRecommended =
                displayedTechniqueIndex === optionIndex && result;
              const hintLevels = getTechniqueLevelOptions(
                techniqueInputPeriod,
                "hint",
              );
              const energyLevels = getTechniqueLevelOptions(
                techniqueInputPeriod,
                "energy",
              );
              const activeHint =
                builder.kind === "hint"
                  ? hintLevels[builder.levelIndex]
                  : hintLevels[0];
              const activeEnergy =
                builder.kind === "energy"
                  ? energyLevels[builder.levelIndex]
                  : energyLevels[0];
              const split = getDualTechniqueSplit(techniqueInputPeriod);
              const isDuo =
                builder.kind === "duo-balanced" || builder.kind === "duo-split";
              const requiredColors = isDuo ? 2 : 1;
              const selectionComplete =
                Boolean(builder.kind) &&
                builder.selectedTokens.length === requiredColors;
              const previewCost = (key: TokenKey): number => {
                const tokenIndex = builder.selectedTokens.indexOf(key);
                if (tokenIndex < 0 || !builder.kind) return 0;
                if (builder.kind === "mono") {
                  return getBaseTechniqueCost(techniqueInputPeriod);
                }
                if (builder.kind === "hint") {
                  return activeHint?.cost ?? 0;
                }
                if (builder.kind === "energy") {
                  return activeEnergy?.cost ?? 0;
                }
                if (builder.kind === "duo-balanced") {
                  return getDualTechniqueCost(techniqueInputPeriod);
                }
                return split?.[tokenIndex] ?? 0;
              };
              const builderStatus = !builder.kind
                ? candidateTotals[optionIndex] > 0
                  ? L.decision.saisieManuelle
                  : L.decision.step1ChooseKind
                : selectionComplete
                  ? L.decision.preteAAnalyser
                  : L.decision.chooseColors(requiredColors);

              return (
                <div
                  className={`technique-option ${
                    choiceAssessment?.safety === "hard-blocking"
                      ? "blocking"
                      : displayedRecommended
                        ? displayedOverride
                          ? "override-recommended"
                          : "recommended"
                        : choiceAssessment?.safety === "safe-alternative"
                          ? "safe-alternative-choice"
                          : ""
                  } ${builder.kind ? "building" : ""}`}
                  key={optionIndex}
                >
                  <div className="option-heading">
                    <span>
                      <strong>{L.decision.option(optionIndex + 1)}</strong>
                      <small>{builderStatus}</small>
                    </span>
                    <span className="option-total">
                      {L.decision.pointsTotal(candidateTotals[optionIndex])}
                    </span>
                    <button
                      type="button"
                      className="option-reset"
                      aria-label={L.decision.clearOption(optionIndex + 1)}
                      onClick={() =>
                        commitQuickBuilder(optionIndex, emptyQuickBuilder())
                      }
                    >
                      ×
                    </button>
                  </div>

                  {choiceAssessment?.blocking && (
                    <div className="choice-blocking-warning">
                      <strong>{L.decision.bloquant}</strong>
                      <span>{t(choiceAssessment.blocking.detail)}</span>
                    </div>
                  )}

                  <div
                    className="quick-kind-row"
                    role="group"
                    aria-label={L.decision.optionType(optionIndex + 1)}
                  >
                    <button
                      type="button"
                      className={builder.kind === "mono" ? "active" : ""}
                      onClick={() => cycleTechniqueKind(optionIndex, "mono")}
                    >
                      <span>{L.decision.mono}</span>
                      <small>
                        {getBaseTechniqueCost(techniqueInputPeriod)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className={isDuo ? "active" : ""}
                      disabled={techniqueInputPeriod === "junior"}
                      onClick={() => cycleTechniqueKind(optionIndex, "duo")}
                      title={
                        techniqueInputPeriod === "junior"
                          ? L.decision.lesTechniquesDuoApparaissentA
                          : L.decision.cliqueEncorePourPasserDe
                      }
                    >
                      <span>{L.decision.duo}</span>
                      <small>
                        {builder.kind === "duo-split" && split
                          ? `${split[0]}+${split[1]}`
                          : techniqueInputPeriod === "junior"
                            ? "—"
                            : `${getDualTechniqueCost(
                                techniqueInputPeriod,
                              )}+${getDualTechniqueCost(techniqueInputPeriod)}`}
                      </small>
                    </button>
                    <button
                      type="button"
                      className={builder.kind === "hint" ? "active" : ""}
                      onClick={() => cycleTechniqueKind(optionIndex, "hint")}
                      title={L.decision.cliqueEncorePourMonterLe}
                    >
                      <span>{L.decision.hint}</span>
                      <small>
                        {builder.kind === "hint"
                          ? `${activeHint.label} · ${activeHint.cost}`
                          : `Lv. 1 · ${hintLevels[0].cost}`}
                      </small>
                    </button>
                    <button
                      type="button"
                      className={builder.kind === "energy" ? "active" : ""}
                      onClick={() => cycleTechniqueKind(optionIndex, "energy")}
                      title={L.decision.cliqueEncorePourPasserDe2}
                    >
                      <span>{L.decision.energy}</span>
                      <small>
                        {builder.kind === "energy"
                          ? `${activeEnergy.label} · ${activeEnergy.cost}`
                          : `+20 · ${energyLevels[0].cost}`}
                      </small>
                    </button>
                  </div>

                  <div
                    className="quick-token-row"
                    role="group"
                    aria-label={L.decision.optionColors(optionIndex + 1)}
                  >
                    {TOKEN_KEYS.map((key) => {
                      const selectedIndex = builder.selectedTokens.indexOf(key);
                      const selected = selectedIndex >= 0;
                      const unavailableSplitColor =
                        builder.kind === "duo-split" &&
                        builder.selectedTokens.length > 0 &&
                        !selected &&
                        key !==
                          getDuoSplitSecondaryToken(builder.selectedTokens[0]);
                      return (
                        <button
                          type="button"
                          className={`quick-token token-${
                            TOKEN_META[key].tone
                          } ${selected ? "selected" : ""}`}
                          key={key}
                          disabled={!builder.kind || unavailableSplitColor}
                          aria-pressed={selected}
                          title={
                            unavailableSplitColor
                              ? L.decision.cetteCombinaisonAsymetriqueNexistePas
                              : undefined
                          }
                          onClick={() => toggleTechniqueToken(optionIndex, key)}
                        >
                          <img src={TOKEN_META[key].icon} alt="" />
                          <span>{TOKEN_META[key].short}</span>
                          <strong>{selected ? previewCost(key) : "—"}</strong>
                          {isDuo && selected && <i>{selectedIndex + 1}</i>}
                        </button>
                      );
                    })}
                  </div>

                  <details className="manual-costs">
                    <summary>{L.decision.adjustManually}</summary>
                    <div className="option-token-grid">
                      {TOKEN_KEYS.map((key) => (
                        <TokenInput
                          key={key}
                          tokenKey={key}
                          value={cost[key]}
                          onChange={(value) =>
                            setCandidateValue(optionIndex, key, value)
                          }
                          compact
                        />
                      ))}
                    </div>
                  </details>
                  {dynamicSpending && (
                    <button
                      type="button"
                      className={`buy-technique-option ${
                        choiceAssessment?.safety === "hard-blocking"
                          ? "blocking"
                          : displayedTechniqueIndex === optionIndex &&
                              result &&
                              !isStale
                            ? displayedOverride
                              ? "override"
                              : "recommended"
                            : choiceAssessment?.safety === "safe-alternative"
                              ? "alternative"
                              : ""
                      }`}
                      disabled={
                        candidateTotals[optionIndex] <= 0 ||
                        (!selectionComplete && Boolean(builder.kind)) ||
                        !canAfford(tokens, cost)
                      }
                      onClick={() => recordTechniquePurchase(optionIndex)}
                    >
                      <span>
                        {choiceAssessment?.safety === "hard-blocking"
                          ? displayedTechniqueIndex === optionIndex &&
                            result &&
                            !isStale
                            ? L.decision.moinsMauvaisChoixBloquant
                            : L.decision.choixBloquant
                          : displayedTechniqueIndex === optionIndex &&
                              result &&
                              !isStale
                            ? displayedOverride
                              ? L.decision.acheterOverride
                              : L.decision.acheterLoptionRecommandee
                            : choiceAssessment?.safety === "safe-alternative"
                              ? L.decision.alternativeSure
                              : L.decision.acheterCetteTechnique}
                      </span>
                      <strong>
                        {L.decision.minusPoints(candidateTotals[optionIndex])}
                      </strong>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="quick-entry-note">
            {L.decision.clickHint} {L.decision.duoOrderNote}
          </p>
        </>
      )}

      <div className="pool-context">
        <div>
          <span>{L.decision.poolAnalysee}</span>
          <strong>{L.decision.songCount(availableSongs.length)}</strong>
        </div>
        <div>
          <span>{L.decision.jaugeDeLaSection}</span>
          <strong>
            {L.decision.gaugeBreakdown(
              gaugeSongs,
              songsThisSection,
              automaticGaugeSongs,
            )}
          </strong>
        </div>
        <p>
          {L.decision.songsTowardGrand(ownedSongs.size + 1)}{" "}
          {L.decision.specialLive}
        </p>
      </div>

      <label
        className={`force-push-toggle ${forcePushOverride ? "active" : ""}`}
      >
        <input
          type="checkbox"
          checked={forcePushOverride}
          onChange={(event) => changeForcePushOverride(event.target.checked)}
        />
        <span>
          <strong>{L.decision.pushForceOverride}</strong>
          <small>{L.decision.afficheLeMeilleurCheminNon}</small>
        </span>
      </label>

      <button
        className="inline-analyze"
        type="button"
        onClick={() => {
          runCurrentAnalysis();
        }}
        disabled={
          isAnalyzing ||
          (songSelectionOpen && !songOfferComplete) ||
          (!songSelectionOpen && hasIncompleteQuickOption)
        }
      >
        {isAnalyzing
          ? L.aside.calculEnCours
          : songSelectionOpen
            ? expectedOfferCount === 0
              ? L.decision.poolEpuisee
              : !songOfferComplete
                ? L.decision.remainingVisibleChoices(
                    expectedOfferCount - selectionSongs.length,
                  )
                : L.decision.comparerAcheterContinuerReserverCarry
            : hasIncompleteQuickOption
              ? L.decision.completeLaTechniqueEnCours
              : L.decision.calculerLaDecision}
        <span>{isAnalyzing ? "" : "→"}</span>
      </button>
    </section>
  );
}
