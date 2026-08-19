# Release validation

This is the release gate for Live Route v1.0.0 and later. Historical validation
records are preserved under `docs/archive/` and are not a substitute for this
current checklist.

## Supported release surfaces

| Surface          | Required result                                                     |
| ---------------- | ------------------------------------------------------------------- |
| Web              | Production bundle works at `/` and a repository base path           |
| Desktop frontend | Production Vite bundle succeeds                                     |
| Desktop native   | Tauri application compiles on Windows                               |
| Installer        | Current-user NSIS installer is generated                            |
| OCR              | Snapshot review, learning, overlay, and local assets are functional |

## Clean-install validation

Run from a fresh source checkout or from the extracted source archive:

```bash
npm ci
npm run check:versions
npm run prepare:ocr
npm run format:check
npm run typecheck
npm test
npm run build:web
npm run build --workspace @glcp/desktop
npm run build:desktop
```

The current post-audit source baseline is:

| Suite           |   Tests |
| --------------- | ------: |
| Core and solver |     236 |
| Shared UI       |      19 |
| Desktop and OCR |      77 |
| **Total**       | **332** |

The historical v1.0.0 baseline was 268 tests (186/19/63), and v1.0.1 raised
desktop/OCR coverage to 66 for 271 total tests. Those historical counts remain
in the release notes and archive. Any intentional test-count change from the
current 332-test baseline must be explained in the release notes. A lower count
without an explicit removal is a release blocker.

## Browser deployment matrix

The upstream GitHub Pages site uses the verified custom domain
`liveroute.tmoperao.fr`, so `.github/workflows/deploy-pages.yml` deliberately
builds with `VITE_BASE_PATH=/`. Vite still supports a repository-site base for
forks and regression testing. The browser entry point contains no solver fork:
it mounts the shared `@glcp/ui` shell and `@glcp/core`, so a Web build of a
commit uses the same solver source as Desktop.

Validate both public-path modes:

```bash
npm run build:web
VITE_BASE_PATH=/live-route/ npm run build:web
```

Check that:

- `npm run check:versions` reports one SemVer across root/workspaces, Web and
  Desktop `APP_VERSION`, Tauri/Cargo metadata and the lockfile;
- the generated HTML references the selected base path;
- song, token, and favicon assets load;
- there are no root-absolute `/assets/...` paths in shared source;
- refreshing the deployed application does not lose the planner shell;
- the browser build contains no OCR model or Tesseract runtime.

For a GitHub Pages deployment, confirm repository **Settings → Pages** uses
**GitHub Actions**. `actions/configure-pages` cannot bootstrap an entirely
unconfigured Pages site with the current workflow: the historical first deploy
failed after a successful Web build for exactly that reason. The upstream site
is now configured as `build_type=workflow`, with a verified custom domain and
HTTPS enforced.

## i18n smoke test

1. Start either surface in French, then switch to English without resetting the
   run state. The recommendation and controls must translate without changing
   the selected action.
2. On Desktop, trigger or simulate an OCR diagnostic, an initialization timeout
   and a recognition timeout. Runtime messages must follow the active language.
3. Calibration region labels and numeric-learning errors must not leak French
   copy into the English cockpit.
4. Keep game vocabulary intentionally shared between languages where the client
   itself uses the same term (Songs, Techniques, Friendship, Skill Pt).

Automated catalogue parity/no-hardcoded-copy tests remain the primary guard;
this smoke test covers runtime OCR strings generated below React.

## Desktop smoke test

On the Windows release candidate:

1. Install with the generated NSIS installer as the current user.
2. Launch the planner and switch between French and English.
3. Open `Live OCR` without completing the manual planner workflow.
4. Capture a technique page and review the five token values and three offers.
5. Confirm one deliberately corrected OCR value and apply the snapshot.
6. In calibration learning, enter a token value above 250 (for example 283)
   and verify it is accepted.
