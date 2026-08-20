# P5 terminal action/value unification

P5 removes the last separate C4 value economy. Terminal technique decisions now
follow the same architecture as song-page decisions:

```text
observed terminal state
  -> candidate technique transition
  -> exposed physical page
  -> buy-stop | buy-continue | carry-current-page
  -> shared zero-income cross-section trial (T1a)
  -> stat-point utility assessment (T1b)
  -> paired PUSH - STOP comparison
```

## Physical action exhaustiveness

`page-actions.ts` owns the physical exposed-page action type. The terminal
implementation uses an exhaustive `switch (action.kind)` with `assertNever` for
all three exposed actions. `buy-continue` is not a synonym for `buy-stop`: after
the visible purchase it runs a real current-section continuation and is rejected
when no further technique or song action is actually taken.

The evaluator now receives `songsThisSection` explicitly. This is required to
value the outgoing Great Success mechanically; reconstructing it from total song
count would mix two different counters.

## Common outcome and utility

There is no C4 branch in `terminal-outcome.ts`. C1 through C4 expose the same
mechanics:

- expected practice-stat delta;
- expected Skill Points;
- Friendship training exposure;
- current Great Success as a discrete gate;
- projected 16/18 gates when their deadline is inside the rollout;
- retained token stock as non-utility telemetry.

Every trial is converted with `terminalUtilityFromTrial()`. Token spending has no
intrinsic negative utility. It matters only when it changes the set of downstream
actions that the shared physical rollout can still fund. Consequently STOP is
the opportunity baseline by construction: `U(PUSH) - U(STOP)` already contains
lost future purchases without a second reserve model.

### P3b2 compatibility note

P3b2 later removed generic behavioural projections from the **canonical** song
T1b scalar. Terminal P5/P4 behaviour was already deployed and empirically used
as a v1.0.2/v6 golden baseline, so that migration is intentionally not performed
as an incidental side effect. `terminalUtilityFromTrial()` now delegates to the
private `terminal-compat-utility.ts` island, which preserves the historical
terminal scalar until a dedicated replay-gated terminal migration is performed.
The common `HorizonOutcome` mechanics remain shared; only the terminal scalar
transform is temporarily compatibility-scoped.

The removed C4-only code is:

- `evaluateTerminalC4Value()`;
- `evaluateTerminalC4OpportunityCost()`;
- `maxFundableFriendshipOptionValue()`;
- `TERMINAL_C4_VALUE_CALIBRATION` and its positive-only deltas.

## Risk versus economy

P5 unifies value, not every risk policy. C1-C3 retain the profile risk threshold
as the terminal admission gate. C4 retains the existing Wilson catastrophe
floor instead of reapplying the generic threshold. Above the applicable safety
gate, expected paired T1b utility decides PUSH versus STOP.

There is no continuous C4 risk penalty in P5 (`riskPenalty = 0`); uncertainty is
kept separate from utility.

## Paired Monte-Carlo contract

P5 deliberately keeps common-random-number paired statistics:

- `createPairedDifferenceStats`;
- `pairedMeanInterval`;
- `pairedDifferenceSeparated`.

Adaptive convergence requires both reach stability and separation of the paired
utility delta around zero. If the sample/time budget ends first,
`uncertainAtBudgetLimit` remains true. P4 generalizes these paired statistics into
the durable separation/convergence and co-recommendation policy documented in
`docs/ROBUSTNESS_P4.md`.

## Regression interpretation

Some legacy STOP cases are expected to become PUSH. A filler or late song may be
worth buying when it yields real Lesson SP, Great Success, or the discrete
18-song reward and does not destroy any downstream action. This is not token
spending receiving positive value; it is the direct consequence of removing the
old intrinsic token/opportunity penalties.

Conversely, a STOP must emerge because preserving the current state enables a
more valuable downstream action in the same rollout, not because a C4-only
function assigns abstract value to the reserve.

## Durable diagnostics

P5 changes the meaning of `TerminalTechniqueDecisionSummary.expectedOpportunityCost`:
it is now `U(STOP)` rather than a C4-specific destroyed-option estimate. The
NDJSON decision-log schema is therefore **v5**, and solver policy telemetry is
**`grand-live-v7`**. This is a semantic-version marker for diagnostic artifacts;
the application package version remains unchanged by this solver patch.
