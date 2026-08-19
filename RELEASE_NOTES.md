# Release notes

## v1.0.3 — Grand Live v8 robust decision model — 2026-08-19

- Completed the frozen v5 solver roadmap: classified replay corpus (P0), carried-song
  resource ranking (P2), explicit funding feasibility (P1′), typed mechanical
  outcomes (P3a/P3b1), stat-point utility (P3b2), unified terminal actions (P5),
  robust co-recommendation (P4), and canonical decision diagnostics (P6).
- Solver telemetry is now `grand-live-v8`. Terminal STOP/PUSH and song actions use
  the shared T1a/T1b value seam; retained tokens have no intrinsic utility and
  `buy-continue` is part of the real terminal action space.
- Decision-log schema v5 is finalized around
  `grand-live-decision-diagnostic-v1`, including physical feasibility, funding-gap
  distributions, T1a/T1b versions, discrete gates, paired Monte-Carlo intervals,
  convergence, calibration breakpoints, and co-recommendation causes.
- Added `npm run replay:corpus`, `npm run replay:diff`, and the classified v5 seed
  corpus so semantic changes can be compared independently from historical user
  choices or recommendations.
- Raised the application SemVer from 1.0.2 to 1.0.3 across Web, Desktop, Tauri,
  Cargo, workspaces, and lockfiles. `check:versions` now also verifies the
  application crate entry in `Cargo.lock` and requires a current release-notes
  section.
- Added `npm run check:docs` to CI. It checks current policy/schema identities and
  rejects broken local Markdown links in active documentation.
- Current suite inventory is 283 core + 19 shared UI + 77 desktop/OCR = 379 tests.
  The core 283/283 suite is source-archive runnable; a release tag still requires
  the clean-install TypeScript/Prettier/UI/Desktop/build/Windows gates in
  `docs/VALIDATION.md`.

## v1.0.2 — Source metadata baseline — 2026-08-16

- Aligned application/package metadata to 1.0.2 after the post-hotfix stabilization
  work below. No additional solver-policy change was introduced by the version
  bump itself.

## Post-hotfix build, Web and i18n stabilization — 2026-08-15

- Fixed the OCR profile TypeScript contract so schema v6 builds cleanly: the
  persisted/default profile and `VisionProfile.schemaVersion` now agree. This is
  a build/schema fix only; solver telemetry remains `grand-live-v6`.
- Completed the OCR-runtime i18n pass for the capture hotfix. Tesseract
  initialization/recognition timeouts, worker errors and canvas failures now
  localize through the same Desktop UI boundary as the older OCR diagnostics.
- Added `npm run check:versions`, which rejects drift between root/workspace
  package versions, Web/Desktop `APP_VERSION`, Tauri/Cargo metadata and the
  lockfile. Application SemVer remains `1.0.1` until a release version is
  deliberately chosen.
- Re-audited the browser surface: `apps/web` still mounts the shared `@glcp/ui`
  application and `@glcp/core`, so there is no stale Web-only solver copy. The
  upstream Pages workflow builds the verified custom domain at base `/`; Vite
  keeps `VITE_BASE_PATH` support for repository-site/fork validation.
- Updated CI/Windows workflow checkout/setup-node actions to v6 and removed the
  redundant standalone OCR-preparation step from the Windows workflow; Desktop
  build/dev already prepare the eight offline OCR assets themselves.
- Normalised the nullable Desktop recommendation ternary that made the latest
  remote CI fail at `prettier --check` even though its Web build had succeeded.
- Reconciled README, architecture and validation docs with the current Pages,
  OCR and versioning contracts. No decision-policy coefficient or ranking rule
  changed in this stabilization pass.
- Current source baseline: 236 core + 19 shared UI + 77 desktop/OCR tests =
  332 after a clean dependency install.

## Grand Live v6 reliability hotfix — 2026-08-14

- Repriced **all** C4 terminal outcomes with marginal opportunity cost while
  Friendship remains in the pool. Miss/carry branches no longer fall back to
  full raw token spend; a small fixed failed-search penalty keeps misses non-free.
- Added a terminal wall-clock guard (about 0.9 s Express / 1.8 s Expert in the
  desktop UI). Unresolved comparisons return `uncertain-at-budget-limit` instead
  of blocking the renderer for 9-23 seconds.
