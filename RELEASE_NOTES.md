# Release notes

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
