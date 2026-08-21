# P4 — Paired uncertainty and co-recommendation

P4 adds the **ROBUSTNESS** stage after the P3b2 stat-point utility model and
P5's unified terminal action space. It does not add a new utility, token value,
or physical action.

```text
PHYSICAL STATE
  -> HorizonOutcome (T1a mechanics)
  -> grand-live-zero-income-v1 projection
  -> UtilityAssessment (T1b, stat-point numeraire)
  -> P4 robustness
  -> decision
```

The frozen robustness policy is:

```text
grand-live-robustness-v1
confidence level: 0.95
normal z: 1.959963984540054
default minimum samples: 192
default maximum samples: 2400
sampling batch: 64
```

Changing these constants changes solver semantics.

## Two uncertainty causes, two remedies

P4 deliberately keeps two causes separate:

```ts
type CoRecommendationReason =
  | "monte-carlo-not-separated"
  | "calibration-sensitive"
  | "both";
```

They are not synonyms.

- `monte-carlo-not-separated`: the paired sampling interval or a stochastic
  risk boundary still crosses the decision boundary. More paired samples can
  resolve it.
- `calibration-sensitive`: a named exchange rate has an admissible breakpoint
  that can reverse the fixed-projection utility order. More Monte-Carlo draws
  do not solve this; the calibration needs measurement or a policy decision.
- `both`: both remedies are relevant and must remain visible independently.

The solver uses **not-separated** and **co-recommended**. It never calls the
alternatives equivalent.

## Canonical decision shape

A primary action is always emitted so downstream consumers remain stable:

```text
recommended = A
coRecommended = [B, ...]
coRecommendationReason = <named cause>
```

This primary is a deterministic API tie-break, not a claim that A is superior.

For a true terminal Monte-Carlo not-separation, the versioned stable order is:

```text
STOP_NOW -> EXPOSE_AND_CARRY
```

This prevents the primary action from flipping with a noisy sample mean.

Calibration uncertainty is different. Under the nominal fixed policy the
utility order is already deterministic, so a calibration-only case keeps that
nominal primary and adds the runner-up as co-recommended. It is not re-sorted
through the Monte-Carlo tie-break.

## True paired Monte-Carlo only

The terminal solver already uses common random numbers for sibling STOP/PUSH
branches. P4 formalizes that existing primitive by retaining the per-trial
difference:

```text
d_i = U(PUSH_i) - U(STOP_i)
```

and reporting the confidence interval of the **paired mean difference**.

```ts
pairedUtility: {
  policy: "grand-live-robustness-v1";
  mean: number;
  interval: [number, number];
  confidenceLevel: 0.95;
  samples: number;
  maxSamples: number;
  separation: "above" | "below" | "not-separated";
  convergenceReason: ...;
  couplingKey: string;
}
```

A shared seed label by itself is not enough. Two marginal simulations are not
called paired unless the implementation actually retains corresponding
trial-by-trial differences under the same `couplingKey`.

For that reason, the current song-policy robustness surface exposes:

```text
pairedComparison = null
```

It may report calibration sensitivity, but P4 does **not** manufacture a
Monte-Carlo covariance from its marginal Wilson estimates. A future producer
may opt in only after it exposes a genuine paired-difference stream.

## Separation rule

For paired differences P4 uses the 95% normal interval of the sample mean.
Against threshold zero:

```text
lower > 0   -> above
upper <= 0  -> below
otherwise   -> not-separated
```

The asymmetry at exactly zero is inherited from the existing Monte-Carlo
primitive and is now parameterized by the frozen P4 z value.

The convergence report distinguishes why sampling stopped:

```text
minimum-samples
risk-and-paired-separated
paired-separated
max-samples
time-budget
sampling
```

`samples`, `maxSamples`, `confidenceLevel`, `convergenceReason` and
`couplingKey` are part of the durable robustness result rather than hidden
runtime details.

## Risk boundaries are statistical too

Terminal utility and terminal safety remain separate dimensions. P4 does not
convert risk into stat points.

The terminal evaluator keeps its existing profile threshold and the C4
catastrophe floor. The reach probability is estimated with a Wilson interval:

```text
lower >= threshold  -> safety admissible
upper < threshold   -> clearly below the safety boundary
otherwise           -> risk not-separated
```

When the Wilson interval still crosses the relevant safety boundary, the
terminal decision is co-recommended for `monte-carlo-not-separated` even if the
sample mean itself has a side. STOP remains the stable primary until the
stochastic safety boundary separates.

A branch whose Wilson interval is **clearly below** the safety boundary is not
co-recommended merely because its utility calibration is attractive: the hard
safety policy still wins.

## Calibration sensitivity under fixed projection

P3b2 already represents utility as linear terms under the named fixed
projection policy. P4 generalizes the breakpoint calculation to expected
terminal linear terms:

```text
w_k* = -(sum_{i != k} w_i * Delta x_i) / Delta x_k
```

The terminal sampler accumulates the linear terms of the actual nominally
selected PUSH outcome and STOP outcome for each paired trial, averages them,
and reports only admissible breakpoints.

This remains a **fixed-projection-policy** sensitivity diagnostic. It does not
claim that rerunning the rollout with another calibration preserves the same
per-trial action choices or that the full kernel is piecewise linear.

## Boundary examples locked by tests

P4 carries three distinct acceptance cases.

### Monte-Carlo only

A real C3 fixture at 80 draws has a paired decisive-metric interval crossing
zero. The sample mean is not used to force a winner:

```text
recommended = STOP_NOW
coRecommended = [EXPOSE_AND_CARRY]
reason = monte-carlo-not-separated
```

### Calibration only

The SP3-vs-Friendship regression keeps its nominal SP3 primary, but a valid
utility-rate breakpoint exposes the runner-up:

```text
recommended = nominal SP3 action
coRecommended = [Friendship alternative]
reason = calibration-sensitive
pairedComparison = null
```

### Both

A second terminal boundary has both a paired interval crossing zero and an
admissible `SKILL_POINT_UTILITY` breakpoint:

```text
recommended = STOP_NOW
coRecommended = [EXPOSE_AND_CARRY]
reason = both
```

The two causes remain separately inspectable through `pairedUtility` and
`calibrationSensitiveParameters`.

## Versioning boundary

P4 changes solver decision semantics and therefore advances the solver policy
identifier:

```text
grand-live-v7 -> grand-live-v8
```

The diagnostic schema remained v5 in this phase. P6 now finalizes the complete
canonical log payload (T1a/T1b/gates/funding/paired robustness and first
separating layer); see `docs/DECISION_LOG_V5.md`.

## P4 invariants

1. No physical feasibility or utility formula is introduced by robustness.
2. Monte-Carlo not-separation requires real paired per-trial differences.
3. A shared seed without paired differences is insufficient evidence of coupling.
4. Calibration uncertainty is systematic and distinct from sampling noise.
5. Co-recommended actions are never described as equivalent.
6. Monte-Carlo unresolved terminal states use a deterministic STOP-first primary.
7. Calibration-only states retain the nominal utility primary.
8. Risk remains an admission boundary, never a stat-point penalty.
9. A clearly unsafe branch is not rescued by calibration sensitivity.
10. P6 owns the canonical durable diagnostic surface; see `docs/DECISION_LOG_V5.md`.
