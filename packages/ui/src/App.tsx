import {
  EMPTY_SLOTS,
  renderSlot,
  type SlotContext,
  type UiSlots,
} from "./slots.tsx";
import type { Message } from "@glcp/core/i18n";
import { useLanguage } from "./i18n/LanguageContext.tsx";
import type {
  ActionsView,
  DiagnosticsView,
  DisplayView,
  RunView,
  SettingsView,
  SolverView,
  TechniqueEntryView,
  ExternalStateIntake,
} from "./view-model.ts";
import { AnalysisAside } from "./components/AnalysisAside.tsx";
import { DecisionColumn } from "./components/DecisionColumn.tsx";
import { ProgressPanel } from "./components/ProgressPanel.tsx";
import { AppFooter } from "./components/AppFooter.tsx";
import { ConcertTrack } from "./components/ConcertTrack.tsx";
import { Intro } from "./components/Intro.tsx";
import { RunPulsePanel } from "./components/RunPulsePanel.tsx";
import { SongsPanel } from "./components/SongsPanel.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { WorkflowBar } from "./components/WorkflowBar.tsx";
import { workflowScrollTarget } from "./workflow-scroll.ts";
import {
  CONCERTS,
  INITIAL_CANDIDATE,
  INITIAL_OWNED,
  INITIAL_TOKENS,
  LEGACY_SESSION_STORAGE_KEY,
  PRIORITY_RANK,
  SESSION_STORAGE_KEY,
  emptyBalance,
  emptyQuickBuilder,
  signatureOf,
  type LiveSnapshot,
  type OptionAnalysis,
  type QuickTechniqueBuilder,
  type SolverMode,
  type SongFilter,
  THEME_IDS,
  type ThemeId,
  type WorkflowMode,
} from "./constants.tsx";

import { planExitMessage, planLabelMessage } from "@glcp/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TOKEN_KEYS,
  buildQuickTechniqueCost,
  buildSolverStateContext,
  canAfford,
  createTechniqueSimulationMemo,
  evaluateTechniqueStrategy,
  getDuoSplitSecondaryToken,
  getTechniqueLevelOptions,
  runAnalysis,
  subtractCost,
  totalCost,
} from "@glcp/core";
import { calculateOfferPercentile, calculateRunPulse } from "@glcp/core";
import type {
  AnalysisObjective,
  AnalysisResult,
  Balance,
  GenerationProfile,
  RiskProfile,
  TokenKey,
} from "@glcp/core";
import { analyzeSongSelection, type SongPolicyResult } from "@glcp/core";
import {
  applyPromotionalLiveTransition,
  automaticGaugeSongsForConcert,
  concertTransitionBlockReason,
  resolveTechniqueInputPeriod,
  techniqueOfferPeriodAfterConcert,
  techniqueOfferPeriodAfterTechniquePurchase,
  type Period,
  gaugeSongCount,
  isGreatSuccess,
  manualSongsForGreatSuccess,
  techniquesForSongCycle,
  tokenCapForSection,
  type TimingMode,
} from "@glcp/core";
import { deriveStrategicPlan } from "@glcp/core";
import { rankObservedTechniques } from "@glcp/core";
import { evaluateTerminalTechniqueOptions } from "@glcp/core";
import {
  selectForcedSongPolicy,
  selectForcedTechniqueCandidate,
} from "@glcp/core";
import type {
  PulseConcertEvent,
  PulseOfferEvent,
  PulsePurchaseEvent,
  RunPulseEvent,
} from "@glcp/core";
import { SONGS, type Song, type UnlockPhase } from "@glcp/core";
import { sanitizePersistedSongState } from "@glcp/core";
import { selectCarryoverPolicy } from "@glcp/core";
import {
  assessSongChoices,
  assessTechniqueChoices,
  type SongChoiceAssessment,
  type TechniqueChoiceAssessment,
} from "@glcp/core";
import {
  appendDecisionLog,
  initializeDecisionLog,
  loggedTrackedBalanceAfterConcert,
  loggedBalanceAfterPurchase,
  nextDecisionLogId,
  type DecisionLogChoice,
  type DecisionLogEntryDraft,
  type DecisionLogState,
  type DecisionSinkStatus,
  type PipelineTimings,
} from "@glcp/core";

export type AppProps = {
  /** Injected by the host application: the shared shell owns no identity. */
  appVersion: string;
  /** Shown in the footer next to the version: "Web", "Desktop". */
  surfaceName: string;
  /** Writes the decision log wherever this surface stores it. */
  onExportDecisionLog: () => Promise<void>;
  /** Capabilities the host adds; see `slots.tsx`. */
  slots?: UiSlots;
};

