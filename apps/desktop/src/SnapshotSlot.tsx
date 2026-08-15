import { useState } from "react";
import type { Message } from "@glcp/core/i18n";
import {
  clearDecisionLog,
  compareDecisionVectors,
  planExitMessage,
  planFallbackMessage,
  planLabelMessage,
  openDecisionLogDirectory,
  readDecisionLog,
  TOKEN_KEYS,
  type Balance,
  type SongPolicyEvaluation,
} from "@glcp/core";
import {
  CONCERTS,
  number,
  percent,
  policyActionLabel,
  useLabels,
  useLanguage,
  type Labels,
  type SlotContext,
} from "@glcp/ui";
import SnapshotCompanionPanel from "./vision/SnapshotCompanionPanel.tsx";
import type {
  VisionDecision,
  VisionDecisionCandidate,
  VisionSnapshot,
} from "./vision/types.ts";
import { downloadDecisionLog } from "./adapters/tauri-decision-sink.ts";

/**
 * Translation layer between the OCR cockpit and the shared shell.
 *
 * It exists so that neither side learns the other's vocabulary: `packages/ui`
 * never hears about a `VisionSnapshot`, and the cockpit never reaches into the
 * shell's state. Everything readable comes from `SlotContext`; everything
 * writable goes through `context.actions`.
 */

/**
 * 16 and 18 render the same `CheckpointStatus` union with deliberately
 * different framing: 18 is a real gate (`supply.status`, shared with the rest
 * of the app), 16 is only ever a pacing reference and was never meant to read
 * like one. The engine's shared catalogue has no reason to carry a second,
 * cockpit-only wording for the same status — so it lives here, next to the
 * one caller that needs it, rather than in `packages/core/i18n`.
 */
const RHYTHM_16_LABEL: Record<"fr" | "en", Record<string, string>> = {
  fr: {
    "secured-now": "Atteint",
    "closable-before-deadline": "Finançable maintenant",
    "reachable-with-future-supply": "Rattrapable plus tard",
    indeterminate: "Indéterminé",
    impossible: "Non atteint",
  },
  en: {
    "secured-now": "Reached",
    "closable-before-deadline": "Affordable now",
    "reachable-with-future-supply": "Catch-up later",
    indeterminate: "Indeterminate",
    impossible: "Not reached",
  },
};

const SAFETY_RANK: Record<VisionDecisionCandidate["safety"], number> = {
  recommended: 0,
  "safe-alternative": 1,
  secondary: 2,
  "hard-blocking": 3,
};

/**
 * Projects the shell's solver output into the cockpit's own decision shape.
 *
 * The cockpit predates the shared view-model and speaks its own vocabulary; the
 * translation stays here rather than reshaping either side. Messages are
 * rendered at this boundary, since `VisionDecision` carries strings. Numeric
 * formatting and the song/technique action wording reuse `packages/ui`'s own
 * `percent`/`number`/`policyActionLabel` rather than a second copy of them.
 */
