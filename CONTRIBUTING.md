# Contributing

Live Route is a monorepo because the browser and OCR editions previously
diverged enough that fixes made to one no longer reached the other. The rules
below preserve one decision engine and one shared interface.

## Choose the correct package

Ask what the code needs at runtime:

| Runtime dependency                               | Location        |
| ------------------------------------------------ | --------------- |
| Data and pure computation only                   | `packages/core` |
| React and the DOM                                | `packages/ui`   |
| Browser-only APIs                                | `apps/web`      |
| Tauri, screen capture, Tesseract, or the overlay | `apps/desktop`  |

If core logic appears to require a platform API, split the platform operation
behind a port instead. `packages/core/src/ports/decision-sink.ts` is the
reference pattern.

## Common workflows

### Solver-only work

```bash
npm run test:core
```

The core tests use only Node's test runner, assertions, and relative source
imports. They can run without installing the frontend dependencies.

### Browser or desktop work

```bash
npm run dev:web

# or (OCR assets are prepared automatically)
npm run dev:desktop
```

Do not duplicate a shared screen for one platform. Platform-specific content
must be injected through `UiSlots` in `packages/ui/src/slots.tsx`. If both
editions need the feature, it belongs in `packages/ui`.

### Repository-wide work

```bash
npm ci
npm run check:versions
npm run typecheck
npm test
```

These commands cover all four workspaces.

## Automated boundaries

The following tests intentionally fail when an architectural regression is
introduced:

| Guard                                | Prevents                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| `core/tests/core-purity`             | DOM, React, Tauri, Tesseract, or adapter dependencies in the solver |
| `core/tests/engine-has-no-prose`     | User-facing prose emitted directly by core logic                    |
| `core/tests/i18n-catalogue`          | Message codes without samples or complete FR/EN rendering           |
| `ui/tests/no-hardcoded-copy`         | User-facing sentences embedded in shared JSX                        |
| `ui/tests/i18n-catalogue-parity`     | Missing, empty, unused, or one-language-only UI keys                |
| `ui/tests/pages-assets`              | Root-absolute public paths that fail on project GitHub Pages        |
| `ui/tests/workflow-scroll`           | Incorrect automatic scroll targets between lesson steps             |
| `desktop/tests/vision-overlay-state` | Stale overlays or missing token-readout state                       |

## Adding user-facing messages

Solver messages never contain rendered prose.

1. Add the variant to `Message` in
   `packages/core/src/i18n/messages.ts`.
2. Add its rendering to both `packages/core/src/i18n/fr.ts` and `en.ts`.
3. Add a sample to `SAMPLES` in
   `packages/core/tests/i18n-catalogue.test.ts`.
4. Emit the structured `{ code: "...", ... }` value from the solver.

Pure interface labels belong in `packages/ui/src/i18n/ui-fr.ts` and
`ui-en.ts`. Do not route presentation-only text through the decision engine.

## Code conventions

- Use English for identifiers, code comments, and documentation.
- Include explicit extensions on relative imports, for example
  `./live-model.ts` and `./components/TopBar.tsx`.
- Import packages by their public name. Do not use relative paths between
  packages or deep imports into another package's `src/` directory.
- Keep solver results deterministic for a stable state and seed.
- Preserve the post-purchase invariant: a recommended action must remain
  coherent when the resulting state is evaluated immediately after purchase.
- Prettier is authoritative for formatting.

## Before pushing

```bash
npm run check:versions
npm run format:check
npm run typecheck
npm test
npm run build:web
```

Run `npm run build:desktop` when changing Tauri configuration, native commands,
OCR asset preparation, or Windows packaging. CI keeps the native build outside
the critical path for solver-only contributions, while tagged releases always
run it on Windows.

## Versions and durable logs

The root version is shared by all workspace `package.json` files, the Web/Desktop
`APP_VERSION` constants, Tauri/Cargo metadata and the lockfile.
`npm run check:versions` is the authoritative drift guard. Add the new entry at
the top of `RELEASE_NOTES.md`. Solver `policyVersion` is intentionally separate
from application SemVer.

The decision log has an independent `schemaVersion` (currently 4). Increment it
whenever a field changes type or meaning. NDJSON logs are durable diagnostic
artifacts and must remain distinguishable across application versions. Schema
v4 also records `policyVersion`, Monte-Carlo seed/sample/stop metadata, Wilson
confidence intervals and decomposed page/target probabilities. The historical
`reachProbability`/`goalProbability` candidate fields are retained as deprecated
aliases for one compatibility cycle; new diagnostics should consume the v4
`probabilities` object.

Standalone solver regressions belong in `packages/core/fixtures/` and can be
replayed outside the UI with:

```bash
npm run replay:fixture --workspace @glcp/core -- fixtures/<fixture>.json
```

### PR-3 Monte-Carlo diagnostics

When changing stochastic evaluators, preserve common-random-number symmetry: UI candidate IDs must not alter future draws. Any evaluator that exhausts its adaptive budget while a decision boundary remains unresolved must surface `uncertainAtBudgetLimit` rather than presenting the estimate as converged. See `docs/PR3_MONTE_CARLO.md`.

### PR-4 terminal C4 value policy

C4 terminal decisions must not reapply the generic risk-threshold gate after
`evaluateTerminalTechniqueOptions()`. Preserve the Wilson catastrophe floor.
Current `grand-live-v6` policy prices C4 branches with marginal opportunity
cost while Friendship remains in the pool; raw weighted spend remains
diagnostic and must not silently become the decision cost again. Calibration
changes require a regression demonstrating both value and destroyed future
options. See `docs/PR4_TERMINAL_C4_VALUE.md` for the original PR and
`docs/HOTFIX_V6_2026-08-14.md` for the current economy.

### PR-5 shared resource economy

Do not introduce a second reserve model in song or technique policy. Downstream
vectors must be expressed as `ResourceDemand` and consumed through
`buildSharedResourceEconomy()` / `calculateTokenPressure()`. Required fillers
are OR-alternatives: their aggregate probability mass is bounded by the number
of purchases still required and they must not become simultaneous hard
reserves. Any `BUY_CONTINUE` with a positive technique depth must include at
least the expected next-cycle technique cost. See
`docs/PR5_RESOURCE_ECONOMY.md`.
