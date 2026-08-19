# V5 classified replay corpus

P0 adds a policy-comparison harness without changing solver behaviour.

## Contract

A corpus case contains a normal deterministic replay fixture plus two review
fields:

- `reviewStatus`: `accepted`, `suspected-bug`, `confirmed-bug`, or `unknown`;
- one or more evidence records classified as `historical-recommendation`,
  `user-action`, `user-override`, or `observed-next-state`.

Evidence is deliberately opaque diagnostic data. It can explain why a case was
captured, but it never becomes the expected solver answer. The corpus validator
rejects an `expected` field inside a corpus fixture. Standalone legacy fixtures
may still use `expected` for narrow unit-regression checks.

The seed corpus lives at:

```text
packages/core/fixtures/replay-corpus-v5.json
```

Its initial cases are promoted from existing deterministic regression tests and
cover the analysis, song-policy, and terminal-technique replay paths.

## Produce a snapshot

From the repository root:

```bash
npm run replay:corpus -- \
  packages/core/fixtures/replay-corpus-v5.json \
  replay-before.json
```

The snapshot records the current `GRAND_LIVE_POLICY_VERSION` for traceability,
but that label is not itself considered a behavioural difference.
Wall-clock diagnostics are excluded. Candidate collections are sorted by stable
physical identifiers before serialization.

## Compare two implementations

Run the same corpus on each implementation, then:

```bash
npm run replay:diff -- replay-before.json replay-after.json
```

The command prints a machine-readable JSON diff and exits:

- `0` when the behavioural diff is empty;
- `1` when cases were added/removed or a canonical decision field changed;
- `2` for invalid CLI usage.

For P3a the required acceptance gate is an exit code `0`: introducing
`HorizonOutcome` must be representational only and reproduce the legacy policy
exactly. Later semantic phases may intentionally produce diffs, but each changed
case can then be reviewed against its evidence and `reviewStatus` instead of
assuming that the historical recommendation was correct.

## Adding cases from decision logs

Capture the smallest replayable physical state and preserve external facts as
evidence. A single case may contain multiple evidence records, for example the
historical recommendation, the user's actual click, and the observed next
state. Do not convert any of those fields into `expected`.

When the record is ambiguous, use `reviewStatus: "unknown"`. Classification is
allowed to improve later without changing the replay decision snapshot or
creating a behavioural diff.
