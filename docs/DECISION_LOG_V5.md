# Decision log v5 — canonical solver diagnostics

P6 finalizes the durable decision-log contract for the Grand Live solver. The
NDJSON schema was already numbered `5` when P5 changed terminal opportunity-cost
semantics; P6 does **not** invent a schema v6. Instead, every candidate now owns a
single canonical diagnostic view whose structure follows the solver pipeline.

The canonical sub-schema is versioned independently as:

```text
grand-live-decision-diagnostic-v1
```

The decision policy remains `grand-live-v8`. P6 is diagnostic-only and must not
change action ranking.

## 1. Canonical pipeline

Each candidate records the layers in this order:

```text
physical state / feasibility
  ↓
T1a mechanical outcome
  ↓
grand-live-zero-income-v1
  ↓
T1b grand-live-stat-numeraire-v1
  ↓
grand-live-robustness-v1
  ↓
decision / first separating layer
```

The durable payload is `candidate.canonicalDiagnostics`. Older candidate fields
remain compatibility telemetry for existing tools, but new consumers should use
the canonical payload.

## 2. Availability is explicit

A field is never synthesized merely to make the schema look complete.

```ts
{ status: "available", value: ... }

{ status: "unavailable", reason:
    | "not-applicable"
    | "not-materialized-on-analysis-path"
    | "not-materialized-on-terminal-aggregate"
    | "conditioning-event-unavailable" }
```

This is the durable representation of the `unknown != 0` invariant at schema
boundaries. In particular:

- a technique `runAnalysis` result exposes exact physical/funding diagnostics,
  but does not pretend to own a T1a/T1b object when that path never materialized
  one;
- a terminal aggregate exposes its paired robustness and calibration
  breakpoints, but P6 does not reconstruct a fictitious T1b component list from
  aggregate means;
- an unavailable conditioning event is not logged as probability `0`.

## 3. Action and physical feasibility

```ts
action: {
  id: string;
  kind: string;
  physicalFeasibility: {
    physicalAffordable: boolean | null;
    immediateFundingGap: Balance | null;
    weightedFundingGap: number | null;
  };
}
```

`physicalAffordable` is a hard game-rule fact when available. The funding gap is
in token units. Tokens are never converted into intrinsic utility.

## 4. Funding and appearance

```ts
funding: {
  currentActionAppearanceProbability: available(number) | unavailable(...);
  projectedAppearanceProbability: available(number) | unavailable(...);
  zeroIncomeFundabilityProbability: available(number) | unavailable(...);
  zeroIncomeFundingGap: available(distribution) | unavailable(...);
  zeroIncomeFundingGapBySong: [
    { songId, distribution }
  ];
}
```

The fields deliberately keep three questions separate:

1. is this concrete action/page visible now?;
2. can the target appear over the projected horizon?;
3. conditional on the zero-income model, can it be funded?

For `runAnalysis`, P1' retains one funding-gap distribution per song. P6 logs
that collection instead of collapsing it into a fabricated aggregate
`zeroIncomeFundingGap`.

## 5. T1a mechanical outcome

A full song-policy candidate records the exact `HorizonOutcome` components:

```ts
t1a: {
  status: "available";
  value: {
    tieId,
    components: [{
      metric,
      value,          // number | interval | unknown
      unit,
      provenance,
      transform,
      uncertainty
    }]
  }
}
```

The global `MetricId -> unit + transform` contract remains authoritative. P6
copies the typed mechanical representation; it never derives it from UI prose or
legacy numeric vectors.

## 6. T1b utility and calibration

A full T1b record contains:

```ts
t1b: {
  projectionPolicy: "grand-live-zero-income-v1";
  utilityModel: "grand-live-stat-numeraire-v1";
  nominalStatPoints;
  boundedCalibrationInterval;
  contributions;
  linearTerms;
  freeParameters;
  unprojectedRewards;
  calibration;
  breakpoints;
}
```

`calibration` snapshots every named exchange rate, including its kind, nominal
value, admissible interval/minimum and unit. Breakpoints preserve:

```text
value · scope=fixed-projection-policy · projectionPolicy
leftId · rightId · epsilon · belowDelta · aboveDelta
withinCalibrationInterval · withinAdmissibleDomain
```

Therefore a later analysis can distinguish a mechanically derived value from a
bounded or free calibration parameter without consulting the source tree from
that date.

## 7. Gates

Canonical gate IDs are:

```text
great-success
gate16
gate18
```

Each available gate records:

