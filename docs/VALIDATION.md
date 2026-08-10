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
npm run prepare:ocr
npm run format:check
npm run typecheck
npm test
npm run build:web
npm run build --workspace @glcp/desktop
npm run build:desktop
```

The V1 test baseline is:

| Suite           |   Tests |
| --------------- | ------: |
| Core and solver |     186 |
| Shared UI       |      19 |
| Desktop and OCR |      63 |
| **Total**       | **268** |

Any intentional test-count change must be explained in the release notes. A
lower count without an explicit removal is a release blocker.

## Browser deployment matrix

Validate both public-path modes:

```bash
npm run build:web
VITE_BASE_PATH=/live-route/ npm run build:web
```

Check that:

- the generated HTML references the selected base path;
- song, token, and favicon assets load;
- there are no root-absolute `/assets/...` paths in shared source;
- refreshing the deployed application does not lose the planner shell;
- the browser build contains no OCR model or Tesseract runtime.

## Desktop smoke test

On the Windows release candidate:

1. Install with the generated NSIS installer as the current user.
2. Launch the planner and switch between French and English.
3. Open `Live OCR` without completing the manual planner workflow.
4. Capture a technique page and review the five token values and three offers.
5. Confirm one deliberately corrected OCR value and apply the snapshot.
6. Verify that analysis enters a loading state and then shows the same decision
   in the main window and passive overlay.
7. Confirm a purchase and verify the page transition, scroll target, and
   overlay refresh.
8. Carry an exposed song page across a concert and verify the next pattern
   point.
9. Carry a technique page across a concert, buy one inherited-price technique,
   and verify that the refreshed page uses the current period.
10. Export the OCR profile and the NDJSON decision log.

## OCR acceptance checks

- Every token readout is visible below the corresponding in-game counter.
- A failed read displays `?`, never a stale previous number.
- Confidence warnings remain visible while the solver is loading.
- Manual correction affects the pending snapshot immediately.
- Learned numeric templates do not replace a higher-confidence exact reading
  without satisfying the similarity and margin gates.
- `0`, `6`, and `9` disagreements require consensus or manual review.
- Implausible stock discontinuities warn but do not silently rewrite history.
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

## V1 result

v1.0.0 passed all 268 automated tests, strict TypeScript, Prettier, the browser
build at both base paths, the desktop frontend build, native Tauri compilation,
and Windows NSIS packaging.
