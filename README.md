# Live Route

Live Route is a decision companion for the **Grand Live** scenario in _Umamusume:
Pretty Derby_. It recommends when to buy a song, which lesson technique to pay
for, when to stop spending, and when carrying an exposed page into the next
concert is worthwhile.

The application is available in two forms backed by the same solver:

| Edition | Intended use                                          | Distribution                         |
| ------- | ----------------------------------------------------- | ------------------------------------ |
| Web     | Manual tracking in any modern browser                 | GitHub Pages                         |
| Desktop | The same planner with local OCR and a passive overlay | Windows installer in GitHub Releases |

The OCR cockpit is a self-contained desktop feature. It captures the game
window only when requested, lets the user review every detected value, and then
applies the confirmed snapshot to the shared planner. The web edition contains
no OCR code or recognition models.

## What the planner tracks

- current concert and whether the lesson window is still open;
- Dance, Passion, Vocal, Visual, and Mental token balances;
- current technique offers and their exact multi-colour costs;
- visible song offers, purchased songs, active bonuses, and remaining pool;
- Great Success gauges, the final 18-song gate, and exposed-page carryover;
- the inherited price period of a technique page carried across a concert.

Recommendations are explanatory rather than opaque. The UI exposes the active
plan, protected targets, token pressure, feasibility, probability diagnostics,
and the reason that separated the selected technique from its alternatives. A
manual override remains available for effects the solver cannot observe, such
as an immediately valuable Energy or Hint reward.

## Repository layout

```text
packages/core   domain rules, solver, song catalogue, structured messages
packages/ui     shared React application, themes, and French/English copy
apps/web        browser entry point and browser persistence adapter
apps/desktop    Tauri entry point, local capture, OCR, and overlay
```

`packages/core` is independent from React, the DOM, Tauri, and Tesseract. It
emits structured message codes rather than prose, so both editions render the
same decision in either supported language.

## Local development

Requirements:

- Node.js 22 and npm;
- Rust stable and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
  when building the desktop edition.

```bash
npm ci

# Browser edition
npm run dev:web

# Desktop edition (prepares its local OCR assets automatically)
npm run dev:desktop
```

Desktop `dev` and `build` run `prepare:ocr` themselves. `npm run prepare:ocr`
remains available as an explicit validation/debug step and creates approximately
23 MB of generated resources under `apps/desktop/public/ocr/`. The directory is
intentionally ignored by Git.

## Validation

```bash
npm run check:versions
npm run format:check
npm run typecheck
npm test
npm run build:web
npm run build --workspace @glcp/desktop
npm run build:desktop
```

The current post-audit source baseline contains **332 tests**: 236 core, 19
shared UI, and 77 desktop/OCR tests. The historical v1.0.0/v1.0.1 counts remain
recorded in the release notes. Full release validation still requires a clean
`npm ci`, strict TypeScript, both frontend builds, and the Windows native/NSIS
workflow described in `docs/VALIDATION.md`.

## GitHub distribution

The repository includes three workflows:

- `.github/workflows/ci.yml` runs formatting, strict TypeScript checks, tests,
  and the browser build on pushes and pull requests;
- `.github/workflows/deploy-pages.yml` deploys `main` to the verified custom
  domain `liveroute.tmoperao.fr` with Vite base `/`; the Vite configuration
  still accepts `VITE_BASE_PATH` for repository-site validation or forks;
- `.github/workflows/build-windows.yml` validates a Windows build on demand and
  publishes the NSIS installer when a `v*` tag is pushed.

The upstream repository already uses **Settings → Pages → Source → GitHub
Actions**. A new fork/repository must enable that once before `configure-pages`
can deploy. `npm run check:versions` prevents the Web/Desktop/Tauri version
labels from drifting even though solver policy telemetry (`grand-live-v6`) is
versioned independently from application SemVer. Release tags should only be
created after the clean-install gate in `docs/VALIDATION.md` passes for the
exact commit being tagged.

## Documentation

| File                                                     | Purpose                                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                     | Contribution workflow and repository guards         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Package boundaries and platform responsibilities    |
| [`docs/ALGORITHMIC_MODEL.md`](docs/ALGORITHMIC_MODEL.md) | Current decision model and invariants               |
| [`docs/VISION_PROFILE.md`](docs/VISION_PROFILE.md)       | OCR profile schema and calibration                  |
| [`docs/VALIDATION.md`](docs/VALIDATION.md)               | Current release validation protocol                 |
| [`audit closure`](docs/AUDIT_CLOSURE_2026-08-13.md)      | PR-0 through PR-7 audit closure and evidence gaps   |
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md)                   | User-facing release history                         |
| [`docs/archive/`](docs/archive)                          | Historical audits, specifications, and pre-V1 notes |

Song and token image sources are documented in each application's
`public/assets/songs/ATTRIBUTION.md` file.
