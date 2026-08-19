# HorizonOutcome v5 — P3a compatibility seam

P3a is an architecture migration only. It must not change solver decisions.
The blocking acceptance criterion is an empty P0 replay diff.

## Boundary introduced by P3a

```text
song-policy state / projections
          |
          v
    HorizonOutcome
   raw named components
   + legacyProjection
          |
          |  temporary compatibility only
          v
legacyDecisionVectorFromOutcome()
          |
          v
    DecisionVector
          |
          v
compareDecisionVectors()
```

`SongPolicyEvaluation.horizonOutcome` is required. Production song policies do
not construct a `DecisionVector` directly; every vector is derived from the
outcome through the single compatibility adapter.

The five physical song-policy actions use this path:

- `buy-stop`;
- `buy-continue`;
- `wait-reserve`;
- `carry-page`;
- `stop-and-carry-stock`.

## Why the representation is a superset

`HorizonOutcome` separates two structures:

1. `components`: raw values with metric identities;
2. `legacyProjection`: references from legacy lanes to those components plus
   the temporary transform needed to reconstruct the current `DecisionVector`.

This separation is intentional. P3a needs to expose the underlying value
without changing the old comparator. For example a BUY stores
`immediate-training-exposure = 41.8` **once**, while two projection references
interpret it differently:

```text
raw component      immediate-training-exposure = 41.8
certain lane       floor-div-20  -> 2
continuation lane  identity      -> 41.8
```

The asymmetry is preserved because removing it would be a semantic change, but
it no longer contaminates the raw consequence. P3b1 can delete
`legacyProjection` and the adapter while keeping consequence production intact.

Opaque legacy vector positions are represented as transitional
`legacy-<lane>:<index>` metric IDs. P3b1 is responsible for replacing these
with mechanical metric identities where appropriate; P3a must not invent new
semantics merely to improve names.

## P3a invariants

1. `HorizonOutcome` contains enough information to reconstruct every legacy
   song-policy `DecisionVector` exactly.
2. `song-policy.ts` contains no direct `decisionVector: { ... }` construction.
3. Legacy `floor(exposure / 20)` is implemented only by the compatibility
   transform, not by business code.
4. All action ranking still uses the existing `compareDecisionVectors()`.
5. Probability banding, lexicographic lane order, retained-token ordering and
   committed-cost ordering remain unchanged.
6. P1′ feasibility fields and all existing diagnostics remain unchanged.
7. P0 replay diff must be empty.

## Explicit non-goals

P3a does **not**:

- define the final mechanical `MetricId` catalogue;
- enforce one transform per metric;
- correct the `floor-div-20` asymmetry;
- change probability banding or utility calibration;
- remove retained tokens from the legacy comparator;
- remove the separate terminal C4 economy;
- change the terminal-technique ranking vector;
- change Monte-Carlo policy or uncertainty handling.

Those changes belong to later phases and are intentionally prevented from
leaking into this refactor.

## P3b1 deletion contract

`legacyDecisionVectorFromOutcome()`, `legacyProjection` and
`LegacyDecisionTransform` are temporary P3a artifacts. The commit implementing
P3b1 must remove them rather than leave a fallback compatibility path.

P3b1 must also add a source-level guard asserting that the adapter no longer
exists. Until that commit, the P3a source guard performs the inverse check: all
song-policy actions must go through the seam and legacy transforms must stay out
of `song-policy.ts`.