- Moved guaranteed visible-song structure and material current-page value ahead
  of future Monte-Carlo projections. Regressions cover Tachiichi vs Nigekiri,
  Zensoku vs Go This Way, and Grow Up and Shine vs Nigekiri from the 2026-08-14 run.
- Reworked observed technique tie-breaking so materially equivalent raw costs
  consume a genuinely overflowing colour before small shadow-price differences.
  The `288 Dance / 104 Passion` replay now selects the 25-Dance offer.
- Migrated OCR profile schema to v6 and enforce `maxTokenValue >= 400`, including
  persisted profiles created with the obsolete 250 ceiling. Calibration values
  such as 283 are valid again.
- Strong single-colour stock discontinuities such as `263 -> 6` now block
  automatic/manual snapshot application until corrected or explicitly confirmed.
- Bumped policy telemetry to `grand-live-v6`; NDJSON schema remains v4.
- Current source baseline: 236 core + 19 shared UI + 76 desktop/OCR tests = 331
  after a clean dependency install.

## C4 opportunity-cost hotfix — 2026-08-13

- Replaced the C4 terminal policy's direct subtraction of raw/shadow-weighted
  token spend with marginal opportunity cost while Friendship targets remain.
- A successful pre-C4 Friendship purchase is charged only for future Friendship
  combinations it makes jointly unfundable and for currently fundable purchase
  capacity lost on the path to 18 songs.
- Failed Friendship searches, fillers and carry-to-Grand-Live branches still pay
  ordinary weighted spend, so exposing a page and missing is never treated as
  free.
- Risk remains continuous above the catastrophe floor and now scales against
  value-at-risk when opportunity cost is zero.
- Added regressions from state `C4-89AB27AB`: the observed first C4 cycle keeps
  every remaining Friendship option fundable, so its opportunity cost is zero
  and the terminal recommendation is PUSH rather than the former false STOP.
- Bumped decision policy telemetry to `grand-live-v5`; NDJSON schema stays v4.
- Current clean-install baseline: 230 core + 19 shared UI + 72 desktop/OCR
  tests = 321 total.

## Desktop capture hotfix — 2026-08-13

- Hide and invalidate the previous always-on-top OCR overlay before invoking
  native Windows capture, so our own overlay cannot contaminate the frame.
- Publish the captured frame to the Live preview immediately after
  `capture_window` succeeds, before Tesseract starts. Capture success is now
  visibly distinct from an OCR failure or stall.
- Preserve string errors returned by the Tauri command instead of replacing
  them with a generic "Windows capture failed" message.
- Report capture-only pipeline timing and captured pixel dimensions before OCR,
  then replace it with the full pipeline timing once recognition completes.
- Added three desktop capture-pipeline regressions; the current baseline is 227
  core, 19 shared UI and 69 desktop/OCR tests (315 total after a clean install).

## Audit closure — PR-0 through PR-7 — 2026-08-13

- Closed the 2026-08-13 solver-audit implementation series without adding a new
  policy or retuning coefficients. Decision telemetry remains `grand-live-v4`
  with NDJSON schema v4.
- Reconciled normative documentation with the post-PR-7 source baseline: 227
  core, 19 shared UI and 66 desktop/OCR tests (312 total after a clean install).
- Added `docs/AUDIT_CLOSURE_2026-08-13.md`, mapping every PR and original audit
  defect to current executable evidence and separating missing historical raw
  fixtures from current implementation failures.
- Reworked `packages/core/fixtures/AUDIT_FIXTURES.md` to record both exact-import
  gaps and the synthetic/property/autonomous tests that cover each repaired
  mechanism. Missing NDJSON states are explicitly not reconstructed from token
  vectors alone.
- No application semver tag is assigned by this documentation-only closure; a
  release tag still requires the clean-install and Windows gates in
  `docs/VALIDATION.md`.

## PR-7 — Total ranking and uncertainty bands — 2026-08-13

- Replaced pairwise same-colour dominance with a Pareto prefilter, eliminating
  non-transitive technique cycles while keeping dominated offers visible for
  manual override.
- Ranked Pareto survivors through one immutable total lexicographic key;
  `rankReason` now reflects the first material tuple criterion.
- Quantised probability-like song/cross-section decision-vector entries into
  anchored 5-point bands so sampling-scale decimals cannot outrank later
  deterministic structural or economic criteria.