const buildDecision = (
  { diagnostics, display, run, solver }: SlotContext,
  t: (message: Message) => string,
  language: "fr" | "en",
  L: Labels,
): VisionDecision => {
  const pct = (value: number) =>
    percent(value, language === "fr" ? "fr-FR" : "en-US");
  const num = (value: number) =>
    number(value, language === "fr" ? "fr-FR" : "en-US");

  const isTechniquePage = !run.songSelectionOpen;

  if (solver.isAnalyzing) {
    return {
      bestTechniqueIndex: null,
      alternativeTechniqueIndex: null,
      recommendedSongId: null,
      alternativeSongId: null,
      techniqueDiagnostics: [],
      songDiagnostics: [],
      headline: L.aside.analyseEnCours,
      summary: L.aside.analyseEnCoursDetail,
      path: [],
      plan: null,
      reasons: [],
      metrics: [],
      candidates: [],
      overrideActive: false,
      stale: false,
      loading: true,
    };
  }

  const policy = display.displayedSongPolicy;
  const techniqueResult = display.displayedTechniqueResult;
  const forcedTechnique = display.forcedTechnique;

  /**
   * "Why" (`reasons`) and "path taken" (`path`) are deliberately distinct in
   * the cockpit UI: `path` summarises *where the run stands* (checkpoint
   * status, reach probability), `reasons` explains *why the policy picked
   * this*. Built from the same typed fields the engine already exposes
   * rather than hand-written prose, so this stays accurate as the solver
   * evolves instead of quietly drifting from it.
   */
  const path: string[] = isTechniquePage
    ? (
        [
          techniqueResult?.terminalDecision
            ? t(techniqueResult.terminalDecision.reason)
            : null,
          techniqueResult
            ? `${pct(techniqueResult.reachProbability)} ${
                language === "fr" ? "d’atteindre la page" : "to reach the page"
              }`
            : null,
          techniqueResult
            ? `${pct(techniqueResult.goalProbability)} ${
                language === "fr" ? "sur l’objectif" : "on the goal"
              }`
            : null,
        ] satisfies (string | null)[]
      ).filter((step): step is string => Boolean(step))
    : policy
      ? [
          `${t({ code: "checkpoint.name", checkpointId: "songs-16" })} : ${
            RHYTHM_16_LABEL[language][policy.checkpoint16Status]
          }`,
          `${t({ code: "checkpoint.name", checkpointId: "songs-18" })} : ${t({
            code: "supply.status",
            status: policy.checkpoint18Status,
          })}`,
        ]
      : [];

  const songMetrics = (
    target: SongPolicyEvaluation,
  ): VisionDecision["metrics"] => [
    {
      label: target.action.startsWith("buy-")
        ? language === "fr"
          ? "Prochaine sélection"
          : "Next selection"
        : language === "fr"
          ? "Sélection préservée"
          : "Selection preserved",
      value: pct(target.nextSongProbability),
      detail:
        language === "fr"
          ? target.exactPageEnumeration
            ? "énumération exacte"
            : "projection bornée"
          : target.exactPageEnumeration
            ? "exact enumeration"
            : "bounded projection",
      tone:
        target.nextSongProbability >= 0.8
          ? "positive"
          : target.nextSongProbability >= 0.5
            ? "neutral"
            : "warning",
    },
    {
      label: language === "fr" ? "Cible conditionnelle" : "Conditional target",
      value: pct(target.priorityAffordableProbability),
      detail:
        language === "fr"
          ? "si la prochaine page est atteinte"
          : "if the next page is reached",
    },
    {
      label: language === "fr" ? "Repère de rythme 16" : "Rhythm marker 16",
      value: RHYTHM_16_LABEL[language][target.checkpoint16Status],
      detail:
        language === "fr"
          ? "indicateur de trajectoire, jamais une porte"
          : "trajectory indicator, never a gate",
      tone:
        target.checkpoint16Status === "secured-now" ? "positive" : "neutral",
    },
    {
      label: "Checkpoint 18",
      value: t({ code: "supply.status", status: target.checkpoint18Status }),
      detail:
        language === "fr"
          ? "diagnostic uniquement, jamais une porte de décision"
          : "diagnostic only, never a decision gate",
      tone:
        target.checkpoint18Status === "secured-now" ? "positive" : "neutral",
    },
    ...(target.nextSectionReadiness
      ? [
          {
            label: `${language === "fr" ? "Friendship attendue" : "Expected Friendship"} · ${
              target.nextSectionReadiness.horizonSections
            } ${language === "fr" ? "section" : "section"}${
              target.nextSectionReadiness.horizonSections > 1 ? "s" : ""
            }`,
            value: `+${num(target.nextSectionReadiness.expectedFriendshipBonus)}%`,
            detail: `${num(target.nextSectionReadiness.expectedRetainedTokens)} ${
              language === "fr" ? "tokens conservés" : "tokens retained"
            }`,
            tone: "positive" as const,
          },
        ]
      : []),
    {
      label: language === "fr" ? "Coût engagé" : "Committed cost",
      value: num(target.decisionVector.committedCost),
      detail: `${num(target.decisionVector.retainedTokens)} ${
        language === "fr" ? "tokens après action" : "tokens after action"
      }`,
    },
  ];

  const techniqueMetrics: VisionDecision["metrics"] = techniqueResult
    ? [
        {
          label:
            language === "fr" ? "Atteindre la sélection" : "Reach the pick",
          value: pct(techniqueResult.reachProbability),
          detail: `${techniqueResult.trials.toLocaleString(
            language === "fr" ? "fr-FR" : "en-US",
          )} ${language === "fr" ? "chemins évalués" : "paths evaluated"}`,
          tone:
            techniqueResult.reachProbability >= 0.8 ? "positive" : "neutral",
        },
        {
          label: language === "fr" ? "Objectif choisi" : "Chosen objective",
          value: pct(techniqueResult.goalProbability),
          detail: techniqueResult.objective,
        },
        {
          label: language === "fr" ? "Blocage immédiat" : "Immediate block",
          value: pct(techniqueResult.immediateBlockProbability),
          detail:
            language === "fr"
              ? "trois options impossibles"
              : "all three options impossible",
          tone:
            techniqueResult.immediateBlockProbability > 0.2
              ? "danger"
              : techniqueResult.immediateBlockProbability > 0.05
                ? "warning"
                : "positive",
        },
        {
          label: language === "fr" ? "Coût si réussite" : "Cost if successful",
          value: num(techniqueResult.averageSuccessSpend),
          detail:
            language === "fr"
              ? "jusqu’à la prochaine sélection"
              : "until the next pick",
        },
        ...(!forcedTechnique && techniqueResult.terminalDecision
          ? [
              {
                label:
                  language === "fr"
                    ? "Décision terminale"
                    : "Terminal decision",
                value:
                  techniqueResult.terminalDecision.action === "stop-now"
                    ? "STOP_NOW"
                    : "EXPOSE_AND_CARRY",
                detail: `${num(techniqueResult.terminalDecision.expectedCommittedCost)} ${
                  language === "fr" ? "tokens engagés" : "tokens committed"
                }`,
                tone:
                  techniqueResult.terminalDecision.action === "stop-now"
                    ? ("warning" as const)
                    : ("positive" as const),
              },
            ]
          : forcedTechnique
            ? [
                {
                  label: "Override",
                  value: `Option ${forcedTechnique.index + 1}`,
                  detail:
                    language === "fr"
                      ? "meilleur achat valide et non bloquant"
                      : "best valid, non-blocking purchase",
                  tone: "positive" as const,
                },
              ]
            : []),
      ]
    : [];

  /** Mirrors the original's read-only "all visible choices" comparison grid. */
  const songCandidates: VisionDecisionCandidate[] = (() => {
    if (!solver.songPolicy) return [];
    const bestPolicyFor = (songId: string | null) =>
      solver
        .songPolicy!.policies.filter(
          (item) => item.valid && item.songId === songId,
        )
        .sort((left, right) =>
          compareDecisionVectors(right.decisionVector, left.decisionVector),
        )[0] ?? null;

    const visible: VisionDecisionCandidate[] = run.selectionSongs.map(
      (song) => {
        const best = bestPolicyFor(song.id);
        const assessment = diagnostics.songChoiceAssessments.find(
          (item) => item.songId === song.id,
        );
        return {
          id: `song-${song.id}`,
          label: song.name,
          safety: assessment?.safety ?? "secondary",
          recommended:
            policy?.songId === song.id && policy.action.startsWith("buy-"),
          action: best
            ? policyActionLabel(best.action, L, best.continuationRecommendation)
            : language === "fr"
              ? "Non retenue"
              : "Not selected",
          summary: assessment?.blocking
            ? t(assessment.blocking.detail)
            : best
              ? best.reasons[0]
                ? t(best.reasons[0])
                : undefined
              : language === "fr"
                ? "Aucune politique d’achat admissible."
                : "No admissible purchase policy.",
          cost: song.cost,
          metrics: best
            ? [
                { label: "Next", value: pct(best.nextSongProbability) },
                {
                  label: language === "fr" ? "Cible" : "Target",
                  value: pct(best.priorityAffordableProbability),
                },
              ]
            : [],
        };
      },
    );

    const passive = bestPolicyFor(null);
    if (passive) {
      visible.push({
        id: `policy-${passive.action}`,
        label:
          passive.action === "stop-and-carry-stock"
            ? language === "fr"
              ? "Conserver tout le stock"
              : "Keep the whole stock"
            : passive.action === "carry-page"
              ? language === "fr"
                ? "Porter la page"
                : "Carry the page"
              : language === "fr"
                ? "Ne rien acheter"
                : "Buy nothing",
        safety: policy?.id === passive.id ? "recommended" : "secondary",
        recommended: policy?.id === passive.id,
        action: policyActionLabel(
          passive.action,
          L,
          passive.continuationRecommendation,
        ),
        summary: passive.reasons[0] ? t(passive.reasons[0]) : undefined,
        metrics: [
          { label: "Next", value: pct(passive.nextSongProbability) },
          {
            label: language === "fr" ? "Stock" : "Stock",
            value: num(passive.decisionVector.retainedTokens),
          },
        ],
      });
    }

    return visible.sort(
      (left, right) =>
        Number(right.recommended) - Number(left.recommended) ||
        SAFETY_RANK[left.safety] - SAFETY_RANK[right.safety],
    );
  })();

  const techniqueCandidates: VisionDecisionCandidate[] = techniqueResult
    ? solver.optionAnalyses.map((analysis) => {
        const index = analysis.index ?? 0;
        const assessment = diagnostics.techniqueChoiceAssessments.find(
          (item) => item.index === index,
        );
        const terminal = analysis.result.terminalDecision;
        return {
          id: `technique-${index}`,
          label: `Option ${index + 1}`,
          safety: assessment?.safety ?? "secondary",
          recommended: display.displayedTechniqueIndex === index,
          action:
            forcedTechnique?.index === index
              ? language === "fr"
                ? "Acheter · Push forcé"
                : "Buy · Forced push"
              : terminal
                ? terminal.action === "stop-now"
                  ? language === "fr"
                    ? "Ne pas acheter · arrêter maintenant"
                    : "Don't buy · stop now"
                  : language === "fr"
                    ? "Acheter puis exposer une page"
                    : "Buy, then expose a page"
                : analysis.result.recommendation.toUpperCase(),
          summary: assessment?.blocking
            ? t(assessment.blocking.detail)
            : forcedTechnique?.index === index
              ? language === "fr"
                ? "Meilleur achat valide et non bloquant ; verdict STOP/HOLD normal ignoré."
                : "Best valid, non-blocking purchase; normal STOP/HOLD verdict overridden."
              : terminal
                ? t(terminal.reason)
                : t(planExitMessage(solver.strategicPlan)),
          cost: analysis.cost,
          metrics: [
            {
              label: language === "fr" ? "Atteinte" : "Reach",
              value: pct(analysis.result.reachProbability),
            },
            {
              label: language === "fr" ? "Objectif" : "Goal",
              value: pct(analysis.result.goalProbability),
            },
          ],
        };
      })
    : [];

  /**
   * Mirrors the original's blocking-warning logic: the displayed choice's own
   * blocking detail takes priority; otherwise, if any *other* choice is
   * blocking, a count — never a fabricated field unrelated to blocking.
   */
  const blockingCount = [
    ...diagnostics.techniqueChoiceAssessments,
    ...diagnostics.songChoiceAssessments,
  ].filter((item) => item.safety === "hard-blocking").length;
  const warning = diagnostics.displayedBlocking
    ? diagnostics.displayedBlockingAssessment?.blocking
      ? t(diagnostics.displayedBlockingAssessment.blocking.detail)
      : undefined
    : blockingCount > 0
      ? language === "fr"
        ? `${blockingCount} choix bloquant${blockingCount > 1 ? "s" : ""} signalé${blockingCount > 1 ? "s" : ""} en rouge.`
        : `${blockingCount} blocking choice${blockingCount > 1 ? "s" : ""} flagged in red.`
      : undefined;

  const target =
    policy?.songName ??
    (display.displayedTechniqueIndex !== null
      ? `Option ${display.displayedTechniqueIndex + 1}`
      : null);
  const headline = diagnostics.displayedBlocking
    ? language === "fr"
      ? `Moins mauvais choix · BLOQUANT · ${target ?? ""}`
      : `Least-bad choice · BLOCKING · ${target ?? ""}`
    : policy
      ? policy.action.startsWith("buy-")
        ? `${policyActionLabel(policy.action, L, policy.continuationRecommendation)} · ${policy.songName ?? ""}`
        : policyActionLabel(policy.action, L, policy.continuationRecommendation)
      : display.displayedOverride
        ? `${language === "fr" ? "Push forcé" : "Forced push"} · Option ${
            (display.displayedTechniqueIndex ?? 0) + 1
          }`
        : techniqueResult
          ? (solver.recommendation?.label ?? "")
          : "";

  const summary = diagnostics.displayedBlocking
    ? diagnostics.displayedBlockingAssessment?.blocking
      ? t(diagnostics.displayedBlockingAssessment.blocking.detail)
      : language === "fr"
        ? "Tous les chemins disponibles perdent une contrainte immédiate."
        : "Every available path loses an immediate constraint."
    : display.displayedOverride
      ? language === "fr"
        ? "Le solveur normal recommande l’arrêt ; meilleur chemin non bloquant affiché par override."
        : "The normal solver recommends stopping; best non-blocking path shown via override."
      : ((policy?.reasons[0] && t(policy.reasons[0])) ??
        (techniqueResult?.terminalDecision &&
          t(techniqueResult.terminalDecision.reason)) ??
        solver.recommendation?.detail ??
        "");

  return {
    bestTechniqueIndex: display.displayedTechniqueIndex,
    alternativeTechniqueIndex: display.alternativeTechniqueIndex,
    recommendedSongId: display.displayedSongId,
    alternativeSongId: null,
    techniqueDiagnostics: diagnostics.techniqueChoiceAssessments.map(
      (item) => ({
        id: String(item.index),
        safety: item.safety,
        reason: item.blocking ? t(item.blocking.detail) : undefined,
      }),
    ),
    songDiagnostics: diagnostics.songChoiceAssessments.map((item) => ({
      id: item.songId,
      safety: item.safety,
      reason: item.blocking ? t(item.blocking.detail) : undefined,
    })),
    headline,
    summary,
    path,
    plan: {
      label: t(planLabelMessage(solver.strategicPlan)),
      detail: t(planExitMessage(solver.strategicPlan)),
      fallback: t(planFallbackMessage(solver.strategicPlan)),
    },
    reasons: (policy?.reasons ?? []).map(t),
    metrics: isTechniquePage
      ? techniqueMetrics
      : policy
        ? songMetrics(policy)
        : [],
    candidates: policy ? songCandidates : techniqueCandidates,
    warning,
    overrideActive: display.displayedOverride,
    stale: solver.isStale,
    loading: false,
  };
};

