/**
 * Session identity and monotonic sequencing for the decision log.
 *
 * Kept separate from `DecisionSink` because the two have different lifetimes: a
 * sink can be swapped or unavailable without restarting the session, and a
 * session survives a failed write. Browser builds back this with sessionStorage
 * so a page reload keeps the same run; the default below is memory-only.
 */
export interface DecisionSession {
  id(): string;
  nextSequence(): number;
}

const randomId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

export const volatileDecisionSession = (): DecisionSession => {
  const id = `volatile-${randomId()}`;
  let sequence = 0;
  return {
    id: () => id,
    nextSequence: () => {
      sequence += 1;
      return sequence;
    },
  };
};
