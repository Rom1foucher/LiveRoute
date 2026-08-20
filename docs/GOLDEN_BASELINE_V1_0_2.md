# v1.0.2 behavioural golden baseline

## Purpose

`v1.0.2` (`69cb994ad8ba5a5415bc9ef188ad0f9e6104023e`) is the empirical behavioural baseline for the P3b2 refactor.
The objective is not to reproduce every internal v6 score. It is to prevent a cleaner utility model from degrading decisions that were already strong in real runs.

The tag commit is only the SemVer bump. The relevant historical decision logs therefore still identify themselves as:

```text
appVersion    1.0.1
policyVersion grand-live-v6
```

Those records are valid v1.0.2 solver evidence.

## What is golden

A checkpoint is admitted only when all of the following hold:

1. it belongs to a run reviewed as globally strong;
2. it is selected explicitly by `sessionId + event + sequence + stateHash`;
3. a `choice` checkpoint used as accepted evidence has `matchedRecommendation = true`;
4. it exercises a behaviour worth preserving: normal technique ranking, structural song choice, a successful HUNT path, real carryover, bounded C4 aggression, or Grand Live conversion;
5. its reason can be stated without depending on a legacy scalar such as friendship stat-equivalent exposure.

The classified selector manifest is:

```text
packages/core/fixtures/golden-v1.0.2-checkpoints.json
```

It currently covers three logical runs:

- `e75f054d-ff78-4f9c-b4ae-f2f85f4babd6`;
- the first logical run inside `ec223cf4-286d-4ea7-8df9-2c2115e1cc7a`;
- the second logical run inside that same long-lived session after its C1 reset.

The long `ec223...` session is deliberately split by sequence range. A logging session is not assumed to be one game run.

## What is explicitly not golden

The following must not become behavioural oracles:

- the older `70b985fd-ebe5-4714-b590-8ae88f1ac905` session (`grand-live-v5`);
- any user action with `matchedRecommendation = false` merely because it happened during a good run;
- the raw `pagesSeenWithoutTarget >= 3` HUNT threshold;
- `friendshipExposure`, training-exposure or legacy C4 `netValue` numbers;
- later C4 opportunity-cost edge cases already classified as suspicious, including the `41 / 51 / 51 / 45 / 72` state;
- an old recommendation solely because it is historical.

This distinction is essential: v1.0.2 is a behavioural safety net, not a requirement to preserve known bugs or obsolete explanations.

## Extract the evidence from the raw NDJSON

Put these two original exported logs in one directory, with their original names:

```text
decision(20260815-113855)(1).ndjson
decision(20260815-160333)(1).ndjson
```

Then run from the repository root:

```bash
npm run golden:v102 -- ./path/to/raw-logs ./golden-v102-evidence.json
```

The extractor:

- parses every NDJSON record strictly;
- finds exactly one record for each selector;
- rejects wrong session, sequence, state hash, policy or ruleset;
- validates classified historical choices such as `choice.id` and `matchedRecommendation`;
- emits the complete selected state/recommendation/choice evidence without pretending it is a current solver oracle.

If a selector is missing or duplicated, extraction fails. Nothing is reconstructed from token vectors alone.

## Promotion into the executable replay corpus

This manifest is intentionally one step before `replay-corpus-v5.json`.

A checkpoint is promoted to an executable replay fixture only when the raw record provides enough state to reconstruct the corresponding public solver input without invention. Promotion must preserve the P0 rule:

```text
historical recommendation / user action = evidence
current replay result                  = measured behaviour
```

Do not add `expected` to a classified P0 corpus fixture.

For P3b2 the validation sequence is:

```text
1. property tests for the new T0/T1/T2 contract
2. targeted bug/edge-case regressions that are expected to change
3. v1.0.2 accepted golden checkpoints
4. replay diff review for every changed accepted case
```

A changed accepted checkpoint is not automatically forbidden, but it is blocking until the behavioural reason is understood and the classification is deliberately updated.

## P3b2 interpretation

The golden baseline protects outcomes, not obsolete arithmetic.

Examples:

- `Grow Up and Shine` being acquired during a successful SP3 HUNT is valuable baseline behaviour.
- The exact legacy `expectedSpTrainingExposure` used to justify it is not golden.
- A real C1 carry into C2 is valuable baseline behaviour.
- Any legacy zero-income Friendship stat-equivalent used inside that decision is not golden.
- Deep C4 continuation that produced strong runs is valuable baseline behaviour.
- The old standalone C4 opportunity-cost scalar is not golden.

This is the intended guardrail for the P3b2 cleanup: remove bad reasons without casually losing good decisions.
