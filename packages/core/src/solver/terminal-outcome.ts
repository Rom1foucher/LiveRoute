import { totalCost } from "../live-model.ts";
import { isGreatSuccess } from "../domain/live-rules.ts";
import type { CrossSectionTrialResult } from "./cross-section.ts";
import {
  createHorizonOutcome,
  outcomeComponent,
  type HorizonOutcome,
  type OutcomeUncertainty,
} from "./horizon-outcome.ts";
import {
  terminalCompatUtilityAssessmentFromOutcome,
  type TerminalCompatUtilityAssessment,
} from "./terminal-compat-utility.ts";

export type TerminalTrialOutcomeInput = {
  tieId: string;
  concertIndex: number;
  songsThisSection: number;
  /** Songs bought before the outgoing Live in this concrete paired trial. */
  currentSectionPurchases: number;
  result: CrossSectionTrialResult;
  couplingKey: string;
};

/**
 * T1a adapter for one terminal common-random-number trial.
 *
 * There is deliberately no C4 branch here. C1..C4 use the same mechanical
 * quantities and the same T1b utility model. Token stock is retained only as
 * state telemetry; it receives no utility term of its own.
 */
export const terminalHorizonOutcomeFromTrial = ({
  tieId,
  concertIndex,
  songsThisSection,
  currentSectionPurchases,
  result,
  couplingKey,
}: TerminalTrialOutcomeInput): HorizonOutcome => {
  const uncertainty: OutcomeUncertainty = {
    kind: "monte-carlo",
    couplingKey,
  };
  const currentGreatSuccess = isGreatSuccess(
    concertIndex,
    songsThisSection + currentSectionPurchases,
  );
  const projectsGate16Deadline = result.nextConcertIndex >= 3;
  const projectsGate18Deadline = result.nextConcertIndex >= 4;
  const gate16Reached = result.totalSongs >= 16;
  const gate18Reached = result.totalSongs >= 18;

  return createHorizonOutcome({
    tieId,
    components: [
      outcomeComponent("hard-state", 1, "deterministic-consequence"),
      outcomeComponent(
        "risk-admissible-state",
        1,
        "deterministic-consequence",
      ),
      outcomeComponent("structural-tier", 0, "deterministic-consequence"),
      outcomeComponent(
        "expected-practice-stat-delta",
        result.practiceTrainingExposure,
        "generic-behavioral-projection",
        uncertainty,
      ),
      outcomeComponent(
        "expected-skill-points",
        result.lessonSkillPoints + result.spTrainingExposure,
        "generic-behavioral-projection",
        uncertainty,
      ),
      outcomeComponent(
        "friendship-exposure",
        result.friendshipTrainingExposure,
        "generic-behavioral-projection",
        uncertainty,
      ),
      outcomeComponent(
        "great-success-secured",
        currentGreatSuccess ? 1 : 0,
        "zero-income-projection",
        uncertainty,
      ),
      outcomeComponent(
        "gate16-crossed",
        gate16Reached ? 1 : 0,
        "zero-income-projection",
        uncertainty,
      ),
      ...(projectsGate16Deadline && !gate16Reached
        ? [
            outcomeComponent(
              "gate16-zero-income-reach",
              0,
              "zero-income-projection",
              uncertainty,
            ),
          ]
        : []),
      outcomeComponent(
        "gate18-crossed",
        gate18Reached ? 1 : 0,
        "zero-income-projection",
        uncertainty,
      ),
      ...(projectsGate18Deadline && !gate18Reached
        ? [
            outcomeComponent(
              "gate18-zero-income-reach",
              0,
              "zero-income-projection",
              uncertainty,
            ),
          ]
        : []),
      outcomeComponent(
        "retained-tokens",
        totalCost(result.retainedBalance),
        "zero-income-projection",
        uncertainty,
      ),
    ],
  });
};

export const terminalUtilityFromTrial = (
  input: TerminalTrialOutcomeInput,
): TerminalCompatUtilityAssessment =>
  terminalCompatUtilityAssessmentFromOutcome(terminalHorizonOutcomeFromTrial(input));
