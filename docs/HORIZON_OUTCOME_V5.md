# HorizonOutcome v5 — P3b1 mechanical outcome contract

P3b1 is the semantic normalization step after the P3a iso-behavior seam. It
removes action-specific legacy projections and makes the quantities used by the
song solver explicit about **metric identity, unit, provenance, transform and
uncertainty**.

P3b1 intentionally does **not** introduce the final utility model. P3b2 owns
that calibration. Until then, a small decision bridge preserves the strategic
lexicographic structure without putting ranking metadata into the mechanical
schema.

## Pipeline after P3b1

```text
physical state / deterministic consequence / zero-income projection
                         |
                         v
                  HorizonOutcome
              typed mechanical components
                         |
                         +------------------------------+
                         | temporary P3b1 decision      |
                         | bridge: metric -> lane/order |
                         v                              |
                  DecisionVector <---------------------+
                         |
                         v
              compareDecisionVectors()
```

The important boundary is that the **mechanical contract** and the **temporary
ranking order** are separate:

- a `MetricId` owns one global `unit` and one global `transform`;
- action code cannot choose a different transform for the same metric;
- lane/order metadata is not part of an `OutcomeComponent`;
- P3b2 can delete the decision bridge without changing consequence production.

The five physical song-policy actions use the same representation:

- `buy-stop`;
- `buy-continue`;
- `wait-reserve`;
- `carry-page`;
- `stop-and-carry-stock`.

## Canonical component shape

Each component records a semantic quantity rather than an opaque vector slot:

```ts
type OutcomeComponent = {
  metric: MetricId;
  value: number | Interval | Unknown;
  unit:
    | "stat-point"
    | "skill-point"
    | "friendship-pt-training"
    | "token"
    | "count"
    | "probability";
  provenance:
    | "observed"
    | "deterministic-consequence"
    | "zero-income-projection";
  transform: TransformId;
  uncertainty:
    | { kind: "none" }
    | { kind: "monte-carlo"; couplingKey: string }
    | { kind: "interval" }
    | { kind: "calibration"; parameter: string }
    | { kind: "unknown"; source: string };
};
```

`createHorizonOutcome()` validates that a metric cannot silently change unit or
transform between actions. Duplicate metrics in one outcome are rejected.

## Dimensional rules

P3b1 separates quantities that the legacy vector could accidentally combine:

| Metric family | Unit | Typical provenance |
| --- | --- | --- |
| expected practice stat delta | `stat-point` | zero-income projection |
| expected skill points | `skill-point` | zero-income projection |
| Friendship training exposure | `friendship-pt-training` | zero-income projection |
| Great Success / pacing / hunt state | `count` | observed or deterministic consequence |
| gate reach / target reach | `probability` | zero-income projection |
| immediate funding gaps | `token` | observed |
| retained balance | `token` | observed |
| visible song cost | `token` | deterministic consequence |
| expected future technique cost | `token` | zero-income projection |

Unlike units are never added without a named exchange rate. In particular,
practice stat output and Skill Points are separate components. The old combined
"training exposure" quantity no longer exists.

`Skill Pt(s) Training +N` is classified structurally as `sp-training`, even if
catalogue roles are absent or change. It cannot fall through to practice-stat
exposure merely because role metadata is incomplete.

## One metric, one transform

P3b1 removes the P3a action-specific `floor(exposure / 20)` behavior. A raw
practice-stat projection such as `41.8` is represented as `41.8 stat-point` and
uses the same transform everywhere.

Probability metrics currently use one global 5 % band transform while the
interim comparator remains lexicographic. This is a transitional decision
transform, not a claim about final utility. P3b2 is responsible for replacing
this bridge with explicit utility/robustness semantics.

The P3a artifacts are deleted and guarded against reintroduction:

- `legacyDecisionVectorFromOutcome`;
- `legacyProjection`;
- `LegacyDecisionTransform`;
- `createLegacyCompatibleHorizonOutcome`;
- `floor-div-20`.

## Tokens are state, not utility