```ts
{
  id,
  deadline,
  crossedByAction,
  provenReachable: boolean | "unknown",
  zeroIncomeReach: {
    label: "zero-income-conservative-estimate",
    mean,
    interval,
    samples,
    couplingKey
  } | unavailable(...),
  reward: {
    statDelta,
    skillPointDelta,
    residualUtilityParameter
  }
}
```

P6 intentionally uses the label `zero-income-conservative-estimate`. It must not
be changed to `lower-bound` until resource-monotonicity of the implemented
projection kernel is proven by property tests.

The reward stays decomposed. A gate is never valued proportionally to its raw
counter.

## 8. Robustness

```ts
robustness: {
  policy: "grand-live-robustness-v1";
  paired: {
    mean,
    interval,
    confidenceLevel,
    samples,
    maxSamples,
    separation,
    convergenceReason,
    couplingKey
  } | null;
  riskAdmission: {
    threshold,
    reachProbability,
    interval,
    confidenceLevel: 0.95,
    separation: "above" | "below" | "not-separated"
  } | unavailable(...);
  calibration;
  breakpoints;
  coRecommendationReason:
    | "monte-carlo-not-separated"
    | "calibration-sensitive"
    | "both"
    | null;
  calibrationSensitiveParameters;
}
```

A paired result is present only when the solver retained genuine common-random-
number differences. Reusing a seed is not enough to fabricate covariance.

Terminal summaries now retain the **full** calibration breakpoints, not merely
parameter names. Their canonical `riskAdmission` record preserves the actual
admission threshold, reach probability, full Wilson interval and whether that
interval is above, below or not separated from the boundary. The calibration
snapshot is also retained here so terminal aggregates remain auditable even when
component-level T1b is intentionally unavailable.

## 9. First separating layer

P6 records why ordering became strict instead of forcing every decision into a
single opaque score:

```text
action-validity
physical-feasibility
hard-state
risk-admissibility
utility
robustness
stable-tie-break
legacy-technique-ranking
not-separated
self
```

Two fields are kept because there can be two nested decisions:

```ts
separation: {
  comparedTo,
  firstSeparatingLayer,          // caller-level candidate ranking
  terminalFirstSeparatingLayer,  // STOP/PUSH inside terminal MC, if any
  sourceRankReasonCode
}
```

For terminal STOP/PUSH:

- MC/calibration `both` or MC not-separated -> `robustness`;
- a Wilson interval clearly below the admission threshold ->
  `risk-admissibility`;
- otherwise a non-zero paired utility delta -> `utility`;
- calibration-only co-recommendation after a nominal result -> `robustness` as
  the uncertainty annotation;
- exact residual equality -> `stable-tie-break`.

This diagnostic never changes the ranking; it explains the already-made
ranking.

## 10. Coverage modes

`modelCoverage` prevents downstream tools from assuming every code path has the
same materialization depth:

```text
full-t1a-t1b
physical-projection-only
terminal-aggregate
```

A `terminal-aggregate` may have rich paired robustness while T1b is explicitly
unavailable as a component-level object. This is intentional and more reliable
than reverse-engineering an outcome from aggregate telemetry.

## 11. Versioning

The durable identities after P6 are:

```text
DecisionLogEntry.schemaVersion       = 5
canonicalDiagnostics.schema          = grand-live-decision-diagnostic-v1
policyVersion                        = grand-live-v8
projectionPolicy                     = grand-live-zero-income-v1
utilityModel                         = grand-live-stat-numeraire-v1
robustnessPolicy                     = grand-live-robustness-v1
application version                  = 1.0.3
```

Change `schemaVersion` when a durable field changes type or meaning. Change the
canonical diagnostic sub-schema when its own contract changes even if the outer
NDJSON envelope remains compatible. Change `policyVersion` only for decision
semantics, not for diagnostic enrichment.

## 12. Compatibility and migration

Existing v5 candidate telemetry is retained for one compatibility window. New
analytics should prefer:

```text
candidate.canonicalDiagnostics
```

over fields such as legacy `decisionVector`, duplicated reach probabilities or
terminal convenience scalars.

Do not add future durable solver diagnostics directly in React. Add them to the
core canonical diagnostic builder first, then serialize that typed result.

## 13. P6 non-goals

P6 does not:

- change the utility calibration;
- change the projection policy;
- change action enumeration;
- change risk thresholds;
- infer missing T1a/T1b data;
- claim zero-income projections are proven lower bounds;
- remove all legacy candidate telemetry in the same patch.

Its acceptance criterion is durable observability of the final solver
architecture with no primary-action change in the classified replay corpus.