- Added permutation/property regressions for the historical cyclic triplet and
  64 pseudo-random triplets across all six input permutations.
- Documented the exact adaptive Monte-Carlo stopping contracts used by
  `runAnalysis`, transition-aware song pages, and terminal technique CRN/paired
  comparisons.
- Bumped policy telemetry to `grand-live-v4`; NDJSON remains schema v4 because
  no log-shape migration is required.

## PR-6 — Persistent HUNT and marginal abandonment — 2026-08-13

- Added section-local `HuntState` for C2/C3 SP chases: physical page misses,
  committed technique cost, filler drift and explicit active/abandoned/found
  status.
- Re-analysis of the same song page is idempotent; only a genuinely new page
  without the active target increments the miss counter.
- Replaced the former fixed depth/probability HUNT shortcut with a marginal
  `CONTINUE_HUNT` versus `ABANDON_TO_HOLD` comparison using P(find & fund),
  remaining SP-training exposure, future committed cost and PR-5 shadow-price
  reserve pressure.
- The first two misses remain normal variance. From the third miss onward, a
  profitable short chase can continue while a deep/low-value chase falls back
  to HOLD. Past technique spend is diagnostic only and is never rewarded as a
  sunk-cost reason to continue.
- Persisted HUNT state through session/history/decision logging and reset it on
  section changes and target acquisition. Decision hashes include the HUNT
  state.
- Bumped policy telemetry to `grand-live-v3`; NDJSON remains schema v4 because
  the HUNT fields are optional and backward-compatible.

## v1.0.1 — OCR English and Tauri refresh — 2026-08-10

- Fixed the desktop OCR cockpit so Live, Decision, Calibration, Settings,
  progress messages, validation warnings, and OCR diagnostics follow the
  application language.
- Added desktop i18n regression coverage for runtime diagnostics and calibration
  region labels.
- Raised the Tauri JavaScript dependency floors to the versions already resolved
  by the lockfile: CLI 2.11.4, API 2.11.1, and global-shortcut 2.3.2.

## v1.0.0 — Web and OCR desktop V1 — 2026-08-10

- **One solver, two editions.** The browser and Tauri applications now share
  the same pure decision engine, React workflow, themes, and French/English
  catalogues.
- **Validated decision policy.** C1 uses cumulative cross-section value rather
  than overvaluing saved stock. C2 and C3 hunt their SP targets, close Great
  Success at the deadline, and then return to strict HOLD. C4 protects valuable
  Friendship targets without treating 16 songs as a hard gate. Grand Live
  converts terminal stock into immediate `+5 SP` techniques and `+25 SP` songs.
- **Cleaner product copy.** Prototype notes, beta labels, obsolete corrections,
  hard-coded fragments, literal HTML entities, and inconsistent “Grand
  Concert” naming were removed. Active project documentation is now in English;
  historical French specifications remain under `docs/archive/`.
- **Smoother live workflow.** Opening a song selection scrolls to the song
  choices. Confirming a song purchase returns to the technique inputs. The
  behaviour is disabled during hydration, manual editing, and reduced-motion
  operation where appropriate.
- **Standalone OCR cockpit.** Desktop capture, review, correction, calibration,
  and application remain usable without navigating through the web workflow.
  The passive overlay shows all five detected token values below the in-game
  counters, including confidence state and an explicit `?` for failed reads.
- **Deployment-ready distribution.** The browser build supports root and
  repository GitHub Pages paths. Version tags create GitHub Releases containing
  the current-user NSIS installer.
- **Performance and loading.** React is isolated in a stable vendor chunk and
  Tesseract is loaded only at the first OCR warm-up. Solver loading states never
  display a stale recommendation.
- **Validation.** 268/268 tests pass: 186 core, 19 shared UI, and 63 desktop/OCR.
  Strict TypeScript, Prettier, the browser bundle, desktop frontend, native
  Tauri compilation, and Windows NSIS packaging are validated.

## Pre-V1 history

The complete development history from v0.10.0 through v0.25.3 is preserved in
[`docs/archive/RELEASE_NOTES_PRE_V1_FR.md`](docs/archive/RELEASE_NOTES_PRE_V1_FR.md).
The current algorithm is documented directly in
[`docs/ALGORITHMIC_MODEL.md`](docs/ALGORITHMIC_MODEL.md); historical audits are
kept for traceability and are not normative.