export default function App({
  appVersion,
  surfaceName,
  onExportDecisionLog,
  slots = EMPTY_SLOTS,
}: AppProps) {
  const { L, t } = useLanguage();
  const [theme, setTheme] = useState<ThemeId>("light");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("live");
  const [concertIndex, setConcertIndex] = useState(0);
  const [songCycle, setSongCycle] = useState(1);
  const [techniquesDone, setTechniquesDone] = useState(0);
  const [songsThisSection, setSongsThisSection] = useState(0);
  const [visibleSongIds, setVisibleSongIds] = useState<Set<string>>(new Set());
  const [activeSongIds, setActiveSongIds] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState<Balance>(INITIAL_TOKENS);
  const [candidateCosts, setCandidateCosts] = useState<Balance[]>([
    { ...INITIAL_CANDIDATE },
    { ...INITIAL_CANDIDATE },
    { ...INITIAL_CANDIDATE },
  ]);
  const [quickBuilders, setQuickBuilders] = useState<QuickTechniqueBuilder[]>([
    emptyQuickBuilder(),
    emptyQuickBuilder(),
    emptyQuickBuilder(),
  ]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [solverMode, setSolverMode] = useState<SolverMode>("express");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("standard");
  const [generationProfile, setGenerationProfile] =
    useState<GenerationProfile>("speed-wit");
  const [analysisObjective, setAnalysisObjective] =
    useState<AnalysisObjective>("priority-song");
  const [ownedSongs, setOwnedSongs] = useState<Set<string>>(
    new Set(INITIAL_OWNED),
  );
  const [songFilter, setSongFilter] = useState<SongFilter>("available");
  // Period the currently displayed technique page was generated with. `null`
  // means the page follows the current concert period.
  const [techniqueOfferPeriod, setTechniqueOfferPeriod] =
    useState<Period | null>(null);
  const [carryoverSongIds, setCarryoverSongIds] = useState<string[] | null>(
    null,
  );
  const [dynamicSpending, setDynamicSpending] = useState(false);
  const [timingMode, setTimingMode] = useState<TimingMode>("section-open");
  const [abandonedChaseTargetIds, setAbandonedChaseTargetIds] = useState<
    Set<string>
  >(new Set());
  const [runPulseBeta, setRunPulseBeta] = useState(false);
  const [runPulseEvents, setRunPulseEvents] = useState<RunPulseEvent[]>([]);
  const [runPulseStartedAtConcert, setRunPulseStartedAtConcert] = useState<
    number | null
  >(null);
  const [history, setHistory] = useState<LiveSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [optionAnalyses, setOptionAnalyses] = useState<OptionAnalysis[]>([]);
  const [bestOptionIndex, setBestOptionIndex] = useState<number | null>(null);
  const [analyzedSignature, setAnalyzedSignature] = useState("");
  // Timings of the last external capture pipeline. Purely diagnostic: the
  // browser surface never sets it, the desktop cockpit does.
  const [pipelineTimings, setPipelineTimings] =
    useState<PipelineTimings | null>(null);
  const [songPolicy, setSongPolicy] = useState<SongPolicyResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forcePushOverride, setForcePushOverride] = useState(false);
  const [decisionLogStatus, setDecisionLogStatus] =
    useState<DecisionSinkStatus | null>(null);
  const [decisionLogError, setDecisionLogError] = useState<string | null>(null);
  const lastDecisionLogIdRef = useRef<string | null>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const analysisRequestRef = useRef(0);
  const songWorkflowAnchorRef = useRef<HTMLDivElement | null>(null);
  const techniqueWorkflowAnchorRef = useRef<HTMLDivElement | null>(null);

  const concert = CONCERTS[concertIndex];
  const techniqueInputPeriod = resolveTechniqueInputPeriod(
    concert.period,
    techniqueOfferPeriod,
  );
  const phaseUnlock = Math.min(concertIndex, 3) as UnlockPhase;
  const nextPhaseUnlock = Math.min(concertIndex + 1, 3) as UnlockPhase;
  const unlockedSongs = SONGS.filter((song) => song.unlockPhase <= phaseUnlock);
  const availableSongs = unlockedSongs.filter(
    (song) => !ownedSongs.has(song.id),
  );
  const ownedUnlockedSongs = unlockedSongs.filter((song) =>
    ownedSongs.has(song.id),
  );
  const lockedSongs = SONGS.filter((song) => song.unlockPhase > phaseUnlock);
  const visibleSongsUnsorted =
    songFilter === "available"
      ? availableSongs
      : songFilter === "owned"
        ? ownedUnlockedSongs
        : lockedSongs;
  const visibleSongs = [...visibleSongsUnsorted].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  const nextSongCover =
    availableSongs[0]?.image ??
    ownedUnlockedSongs.at(-1)?.image ??
    "assets/songs/kiseki.webp";

  const targetRule = techniquesForSongCycle(concertIndex, songCycle);
  const patternUnsupported = targetRule === null;
  const target = targetRule ?? 0;
  const remaining = patternUnsupported
    ? 0
    : Math.max(0, target - techniquesDone);
  const songSelectionOpen =
    !patternUnsupported && (remaining === 0 || carryoverSongIds !== null);
  const manualGaugeTarget = manualSongsForGreatSuccess(concertIndex);
  const automaticGaugeSongs = automaticGaugeSongsForConcert(concertIndex);
  const gaugeSongs = gaugeSongCount(concertIndex, songsThisSection);
  const tokenCap = tokenCapForSection(concertIndex);
  const selectedOfferIds =
    visibleSongIds.size > 0 ? visibleSongIds : new Set(carryoverSongIds ?? []);
  const selectionSongs = availableSongs
    .filter((song) => selectedOfferIds.has(song.id))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const expectedOfferCount =
    carryoverSongIds !== null && visibleSongIds.size === 0
      ? carryoverSongIds.length
      : Math.min(3, availableSongs.length);
  const songOfferComplete =
    expectedOfferCount > 0 && selectionSongs.length === expectedOfferCount;
  // v0.22.16 made carryover repeatable: an active carryover no longer blocks
  // the transition, so the engine dropped `hasActiveCarryover` from the input.
  const concertTransitionBlock = concertTransitionBlockReason({
    concertIndex,
    concertCount: CONCERTS.length,
    songSelectionReady: remaining === 0,
    songOfferComplete,
  });
  const solverContext = useMemo(
    () =>
      buildSolverStateContext({
        catalog: SONGS,
        concertIndex,
        period: concert.period,
        techniqueOfferPeriod,
        songCycle,
        techniquesToNextSong: carryoverSongIds ? 0 : remaining,
        tokens,
        ownedSongIds: Array.from(ownedSongs),
        activeSongIds: Array.from(activeSongIds),
        selectedOfferIds: Array.from(selectedOfferIds),
        currentTechniqueOffers: candidateCosts.every(
          (cost) => totalCost(cost) > 0,
        )
          ? candidateCosts
          : undefined,
        solverMode,
        riskProfile,
        generationProfile,
        analysisObjective,
        songsThisSection,
        totalSongs: ownedSongs.size + 1,
        timingMode,
        abandonedChaseTargetIds: Array.from(abandonedChaseTargetIds),
      }),
    [
      concertIndex,
      concert.period,
      techniqueOfferPeriod,
      songCycle,
      remaining,
      carryoverSongIds,
      tokens,
      ownedSongs,
      activeSongIds,
      visibleSongIds,
      candidateCosts,
      solverMode,
      riskProfile,
      generationProfile,
      analysisObjective,
      songsThisSection,
      timingMode,
      abandonedChaseTargetIds,
    ],
  );
  const songTargets = solverContext.currentSongs;
  const futureSongTargets = solverContext.futureSongs;
  const laterSongTargets = solverContext.laterSongs;
  const strategicPlan = solverContext.strategicPlan;
  const protectedReserveSongTargets = solverContext.protectedReserveSongs;
  const pressurePreview = solverContext.tokenPressure;
  const reservePlanPreview = solverContext.tokenReservePlan;
  const effectiveGenerationProfile = solverContext.effectiveGenerationProfile;
  const effectiveRiskProfile = solverContext.effectiveRiskProfile;
  const friendshipSongMultiplier = solverContext.friendshipSongMultiplier;
  const selectedTargetsById = new Map(
    solverContext.visibleSongs.map((song) => [song.id, song]),
  );
  const selectedSongTargets = selectionSongs.flatMap((song) => {
    const target = selectedTargetsById.get(song.id);
    return target ? [target] : [];
  });
  const targetById = new Map(
    solverContext.allReserveSongs.map((song) => [song.id, song]),
  );
  const currentSignature = signatureOf(
    concertIndex,
    techniqueOfferPeriod,
    songCycle,
    techniquesDone,
    tokens,
    candidateCosts,
    analysisObjective,
    songTargets.map((song) => song.id),
    Array.from(selectedOfferIds).sort(),
    songsThisSection,
    solverMode,
    riskProfile,
    generationProfile,
    timingMode,
    Array.from(abandonedChaseTargetIds),
    Array.from(ownedSongs),
    Array.from(activeSongIds),
    carryoverSongIds,
  );
  const isStale =
    Boolean(result || songPolicy) && currentSignature !== analyzedSignature;
  const activeSongs = SONGS.filter((song) => activeSongIds.has(song.id));
  const ownedBonusTotals = activeSongs.reduce(
    (totals, song) => ({
      ...totals,
      [song.liveBonusType]: totals[song.liveBonusType] + song.liveBonusValue,
    }),
    { friendship: 0, speciality: 5, event: 0 },
  );
  const pendingBonusCount = Array.from(ownedSongs).filter(
    (id) => !activeSongIds.has(id),
  ).length;
  const songsToRender = visibleSongs;
  const candidateTotals = candidateCosts.map(totalCost);
  const hasIncompleteQuickOption = quickBuilders.some(
    (builder) =>
      Boolean(builder.kind) &&
      builder.selectedTokens.length <
        (builder.kind === "duo-balanced" || builder.kind === "duo-split"
          ? 2
          : 1),
  );
  const futureTopCount = SONGS.filter(
    (song) =>
      song.unlockPhase > phaseUnlock &&
      song.unlockPhase <= nextPhaseUnlock &&
      song.priority === "top" &&
      !ownedSongs.has(song.id),
  ).length;
  const techniqueStrategy =
    result && !isStale
      ? evaluateTechniqueStrategy({
          concertIndex,
          songsThisSection,
          tokens,
          currentSongs: songTargets,
          futureSongs: futureSongTargets,
          futureTopCount,
          result,
          strategicPlan,
        })
      : null;
  const runPulseSummary = calculateRunPulse(runPulseEvents, {
    startedAtConcert: runPulseStartedAtConcert,
  });
  const latestPulseOffer = [...runPulseEvents]
    .reverse()
    .find((event): event is PulseOfferEvent => event.type === "song-offer");
  const latestPulsePurchase = [...runPulseEvents]
    .reverse()
    .find(
      (event): event is PulsePurchaseEvent => event.type === "song-purchase",
    );
  const latestPulseConcert = [...runPulseEvents]
    .reverse()
    .find((event): event is PulseConcertEvent => event.type === "concert");

  const recordCurrentSongOffer = () => {
    if (
      !runPulseBeta ||
      workflowMode !== "live" ||
      carryoverSongIds !== null ||
      !songOfferComplete
    ) {
      return;
    }
    const poolValues = songTargets.map((song) => ({
      id: song.id,
      name: song.name,
      value: song.policyValue ?? song.utility * 18,
    }));
    const offerIds = selectedSongTargets.map((song) => song.id).sort();
    const bestSong = [...selectedSongTargets].sort(
      (a, b) =>
        (b.policyValue ?? b.utility * 18) - (a.policyValue ?? a.utility * 18),
    )[0];
    const event: PulseOfferEvent = {
      id: `offer:${concertIndex}:${songCycle}`,
      type: "song-offer",
      concertIndex,
      songCycle,
      offerIds,
      percentile: calculateOfferPercentile(poolValues, offerIds),
      bestSongName: bestSong?.name ?? L.app.selectionInconnue,
    };
    setRunPulseEvents((current) => [
      ...current.filter((item) => item.id !== event.id),
      event,
    ]);
  };

  const currentDecisionLogState = (
    overrides: Partial<DecisionLogState> = {},
  ): DecisionLogState => ({
    concertIndex,
    concertPeriod: concert.period,
    techniqueOfferPeriod,
    songCycle,
    techniquesDone,
    techniquesTarget: target,
    songsThisSection,
    totalSongs: ownedSongs.size + 1,
    timingMode,
    tokens: { ...tokens },
    visibleSongIds: Array.from(visibleSongIds),
    carryoverSongIds: carryoverSongIds ? [...carryoverSongIds] : null,
    abandonedChaseTargetIds: Array.from(abandonedChaseTargetIds),
    solverMode,
    riskProfile: effectiveRiskProfile,
    generationProfile: effectiveGenerationProfile,
    objective: analysisObjective,
    plan: {
      id: strategicPlan.id,
      mode: strategicPlan.mode,
      label: t(planLabelMessage(strategicPlan)),
    },
    stateSignature: currentSignature,
    ...overrides,
  });

  const writeDecisionLog = (entry: DecisionLogEntryDraft) => {
    void appendDecisionLog(entry)
      .then((status) => {
        if (status) setDecisionLogStatus(status);
        setDecisionLogError(null);
      })
      .catch((error: unknown) => {
        setDecisionLogError(
          error instanceof Error ? error.message : String(error),
        );
      });
  };

  const logUserChoice = (
    choice: DecisionLogChoice,
    stateAfter?: DecisionLogState,
  ) => {
    const id = nextDecisionLogId();
    writeDecisionLog({
      id,
      timestamp: new Date().toISOString(),
      event: "choice",
      source: "manual",
      state: currentDecisionLogState(),
      stateAfter,
      choice,
      previousDecisionId: lastDecisionLogIdRef.current,
    });
  };

  const changeForcePushOverride = (enabled: boolean) => {
    setForcePushOverride(enabled);
    logUserChoice({
      kind: "override",
      id: enabled ? "push-forced-enabled" : "push-forced-disabled",
      label: enabled ? L.app.pushForceActive : L.app.pushForceDesactive,
      tokenAccounting: "none",
      recommended: false,
    });
  };

  const performCurrentAnalysis = () => {
    const solverStartedAt = performance.now();
    if (songSelectionOpen) {
      if (selectedSongTargets.length === 0) {
        setSongPolicy(null);
        setResult(null);
        return;
      }
      recordCurrentSongOffer();
      const policy = analyzeSongSelection({
        period: concert.period,
        firstOfferPeriod: solverContext.firstOfferPeriod,
        tokens,
        visibleSongs: selectedSongTargets,
        remainingSongs: songTargets,
        futureSongs: futureSongTargets,
        laterSongs: laterSongTargets,
        techniquesToNextSong:
          techniquesForSongCycle(concertIndex, songCycle + 1) ?? 0,
        songsThisSection,
        totalSongs: ownedSongs.size + 1,
        concertIndex,
        generationProfile: effectiveGenerationProfile,
        friendshipSongMultiplier,
        remainingTrainingsByFacility:
          solverContext.remainingTrainings ?? undefined,
        riskProfile: effectiveRiskProfile,
        trials: solverMode === "express" ? 7000 : 12000,
        nextSongCycle: songCycle + 1,
        timingMode,
        maxSongPages:
          techniquesForSongCycle(concertIndex, songCycle + 1) === null ? 1 : 4,
        continuationObjective:
          solverMode === "expert" ? analysisObjective : undefined,
        abandonedChaseTargetIds: Array.from(abandonedChaseTargetIds),
      });
      const normalPolicyStops = policy.recommended?.action !== "buy-continue";
      const forcedPolicy =
        forcePushOverride && normalPolicyStops
          ? selectForcedSongPolicy(policy)
          : null;
      const displayed = forcedPolicy ?? policy.recommended;
      const assessments = assessSongChoices({
        policyResult: policy,
        visibleSongIds: selectedSongTargets.map((song) => song.id),
        recommendedSongId: displayed?.action.startsWith("buy-")
          ? displayed.songId
          : null,
        recommendedPolicyId: displayed?.id ?? null,
      });
      setSongPolicy(policy);
      setResult(null);
      setOptionAnalyses([]);
      setBestOptionIndex(null);
      setAnalyzedSignature(currentSignature);

      const solverMs = performance.now() - solverStartedAt;
      const timings: PipelineTimings = {
        solverMs,
        totalMs: solverMs,
        solverBreakdown: { ...policy.diagnostics },
      };
      const previousDecisionId = lastDecisionLogIdRef.current;
      const id = nextDecisionLogId();
      lastDecisionLogIdRef.current = id;
      writeDecisionLog({
        id,
        timestamp: new Date().toISOString(),
        event: "recommendation",
        source: "manual",
        state: currentDecisionLogState(),
        recommendation: {
          page: "songs",
          normal: policy.recommended
            ? `${policy.recommended.action}:${policy.recommended.songId ?? "none"}`
            : "none",
          displayed: displayed
            ? `${displayed.action}:${displayed.songId ?? "none"}`
            : "none",
          overrideActive: Boolean(forcedPolicy),
          reasons: displayed?.reasons ?? [],
          candidates: policy.policies.map((candidate) => {
            const assessment = candidate.songId
              ? assessments.find((item) => item.songId === candidate.songId)
              : null;
            const nextSection = candidate.nextSectionReadiness;
            return {
              id: candidate.id,
              label: candidate.songName,
              safety: !candidate.valid
                ? "invalid"
                : candidate.id === displayed?.id
                  ? "recommended"
                  : candidate.action.startsWith("buy-")
                    ? (assessment?.safety ?? "secondary")
                    : "secondary",
              valid: candidate.valid,
              overrideEligible: candidate.overrideEligible,
              action: candidate.action,
              cost: candidate.songId
                ? selectedSongTargets.find(
                    (song) => song.id === candidate.songId,
                  )?.cost
                : undefined,
              blockingReason: candidate.action.startsWith("buy-")
                ? assessment?.blocking?.detail
                : undefined,
              reasons: [...candidate.reasons],
              reachProbability: candidate.nextSongProbability,
              goalProbability: candidate.priorityAffordableProbability,
              greatSuccessProbability: candidate.greatSuccessProbability,
              continuationRecommendation: candidate.continuationRecommendation,
              postPurchasePlanId: candidate.postPurchasePlanId,
              postPurchaseObjective: candidate.postPurchaseObjective,
              abandonsHunt: candidate.abandonsHunt,
              huntAbandonReason: candidate.huntAbandonReason,
              checkpoint16Status: candidate.checkpoint16Status,
              checkpoint18Status: candidate.checkpoint18Status,
              finalGateStatus: candidate.finalGateStatus,
              valueOutcome: { ...candidate.valueOutcome },
              nextSectionReadiness: nextSection
                ? {
                    horizonSections: nextSection.horizonSections,
                    valueConcertIndex: nextSection.valueConcertIndex,
                    checkpointRequired: nextSection.checkpointRequired,
                    checkpointProbability: nextSection.checkpointProbability,
                    friendship10Probability:
                      nextSection.friendship10Probability,
                    expectedFriendshipBonus:
                      nextSection.expectedFriendshipBonus,
                    expectedLessonSkillPoints:
                      nextSection.expectedLessonSkillPoints,
                    expectedRetainedBalance: {
                      ...nextSection.expectedRetainedBalance,
                    },
                  }
                : undefined,
              decisionVector: {
                hard: candidate.decisionVector.hard,
                riskAdmissible: candidate.decisionVector.riskAdmissible,
                prospective: candidate.decisionVector.prospective
                  ? [...candidate.decisionVector.prospective]
                  : undefined,
                structural: candidate.decisionVector.structural,
                continuation: [...candidate.decisionVector.continuation],
                retainedTokens: candidate.decisionVector.retainedTokens,
                committedCost: candidate.decisionVector.committedCost,
              },
            };
          }),
        },
        timings,
        previousDecisionId,
      });
      return;
    }

    const effectiveObjective = solverContext.effectiveObjective;
    const enteredOptions = candidateCosts
      .map((cost, index) => ({ cost, index }))
      .filter(({ cost }) => totalCost(cost) > 0);
    const techniqueMemo = createTechniqueSimulationMemo();
    const rawAnalyses: OptionAnalysis[] =
      enteredOptions.length > 0
        ? enteredOptions.map(({ cost, index }) => ({
            index,
            cost,
            result: runAnalysis({
              period: concert.period,
              firstOfferPeriod: solverContext.firstOfferPeriod,
              tokens,
              candidateCost: cost,
              techniquesRemaining: carryoverSongIds ? 0 : remaining,
              songs: songTargets,
              reserveSongs: protectedReserveSongTargets,
              objective: effectiveObjective,
              strategicPlan,
              riskProfile: effectiveRiskProfile,
              generationProfile: effectiveGenerationProfile,
              nextSongCycle: songCycle,
              seedKey: `technique:${concertIndex}:${songCycle}:${techniquesDone}`,
              trials: solverMode === "express" ? 7000 : 12000,
              minimumSamples: solverMode === "express" ? 512 : 1024,
              techniqueMemo,
            }),
          }))
        : [
            {
              index: null,
              cost: emptyBalance(),
              result: runAnalysis({
                period: concert.period,
                firstOfferPeriod: solverContext.firstOfferPeriod,
                tokens,
                techniquesRemaining: carryoverSongIds ? 0 : remaining,
                songs: songTargets,
                reserveSongs: protectedReserveSongTargets,
                objective: effectiveObjective,
                strategicPlan,
                riskProfile: effectiveRiskProfile,
                generationProfile: effectiveGenerationProfile,
                nextSongCycle: songCycle,
                seedKey: `technique:${concertIndex}:${songCycle}:${techniquesDone}`,
                trials: solverMode === "express" ? 10000 : 18000,
                minimumSamples: solverMode === "express" ? 512 : 1024,
                techniqueMemo,
              }),
            },
          ];
    const terminalAssessments =
      timingMode === "deadline-now" &&
      strategicPlan.mode === "close" &&
      strategicPlan.id !== "close-checkpoint" &&
      enteredOptions.length > 0
        ? evaluateTerminalTechniqueOptions({
            concertIndex,
            period: concert.period,
            firstOfferPeriod: solverContext.firstOfferPeriod,
            tokens,
            candidates: enteredOptions.map(({ cost, index }) => ({
              id: String(index),
              cost,
            })),
            techniquesRemaining: carryoverSongIds ? 0 : remaining,
            nextSongCycle: songCycle,
            currentSongs: songTargets,
            futureSongs: futureSongTargets,
            totalSongs: ownedSongs.size + 1,
            plan: strategicPlan,
            riskProfile: effectiveRiskProfile,
            generationProfile: effectiveGenerationProfile,
            trials: solverMode === "express" ? 180 : 300,
            seedKey: `terminal-technique:${concertIndex}:${songCycle}:${techniquesDone}`,
          })
        : null;
    const terminalById = new Map(
      (terminalAssessments ?? []).map((assessment) => [
        assessment.candidateId,
        assessment,
      ]),
    );
    const analyses: OptionAnalysis[] = rawAnalyses.map((analysis) => {
      if (analysis.index === null) return analysis;
      const terminal = terminalById.get(String(analysis.index));
      if (!terminal) return analysis;
      const recommendation =
        terminal.action === "stop-now"
          ? "stop"
          : terminal.reachProbability >= 0.985
            ? "safe"
            : "push";
      return {
        ...analysis,
        result: {
          ...analysis.result,
          recommendation,
          terminalDecision: terminal,
        },
      };
    });
    const ranked = rankObservedTechniques({
      candidates: analyses.map((analysis) => ({
        id: String(analysis.index ?? "projection"),
        cost: analysis.cost,
        reachProbability: analysis.result.reachProbability,
        goalProbability: analysis.result.goalProbability,
        terminalDecisionVector:
          analysis.index === null
            ? undefined
            : terminalById.get(String(analysis.index))?.decisionVector,
        payload: analysis,
      })),
      tokens,
      songs: songTargets,
      plan: strategicPlan,
      riskProfile: effectiveRiskProfile,
      tokenPressure: pressurePreview,
    }).map((candidate) => candidate.payload);
    const recommended = ranked[0];
    setResult(recommended.result);
    setSongPolicy(null);
    setBestOptionIndex(recommended.index);
    setOptionAnalyses(analyses);
    setAnalyzedSignature(currentSignature);

    const assessments = assessTechniqueChoices({
      tokens,
      candidates: analyses.flatMap((analysis) =>
        analysis.index === null
          ? []
          : [
              {
                index: analysis.index,
                cost: analysis.cost,
                result: analysis.result,
              },
            ],
      ),
      songs: songTargets,
      plan: strategicPlan,
      riskProfile: effectiveRiskProfile,
      recommendedIndex: recommended.index,
    });
    const analyzedTechniqueStrategy = evaluateTechniqueStrategy({
      concertIndex,
      songsThisSection,
      tokens,
      currentSongs: songTargets,
      futureSongs: futureSongTargets,
      futureTopCount,
      result: recommended.result,
      strategicPlan,
    });
    const normalStops =
      analyzedTechniqueStrategy.shouldSave ||
      recommended.result.recommendation === "stop" ||
      recommended.result.recommendation === "invalid";
    const forced =
      forcePushOverride && normalStops
        ? selectForcedTechniqueCandidate(ranked, assessments)
        : null;
    const displayed = forced ?? recommended;
    const solverMs = performance.now() - solverStartedAt;
    const timings: PipelineTimings = {
      solverMs,
      totalMs: solverMs,
    };
    const previousDecisionId = lastDecisionLogIdRef.current;
    const id = nextDecisionLogId();
    lastDecisionLogIdRef.current = id;
    writeDecisionLog({
      id,
      timestamp: new Date().toISOString(),
      event: "recommendation",
      source: "manual",
      state: {
        ...currentDecisionLogState(),
        objective: effectiveObjective,
      },
      recommendation: {
        page: "techniques",
        normal:
          recommended.index === null
            ? recommended.result.recommendation
            : `option-${recommended.index + 1}:${recommended.result.recommendation}`,
        displayed:
          forced && displayed.index !== null
            ? `option-${displayed.index + 1}:force-buy`
            : displayed.index === null
              ? displayed.result.recommendation
              : `option-${displayed.index + 1}:${displayed.result.recommendation}`,
        overrideActive: Boolean(forced),
        reasons: forced
          ? ([
              { code: "override.forcedPushActive" },
              { code: "override.forcedPushOption", option: forced.index + 1 },
              forced.result.exitCondition ?? planExitMessage(strategicPlan),
            ] satisfies Message[])
          : ([
              recommended.result.planLabel ?? planLabelMessage(strategicPlan),
              recommended.result.exitCondition ??
                planExitMessage(strategicPlan),
              ...(recommended.result.terminalDecision
                ? [recommended.result.terminalDecision.reason]
                : []),
            ] satisfies Message[]),
        candidates: assessments.map((assessment) => {
          const candidate = analyses.find(
            (analysis) => analysis.index === assessment.index,
          );
          return {
            id: `option-${assessment.index + 1}`,
            label: `Option ${assessment.index + 1}`,
            safety: assessment.safety,
            cost: candidate ? { ...candidate.cost } : undefined,
            reachProbability: candidate?.result.reachProbability,
            goalProbability: candidate?.result.goalProbability,
            terminalDecision: candidate?.result.terminalDecision,
            blockingReason: assessment.blocking?.detail,
          };
        }),
      },
      timings,
      previousDecisionId,
    });
  };

  const runCurrentAnalysis = () => {
    const requestId = ++analysisRequestRef.current;
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
    }
    setIsAnalyzing(true);
    // Yield once so React and the detached overlay can paint the explicit
    // loading state before the synchronous decision kernel takes the thread.
    analysisTimerRef.current = window.setTimeout(() => {
      analysisTimerRef.current = null;
      if (analysisRequestRef.current !== requestId) return;
      try {
        performCurrentAnalysis();
      } finally {
        if (analysisRequestRef.current === requestId) setIsAnalyzing(false);
      }
    }, 24);
  };

  useEffect(() => {
    void initializeDecisionLog()
      .then((status) => {
        setDecisionLogStatus(status);
        setDecisionLogError(null);
      })
      .catch((error: unknown) => {
        setDecisionLogError(
          error instanceof Error ? error.message : String(error),
        );
      });
  }, []);

  useEffect(
    () => () => {
      analysisRequestRef.current += 1;
      if (analysisTimerRef.current !== null) {
        window.clearTimeout(analysisTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    // Any solver input change invalidates a queued calculation. This prevents
    // an older snapshot from publishing a result after a newer OCR intake.
    analysisRequestRef.current += 1;
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    setIsAnalyzing(false);
  }, [currentSignature]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("gl-theme");
    const isThemeId = (value: string | null): value is ThemeId =>
      value !== null && (THEME_IDS as readonly string[]).includes(value);
    const storedSession =
      window.localStorage.getItem(SESSION_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (isThemeId(storedTheme)) setTheme(storedTheme);
    if (storedSession) {
      try {
        const validIds = new Set(SONGS.map((song) => song.id));
        const session = JSON.parse(storedSession) as {
          workflowMode?: WorkflowMode;
          concertIndex?: number;
          techniqueOfferPeriod?: Period | null;
          songCycle?: number;
          techniquesDone?: number;
          songsThisSection?: number;
          ownedSongs?: string[];
          activeSongIds?: string[];
          visibleSongIds?: string[];
          carryoverSongIds?: string[] | null;
          tokens?: Partial<Balance>;
          dynamicSpending?: boolean;
          timingMode?: TimingMode;
          runPulseBeta?: boolean;
          runPulseEvents?: RunPulseEvent[];
          runPulseStartedAtConcert?: number | null;
          solverMode?: SolverMode;
          riskProfile?: RiskProfile;
          generationProfile?: GenerationProfile;
          abandonedChaseTargetIds?: string[];
        };
        if (
          session.workflowMode === "manual" ||
          session.workflowMode === "live"
        ) {
          setWorkflowMode(session.workflowMode);
        }
        if (
          typeof session.concertIndex === "number" &&
          session.concertIndex >= 0 &&
          session.concertIndex < CONCERTS.length
        ) {
          setConcertIndex(session.concertIndex);
        }
        if (
          session.techniqueOfferPeriod === null ||
          session.techniqueOfferPeriod === "junior" ||
          session.techniqueOfferPeriod === "classic" ||
          session.techniqueOfferPeriod === "senior"
        ) {
          setTechniqueOfferPeriod(session.techniqueOfferPeriod);
        }
        if (typeof session.songCycle === "number" && session.songCycle >= 1) {
          setSongCycle(session.songCycle);
        }
        if (
          typeof session.techniquesDone === "number" &&
          session.techniquesDone >= 0
        ) {
          setTechniquesDone(session.techniquesDone);
        }
        if (
          typeof session.songsThisSection === "number" &&
          session.songsThisSection >= 0
        ) {
          setSongsThisSection(session.songsThisSection);
        }
        const restoredSongs = sanitizePersistedSongState({
          validIds,
          ownedSongIds: session.ownedSongs,
          activeSongIds: session.activeSongIds,
          visibleSongIds: session.visibleSongIds,
          carryoverSongIds: session.carryoverSongIds,
        });
        setOwnedSongs(new Set(restoredSongs.ownedSongIds));
        setActiveSongIds(new Set(restoredSongs.activeSongIds));
        setVisibleSongIds(new Set(restoredSongs.visibleSongIds));
        setCarryoverSongIds(restoredSongs.carryoverSongIds);
        setAbandonedChaseTargetIds(
          new Set(
            Array.isArray(session.abandonedChaseTargetIds)
              ? session.abandonedChaseTargetIds.filter((id) => validIds.has(id))
              : [],
          ),
        );
        if (session.tokens && typeof session.tokens === "object") {
          setTokens(
            Object.fromEntries(
              TOKEN_KEYS.map((key) => [
                key,
                Math.max(0, Number(session.tokens?.[key]) || 0),
              ]),
            ) as Balance,
          );
        }
        if (typeof session.dynamicSpending === "boolean") {
          setDynamicSpending(session.dynamicSpending);
        }
        if (
          session.timingMode === "section-open" ||
          session.timingMode === "deadline-now"
        ) {
          setTimingMode(session.timingMode);
        }
        if (typeof session.runPulseBeta === "boolean") {
          setRunPulseBeta(session.runPulseBeta);
        }
        if (Array.isArray(session.runPulseEvents)) {
          setRunPulseEvents(
            session.runPulseEvents.filter(
              (event) =>
                event &&
                typeof event.id === "string" &&
                (event.type === "song-offer" ||
                  event.type === "song-purchase" ||
                  event.type === "concert"),
            ),
          );
        }
        if (
          typeof session.runPulseStartedAtConcert === "number" &&
          session.runPulseStartedAtConcert >= 0 &&
          session.runPulseStartedAtConcert < CONCERTS.length
        ) {
          setRunPulseStartedAtConcert(session.runPulseStartedAtConcert);
        }
        if (
          session.solverMode === "express" ||
          session.solverMode === "expert"
        ) {
          setSolverMode(session.solverMode);
        }
        if (
          session.riskProfile === "safe" ||
          session.riskProfile === "standard" ||
          session.riskProfile === "greedy"
        ) {
          setRiskProfile(session.riskProfile);
        }
        if (
          session.generationProfile === "speed-wit" ||
          session.generationProfile === "speed-stamina-wit" ||
          session.generationProfile === "power-present" ||
          session.generationProfile === "balanced"
        ) {
          setGenerationProfile(session.generationProfile);
        }
      } catch {
        // Ignore une sauvegarde locale mal formée.
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("gl-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        workflowMode,
        concertIndex,
        techniqueOfferPeriod,
        songCycle,
        techniquesDone,
        songsThisSection,
        ownedSongs: Array.from(ownedSongs),
        activeSongIds: Array.from(activeSongIds),
        visibleSongIds: Array.from(visibleSongIds),
        carryoverSongIds,
        tokens,
        dynamicSpending,
        timingMode,
        runPulseBeta,
        runPulseEvents,
        runPulseStartedAtConcert,
        solverMode,
        riskProfile,
        generationProfile,
        abandonedChaseTargetIds: Array.from(abandonedChaseTargetIds),
      }),
    );
  }, [
    hydrated,
    workflowMode,
    concertIndex,
    techniqueOfferPeriod,
    songCycle,
    techniquesDone,
    songsThisSection,
    ownedSongs,
    activeSongIds,
    visibleSongIds,
    carryoverSongIds,
    tokens,
    dynamicSpending,
    timingMode,
    runPulseBeta,
    runPulseEvents,
    runPulseStartedAtConcert,
    solverMode,
    riskProfile,
    generationProfile,
    abandonedChaseTargetIds,
  ]);

  useEffect(() => {
    if (workflowMode === "live" && songSelectionOpen) {
      setAnalysisOpen(true);
    }
  }, [songSelectionOpen, workflowMode]);

  const previousSongSelectionOpenRef = useRef(songSelectionOpen);
  const workflowScrollHydratedRef = useRef(false);
  useEffect(() => {
    const hydrationWasSettled = workflowScrollHydratedRef.current;
    if (hydrated) workflowScrollHydratedRef.current = true;
    const target = workflowScrollTarget({
      // The first hydrated render restores the saved page. It is not a user
      // transition and must not move the viewport.
      hydrated: hydrated && hydrationWasSettled,
      workflowMode,
      previousSongSelectionOpen: previousSongSelectionOpenRef.current,
      songSelectionOpen,
    });
    previousSongSelectionOpenRef.current = songSelectionOpen;
    if (target === null) return;

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const anchor =
        target === "songs"
          ? songWorkflowAnchorRef.current
          : techniqueWorkflowAnchorRef.current;
      anchor?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, songSelectionOpen, workflowMode]);

  useEffect(() => {
    if (
      !hydrated ||
      !dynamicSpending ||
      !analysisOpen ||
      currentSignature === analyzedSignature
    ) {
      return;
    }
    const ready = songSelectionOpen
      ? songOfferComplete
      : candidateTotals.every((value) => value > 0) &&
        !hasIncompleteQuickOption;
    if (!ready) {
      setIsAnalyzing(false);
      return;
    }
    setIsAnalyzing(true);
    const timer = window.setTimeout(runCurrentAnalysis, 120);
    return () => {
      window.clearTimeout(timer);
      setIsAnalyzing(false);
    };
  }, [
    hydrated,
    dynamicSpending,
    analysisOpen,
    currentSignature,
    analyzedSignature,
    songSelectionOpen,
    songOfferComplete,
    hasIncompleteQuickOption,
    candidateTotals.join(":"),
  ]);

  const policyTone =
    songPolicy?.recommended?.action === "wait-reserve" ||
    songPolicy?.recommended?.action === "stop-and-carry-stock"
      ? "reserve"
      : songPolicy?.recommended?.action === "carry-page"
        ? "push"
        : (songPolicy?.recommended?.lateFailureProbability ?? 0) >= 0.12
          ? "risky"
          : (songPolicy?.recommended?.lateFailureProbability ?? 0) >= 0.04
            ? "push"
            : "safe";
  const resultTone = songPolicy?.recommended
    ? policyTone
    : techniqueStrategy?.shouldSave
      ? "reserve"
      : (result?.recommendation ?? "risky");
  const displayObjective = result?.objective ?? analysisObjective;
  const recommendation = useMemo(() => {
    const objectiveLabel =
      displayObjective === "priority-song"
        ? L.app.objectivePrioritySong
        : displayObjective === "any-song"
          ? L.app.objectiveAnySong
          : L.app.laSelectionDeChanson;
    const content = {
      safe: {
        label:
          displayObjective === "carryover"
            ? L.app.pushSecurise
            : L.app.pushOrienteChanson,
        detail: L.app.detailVeryGood(objectiveLabel),
      },
      push: {
        label: L.app.pushRaisonnable,
        detail: L.app.detailFavourable(objectiveLabel),
      },
      risky: {
        label: L.app.greedRisque,
        detail: L.app.leResultatRestePlausibleMais,
      },
      stop: {
        label: L.app.conserveTesTokens,
        detail: L.app.leRisqueOuLaValeur,
      },
      reserve: {
        label: L.app.economisePourLaProchainePool,
        detail: L.app.leCheminEstAtteignableMais,
      },
      invalid: {
        label: L.app.optionNonAchetable,
        detail: L.app.leCoutIndiqueDepasseTon,
      },
    };
    return content[resultTone];
  }, [displayObjective, resultTone]);

  const rollNote =
    availableSongs.length >= 3
      ? L.app.rollNoteMany(availableSongs.length)
      : availableSongs.length > 0
        ? L.app.rollNoteFew(availableSongs.length)
        : L.app.aucuneChansonRestanteDansCette;
  const goalLabel = techniqueStrategy?.shouldSave
    ? L.app.faisabiliteDuPushActuel
    : displayObjective === "priority-song"
      ? L.app.atteindrePrioriteAchetable
      : displayObjective === "any-song"
        ? L.app.atteindreSongAchetable
        : L.app.atteindreLaSelection;

  const setTokenValue = (key: TokenKey, value: number) =>
    setTokens((current) => ({ ...current, [key]: value }));

  const setCandidateValue = (
    optionIndex: number,
    key: TokenKey,
    value: number,
  ) => {
    setCandidateCosts((current) =>
      current.map((cost, index) =>
        index === optionIndex ? { ...cost, [key]: value } : cost,
      ),
    );
    setQuickBuilders((current) =>
      current.map((builder, index) =>
        index === optionIndex ? emptyQuickBuilder() : builder,
      ),
    );
    setResult(null);
    setOptionAnalyses([]);
    setBestOptionIndex(null);
  };

  const resetTechniqueOptions = () => {
    setCandidateCosts([emptyBalance(), emptyBalance(), emptyBalance()]);
    setQuickBuilders([
      emptyQuickBuilder(),
      emptyQuickBuilder(),
      emptyQuickBuilder(),
    ]);
    setResult(null);
    setOptionAnalyses([]);
    setBestOptionIndex(null);
  };

  const commitQuickBuilder = (
    optionIndex: number,
    builder: QuickTechniqueBuilder,
  ) => {
    const nextCost = builder.kind
      ? buildQuickTechniqueCost(
          techniqueInputPeriod,
          builder.kind,
          builder.selectedTokens,
          builder.levelIndex,
        )
      : emptyBalance();
    setQuickBuilders((current) =>
      current.map((value, index) => (index === optionIndex ? builder : value)),
    );
    setCandidateCosts((current) =>
      current.map((cost, index) => (index === optionIndex ? nextCost : cost)),
    );
    setResult(null);
    setOptionAnalyses([]);
    setBestOptionIndex(null);
  };

  const cycleTechniqueKind = (
    optionIndex: number,
    requested: "mono" | "duo" | "hint" | "energy",
  ) => {
    const current = quickBuilders[optionIndex];
    let next: QuickTechniqueBuilder;

    if (requested === "mono") {
      next =
        current.kind === "mono"
          ? emptyQuickBuilder()
          : {
              kind: "mono",
              levelIndex: 0,
              selectedTokens: current.selectedTokens.slice(0, 1),
            };
    } else if (requested === "duo") {
      if (techniqueInputPeriod === "junior") return;
      next =
        current.kind === "duo-balanced"
          ? {
              ...current,
              kind: "duo-split",
              selectedTokens:
                current.selectedTokens.length < 2 ||
                getDuoSplitSecondaryToken(current.selectedTokens[0]) ===
                  current.selectedTokens[1]
                  ? current.selectedTokens
                  : current.selectedTokens.slice(0, 1),
            }
          : current.kind === "duo-split"
            ? emptyQuickBuilder()
            : {
                kind: "duo-balanced",
                levelIndex: 0,
                selectedTokens: current.selectedTokens.slice(0, 2),
              };
    } else {
      const levels = getTechniqueLevelOptions(techniqueInputPeriod, requested);
      if (current.kind === requested) {
        next =
          current.levelIndex + 1 < levels.length
            ? { ...current, levelIndex: current.levelIndex + 1 }
            : emptyQuickBuilder();
      } else {
        next = {
          kind: requested,
          levelIndex: 0,
          selectedTokens: current.selectedTokens.slice(0, 1),
        };
      }
    }
    commitQuickBuilder(optionIndex, next);
  };

  const toggleTechniqueToken = (optionIndex: number, key: TokenKey) => {
    const current = quickBuilders[optionIndex];
    if (!current.kind) return;
    const isDuo =
      current.kind === "duo-balanced" || current.kind === "duo-split";
    let selectedTokens: TokenKey[];
    if (current.selectedTokens.includes(key)) {
      selectedTokens =
        current.kind === "duo-split" && current.selectedTokens[0] === key
          ? []
          : current.selectedTokens.filter((selected) => selected !== key);
    } else if (isDuo) {
      if (
        current.kind === "duo-split" &&
        current.selectedTokens.length > 0 &&
        key !== getDuoSplitSecondaryToken(current.selectedTokens[0])
      ) {
        return;
      }
      selectedTokens =
        current.selectedTokens.length < 2
          ? [...current.selectedTokens, key]
          : [current.selectedTokens[0], key];
    } else {
      selectedTokens = [key];
    }
    commitQuickBuilder(optionIndex, {
      ...current,
      selectedTokens,
    });
  };

  const pushHistory = () => {
    const snapshot: LiveSnapshot = {
      concertIndex,
      techniqueOfferPeriod,
      songCycle,
      techniquesDone,
      songsThisSection,
      ownedSongs: Array.from(ownedSongs),
      activeSongIds: Array.from(activeSongIds),
      visibleSongIds: Array.from(visibleSongIds),
      carryoverSongIds: carryoverSongIds ? [...carryoverSongIds] : null,
      tokens: { ...tokens },
      runPulseEvents: [...runPulseEvents],
      runPulseStartedAtConcert,
      timingMode,
      abandonedChaseTargetIds: Array.from(abandonedChaseTargetIds),
    };
    setHistory((current) => [...current.slice(-19), snapshot]);
  };

  const undoLastLiveAction = () => {
    const snapshot = history.at(-1);
    if (!snapshot) return;
    setConcertIndex(snapshot.concertIndex);
    setTechniqueOfferPeriod(snapshot.techniqueOfferPeriod);
    setSongCycle(snapshot.songCycle);
    setTechniquesDone(snapshot.techniquesDone);
    setSongsThisSection(snapshot.songsThisSection);
    setOwnedSongs(new Set(snapshot.ownedSongs));
    setActiveSongIds(new Set(snapshot.activeSongIds));
    setVisibleSongIds(new Set(snapshot.visibleSongIds));
    setCarryoverSongIds(snapshot.carryoverSongIds);
    setTokens(snapshot.tokens);
    setRunPulseEvents(snapshot.runPulseEvents);
    setRunPulseStartedAtConcert(snapshot.runPulseStartedAtConcert);
    setTimingMode(snapshot.timingMode);
    setAbandonedChaseTargetIds(new Set(snapshot.abandonedChaseTargetIds));
    setHistory((current) => current.slice(0, -1));
    resetTechniqueOptions();
    setSongPolicy(null);
  };

  const recordTechniquePurchase = (optionIndex?: number) => {
    if (remaining === 0 || carryoverSongIds) return false;
    if (dynamicSpending) {
      if (optionIndex === undefined) return false;
      const selectedCost = candidateCosts[optionIndex];
      if (totalCost(selectedCost) <= 0 || !canAfford(tokens, selectedCost)) {
        return false;
      }
    }
    if (optionIndex !== undefined) {
      const assessment = techniqueChoiceAssessments.find(
        (item) => item.index === optionIndex,
      );
      const nextTokens = loggedBalanceAfterPurchase(
        tokens,
        candidateCosts[optionIndex],
      );
      logUserChoice(
        {
          kind: "technique",
          id: `option-${optionIndex + 1}`,
          label: `Option ${optionIndex + 1}`,
          cost: { ...candidateCosts[optionIndex] },
          tokenAccounting: "exact-cost",
          recommended: optionIndex === displayedTechniqueIndex,
          safety: assessment?.safety,
          blockingReason: assessment?.blocking?.detail,
        },
        currentDecisionLogState({
          tokens: nextTokens,
          techniquesDone: Math.min(target, techniquesDone + 1),
          techniqueOfferPeriod: null,
          stateSignature: `${currentSignature}:technique:${optionIndex + 1}`,
        }),
      );
    } else {
      logUserChoice(
        {
          kind: "technique",
          id: "untracked-technique",
          label: L.app.techniqueAcheteeSansCoutSuivi,
          tokenAccounting: "untracked-cost",
          recommended: false,
        },
        currentDecisionLogState({
          techniquesDone: Math.min(target, techniquesDone + 1),
          techniqueOfferPeriod: null,
          stateSignature: `${currentSignature}:technique:untracked`,
        }),
      );
    }
    pushHistory();
    if (dynamicSpending && optionIndex !== undefined) {
      setTokens((current) =>
        subtractCost(current, candidateCosts[optionIndex]),
      );
    }
    setTechniquesDone((current) => Math.min(target, current + 1));
    setTechniqueOfferPeriod(techniqueOfferPeriodAfterTechniquePurchase());
    setSongFilter("available");
    resetTechniqueOptions();
    setSongPolicy(null);
    return true;
  };

  const buySong = (song: Song) => {
    if (!songSelectionOpen) return false;
    if (dynamicSpending && !canAfford(tokens, song.cost)) return false;
    const fromCarryover = carryoverSongIds !== null;
    const assessment = songChoiceAssessments.find(
      (item) => item.songId === song.id,
    );
    const nextSongTokens = loggedBalanceAfterPurchase(tokens, song.cost);
    const selectedAbandonPolicy = songPolicy?.policies.find(
      (policy) =>
        policy.songId === song.id &&
        policy.action === "buy-stop" &&
        policy.abandonsHunt,
    );
    const nextAbandonedChaseTargets = new Set(abandonedChaseTargetIds);
    if (selectedAbandonPolicy) {
      for (const id of strategicPlan.chaseTargets.ids) {
        nextAbandonedChaseTargets.add(id);
      }
    }
    const remainingAfterSong = [
      ...songTargets.filter((candidate) => candidate.id !== song.id),
      ...futureSongTargets,
      ...laterSongTargets,
    ];
    const planAfterSong = deriveStrategicPlan({
      concertIndex,
      timingMode,
      remainingSongs: remainingAfterSong,
      songsThisSection: fromCarryover ? 1 : songsThisSection + 1,
      abandonedChaseTargetIds: Array.from(nextAbandonedChaseTargets),
    });
    logUserChoice(
      {
        kind: "song",
        id: song.id,
        label: song.name,
        cost: { ...song.cost },
        tokenAccounting: "exact-cost",
        recommended: song.id === displayedSongId,
        safety: assessment?.safety,
        blockingReason: assessment?.blocking?.detail,
      },
      currentDecisionLogState({
        tokens: nextSongTokens,
        songCycle: fromCarryover ? 1 : songCycle + 1,
        techniquesDone: fromCarryover ? 1 : 0,
        songsThisSection: fromCarryover ? 1 : songsThisSection + 1,
        totalSongs: ownedSongs.size + 2,
        visibleSongIds: [],
        carryoverSongIds: null,
        abandonedChaseTargetIds: Array.from(nextAbandonedChaseTargets),
        plan: {
          id: planAfterSong.id,
          mode: planAfterSong.mode,
          label: t(planLabelMessage(planAfterSong)),
        },
        stateSignature: `${currentSignature}:song:${song.id}`,
      }),
    );
    pushHistory();
    setAbandonedChaseTargetIds(nextAbandonedChaseTargets);
    recordCurrentSongOffer();
    if (runPulseBeta && workflowMode === "live") {
      const targetSong = targetById.get(song.id)!;
      const policyValue = targetSong.policyValue ?? targetSong.utility * 18;
      const poolMaximum = Math.max(
        1,
        ...songTargets.map(
          (candidate) => candidate.policyValue ?? candidate.utility * 18,
        ),
      );
      const absoluteValue = Math.max(0, Math.min(1, policyValue / 80));
      const relativeValue = Math.max(0, Math.min(1, policyValue / poolMaximum));
      const isSkillPointSong = song.practiceBonus.includes("Skill Pt training");
      const timing: PulsePurchaseEvent["timing"] = fromCarryover
        ? "carryover"
        : songCycle <= 2
          ? "early"
          : songCycle <= 4
            ? "normal"
            : "late";
      const event: PulsePurchaseEvent = {
        id: `purchase:${concertIndex}:${songCycle}:${song.id}`,
        type: "song-purchase",
        concertIndex,
        songCycle,
        songId: song.id,
        songName: song.name,
        valueIndex: absoluteValue * 0.7 + relativeValue * 0.3,
        timing,
        isSkillPointSong,
      };
      setRunPulseEvents((current) => [
        ...current.filter((item) => item.id !== event.id),
        event,
      ]);
    }
    if (dynamicSpending) {
      setTokens((current) => subtractCost(current, song.cost));
    }
    setOwnedSongs((current) => new Set(current).add(song.id));
    if (fromCarryover) {
      setSongCycle(1);
      setTechniquesDone(1);
      setSongsThisSection(1);
    } else {
      setSongCycle((current) => current + 1);
      setTechniquesDone(0);
      setSongsThisSection((current) => current + 1);
    }
    setCarryoverSongIds(null);
    setVisibleSongIds(new Set());
    setSongFilter("available");
    resetTechniqueOptions();
    setSongPolicy(null);
    return true;
  };

  const skipEmptySongSelection = () => {
    if (!songSelectionOpen || availableSongs.length > 0) return;
    pushHistory();
    setSongCycle((current) => current + 1);
    setTechniquesDone(0);
    setCarryoverSongIds(null);
    resetTechniqueOptions();
    setSongPolicy(null);
  };

  /**
   * v0.22.16 removed the user-facing carry choice. Lessons already displayed in
   * game survive a Promotional Live, so pressing the concert button carries
   * whichever page is currently open: a song page keeps every visible song, with
   * one policy-selected song retained as the solver's projection anchor; a
   * technique page keeps the period and prices it was generated with, until the
   * first purchase refreshes the shop.
   */
  const advanceConcert = (): boolean => {
    if (concertTransitionBlock !== null) return false;

    const songPageCarried =
      songSelectionOpen && remaining === 0 && songOfferComplete;
    const carriedSongId = songPageCarried
      ? (carryoverPolicy?.songId ?? selectionSongs[0]?.id ?? null)
      : null;
    if (songPageCarried && !carriedSongId) return false;
    const carriedSongIds = carriedSongId ? [carriedSongId] : null;
    const carriedVisibleSongIds = songPageCarried
      ? Array.from(visibleSongIds).slice(0, expectedOfferCount)
      : [];
    const techniquePageVisible = !songSelectionOpen && remaining > 0;
    const nextTechniqueOfferPeriod = techniqueOfferPeriodAfterConcert({
      currentPeriod: concert.period,
      currentOfferPeriod: techniqueOfferPeriod,
      techniquePageVisible,
      songPageCarried,
    });
    const nextConcertIndex = concertIndex + 1;
    const nextAbandonedChaseTargets = new Set(abandonedChaseTargetIds);
    if (displayedSongPolicy?.abandonsHunt) {
      for (const id of strategicPlan.chaseTargets.ids) {
        nextAbandonedChaseTargets.add(id);
      }
    }
    const nextUnlockedTargetIds = new Set(
      SONGS.filter(
        (candidate) =>
          candidate.unlockPhase <= Math.min(nextConcertIndex, 3) &&
          !ownedSongs.has(candidate.id),
      ).map((candidate) => candidate.id),
    );
    const nextUnlockedTargets = solverContext.allReserveSongs.filter((target) =>
      nextUnlockedTargetIds.has(target.id),
    );
    const nextConcertPlan = deriveStrategicPlan({
      concertIndex: nextConcertIndex,
      timingMode: "section-open",
      remainingSongs: nextUnlockedTargets,
      abandonedChaseTargetIds: Array.from(nextAbandonedChaseTargets),
    });
    const nextLoggedTokens = loggedTrackedBalanceAfterConcert(
      tokens,
      concertIndex,
      dynamicSpending,
    );
    logUserChoice(
      {
        kind: "concert",
        id: `concert-${concertIndex + 1}`,
        label: songPageCarried
          ? L.app.concertPageDeSongsPortee
          : nextTechniqueOfferPeriod !== null
            ? L.app.concertPageDeTechniquesPortee
            : displayedSongPolicy?.action === "stop-and-carry-stock"
              ? L.app.concertSansAchatStockIntegral
              : L.app.concertJoue,
        tokenAccounting: dynamicSpending
          ? "verified-concert-credit"
          : "verified-concert-credit-not-applied",
        recommended: Boolean(
          displayedSongPolicy &&
          (songPageCarried
            ? displayedSongPolicy.action === "carry-page" ||
              displayedSongPolicy.action === "stop-and-carry-stock"
            : displayedSongPolicy.action !== "carry-page"),
        ),
      },
      currentDecisionLogState({
        concertIndex: nextConcertIndex,
        concertPeriod: CONCERTS[nextConcertIndex].period,
        techniqueOfferPeriod: nextTechniqueOfferPeriod,
        songCycle: 1,
        techniquesDone: 0,
        songsThisSection: 0,
        timingMode: "section-open",
        tokens: nextLoggedTokens,
        visibleSongIds: carriedVisibleSongIds,
        carryoverSongIds: carriedSongIds,
        abandonedChaseTargetIds: Array.from(nextAbandonedChaseTargets),
        plan: {
          id: nextConcertPlan.id,
          mode: nextConcertPlan.mode,
          label: t(planLabelMessage(nextConcertPlan)),
        },
        stateSignature: `${currentSignature}:concert:${nextConcertIndex}`,
      }),
    );
    pushHistory();
    setAbandonedChaseTargetIds(nextAbandonedChaseTargets);
    if (runPulseBeta && workflowMode === "live") {
      const event: PulseConcertEvent = {
        id: `concert:${concertIndex}`,
        type: "concert",
        concertIndex,
        songsBought: songsThisSection,
        greatSuccess: isGreatSuccess(concertIndex, songsThisSection),
      };
      setRunPulseEvents((current) => [
        ...current.filter((item) => item.id !== event.id),
        event,
      ]);
    }
    setActiveSongIds(
      (current) => new Set([...current, ...Array.from(ownedSongs)]),
    );
    setCarryoverSongIds(carriedSongIds);
    setTechniqueOfferPeriod(nextTechniqueOfferPeriod);
    if (dynamicSpending) {
      setTokens((current) =>
        applyPromotionalLiveTransition(current, concertIndex),
      );
    }
    setConcertIndex((current) => current + 1);
    setSongCycle(1);
    setTechniquesDone(0);
    setSongsThisSection(0);
    setTimingMode("section-open");
    setForcePushOverride(false);
    setVisibleSongIds(new Set(carriedVisibleSongIds));
    setSongFilter("available");
    // A technique page already displayed survives the concert as-is: its
    // captured costs and builders must not be erased. Only the analysis is
    // invalidated, since the state it described has moved on.
    if (nextTechniqueOfferPeriod === null) {
      resetTechniqueOptions();
    } else {
      setResult(null);
      setOptionAnalyses([]);
      setBestOptionIndex(null);
    }
    setSongPolicy(null);
    return true;
  };

  /**
   * Replaces manually entered state with state captured elsewhere. The shell
   * owns this because it is a mutation of the run, not a panel concern; the
   * capturing surface only translates its own format into `ExternalStateIntake`.
   *
   * Recognised song ids are filtered against what is actually available: a
   * capture that misreads a title must not invent an offer.
   */
  const applyExternalState = (intake: ExternalStateIntake) => {
    const previousDecisionId = lastDecisionLogIdRef.current;
    const id = nextDecisionLogId();
    lastDecisionLogIdRef.current = id;
    writeDecisionLog({
      id,
      timestamp: new Date().toISOString(),
      event: "snapshot",
      source: intake.source === "ocr" ? "ocr" : "system",
      state: currentDecisionLogState(),
      snapshot: intake.logPayload,
      timings: intake.timings,
      previousDecisionId,
    });

    setAnalysisOpen(true);
    setIsAnalyzing(true);
    /**
     * Capturing external state (OCR reading the live screen) is, by
     * definition, the same trust the "dynamic spending" toggle grants to
     * manual entry: it means the app can believe the balances it's shown and
     * track deltas automatically. Without it, the auto-analysis effect below
     * never runs (`dynamicSpending` is one of its gates), so a captured
     * snapshot would update the displayed numbers but never produce a fresh
     * recommendation — exactly the "empty decision" symptom this exists to
     * prevent.
     */
    setDynamicSpending(true);
    setTokens(
      (current) =>
        Object.fromEntries(
          TOKEN_KEYS.map((key) => [key, intake.tokens[key] ?? current[key]]),
        ) as Balance,
    );

    if (intake.page === "techniques" && intake.techniqueCosts) {
      setCandidateCosts(
        [0, 1, 2].map(
          (slot) => intake.techniqueCosts?.[slot] ?? emptyBalance(),
        ),
      );
      setQuickBuilders([
        emptyQuickBuilder(),
        emptyQuickBuilder(),
        emptyQuickBuilder(),
      ]);
    }

    if (intake.page === "songs") {
      const availableIds = new Set(availableSongs.map((song) => song.id));
      const recognizedIds = (intake.recognizedSongIds ?? [])
        .filter((songId: string) => availableIds.has(songId))
        .slice(0, 3);
      if (carryoverSongIds === null) setTechniquesDone(target);
      setVisibleSongIds(new Set(recognizedIds));
      setSongFilter("available");
    }

    setResult(null);
    setSongPolicy(null);
    setOptionAnalyses([]);
    setBestOptionIndex(null);
    setAnalyzedSignature("");
  };

  const resetRun = () => {
    setWorkflowMode("live");
    setConcertIndex(0);
    setTechniqueOfferPeriod(null);
    setSongCycle(1);
    setTechniquesDone(0);
    setSongsThisSection(0);
    setTokens({ ...INITIAL_TOKENS });
    setCandidateCosts([emptyBalance(), emptyBalance(), emptyBalance()]);
    setQuickBuilders([
      emptyQuickBuilder(),
      emptyQuickBuilder(),
      emptyQuickBuilder(),
    ]);
    setOwnedSongs(new Set());
    setActiveSongIds(new Set());
    setVisibleSongIds(new Set());
    setCarryoverSongIds(null);
    setDynamicSpending(false);
    setTimingMode("section-open");
    setAbandonedChaseTargetIds(new Set());
    setRunPulseEvents([]);
    setRunPulseStartedAtConcert(runPulseBeta ? 0 : null);
    setHistory([]);
    setSongFilter("available");
    setResult(null);
    setOptionAnalyses([]);
    setBestOptionIndex(null);
    setSongPolicy(null);
    setForcePushOverride(false);
    setAnalysisOpen(false);
  };

  const chooseConcert = (index: number) => {
    if (workflowMode === "live") return;
    setConcertIndex(index);
    setTechniqueOfferPeriod(null);
    setSongCycle(1);
    setTechniquesDone(0);
    setSongsThisSection(0);
    setVisibleSongIds(new Set());
    setCarryoverSongIds(null);
    setTimingMode("section-open");
    resetTechniqueOptions();
    setSongPolicy(null);
  };

  const toggleSong = (id: string) => {
    if (workflowMode !== "manual") return;
    setOwnedSongs((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setActiveSongIds((active) => {
          const nextActive = new Set(active);
          nextActive.delete(id);
          return nextActive;
        });
      } else {
        next.add(id);
        setActiveSongIds((active) => new Set(active).add(id));
      }
      return next;
    });
  };

  const toggleVisibleSong = (id: string) => {
    if (!songSelectionOpen || carryoverSongIds !== null) return;
    setVisibleSongIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
    setSongPolicy(null);
    setResult(null);
  };

  const rankedObservedAnalyses = rankObservedTechniques({
    candidates: optionAnalyses
      .filter(
        (analysis) =>
          analysis.index !== null &&
          analysis.result.recommendation !== "invalid",
      )
      .map((analysis) => ({
        id: String(analysis.index),
        cost: analysis.cost,
        reachProbability: analysis.result.reachProbability,
        goalProbability: analysis.result.goalProbability,
        terminalDecisionVector:
          analysis.result.terminalDecision?.decisionVector,
        payload: analysis,
      })),
    tokens,
    songs: songTargets,
    plan: strategicPlan,
    riskProfile: effectiveRiskProfile,
    tokenPressure: pressurePreview,
  }).map((candidate) => candidate.payload);

  const normalTechniqueStops = Boolean(
    result &&
    (techniqueStrategy?.shouldSave ||
      result.recommendation === "stop" ||
      result.recommendation === "invalid"),
  );
  const techniqueChoiceAssessments: TechniqueChoiceAssessment[] =
    assessTechniqueChoices({
      tokens,
      candidates: optionAnalyses.flatMap((analysis) =>
        analysis.index === null
          ? []
          : [
              {
                index: analysis.index,
                cost: analysis.cost,
                result: analysis.result,
              },
            ],
      ),
      songs: songTargets,
      plan: strategicPlan,
      riskProfile: effectiveRiskProfile,
      recommendedIndex: normalTechniqueStops ? null : bestOptionIndex,
    });
  const forcedTechnique =
    forcePushOverride && normalTechniqueStops
      ? selectForcedTechniqueCandidate(
          rankedObservedAnalyses,
          techniqueChoiceAssessments,
        )
      : null;
  const displayedTechniqueIndex =
    forcedTechnique?.index ?? (!normalTechniqueStops ? bestOptionIndex : null);
  const alternativeTechniqueIndex =
    rankedObservedAnalyses.find(
      (analysis) =>
        analysis.index !== null &&
        analysis.index !== displayedTechniqueIndex &&
        techniqueChoiceAssessments.find(
          (assessment) => assessment.index === analysis.index,
        )?.safety === "safe-alternative",
    )?.index ?? null;

  const normalSongPolicy = songPolicy?.recommended ?? null;
  const forcedSongPolicy =
    forcePushOverride &&
    songPolicy &&
    normalSongPolicy?.action !== "buy-continue"
      ? selectForcedSongPolicy(songPolicy)
      : null;
  const displayedSongPolicy = forcedSongPolicy ?? normalSongPolicy;
  const carryoverPolicy = selectCarryoverPolicy({
    policies: songPolicy?.policies ?? [],
    displayed: displayedSongPolicy,
    visibleSongIds,
  });
  const canCarryVisibleSongPage = remaining === 0 && carryoverPolicy !== null;
  const shouldCarryVisibleSongPage =
    canCarryVisibleSongPage && displayedSongPolicy?.action === "carry-page";
  const displayedSongId = displayedSongPolicy?.action.startsWith("buy-")
    ? displayedSongPolicy.songId
    : null;
  const songChoiceAssessments: SongChoiceAssessment[] = assessSongChoices({
    policyResult: songPolicy,
    visibleSongIds: selectedSongTargets.map((song) => song.id),
    recommendedSongId: displayedSongId,
    recommendedPolicyId: displayedSongPolicy?.id ?? null,
  });

  const displayedTechniqueAssessment =
    displayedTechniqueIndex === null
      ? null
      : (techniqueChoiceAssessments.find(
          (assessment) => assessment.index === displayedTechniqueIndex,
        ) ?? null);
  const displayedSongAssessment =
    displayedSongId === null
      ? null
      : (songChoiceAssessments.find(
          (assessment) => assessment.songId === displayedSongId,
        ) ?? null);
  const displayedBlockingAssessment = displayedSongPolicy
    ? displayedSongAssessment
    : displayedTechniqueAssessment;
  const displayedBlocking =
    displayedBlockingAssessment?.safety === "hard-blocking";
  const displayedOverride = Boolean(forcedTechnique || forcedSongPolicy);
  const displayedTechniqueResult = forcedTechnique?.result ?? result;
  const displayedResultTone = isAnalyzing
    ? "loading"
    : forcedTechnique
      ? "push"
      : resultTone;

  const actions: ActionsView = {
    advanceConcert,
    buySong,
    applyExternalState,
    changeForcePushOverride,
    setPipelineTimings,
    undoLastAction: undoLastLiveAction,
    recordTechniquePurchase,
    runCurrentAnalysis,
    setAnalysisOpen,
    setSongCycle,
    setSongsThisSection,
    setTechniquesDone,
    setTokenValue,
    toggleVisibleSong,
  };
  const diagnostics: DiagnosticsView = {
    pipelineTimings,
    decisionLogStatus,
    decisionLogError,
    setDecisionLogStatus,
    setDecisionLogError,
    displayedBlocking,
    displayedBlockingAssessment,
    displayedResultTone,
    songChoiceAssessments,
    techniqueChoiceAssessments,
  };
  const display: DisplayView = {
    alternativeTechniqueIndex,
    analysisOpen,
    displayedOverride,
    displayedSongId,
    displayedSongPolicy,
    displayedTechniqueIndex,
    displayedTechniqueResult,
    forcePushOverride,
    forcedTechnique,
  };
  const entry: TechniqueEntryView = {
    candidateCosts,
    candidateTotals,
    commitQuickBuilder,
    cycleTechniqueKind,
    hasIncompleteQuickOption,
    quickBuilders,
    resetTechniqueOptions,
    setCandidateValue,
    toggleTechniqueToken,
  };
  const run: RunView = {
    techniqueOfferPeriod,
    canUndo: history.length > 0,
    automaticGaugeSongs,
    availableSongs,
    canCarryVisibleSongPage,
    carryoverPolicy,
    carryoverSongIds,
    concert,
    concertIndex,
    concertTransitionBlock,
    expectedOfferCount,
    gaugeSongs,
    manualGaugeTarget,
    nextSongCover,
    ownedSongs,
    patternUnsupported,
    remaining,
    selectionSongs,
    shouldCarryVisibleSongPage,
    songCycle,
    songOfferComplete,
    songSelectionOpen,
    songTargets,
    songsThisSection,
    target,
    techniqueInputPeriod,
    techniquesDone,
    timingMode,
    tokenCap,
    tokens,
    visibleSongIds,
    workflowMode,
  };
  const settings: SettingsView = {
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
  };
  const solver: SolverView = {
    goalLabel,
    isAnalyzing,
    isStale,
    normalSongPolicy,
    optionAnalyses,
    pressurePreview,
    recommendation,
    reservePlanPreview,
    result,
    songPolicy,
    strategicPlan,
    techniqueStrategy,
  };

  const slotContext: SlotContext = {
    actions,
    diagnostics,
    display,
    run,
    settings,
    solver,
  };

  return (
    <main className="app-shell">
      {/* Slots see exactly what the shared components see, nothing more. */}
      <TopBar
        analysisOpen={analysisOpen}
        concert={concert}
        gaugeSongs={gaugeSongs}
        remaining={remaining}
        result={result}
        setTheme={setTheme}
        songPolicy={songPolicy}
        theme={theme}
        actions={renderSlot(slots.topBarActions, slotContext)}
      />

      <div className="page-wrap">
        <Intro />

        <WorkflowBar
          concertIndex={concertIndex}
          history={history}
          resetRun={resetRun}
          runPulseBeta={runPulseBeta}
          runPulseStartedAtConcert={runPulseStartedAtConcert}
          setRunPulseBeta={setRunPulseBeta}
          setRunPulseStartedAtConcert={setRunPulseStartedAtConcert}
          setWorkflowMode={setWorkflowMode}
          undoLastLiveAction={undoLastLiveAction}
          workflowMode={workflowMode}
        />
        {renderSlot(slots.workflowActions, slotContext)}

        <RunPulsePanel
          latestPulseConcert={latestPulseConcert}
          latestPulseOffer={latestPulseOffer}
          latestPulsePurchase={latestPulsePurchase}
          runPulseBeta={runPulseBeta}
          runPulseEvents={runPulseEvents}
          runPulseSummary={runPulseSummary}
        />

        <ConcertTrack
          chooseConcert={chooseConcert}
          concertIndex={concertIndex}
          workflowMode={workflowMode}
        />

        <div className="workspace-grid">
          <div className="work-column">
            <div
              ref={songWorkflowAnchorRef}
              className="workflow-scroll-anchor"
              aria-hidden="true"
            />
            <ProgressPanel
              actions={actions}
              diagnostics={diagnostics}
              display={display}
              run={run}
              settings={settings}
              solver={solver}
            />

            <div
              ref={techniqueWorkflowAnchorRef}
              className="workflow-scroll-anchor"
              aria-hidden="true"
            />
            <DecisionColumn
              actions={actions}
              diagnostics={diagnostics}
              display={display}
              entry={entry}
              run={run}
              settings={settings}
              solver={solver}
            />
            {renderSlot(slots.decisionAside, slotContext)}
          </div>

          <AnalysisAside
            actions={actions}
            diagnostics={diagnostics}
            display={display}
            entry={entry}
            run={run}
            solver={solver}
          />
        </div>

        <SongsPanel
          availableSongs={availableSongs}
          carryoverSongIds={carryoverSongIds}
          concert={concert}
          lockedSongs={lockedSongs}
          ownedBonusTotals={ownedBonusTotals}
          ownedSongs={ownedSongs}
          ownedUnlockedSongs={ownedUnlockedSongs}
          pendingBonusCount={pendingBonusCount}
          phaseUnlock={phaseUnlock}
          rollNote={rollNote}
          setSongFilter={setSongFilter}
          skipEmptySongSelection={skipEmptySongSelection}
          songFilter={songFilter}
          songSelectionOpen={songSelectionOpen}
          songsToRender={songsToRender}
          toggleSong={toggleSong}
          unlockedSongs={unlockedSongs}
          workflowMode={workflowMode}
        />

        <AppFooter
          appVersion={appVersion}
          surfaceName={surfaceName}
          onExport={onExportDecisionLog}
          decisionLogError={decisionLogError}
          decisionLogStatus={decisionLogStatus}
          setDecisionLogError={setDecisionLogError}
          setDecisionLogStatus={setDecisionLogStatus}
        />
      </div>
      {renderSlot(slots.overlay, slotContext)}
    </main>
  );
}
