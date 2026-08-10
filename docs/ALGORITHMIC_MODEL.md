# V1 algorithmic model

This document describes the decision model shipped in v1.0.0. Historical
experiments, replay-specific investigations, and superseded reserve designs are
kept under `docs/archive/`; they are not normative.

The mechanical source of truth is
`packages/core/src/domain/live-rules.ts`, currently identified as
`global-grand-live-2026-08-r3`.

## Mechanical contract

| Property                              |  C1 |  C2 |  C3 |  C4 | Grand Live |
| ------------------------------------- | --: | --: | --: | --: | ---------: |
| Cumulative song pool                  |   8 |  11 |  15 |  21 |         21 |
| Newly unlocked songs                  |   8 |   3 |   4 |   6 |          0 |
| Automatic Great Success gauge songs   |   1 |   0 |   0 |   0 |          1 |
| Manual songs needed for Great Success |   2 |   3 |   3 |   3 |          2 |
| Token cap                             | 200 | 250 | 300 | 350 |        400 |

Technique-to-song patterns:

- C1 uses the verified prefix `1-2-3-4-4-2-3`. The model does not extrapolate
  beyond this prefix.
- C2 through C4 use `2-2-2`, then repeat `4-5-2-2`.
- Grand Live uses `2-2-2`, then repeats `4-3-2-2`.

After C1 through C4, **New Supporters!** first raises every token cap by 50 and
then credits 10 of each token, clamped to the new cap. There is no transition
after Grand Live.

A lesson refresh always exposes three cards. When fewer than three songs remain
in the pool, all remaining songs are guaranteed and unused slots are ordinary
techniques.

## Carryover mechanics

An exposed song page may cross any Promotional Live. Buying the carried song in
the next section consumes one point of that section's technique pattern and
removes the song from the remaining pool.

An exposed technique page may also cross a Promotional Live. Its three cards
retain the price period in which the page was generated until the first
technique is bought. That purchase refreshes the shop, and the new page uses the
current section's period. Song carryover does not itself preserve technique
prices.

These two carryover states are distinct and are recorded separately in session
state and decision logs.

## Strategic controller

The controller separates five modes:

| Mode         | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `ACCUMULATE` | Invest when current and cross-section value justify it            |
| `HUNT`       | Open pages for a specific hidden structural target                |
| `HOLD`       | Do not start a new technique chain; preserve future optional buys |
| `CLOSE`      | Finish a local deadline objective before the concert              |
| `CONVERT`    | Spend terminal stock for immediate Grand Live value               |

### C1: accumulate

C1 has no fixed song quota. Continuation is evaluated as:

```text
value of the remaining C1 chain + value of the resulting future sections
```

The current chain contributes its actual purchases, SP, early Friendship
activation, and technique costs. The resulting balance and thinned pool then
feed the later sections. This prevents saved stock from receiving an asymmetric
advantage over songs bought before the first concert.

Great Success is one part of the value, not the only reason to continue. A
profitable early chain may still win when its 35-stat Great Success component is
removed. Conversely, no rule forces a number of C1 songs: a chain with no
affordable future acquisition remains rejected.

### C2: hunt SP +2, then hold or close

While the SP +2 target remains active, C2 is in `HUNT`. Once the target is
acquired or deliberately abandoned:

- `section-open` uses strict `HOLD` and will not reopen a hidden Friendship or
  filler chain;
- `deadline-now` switches to `CLOSE` if the Great Success gauge is incomplete;
- after the third manual song, the plan immediately returns to `HOLD`.

An older SP or Friendship may remain a visible optional purchase without
becoming a hidden chase target.

### C3: hunt SP +3, then hold or close

C3 applies the same state machine to SP +3. The separation between hidden
`chaseTargets`, visible `optionalTargets`, and future `reserveTargets` prevents
an already completed or abandoned objective from silently reopening spending.

### C4: accumulate toward valuable final state

C4 continues to value relevant Friendship targets, current lesson quality,
pool thinning, and the exact Grand Live continuation. The displayed 16-song
checkpoint is pacing telemetry rather than a hard purchase gate.