type SnapshotSlotProps = SlotContext & {
  /**
   * Owned by whatever renders the top-bar trigger button, not by this
   * component: `SnapshotCompanionPanel` renders nothing at all while closed
   * (`if (!open) return null`), so the button that opens it necessarily lives
   * in a different slot (`topBarActions`). The two must share one state.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SnapshotSlot({
  open,
  onOpenChange,
  ...context
}: SnapshotSlotProps) {
  const { actions, diagnostics, display, run, settings } = context;
  // Concert titles and dates are user-facing copy, so they live in the shared
  // catalogue rather than in the CONCERTS constant.
  const L = useLabels();
  const { t, language } = useLanguage();

  /**
   * Local to the desktop: a token baseline only becomes meaningful once a
   * capture has actually read the tokens once. Before that, continuity checks
   * would compare against manually typed values and flag phantom drift.
   */
  const [baselineReady, setBaselineReady] = useState(false);

  const reportError = (error: unknown) => {
    diagnostics.setDecisionLogError(
      error instanceof Error ? error.message : String(error),
    );
  };

  const applySnapshot = (snapshot: VisionSnapshot) => {
    setBaselineReady(true);
    const tokens: Partial<Record<keyof Balance, number>> = {};
    for (const key of TOKEN_KEYS) {
      const value = snapshot.tokens[key]?.value;
      if (value !== undefined && value !== null) tokens[key] = value;
    }
    actions.applyExternalState({
      source: "ocr",
      page: snapshot.page === "songs" ? "songs" : "techniques",
      tokens,
      techniqueCosts: [0, 1, 2].map(
        (slot) =>
          snapshot.techniques.find((item) => item.slot === slot)?.cost ?? null,
      ),
      recognizedSongIds: snapshot.songs
        .map((song) => song.songId)
        .filter((songId): songId is string => Boolean(songId)),
      logPayload: {
        page: snapshot.page,
        pageConfidence: snapshot.pageConfidence,
        warnings: snapshot.warnings,
        tokens: snapshot.tokens,
        techniques: snapshot.techniques,
        songs: snapshot.songs,
      },
      timings: snapshot.timings,
    });
  };

  return (
    <SnapshotCompanionPanel
      open={open}
      language={language}
      onOpen={() => onOpenChange(true)}
      onClose={() => onOpenChange(false)}
      expectedPage={run.songSelectionOpen ? "songs" : "techniques"}
      context={{
        period: run.techniqueInputPeriod,
        songs: run.availableSongs,
        expectedSongCount: run.expectedOfferCount,
      }}
      availableSongIds={run.availableSongs.map((song) => song.id)}
      decision={buildDecision(context, t, language, L)}
      tokenContinuityBaseline={baselineReady ? run.tokens : null}
      decisionTools={{
        concertIndex: run.concertIndex,
        concerts: CONCERTS.map(({ short }, index) => ({
          short,
          title: L.meta.concertTitles[index] ?? short,
          date: L.meta.concertDates[index] ?? "",
        })),
        concertLabel:
          L.meta.concertTitles[run.concertIndex] ?? run.concert.short,
        concertPeriod: run.concert.period,
        techniqueOfferCarried: run.techniqueOfferPeriod !== null,
        nextConcertLabel:
          run.concertIndex < CONCERTS.length - 1
            ? CONCERTS[run.concertIndex + 1].short
            : null,
        songCycle: run.songCycle,
        techniquesDone: run.techniquesDone,
        techniquesTarget: run.target,
        songsThisSection: run.songsThisSection,
        gaugeSongs: run.gaugeSongs,
        totalSongs: run.ownedSongs.size + 1,
        timingMode: run.timingMode,
        dynamicSpending: settings.dynamicSpending,
        solverMode: settings.solverMode,
        riskProfile: settings.riskProfile,
        generationProfile: settings.generationProfile,
        analysisObjective: settings.analysisObjective,
        forcePushOverride: display.forcePushOverride,
        pipelineTimings: diagnostics.pipelineTimings,
        decisionLogStatus: diagnostics.decisionLogStatus,
        decisionLogError: diagnostics.decisionLogError,
        canAdvanceConcert: run.concertTransitionBlock === null,
        canUndo: run.canUndo,
        automaticCarryoverPage: run.shouldCarryVisibleSongPage
          ? "songs"
          : run.techniqueOfferPeriod !== null
            ? "techniques"
            : null,
        advanceDisabledReason: run.concertTransitionBlock ?? "",
        advanceWarning: "",
        onTimingModeChange: settings.setTimingMode,
        onDynamicSpendingChange: settings.setDynamicSpending,
        onSolverModeChange: settings.setSolverMode,
        onRiskProfileChange: settings.setRiskProfile,
        onGenerationProfileChange: settings.setGenerationProfile,
        onAnalysisObjectiveChange: settings.setAnalysisObjective,
        onForcePushOverrideChange: actions.changeForcePushOverride,
        onExportDecisionLog: () => {
          void readDecisionLog().then(downloadDecisionLog).catch(reportError);
        },
        onOpenDecisionLogDirectory: () => {
          void openDecisionLogDirectory().catch(reportError);
        },
        onClearDecisionLog: () => {
          void clearDecisionLog()
            .then((status) => {
              diagnostics.setDecisionLogStatus(status);
              diagnostics.setDecisionLogError(null);
            })
            .catch(reportError);
        },
        onUndo: actions.undoLastAction,
        onAdvanceConcert: actions.advanceConcert,
      }}
      onApply={applySnapshot}
      onPipelineTimings={actions.setPipelineTimings}
      onConfirmTechniquePurchase={(slot) =>
        actions.recordTechniquePurchase(slot)
      }
      onConfirmSongPurchase={(songId) => {
        const song = run.availableSongs.find(
          (candidate) => candidate.id === songId,
        );
        return song ? actions.buySong(song) : false;
      }}
    />
  );
}
