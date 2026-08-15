import { useLanguage } from "../i18n/LanguageContext.tsx";

import {
  checkpointStatusLabels,
  rhythm16StatusLabels,
  TOKEN_META,
  tokenPressureLabels,
  number,
  percent,
  policyActionLabel,
  tokenMarginLabel,
} from "../constants.tsx";
import { TokenReservePlanCard } from "./TokenWidgets.tsx";
import {
  planExitMessage,
  planFallbackMessage,
  planLabelMessage,
} from "@glcp/core";

import { SONGS } from "@glcp/core";
import {
  ActionsView,
  DiagnosticsView,
  DisplayView,
  RunView,
  SolverView,
  TechniqueEntryView,
} from "../view-model.ts";

type AnalysisAsideProps = {
  actions: ActionsView;
  diagnostics: DiagnosticsView;
  display: DisplayView;
  entry: TechniqueEntryView;
  run: RunView;
  solver: SolverView;
};

export function AnalysisAside({
  actions,
  diagnostics,
  display,
  entry,
  run,
  solver,
}: AnalysisAsideProps) {
  const { L, t } = useLanguage();
  const { runCurrentAnalysis, setAnalysisOpen } = actions;
  const {
    displayedBlocking,
    displayedBlockingAssessment,
    displayedResultTone,
    songChoiceAssessments,
    techniqueChoiceAssessments,
  } = diagnostics;
  const {
    alternativeTechniqueIndex,
    analysisOpen,
    displayedOverride,
    displayedSongPolicy,
    displayedTechniqueIndex,
    displayedTechniqueResult,
    forcedTechnique,
  } = display;
  const { hasIncompleteQuickOption } = entry;
  const { remaining, songOfferComplete, songSelectionOpen, songTargets } = run;
  const {
    goalLabel,
    isAnalyzing,
    isStale,
    normalSongPolicy,
    optionAnalyses,
    recommendation,
    result,
    songPolicy,
    strategicPlan,
    techniqueStrategy,
  } = solver;

  return (
    <aside
      className={`analysis-card tone-${displayedResultTone} ${
        displayedBlocking ? "blocking-recommendation" : ""
      }`}
      aria-live="polite"
    >
      <div className="analysis-topline">
        <span className="section-kicker">{L.aside.diagnosticPonctuel}</span>
        {isStale && <span className="stale-badge">{L.aside.staleBadge}</span>}
      </div>

      {isAnalyzing ? (
        <div className="analysis-placeholder solver-loading" role="status">
          <span className="solver-loading-spinner" aria-hidden="true" />
          <h2>{L.aside.analyseEnCours}</h2>
          <p>{L.aside.analyseEnCoursDetail}</p>
        </div>
      ) : displayedTechniqueResult ? (
        <>
          <div className="recommendation">
            <span className="recommendation-icon">
              {displayedResultTone === "reserve"
                ? "◇"
                : displayedResultTone === "safe" ||
                    displayedResultTone === "push"
                  ? "↑"
                  : displayedResultTone === "risky"
                    ? "!"
                    : "×"}
            </span>
            <div>
              <h2>
                {displayedBlocking
                  ? L.aside.moinsMauvaisChoixBloquant
                  : forcedTechnique
                    ? L.aside.forcedPushOption(forcedTechnique.index + 1)
                    : (recommendation?.label ?? "")}
              </h2>
              <p>
                {displayedBlocking
                  ? displayedBlockingAssessment?.blocking?.detail
                    ? t(displayedBlockingAssessment.blocking.detail)
                    : L.aside.tousLesChoixDisponiblesPerdent
                  : forcedTechnique
                    ? L.aside.leVerdictStopHoldNormal
                    : displayedTechniqueResult.terminalDecision
                      ? t(displayedTechniqueResult.terminalDecision.reason)
                      : (recommendation?.detail ?? "")}
              </p>
              {/*
                v0.22.15: a non-blocking warning. The option stays valid, it is
                simply dearer on identical colours, so it earns a caution rather
                than the red treatment reserved for real blockers.
              */}
              {!displayedBlocking &&
                displayedBlockingAssessment &&
                "advisory" in displayedBlockingAssessment &&
                displayedBlockingAssessment.advisory && (
                  <div className="choice-advisory-warning">
                    <strong>{L.aside.surcoutDeProgression}</strong>
                    <span>{t(displayedBlockingAssessment.advisory)}</span>
                  </div>
                )}
              {displayedTechniqueIndex !== null && (
                <span
                  className={`recommended-option ${
                    displayedBlocking
                      ? "blocking"
                      : displayedOverride
                        ? "override"
                        : ""
                  }`}
                >
                  {displayedBlocking
                    ? L.aside.blockingOption(displayedTechniqueIndex + 1)
                    : displayedOverride
                      ? L.aside.overrideOption(displayedTechniqueIndex + 1)
                      : L.aside.recommendedOption(displayedTechniqueIndex + 1)}
                </span>
              )}
              {alternativeTechniqueIndex !== null && (
                <span className="recommended-option alternative">
                  {L.aside.safeAlternativeOption(alternativeTechniqueIndex + 1)}
                </span>
              )}
            </div>
          </div>

          {techniqueChoiceAssessments.some(
            (item) => item.safety === "hard-blocking",
          ) && (
            <div className="blocking-choice-list">
              <strong>{L.aside.choixBloquantsImmediats}</strong>
              {techniqueChoiceAssessments
                .filter((item) => item.safety === "hard-blocking")
                .map((item) => (
                  <span key={item.index}>
                    {L.aside.option(item.index + 1)} ·{" "}
                    {item.blocking ? t(item.blocking.detail) : null}
                  </span>
                ))}
            </div>
          )}

          {displayedTechniqueResult.planLabel && (
            <div className="strategic-context open plan-context">
              <div className="strategic-heading">
                <span>{L.aside.planActif}</span>
                <strong>{t(displayedTechniqueResult.planLabel)}</strong>
              </div>
              <p>
                {displayedTechniqueResult.exitCondition
                  ? t(displayedTechniqueResult.exitCondition)
                  : null}
              </p>
              <small>
                {L.aside.fallback}{" "}
                {displayedTechniqueResult.fallback
                  ? t(displayedTechniqueResult.fallback)
                  : null}
              </small>
            </div>
          )}

          {techniqueStrategy?.applies && (
            <div
              className={`strategic-context ${
                techniqueStrategy.shouldSave ? "save" : "open"
              }`}
            >
              <div className="strategic-heading">
                <span>{L.aside.gardeFouDuPlan}</span>
                <strong>
                  {techniqueStrategy.shouldSave
                    ? L.aside.planSave(strategicPlan.mode.toUpperCase())
                    : L.aside.cibleStructurelleEncoreOuverte}
                </strong>
              </div>
              <p>
                {techniqueStrategy.shouldSave
                  ? strategicPlan.mode === "hold"
                    ? L.aside.holdInterditDentamerUneNouvelle
                    : L.aside.aucuneCibleDuPlanActif
                  : L.aside.lePlanActifConserveUne}
              </p>
              <div className="strategic-metrics">
                <div>
                  <span>{L.aside.greatSuccess}</span>
                  <strong>
                    {techniqueStrategy.greatSuccessSecured
                      ? L.aside.dejaSecurise
                      : L.aside.encoreAConstruire}
                  </strong>
                </div>
                <div>
                  <span>{L.aside.ciblesAChasser}</span>
                  <strong>
                    {techniqueStrategy.currentPriorityCount} /{" "}
                    {songTargets.length}
                  </strong>
                </div>
                <div>
                  <span>{L.aside.pageAtteinte}</span>
                  <strong>
                    {percent(
                      displayedTechniqueResult.reachProbability,
                      L.meta.locale,
                    )}
                  </strong>
                </div>
                <div>
                  <span>{L.aside.engagementEstime}</span>
                  <strong>
                    ≈{" "}
                    {number(
                      techniqueStrategy.estimatedCommitment,
                      L.meta.locale,
                    )}{" "}
                    {L.aside.pointsUnit}
                  </strong>
                </div>
              </div>
              <small>{L.aside.noHeadroom}</small>
            </div>
          )}

          <div className="main-probability">
            <span>{goalLabel}</span>
            <strong>
              {percent(displayedTechniqueResult.goalProbability, L.meta.locale)}
            </strong>
            <div className="probability-track">
              <span
                style={{
                  width: `${displayedTechniqueResult.goalProbability * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="decision-metrics">
            <div>
              <span>{L.aside.atteindreLaSelection}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.reachProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
            <div>
              <span>{L.aside.prioriteDansLes3}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.prioritySongShownProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
            <div>
              <span>{L.aside.songAchetableDansLes3}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.reachAnySongAffordableProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
            <div>
              <span>{L.aside.prioriteAchetableDansLes3}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.reachPrioritySongAffordableProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
          </div>

          {optionAnalyses.length > 1 && (
            <div className="option-comparison">
              <div className="subheading-row">
                <strong>{L.aside.comparerLesTechniquesVisibles}</strong>
                <small>
                  {techniqueStrategy?.applies
                    ? L.aside.faisabiliteImmediate
                    : L.aside.fullObjective}
                </small>
              </div>
              {optionAnalyses.map((analysis) => (
                <div
                  className={`option-result ${
                    analysis.index === displayedTechniqueIndex ? "best" : ""
                  }`}
                  key={analysis.index}
                >
                  <span>{L.aside.option((analysis.index ?? 0) + 1)}</span>
                  <div>
                    <i
                      style={{
                        width: `${analysis.result.goalProbability * 100}%`,
                      }}
                    />
                  </div>
                  <strong>
                    {analysis.result.valid
                      ? percent(analysis.result.goalProbability, L.meta.locale)
                      : L.aside.impossible}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {displayedTechniqueResult.songOutcomes.some(
            (song) => song.priority,
          ) && (
            <div className="song-outcomes">
              <div className="subheading-row">
                <strong>{L.aside.meilleuresCiblesRestantes}</strong>
                <small>{L.aside.atteinteAchatTirage}</small>
              </div>
              {displayedTechniqueResult.songOutcomes
                .filter((song) => song.priority)
                .slice(0, 3)
                .map((song) => (
                  <div className="song-outcome" key={song.id}>
                    <span>{song.name}</span>
                    <strong>
                      {percent(
                        song.reachAffordAndShownProbability,
                        L.meta.locale,
                      )}
                    </strong>
                  </div>
                ))}
            </div>
          )}

          <div className="risk-grid secondary-risk">
            <div>
              <span>{L.aside.threeOptionsBlocked}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.immediateBlockProbability,
                  L.meta.locale,
                )}
              </strong>
              <small>{L.aside.prochainRefreshExact}</small>
            </div>
            <div>
              <span>{L.aside.blocageJusteAvant}</span>
              <strong>
                {percent(
                  displayedTechniqueResult.lateBlockProbability,
                  L.meta.locale,
                )}
              </strong>
              <small>{L.aside.apresAvoirPresqueToutPaye}</small>
            </div>
            <div>
              <span>{L.aside.perteSiEchec}</span>
              <strong>
                {number(
                  displayedTechniqueResult.conditionalWaste,
                  L.meta.locale,
                )}
              </strong>
              <small>{L.aside.tokensDejaDepenses}</small>
            </div>
            <div>
              <span>{L.aside.coutSiReussite}</span>
              <strong>
                {number(
                  displayedTechniqueResult.averageSuccessSpend,
                  L.meta.locale,
                )}
              </strong>
              <small>{L.aside.jusquaLaSelection}</small>
            </div>
          </div>

          {remaining > 0 && (
            <div className="failure-profile">
              <div className="subheading-row">
                <strong>{L.aside.ouLesRunsSeBloquent}</strong>
                <small>
                  {L.aside.pathsEvaluated(
                    displayedTechniqueResult.trials.toLocaleString(
                      L.meta.locale,
                    ),
                  )}
                </small>
              </div>
              {displayedTechniqueResult.failureDepth
                .slice(0, Math.max(1, remaining))
                .map((probability, depth) => (
                  <div className="failure-row" key={depth}>
                    <span>{L.aside.afterPurchases(depth)}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, probability * 400)}%`,
                        }}
                      />
                    </div>
                    <strong>{percent(probability, L.meta.locale)}</strong>
                  </div>
                ))}
            </div>
          )}

          {displayedTechniqueResult.criticalToken &&
            displayedTechniqueResult.criticalTokenGain > 0.001 && (
              <div className="insight">
                <img
                  src={TOKEN_META[displayedTechniqueResult.criticalToken].icon}
                  alt=""
                />
                <span>
                  <strong>
                    {TOKEN_META[displayedTechniqueResult.criticalToken].label}
                  </strong>{" "}
                  {L.aside.criticalTokenHint}{" "}
                  {L.aside.approximateGain(
                    percent(
                      displayedTechniqueResult.criticalTokenGain,
                      L.meta.locale,
                    )
                      .replace(" %", "")
                      .replace("%", ""),
                  )}
                  .
                </span>
              </div>
            )}
        </>
      ) : displayedSongPolicy && songPolicy ? (
        <>
          <div className="recommendation policy-recommendation">
            <span className="recommendation-icon">
              {displayedSongPolicy.action === "wait-reserve" ||
              displayedSongPolicy.action === "stop-and-carry-stock" ||
              displayedSongPolicy.action === "carry-page"
                ? "⏸"
                : displayedSongPolicy.action === "buy-continue"
                  ? "↑"
                  : "✓"}
            </span>
            <div>
              <span className="policy-label">
                {displayedBlocking
                  ? L.aside.moinsMauvaisePolitiqueBloquante
                  : L.aside.politiqueRecommandee}
              </span>
              <h2>
                {policyActionLabel(
                  displayedSongPolicy.action,
                  L,
                  displayedSongPolicy.continuationRecommendation,
                )}
              </h2>
              <p>
                {displayedSongPolicy.songName}
                {displayedBlockingAssessment?.blocking?.detail
                  ? ` · ${t(displayedBlockingAssessment.blocking.detail)}`
                  : ""}
              </p>
            </div>
          </div>

          {displayedOverride && normalSongPolicy && (
            <div className="override-explanation">
              <strong>{L.aside.overrideActif}</strong>
              <span>
                {L.aside.normalPolicy}{" "}
                {policyActionLabel(
                  normalSongPolicy.action,
                  L,
                  normalSongPolicy.continuationRecommendation,
                )}
                {normalSongPolicy.songName
                  ? ` · ${normalSongPolicy.songName}`
                  : ""}
              </span>
              <small>{L.aside.leCheminAfficheEstLe}</small>
            </div>
          )}

          <div className="strategic-context open plan-context">
            <div className="strategic-heading">
              <span>{L.aside.planActif}</span>
              <strong>{t(planLabelMessage(songPolicy.plan))}</strong>
            </div>
            <p>{t(planExitMessage(songPolicy.plan))}</p>
            <small>
              {L.aside.fallback} {t(planFallbackMessage(songPolicy.plan))}
            </small>
          </div>

          <div className="policy-reasons">
            {displayedSongPolicy.reasons.map((reason, index) => (
              <span key={`${reason.code}:${index}`}>✓ {t(reason)}</span>
            ))}
          </div>

          <div className="decision-metrics policy-metrics">
            <div>
              <span>
                {!displayedSongPolicy.action.startsWith("buy-")
                  ? L.aside.selectionPreservee
                  : L.aside.prochaineSelection}
              </span>
              <strong>
                {percent(
                  displayedSongPolicy.nextSongProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
            <div>
              <span>{L.aside.cibleConditionnelle}</span>
              <strong>
                {percent(
                  displayedSongPolicy.priorityAffordableProbability,
                  L.meta.locale,
                )}
              </strong>
            </div>
            <div>
              <span>{L.aside.jaugeDuConcert}</span>
              <strong>
                {displayedSongPolicy.greatSuccessProbability === null
                  ? "—"
                  : percent(
                      displayedSongPolicy.greatSuccessProbability,
                      L.meta.locale,
                    )}
              </strong>
            </div>
            {displayedSongPolicy.nextSectionReadiness && (
              <>
                <div>
                  <span>{L.aside.nextSectionStock}</span>
                  <strong>
                    {percent(
                      displayedSongPolicy.nextSectionReadiness
                        .checkpointProbability,
                      L.meta.locale,
                    )}
                  </strong>
                </div>
                <div>
                  <span>{L.aside.friendshipProjetee}</span>
                  <strong>
                    +
                    {Math.round(
                      displayedSongPolicy.nextSectionReadiness
                        .expectedFriendshipBonus * 10,
                    ) / 10}
                    % · exp.{" "}
                    {Math.round(
                      displayedSongPolicy.nextSectionReadiness
                        .expectedFriendshipTrainingExposure * 10,
                    ) / 10}
                  </strong>
                </div>
              </>
            )}
            <div>
              <span>{L.aside.repereDeRythme16}</span>
              <strong>
                {
                  rhythm16StatusLabels(L)[
                    displayedSongPolicy.checkpoint16Status
                  ]
                }
              </strong>
            </div>
            <div>
              <span>{L.aside.checkpoint18}</span>
              <strong>
                {
                  checkpointStatusLabels(L)[
                    displayedSongPolicy.checkpoint18Status
                  ]
                }
              </strong>
            </div>
            <div>
              <span>{L.aside.porte18GsFinal}</span>
              <strong>
                {displayedSongPolicy.finalGateStatus === "secured"
                  ? L.aside.finalGateGuaranteed
                  : displayedSongPolicy.finalGateStatus === "failed"
                    ? L.aside.echouee
                    : L.aside.finalGateOpen}
              </strong>
            </div>
          </div>

          <div className="policy-comparison">
            <div className="subheading-row">
              <strong>{L.aside.politiquesComparees}</strong>
              <small>{L.aside.ordreLexicographiqueContraintesAvantCo}</small>
            </div>
            {[...songPolicy.policies]
              .filter(
                (policy) =>
                  policy.valid || policy.id === displayedSongPolicy.id,
              )
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((policy, index, policies) => {
                const bestScore = policies[0]?.score ?? 0;
                const worstScore = policies.at(-1)?.score ?? bestScore;
                const range = Math.max(1, bestScore - worstScore);
                const relative =
                  36 + ((policy.score - worstScore) / range) * 64;
                return (
                  <div
                    className={`policy-row ${
                      policy.id === displayedSongPolicy.id ? "best" : ""
                    }`}
                    key={policy.id}
                  >
                    <span>
                      <strong>
                        {policyActionLabel(
                          policy.action,
                          L,
                          policy.continuationRecommendation,
                        )}
                      </strong>
                      <small>{policy.songName}</small>
                    </span>
                    <div>
                      <i style={{ width: `${relative}%` }} />
                    </div>
                    <em>
                      {index === 0
                        ? L.aside.choiceRank
                        : L.aside.rankNo(index + 1)}
                    </em>
                  </div>
                );
              })}
          </div>

          <div className="risk-grid secondary-risk">
            <div>
              <span>{L.aside.blocageTardif}</span>
              <strong>
                {percent(
                  displayedSongPolicy.lateFailureProbability,
                  L.meta.locale,
                )}
              </strong>
              <small>{L.aside.apresPlusieursDepenses}</small>
            </div>
            <div>
              <span>{L.aside.perteAttendue}</span>
              <strong>
                {number(displayedSongPolicy.expectedWaste, L.meta.locale)}
              </strong>
              <small>{L.aside.tokensPonderesParLechec}</small>
            </div>
          </div>

          {songPolicy.safeAlternative && (
            <div className="safe-alternative">
              <span>{L.aside.alternativePlusPrudente}</span>
              <strong>
                {policyActionLabel(
                  songPolicy.safeAlternative.action,
                  L,
                  songPolicy.safeAlternative.continuationRecommendation,
                )}
                {songPolicy.safeAlternative.action.startsWith("buy-") &&
                  ` · ${songPolicy.safeAlternative.songName}`}
              </strong>
              <small>
                {L.aside.lateRisk(
                  percent(
                    songPolicy.safeAlternative.lateFailureProbability,
                    L.meta.locale,
                  ),
                )}
              </small>
            </div>
          )}

          {songChoiceAssessments.some(
            (item) => item.safety === "hard-blocking",
          ) && (
            <div className="blocking-choice-list">
              <strong>{L.aside.choixBloquantsImmediats}</strong>
              {songChoiceAssessments
                .filter((item) => item.safety === "hard-blocking")
                .map((item) => (
                  <span key={item.songId}>
                    {SONGS.find((song) => song.id === item.songId)?.name ??
                      item.songId}{" "}
                    · {item.blocking ? t(item.blocking.detail) : null}
                  </span>
                ))}
            </div>
          )}

          <div className="pressure-list">
            <div className="subheading-row">
              <strong>{L.aside.reservesParCouleur}</strong>
              <small>{L.aside.seuilJustification}</small>
            </div>
            <TokenReservePlanCard plan={songPolicy.tokenReservePlan} compact />
            {songPolicy.tokenPressure.map((pressure) => (
              <div
                className={`pressure-row pressure-${pressure.level}`}
                key={pressure.key}
              >
                <img src={TOKEN_META[pressure.key].icon} alt="" />
                <span>
                  <strong>{TOKEN_META[pressure.key].label}</strong>
                  <small>{tokenPressureLabels(L)[pressure.level]}</small>
                </span>
                <span className="pressure-row-value">
                  <strong>≥ {pressure.reserveTarget}</strong>
                  <small>{tokenMarginLabel(pressure, L)}</small>
                </span>
                <p>{t(pressure.reserveReason)}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="analysis-placeholder">
          <span>⌁</span>
          <h2>
            {analysisOpen ? L.aside.analysePrete : L.aside.aucunMicroTracking}
          </h2>
          <p>
            {analysisOpen
              ? songSelectionOpen
                ? L.aside.selectionneLesChoixVisiblesRenseigne
                : L.aside.renseigneLesTokensEventuellementLes
              : L.aside.leSuiviAvanceSansTokens}
          </p>
        </div>
      )}

      <button
        className="primary-button"
        type="button"
        onClick={() => {
          if (analysisOpen) {
            runCurrentAnalysis();
          } else {
            setAnalysisOpen(true);
          }
        }}
        disabled={
          isAnalyzing ||
          (analysisOpen &&
            ((songSelectionOpen && !songOfferComplete) ||
              (!songSelectionOpen && hasIncompleteQuickOption)))
        }
      >
        {isAnalyzing
          ? L.aside.calculEnCours
          : !analysisOpen
            ? result || songPolicy
              ? L.aside.ajusterLesDonnees
              : L.aside.ouvrirLanalyse
            : result || songPolicy
              ? L.aside.recalculerLaDecision
              : songSelectionOpen
                ? L.aside.comparerLesPolitiques
                : hasIncompleteQuickOption
                  ? L.aside.completeLaTechniqueEnCours
                  : L.aside.analyserLePush}
        <span>{isAnalyzing ? "" : "→"}</span>
      </button>
      <p className="model-note">{L.aside.modelNote}</p>
    </aside>
  );
}