The solver may stop below 16 when spending now does not improve the prospective
state, or continue above it for a valuable target. A filler is not promoted
solely because it moves the counter toward 18.

### Grand Live: terminal conversion

The final game reward requires:

```text
total songs >= 18 AND Grand Live Great Success
```

At Grand Live there is no future training and no later token use. The model
therefore assigns:

- `+5 SP` to every affordable technique;
- `+25 SP` to every affordable song;
- zero future value to training, Friendship, Specialty, or retained stock.

The incomplete final Great Success gauge is closed first. Affordable terminal
conversions are then compared by immediate gain, feasibility of the next page,
and cost. Spending can continue beyond 18 when it produces more immediate SP.

## Decision ordering

Actions are compared lexicographically. Distinct value families are not added
into one arbitrary universal score.

The shared `DecisionVector` uses this order:

1. mechanical validity and deterministic hard constraints;
2. admission under the selected risk profile;
3. costed prospective state and pacing debt;
4. ordinal structural value;
5. lexicographic continuation value;
6. retained tokens;
7. lower committed cost;
8. stable candidate identifier.

Risk thresholds are:

| Profile  | Minimum admitted probability |
| -------- | ---------------------------: |
| Safe     |                        98.5% |
| Standard |                          92% |
| Greedy   |                          78% |

Probability differences inside the same admission band are weak tie-breakers.
They do not override mechanical constraints, material structural value, or a
meaningful colour bottleneck.

## Song roles and timing

The structural roles are ordinal:

- active SP +2 or SP +3 hunt target;
- Friendship +10%;
- Friendship +5%, with value decreasing as activation is delayed;
- missed SP targets, with value decreasing after their preferred section;
- Specialty Priority as a weak filler tie-breaker;
- ordinary filler with no independent hard reserve.

Flat stat and training bonuses do not become structural tiers. They can
differentiate otherwise comparable fillers, but cannot outrank an active SP or
Friendship objective merely by being expressed in larger numeric units.

## Dynamic training-bonus value

For `Training X Gain +N`, the expected remaining value is:

```text
V(Training X Gain +N) = N * phi * T_x
phi = 1 + active Friendship Training Effectiveness from songs
```

`T_x` is the expected count of remaining training clicks that produce stat
`x`, including secondary stat production. The calibrated `speed-wit` profile
uses relative weights:

| Stat    | Weight |
| ------- | -----: |
| Speed   |   1.00 |
| Power   |   0.71 |
| Wit     |   0.39 |
| Stamina |   0.18 |
| Guts    |   0.16 |

An exact distribution supplied by the caller takes priority. Other generation
profiles retain their explicit fallback rather than inventing an unverified
click distribution.

This value is soft pressure and a filler tie-breaker. It never creates a hard
token reserve by itself.

## Strategic reserve and colour pressure

Reserve targets are complete cost vectors, not independent per-colour minima.
The solver orders targets by decreasing structural value, breaking ties by
weighted demand cost, and greedily builds a feasible protected set.

For a protected set `S`:

```text
reachAndAfford(S) iff there exists a real vector-valued trajectory
that reaches the protected acquisitions and, after every mandatory payment,
can still fully afford every unpurchased target in S
```

Consequences:

- techniques and songs paid along the trajectory are deducted;
- acquired songs immediately leave the reserve and remaining pool;
- minima from incompatible trajectories are never merged into a fictitious
  balance;
- when the current technique page is known, the first simulated payment must be
  one of its actual offers;
- unknown refreshes use favourable feasibility, not a fabricated Monte Carlo
  probability;
- `visible(target) => reachCost(target) = 0`;
- a target skipped while hidden is reconsidered immediately when it becomes
  visible and affordable.

Lower-tier desirable songs produce a soft shadow price by colour. This pressure
is evaluated after hard constraints and material structural gains but before
small probability differences. A high raw balance is therefore not
automatically surplus, and a low nominal cost is not automatically safe.

