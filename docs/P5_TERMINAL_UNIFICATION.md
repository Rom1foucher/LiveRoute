# P5 terminal action/value unification

P5 removes the last separate C4 value economy. Terminal technique decisions now
follow the same architecture as song-page decisions:

```text
observed terminal state
  -> candidate technique transition
  -> exposed physical page
  -> buy-stop | buy-continue | carry-current-page
  -> shared zero-income cross-section trial (T1a)
  -> native layered terminal outcome
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

## Common outcome and layered comparison

There is no C4 branch in `terminal-outcome.ts`. C1 through C4 expose the same
mechanics, including deterministic immediate stat/SP rewards, current Great
Success, structural acquisitions, generic future-training projections and
retained token stock.

The terminal no longer converts those quantities into one stat-point scalar.
`terminal-layered-value.ts` compares paired common-random-number evidence in this
order:

```text
Great Success
-> structural tier >= 5 / >= 4 / >= 3 / >= 2
-> deterministic immediate stat/SP reward
-> generic practice projection
-> generic SP projection
```

An unresolved upper layer blocks lower layers. Friendship therefore keeps its
structural priority without `Friendship exposure × rate`, while generic training
projections remain T2. The 18-song counter and its zero-income reach probability
are absent from this ranking; they remain progress/funding diagnostics.

Token spending has no intrinsic negative utility. When a lower-layer PUSH gain
is real but competes with resource preservation for which no explicit exchange
rate exists, the primary action stays STOP and PUSH is co-recommended as a
`resource-tradeoff` instead of manufacturing a token-to-stat conversion.

### P3b2 terminal migration

The temporary `terminal-compat-utility.ts` island introduced during P3b2 has now
been deleted. The observed-technique sorter receives a typed
`TerminalTechniqueDecisionVector` containing the same native terminal layers;
there is no compatibility scalar hidden in technique ranking. Deprecated
`grossValue`, `expectedOpportunityCost` and `netValue` fields remain zero-valued
schema aliases for older log consumers during this release. New diagnostics use
`decisionLayer`, `decisionMetric`, `decisionDelta` and `decisionInterval`.

The removed C4-only code remains:

- `evaluateTerminalC4Value()`;
- `evaluateTerminalC4OpportunityCost()`;
- `maxFundableFriendshipOptionValue()`;
- `TERMINAL_C4_VALUE_CALIBRATION` and its positive-only deltas.

## Risk versus economy

P5 unifies value, not every risk policy. C1-C3 retain the profile risk threshold
as the terminal admission gate. C4 retains the existing Wilson catastrophe
floor instead of reapplying the generic threshold. Above the applicable safety
gate, paired layered evidence decides PUSH versus STOP.

There is no continuous C4 risk penalty in P5 (`riskPenalty = 0`); uncertainty is
kept separate from utility.

## Paired Monte-Carlo contract

P5 deliberately keeps common-random-number paired statistics:

- `createPairedDifferenceStats`;
- `pairedMeanInterval`;
- `pairedDifferenceSeparated`.

Adaptive convergence requires both reach stability and separation of the
currently decisive paired native metric. If the sample/time budget ends first,
`uncertainAtBudgetLimit` remains true. P4 generalizes these paired statistics into
the durable separation/convergence and co-recommendation policy documented in
`docs/ROBUSTNESS_P4.md`.

## Regression interpretation

Some legacy STOP cases are expected to become PUSH when they were driven by the
old zero-income gate-18 or Friendship scalar. A filler or late song may still be
worth buying for real Lesson SP or Great Success, but the 18-song counter itself
never supplies a proportional reward. This is not token spending receiving
positive value; it follows from comparing explicit consequences in their native
layers.

Conversely, a STOP must emerge because preserving the current state enables a
more valuable downstream action in the same rollout, not because a C4-only
function assigns abstract value to the reserve.

## Durable diagnostics

The canonical terminal explanation is now:

- `decisionLayer`;
- `decisionMetric`;
- `decisionDelta`;
- `decisionInterval`;
- paired reach/safety evidence and `coRecommendationReason`.

Replay snapshots serialize those fields directly. The previous scalar fields
`expectedOpportunityCost`, `grossValue` and `netValue` remain zero-valued,
deprecated compatibility aliases only; they must not be interpreted as terminal
economics.
