# HorizonOutcome v5 — T1a mechanics and T1b utility

P3b2 completes the semantic migration started by P3a/P3b1 for the song solver.
`HorizonOutcome` remains the typed **T1a mechanical outcome**, while ranking
uses a separate **T1b utility assessment** with an explicit stat-point numeraire.
The temporary P3b1 metric-to-vector bridge is deleted.

P3b2 originally left terminal C4 and paired Monte-Carlo robustness outside
this seam. P5 migrated terminal C4, and P4 now adds the robustness stage. The
full durable diagnostic schema remains P6.

## Pipeline after P3b2

```text
physical state
    |
    v
HorizonOutcome (T1a)
metric + value/interval + unit + provenance + transform + uncertainty
    |
    v
grand-live-zero-income-v1
    |
    v
utilityAssessmentFromOutcome() (T1b)
stat-point numeraire + named calibration parameters
    |
    v
P4 robustness
paired MC interval + calibration breakpoints + named co-recommendation cause
    |
    v
hard/admissibility gates -> robust decision + deterministic primary
```

A compatibility `DecisionVector` is still emitted for diagnostics and consumers
that have not yet migrated, but when it contains `utilityStatPoints` its legacy
lanes are not decision inputs. P5 moved terminal-technique decisions onto the
same T1a/T1b utility seam; P4 layers robustness on top without changing that
mechanical or utility contract.

## T1a mechanical contract

T1a owns units and provenance, not utility. Relevant mechanical families are:

| Metric | Unit | Provenance |
| --- | --- | --- |
| expected practice-stat delta | stat-point | zero-income projection |
| expected Skill Points | skill-point | zero-income projection |
| Friendship exposure | friendship-pt-training | zero-income projection |
| Great Success crossed/reach | count / probability | deterministic or projected |
| Gate 16/18 crossed/reach | count / probability | deterministic or projected |
| funding gaps / retained tokens | token | observed/projected state |

Tokens remain state only. They never receive a generic exchange rate into
stat-point utility.

Unknown and interval-valued mechanical outputs cannot silently scalarize to
zero. A utility transform consumes only explicit numeric consequences.

## T1b utility model

The utility model identifier is:

```text
grand-live-stat-numeraire-v1
```

The projection policy is:

```text
grand-live-zero-income-v1
```

### Mechanical / derived values

```text
STAT_POINT_UTILITY       = 1
GREAT_SUCCESS_STAT_DELTA = 35
GATE18_STAT_DELTA        = 50
```

`expectedPracticeStatDelta` is already expressed in stat points and therefore
uses coefficient 1 by construction.

### Bounded calibration

Friendship uses:

```text
FRIENDSHIP_EXPOSURE_STAT_RATE
nominal = 0.52
calibration interval = [0.30, 0.80]
```

The exposure itself remains `Friendship bonus point × generic remaining
training`; the rainbow/stat conversion belongs entirely to the exchange rate.

### Free parameters

```text
SKILL_POINT_UTILITY    = 1.0 nominal seed
SCENARIO_SKILL_UTILITY = 0
SCENARIO_EVENT_UTILITY = 0
```

These are explicit policy parameters, not hidden truth claims. In particular,
`SKILL_POINT_UTILITY = 1` is a neutral seed for calibration rather than a value
derived from the former mixed-unit comparator.

## Discrete gates

Great Success and the 16/18 gates are discrete rewards. Raw progress such as
`15 / 18` is not converted into proportional utility.

Gate 16 contributes only its named scenario-event residual when crossed or when
a zero-income projection actually reaches its deadline. Gate 18 contributes the
50-stat mechanical reward plus its named scenario-skill residual under the same
condition.

If the rollout horizon does not reach a gate deadline, the reward is recorded as
`not-projected`; that is distinct from a projected probability of exactly zero.

## HUNT

HUNT no longer owns a second utility model. Token cost, miss count, filler count
and cycle depth remain diagnostics/state, but are not converted into pseudo
stat-points. Admission uses the projected find-and-fund probability together
with the target's T1b utility. A deep hunt is not made bad merely because it is
deep.

## Carried-page song selection

P2's resource-cost order is now a fallback only. A carried page is ranked first
by nominal T1b utility. Only exact utility ties fall through to:

```text
target
-> structuralTier
-> weightedCost
-> scarcityNormalisedCost
-> totalCost
-> expectedPracticeStatDelta
-> id
```

This preserves the P2 deterministic resource discriminator without allowing it
to outrank a genuine stat-point utility difference.

## Calibration sensitivity

For a named parameter `w_k`, the fixed-projection breakpoint is:

```text
w_k* = - sum(i != k, w_i * Delta x_i) / Delta x_k
```

Breakpoints are reported with:

```text
scope = fixed-projection-policy
projectionPolicy = grand-live-zero-income-v1
```

Only decision-relevant values are retained:

- bounded parameters must cross inside their calibration interval;
- free parameters must cross inside their non-negative policy domain;
- calibration never claims to overturn a different hard/admissibility state.

## P4 robustness boundary

T1a keeps Monte-Carlo `couplingKey` metadata on related projections. P4 now
generalizes the terminal path's existing common-random-number comparison into
a named paired robustness report. A Monte-Carlo cause is emitted only where
per-trial differences are actually retained; a shared seed label alone is not
treated as proof of pairing.

Song policy currently exposes `pairedComparison = null` because its sampling
results are marginal rather than a retained paired utility-difference stream.
It can still expose calibration sensitivity. This is deliberate: a
**calibration-sensitive** order and a **monte-carlo-not-separated** order have
opposite remedies and are never collapsed into one generic uncertainty flag.

See `docs/ROBUSTNESS_P4.md` for the frozen confidence policy, convergence
reasons and co-recommendation contract.

## Compatibility boundary after P5

`DecisionVector` remains in the public diagnostics surface for compatibility.
Song-policy vectors carry `utilityStatPoints`; when both compared vectors have
that field, legacy structural/prospective/token lanes are ignored.

P5 migrated terminal-technique/C4 onto the same T1a/T1b utility seam and
removed the special C4 opportunity-cost economy. Terminal diagnostics still
export a compact numeric vector for durable compatibility, but terminal action
selection itself is the paired T1b comparison documented in
`P5_TERMINAL_UNIFICATION.md`.

## P3b2 invariants

1. T1a remains mechanical and ranking-free.
2. Every cross-unit conversion is named in T1b.
3. Stat points are the explicit numeraire.
4. Great Success and 16/18 remain discrete gates.
5. Raw progress below a gate receives no fractional reward.
6. Tokens have no intrinsic utility.
7. Unknown/interval mechanics cannot silently scalarize to zero.
8. Breakpoints are conditional on the fixed projection policy.
9. Full paired Monte-Carlo robustness remains outside P3b2.