7. Verify that analysis enters a loading state and then shows the same decision
   in the main window and passive overlay.
8. Confirm a purchase and verify the page transition, scroll target, and
   overlay refresh.
9. Carry an exposed song page across a concert and verify the next pattern
   point.
10. Carry a technique page across a concert, buy one inherited-price technique,
    and verify that the refreshed page uses the current period.
11. Export the OCR profile and the NDJSON decision log.

## OCR acceptance checks

- Every token readout is visible below the corresponding in-game counter.
- A failed read displays `?`, never a stale previous number.
- Confidence warnings remain visible while the solver is loading.
- Manual correction affects the pending snapshot immediately.
- Learned numeric templates do not replace a higher-confidence exact reading
  without satisfying the similarity and margin gates.
- `0`, `6`, and `9` disagreements require consensus or manual review.
- Strong single-colour stock discontinuities block snapshot application until
  corrected or explicitly confirmed; broad multi-colour drift remains reviewable.
- A wrong concert-period price page is detected without changing the run's
  actual concert index.
- The overlay remains passive and does not intercept game input.

## Solver regression checks

The automated suite must keep the following behaviours:

- C1 can fund an early acquisition chain from cumulative value even when Great
  Success value is neutralised; a chain with no affordable future song remains
  rejected.
- C2 and C3 stay in HOLD after their SP target during `section-open`, then close
  an incomplete Great Success gauge at `deadline-now` and return to HOLD after
  the third manual song.
- C4 does not turn 16 or 18 into a hard song quota. It evaluates current value,
  protected targets, carryover, and the exact Grand Live continuation.
- A visible target has zero reach cost and cannot remain excluded by an older
  hidden-page feasibility result.
- Purchased songs leave both the pool and future reserve calculations.
- A carried technique page keeps its prior period only until the first
  technique purchase.
- Grand Live assigns no future training value and converts affordable lessons
  into immediate SP.
- A `buy-stop` recommendation re-evaluates to STOP or invalid after purchase;
  a `buy-continue` recommendation re-evaluates to a genuine continuation.
- Candidate order is stable for an identical state and seed.
- Technique ranking is invariant to candidate permutation, including Pareto
  same-support cases; probability micro-deltas inside the same 5-point band do
  not outrank later deterministic structural/economic criteria.

## Release artifact checks

The source archive must not contain:

```text
node_modules/
dist/
apps/desktop/public/ocr/
apps/desktop/src-tauri/target/
```

It must contain the lockfile, workflows, Tauri icons, attribution files, active
English documentation, and historical documents under `docs/archive/`.

For a tagged release, verify that GitHub contains:

- the generated release notes;
- the NSIS `.exe` attached by the Tauri action;
- the separate `desktop-windows` workflow artifact;
- a successful Pages deployment for the same commit.

## Historical V1 result

v1.0.0 passed all 268 automated tests, strict TypeScript, Prettier, the browser
build at both base paths, the desktop frontend build, native Tauri compilation,
and Windows NSIS packaging. v1.0.1 subsequently raised the automated baseline
to 271 tests (186 core, 19 shared UI, 66 desktop/OCR).

## Current post-audit release gate

The PR-0 through PR-7 correction series is considered solver-closed when:

- all 236 core tests pass, including PR-1 through PR-7 regression/property tests;
- all 19 shared UI tests and 77 desktop/OCR tests pass after `npm ci`;
- `policyVersion` is `grand-live-v7` and NDJSON schema is v5;
- no exact historical audit fixture is claimed as replayed unless its full raw
  solver state is present under `packages/core/fixtures/`;
- source documentation distinguishes missing historical evidence from a failed
  current invariant;
- the source archive contains no generated dependencies or build outputs.

The remaining external-evidence gaps and their synthetic/property coverage are
listed in `docs/AUDIT_CLOSURE_2026-08-13.md`. They are not grounds to reconstruct
missing NDJSON states from token vectors alone.