Probability is separate from feasibility. The solver never reserves
`probability * cost`; protected targets keep their complete price.

## Technique ranking

Observed technique offers are compared in an explainable sequence:

1. affordability;
2. immediate deterministic blocking of a strategic target;
3. dominance on the same set of colours;
4. hard terminal state;
5. breaks and deficit below the strategic frontier;
6. reach and joint-goal admission band;
7. strategic opportunity cost;
8. shadow-price-weighted cost;
9. total cost and normalised reserve drain;
10. next-page coverage, terminal economy, generic continuation, and stable ID.

`rankReason` records the first criterion that separated a candidate from the
winner. A more expensive technique on the same colour support remains available
as an override because an Energy or Hint effect may be operationally valuable
even when the OCR cannot observe that value.

## Horizons and probabilities

Small song pools are enumerated exactly. Above 160 possible pages or 3,000
states, deterministic sampling closes the horizon. Technique offers use a
stable seed, making repeated decisions reproducible for the same state.

Future-page simulation always alternates the real sequence:

```text
techniques -> resulting balance -> song page -> song purchase
```

A song page is never evaluated using the pre-technique balance. The default
page law is uniform and marked as heuristic; the model accepts measured weights
without changing the decision API.

`AnalysisResult` separates:

```text
reachProbability     = P(reach the page)
conditionalGoal      = P(goal | page reached)
jointGoalProbability = P(reach AND goal)
```

Only the joint probability participates in ranking. It must never exceed reach
probability. Invalid or unreachable candidates have joint probability zero.
Qualitative 16/18 capacity diagnostics remain separate from these simulated
shop probabilities.

The UI budgets deterministic samples by profile and may stop early once
confidence intervals no longer cross a decision boundary. Diagnostics record
the actual sample count and time spent in each sub-engine.

## Cross-section value

At `deadline-now`, C1 through C4 may be evaluated into the next section using
the same probabilistic kernel as the current section:

1. finish the remaining current continuation with actual technique costs;
2. apply the verified cap increase and `+10` transition;
3. buy a carried song when applicable;
4. add newly unlocked songs and remove purchased IDs;
5. simulate the next section, preserving inherited technique pricing for only
   the first purchase when such a page is actually carried;
6. compare target acquisition and timing, active Friendship, cumulative songs,
   paid techniques, SP, and resulting balance.

The horizon value includes both the current continuation and later sections.
Pool thinning is not an artificial bonus term: later draws operate directly on
the pool from which purchased songs have been removed.

Future training-token income is not converted into a fabricated absolute chance
of reaching 16 or 18. Cross-section projection uses guaranteed current stock
and the verified concert transition unless an explicit measured supply model is
provided.

## HOLD and post-purchase invariants

During `section-open`, `HOLD` forbids starting a new technique chain. Progress
already paid toward a page is a sunk cost and never justifies additional
spending by itself.

On an already exposed song page:

- a visible optional structural target may still be bought;
- an ordinary filler cannot reopen the chain;
- a carried page may be kept without assigning value to already paid
  techniques.

Recommendation semantics must also survive immediate re-evaluation:

- `buy-stop` must produce STOP, invalid, or an explicitly abandoned hunt after
  purchase;
- `buy-continue` must produce a genuine continuation after purchase;
- STOP is never described as a successful purchase path;
- a candidate cannot be labelled unreachable while its song is visible and
  affordable.

These invariants are verified against production builders, not isolated mock
comparators.

## Safety and observability

Safety qualification annotates a computed decision; it does not recompute it.
`hard-blocking` is reserved for deterministic evidence that a candidate is
unaffordable or makes every currently affordable active target impossible
before the deadline. Probabilistic or model-sensitive concerns remain warnings.

Forced override exposes the same policy with the user's risk preference; it
does not bypass mechanical validity or create a second solver.

The version-3 NDJSON log records structured message codes instead of rendered
sentences. This keeps logs comparable across French and English and supports
replay analysis across application versions.
