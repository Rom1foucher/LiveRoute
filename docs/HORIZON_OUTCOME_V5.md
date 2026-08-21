# HorizonOutcome v5 — T1a mechanics and T1b utility

P3b2 completes the semantic migration started by P3a/P3b1 for the song solver.
`HorizonOutcome` remains the typed **T1a mechanical outcome**, while ranking
uses a separate **T1b utility assessment** with an explicit stat-point numeraire.
The temporary P3b1 metric-to-vector bridge is deleted.

P3b2 originally left terminal C4 and paired Monte-Carlo robustness outside
this seam. P5 migrated terminal C4, and P4 now adds the robustness stage. The
P6 now finalizes the durable schema in `docs/DECISION_LOG_V5.md`.

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
deterministic stat-point numeraire only
    |
    v
T2 generic behavioural projection
practice/SP training estimates as tie-breaks only
Friendship exposure diagnostics only
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

| Metric | Unit | Provenance | Decision layer |
| --- | --- | --- | --- |
| immediate stat delta | stat-point | deterministic consequence | T1b |
| immediate Skill Points | skill-point | deterministic consequence | T1b |
| expected practice-stat delta | stat-point | generic behavioural projection | T2 |
| expected Skill Points from future trainings | skill-point | generic behavioural projection | T2 |
| Friendship exposure | friendship-pt-training | generic behavioural projection | diagnostic only |
| Great Success crossed/reach | count / probability | deterministic or zero-income projection | crossed → T1b; reach → mechanics |
| Gate 16/18 crossed/reach | count / probability | deterministic or zero-income projection | crossed → T1b; reach → mechanics |
| funding gaps / retained tokens | token | observed/projected state | mechanics |

Tokens remain state only. They never receive a generic exchange rate into
stat-point utility. `generic-behavioral-projection` is deliberately distinct
from `zero-income-projection`: the former also assumes a generic future click
profile and therefore cannot outrank factual differences.

Unknown and interval-valued mechanical outputs cannot silently scalarize to
zero. A utility transform consumes only explicit numeric consequences.

## T1b utility model

The utility model identifier is:

```text
grand-live-stat-numeraire-v1
```

The projection policy remains:

```text
grand-live-zero-income-v1
```

Canonical T1b contains only deterministic consequences of the current action:

```text
immediateStatDelta
+ GREAT_SUCCESS_STAT_DELTA × greatSuccessSecured
+ GATE18_STAT_DELTA × gate18Crossed
+ immediate/lesson Skill Points × SKILL_POINT_UTILITY
+ named scenario residuals for gates actually crossed
```

Mechanical constants:

```text
STAT_POINT_UTILITY       = 1
GREAT_SUCCESS_STAT_DELTA = 35
GATE18_STAT_DELTA        = 50
```

Free policy parameters remain:

```text
SKILL_POINT_UTILITY    = 1.0 nominal seed
SCENARIO_SKILL_UTILITY = 0
SCENARIO_EVENT_UTILITY = 0
```

`FRIENDSHIP_EXPOSURE_STAT_RATE` is **not** part of canonical T1b anymore.
Friendship priority comes from its documented structural tier, not from a fake
conversion of generic exposure into stat points.

## T2 generic behavioural projection

T2 is not a second scalar utility. It is reached only after hard state, risk
admission, structural tier, deterministic T1b reward and visible purchase cost
are unable to separate two actions. Its operational tie-breaks are:

```text
expectedPracticeStatDelta
-> expectedSkillPoints
-> deterministic id fallback
```

This keeps the original use case: at equal structure and cost, a generic
`Speed training +1` can beat `Guts training +1`. Friendship exposure remains in
`HorizonOutcome` and logs for analysis but does not vote in the canonical song
comparison.

## Discrete gates

Great Success and the 16/18 gates are discrete rewards. Raw progress such as
`15 / 18` is never converted proportionally. Canonical T1b rewards a gate only
when the current action actually crosses it. A `zeroIncomeReach` probability is
still valuable mechanics/diagnostics, but it is not silently converted into a
fraction of the deterministic gate reward.

## HUNT

HUNT no longer owns a marginal pseudo-utility model and no raw miss counter is
an admission threshold. The persistent chase records missed physical pages,
committed technique spend and filler purchases as telemetry only.

The crucial distinction is:

```text
STOP current chain != ABANDON persistent HUNT
```

A song policy may therefore recommend `buy-stop` because the current wallet or
rollout does not justify another immediate technique while leaving the SP target
active for later trainings. `P(find & fund) = 0` under zero income is not proof
of impossibility because future training income is unknown and non-negative.

Persistent HUNT is abandoned automatically only when the target has no modeled
appearance probability left (or the state was already closed). `pagesSeenWithoutTarget`,
filler count, committed spend and cycle depth do not change that admission.

## Terminal layered boundary

The replay-gated terminal migration is complete. `terminal-compat-utility.ts`
has been removed and P5/P4 no longer owns a scalar conversion of Friendship
exposure or zero-income gate-18 reach. Terminal trials retain the same physical
`HorizonOutcome`/cross-section evidence but compare it in native layers:
Great Success, structural tiers, deterministic reward, then generic T2.

Zero-income checkpoint probabilities remain available as diagnostics/robustness
evidence only. They are not fractions of a deterministic gate reward.

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