`retained-tokens`, visible song cost and funding gaps remain observable
mechanical state. They do **not** occupy a generic ranking lane and the interim
`DecisionVector` receives zero retained-token and committed-cost utility from
`HorizonOutcome`.

Tokens matter only through concrete consequences such as affordability,
funding gaps, reachable actions and discrete gates. This prevents a solver from
preferring an otherwise worse action merely because it leaves a larger raw
wallet.

The P1′ per-color `zeroIncomeFundingGap` distribution remains the authoritative
fundability diagnostic in `runAnalysis()`. `future-technique-cost-expected` in
`HorizonOutcome` is explicitly expected-value telemetry with Monte-Carlo
uncertainty; it is **not** a replacement for that distribution and is not used
as generic utility.

## Discrete gates

P3b1 does not turn progress counters into fractional gate utility. A raw
`counter / target` fraction is not used as a substitute for whether a gate is
crossed or for the probability of crossing it under a zero-income projection.

Gate-oriented metrics are named explicitly, for example:

- `great-success-secured`;
- `great-success-zero-income-reach`;
- `final-gauge-zero-income-reach`;
- `next-page-zero-income-reach`;
- `next-section-completion-state`.

Adding resources should intuitively not hurt a funding projection, but the
current rollout kernel also contains policy and Monte-Carlo interactions.
Therefore zero-income gate reach is documented as a **conservative estimate**,
not as a mathematically proven lower bound. P3b1 makes no monotonic lower-bound
claim that the existing kernel cannot guarantee.

## Uncertainty and coupling

Projected cross-section values carry an explicit Monte-Carlo uncertainty with
a shared `couplingKey`. Related action evaluations can therefore be recognized
as originating from the same random experiment instead of being mistaken for
independent certainty.

P3b1 records this structure but does not yet implement the final paired
robustness comparison. Common-random-number semantics, confidence/robustness
policy and calibration belong to P3b2.

## Deliberate semantic changes from P3a

P3a had to preserve historical asymmetries exactly; P3b1 is the phase where
those asymmetries are removed. Replay differences are therefore allowed but
must be explainable mechanically.

One regression fixture changes from `ring-ring` to `kiseki`: both alternatives
secure the same Great Success gate, while the typed zero-income practice-stat
projection for `kiseki` is larger. The former `ring-ring` preference depended
on legacy vector ordering rather than on an explicit same-unit mechanical
advantage.

Carry behavior is kept explicit rather than restored through token utility.
`carry-without-opportunity-delay` represents the specific structural benefit of
preserving a non-opportunity page and its inherited technique when doing so does
not postpone a visible target. `carried-page-preserved` itself remains telemetry.

## P3b1 invariants

1. Every `MetricId` has exactly one global unit and transform.
2. No action supplies its own unit, transform or vector lane.
3. Stat points, Skill Points, Friendship exposure and tokens are never summed
   as if they were the same dimension.
4. Retained tokens and raw token costs are state, never intrinsic utility.
5. Discrete gates are represented as gates/reach probabilities, not normalized
   progress counters.
6. Zero-income projections state their provenance and uncertainty.
7. The P3a compatibility adapter and transforms no longer exist in core source.
8. `SongPolicyEvaluation.horizonOutcome` remains required for all five physical
   action kinds.

## Temporary bridge and P3b2 deletion contract

`decisionVectorFromOutcome()` and its private `p3b1DecisionBridge` are deliberate
transitional machinery. They map canonical metrics to the current comparator's
lexicographic lanes **without** changing the mechanical contracts.

P3b2 must replace this bridge with explicit utility/robustness semantics. It
must not reintroduce action-specific transforms, mixed-unit sums or intrinsic
token value while doing so.

## Non-goals of P3b1

P3b1 does not:

- calibrate stat points against Skill Points or Friendship exposure;
- define the final scalar/lexicographic utility function;
- prove Monte-Carlo monotonicity or confidence bounds;
- replace P1′ funding-gap distributions with a scalar;
- unify the separate terminal C4 economy;
- fix the terminal `buy-continue` action-space divergence;
- change terminal-technique ranking into the final outcome model.

Those changes belong to P3b2 and later phases in the frozen implementation
order.
