# V1 architecture

This document is normative. A code change that violates these boundaries is an
architecture regression even when the application still builds.

## Repository

- npm workspaces with `main` as the default branch;
- one application version shared by every workspace and Tauri;
- strict TypeScript and repository-wide Prettier formatting;
- private local packages under the unpublished `@glcp/*` scope.

| Path            | Package         | Responsibility                                              |
| --------------- | --------------- | ----------------------------------------------------------- |
| `packages/core` | `@glcp/core`    | Domain state, rules, solver, structured messages, ports     |
| `packages/ui`   | `@glcp/ui`      | Shared React application, components, themes, FR/EN UI copy |
| `apps/web`      | `@glcp/web`     | Browser entry point and browser adapters                    |
| `apps/desktop`  | `@glcp/desktop` | Tauri entry point, local capture, OCR, and overlay          |

## Dependency direction

```text
apps/web -------+
                 +--> packages/ui --> packages/core
apps/desktop ---+          +--------> packages/core
```

Dependencies never point upward. `packages/core` has no knowledge of React,
the DOM, Tauri, Tesseract, or platform persistence. Only `apps/desktop` may
import Tauri APIs and the OCR pipeline.

The public core entry points are:

```text
@glcp/core
@glcp/core/i18n
@glcp/core/ports
@glcp/core/adapters/browser
```

No package may import another package's `src/` path.

## Engine and presentation boundary

The solver returns data and discriminated `Message` unions. It does not build
sentences. Domain messages are rendered by
`packages/core/src/i18n/{fr,en}.ts`; presentation-only labels live in
`packages/ui/src/i18n/ui-{fr,en}.ts`.

This boundary guarantees that:

- core tests compare stable codes instead of language-specific sentences;
- web and desktop render the same recommendation;
- changing language cannot change a decision;
- missing, empty, orphaned, or unused catalogue entries fail automated tests.

## Shared application shell

`packages/ui/src/App.tsx` is the only application shell. Web and desktop inject
their version, diagnostic sink, and platform extensions through `UiSlots`.

| Slot              | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `topBarActions`   | Platform actions such as opening Live OCR   |
| `workflowActions` | Platform-specific concert transition action |
| `decisionAside`   | OCR cockpit mounting point                  |
| `overlay`         | Platform-owned modal or global surface      |

A slot reads `SlotContext`. Any run mutation must go through
`context.actions`; a slot must never reach into internal React state.

The shared workflow owns two scroll anchors. Entering song selection scrolls to
the song block, and confirming a song returns to the technique block. Scroll is
suppressed during state hydration, manual editing, and unchanged transitions.

## Browser edition

`apps/web` contains only the Vite entry point, public assets, and browser
decision-log adapter. Asset URLs are resolved against Vite's `base`, allowing
both root deployments and project sites such as
`owner.github.io/repository/`.

The web dependency graph contains no OCR package and downloads no recognition
model.

## Desktop and OCR

`SnapshotCompanionPanel.tsx` is a standalone cockpit. It captures on demand,
presents a manual review, and applies a typed snapshot to the shared shell.

```text
local capture -> region profile -> OCR candidates -> plausibility checks
              -> optional correction -> apply snapshot -> shared decision
```

The overlay is a separate transparent, always-on-top Tauri window. It is
passive and mouse-click-through. It receives an `OverlayPayload` and never runs
the solver itself. All five detected token values are positioned below their
in-game counters; failed reads are rendered as `?` and confidence controls the
visual warning state.

`npm run prepare:ocr` generates the Tesseract language resources in an ignored
directory. Desktop `dev` and `build` invoke it automatically, so a Tauri build
cannot silently omit the local worker/WASM/language payload. Tesseract's
JavaScript runtime is dynamically imported at the first OCR warm-up instead of
joining the initial desktop bundle.

## Solver mechanical outcome boundary

P3b1 makes `HorizonOutcome` the typed mechanical representation between
song-policy consequence construction and decision ranking. Each semantic
metric owns one global unit and transform; provenance and uncertainty travel
with the value. Practice stat points, Skill Points, Friendship exposure and
tokens therefore remain dimensionally distinct. See
`docs/HORIZON_OUTCOME_V5.md`.

The P3a compatibility projection is gone. A deliberately separate, temporary
P3b1 decision bridge maps canonical metrics into the existing lexicographic
`DecisionVector` ordering while P3b2 is still pending. Raw token balance and
cost are telemetry/feasibility state and do not receive generic utility. P3b2
must remove that ordering bridge without changing the mechanical metric
contracts.

## Persistence and diagnostics

The `DecisionSink` port isolates platform persistence:

| Edition | Implementation                                         |
| ------- | ------------------------------------------------------ |
| Web     | Bounded `localStorage` history, exportable as NDJSON   |
| Desktop | Durable application file with browser-storage fallback |

The application version is injected at startup. `npm run check:versions` keeps
root/workspace package metadata, Web/Desktop `APP_VERSION`, Tauri metadata,
Cargo metadata and the lockfile on one SemVer. The decision log has its own
schema and policy versions because solver/log compatibility does not necessarily
follow application SemVer. Each recommendation records the input state,
candidates, decision vector, selected action, override state, timings, and
later user choice.

## Automated guards

| Guard                          | Rejected regression                                      |
| ------------------------------ | -------------------------------------------------------- |
| `core-purity`                  | Platform or UI dependencies in core                      |
| `engine-has-no-prose`          | User-facing prose emitted by the engine                  |
| `i18n-catalogue`               | Domain message without a sample and both translations    |
| `ui/no-hardcoded-copy`         | User-facing sentence embedded in shared JSX              |
| `ui/i18n-catalogue-parity`     | Missing, empty, dead, or single-language UI key          |
| `ui/pages-assets`              | Root-absolute asset path incompatible with project Pages |
| `ui/workflow-scroll`           | Incorrect live-workflow scroll transition                |
| `desktop/vision-overlay-state` | Missing token readout or stale overlay state             |

## Build and delivery

| Command                                   | Scope                                       |
| ----------------------------------------- | ------------------------------------------- |
| `npm run format:check`                    | Repository formatting                       |
| `npm run typecheck`                       | Strict TypeScript across four workspaces    |
| `npm test`                                | Core, shared UI, and desktop/OCR tests      |
| `npm run build:web`                       | Browser bundle                              |
| `npm run build --workspace @glcp/desktop` | Desktop frontend bundle                     |
| `npm run build:desktop`                   | Native Tauri application and NSIS installer |

`ci.yml` validates quality, release-metadata parity and the browser build.
`deploy-pages.yml` publishes `main` at base `/` because the upstream Pages site
is served through the custom domain `liveroute.tmoperao.fr`; Vite remains
configurable through `VITE_BASE_PATH` for project-site builds.
`build-windows.yml` performs on-demand native builds and publishes the installer
for `v*` tags.
