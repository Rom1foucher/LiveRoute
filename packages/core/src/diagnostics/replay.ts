import {
  createTechniqueSimulationMemo,
  runAnalysis,
  type AnalysisInput,
  type AnalysisResult,
} from "../live-model.ts";
import {
  analyzeSongSelection,
  type SongPolicyInput,
  type SongPolicyResult,
} from "../solver/song-policy.ts";
import {
  evaluateTerminalTechniqueOptions,
  type TerminalTechniqueOptionAssessment,
  type TerminalTechniqueOptionsInput,
} from "../solver/terminal-technique.ts";

export type ReplayFixture =
  | {
      fixtureVersion: 1;
      id: string;
      kind: "analysis";
      input: Omit<AnalysisInput, "techniqueMemo">;
      expected?: { recommendation?: AnalysisResult["recommendation"] };
    }
  | {
      fixtureVersion: 1;
      id: string;
      kind: "song-policy";
      input: SongPolicyInput;
      expected?: { recommendedId?: string | null };
    }
  | {
      fixtureVersion: 1;
      id: string;
      kind: "terminal-technique";
      input: TerminalTechniqueOptionsInput;
      expected?: { actions?: Record<string, "stop-now" | "expose-and-carry"> };
    };

export type ReplayFixtureResult =
  | { id: string; kind: "analysis"; result: AnalysisResult }
  | { id: string; kind: "song-policy"; result: SongPolicyResult }
  | {
      id: string;
      kind: "terminal-technique";
      result: TerminalTechniqueOptionAssessment[] | null;
    };

/**
 * Pure replay oracle for standalone JSON fixtures. File I/O deliberately lives
 * in `scripts/replay-fixture.ts`, outside the engine.
 */
export const replayFixture = (fixture: ReplayFixture): ReplayFixtureResult => {
  switch (fixture.kind) {
    case "analysis":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: runAnalysis({
          ...fixture.input,
          techniqueMemo: createTechniqueSimulationMemo(),
        }),
      };
    case "song-policy":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: analyzeSongSelection(fixture.input),
      };
    case "terminal-technique":
      return {
        id: fixture.id,
        kind: fixture.kind,
        result: evaluateTerminalTechniqueOptions(fixture.input),
      };
  }
};

export const replayFixtureMatchesExpected = (
  fixture: ReplayFixture,
  replay: ReplayFixtureResult,
): boolean => {
  if (!fixture.expected) return true;
  if (fixture.kind === "analysis" && replay.kind === "analysis") {
    return (
      fixture.expected.recommendation === undefined ||
      replay.result.recommendation === fixture.expected.recommendation
    );
  }
  if (fixture.kind === "song-policy" && replay.kind === "song-policy") {
    return (
      fixture.expected.recommendedId === undefined ||
      (replay.result.recommended?.id ?? null) === fixture.expected.recommendedId
    );
  }
  if (
    fixture.kind === "terminal-technique" &&
    replay.kind === "terminal-technique"
  ) {
    if (!fixture.expected.actions) return true;
    const terminalResult = replay.result;
    if (!terminalResult) return false;
    return Object.entries(fixture.expected.actions).every(([id, action]) =>
      terminalResult.some(
        (candidate) =>
          candidate.candidateId === id && candidate.action === action,
      ),
    );
  }
  return false;
};
