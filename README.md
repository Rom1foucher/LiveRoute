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

# Desktop edition
npm run prepare:ocr
npm run dev:desktop
```

`npm run prepare:ocr` creates approximately 23 MB of generated OCR resources
under `apps/desktop/public/ocr/`. The directory is intentionally ignored by
Git.

## Validation

```bash
npm run format:check
npm run typecheck
npm test
npm run build:web
npm run build --workspace @glcp/desktop
npm run build:desktop
```

The V1 baseline contains **268 tests**: 186 core, 19 shared UI, and 63
desktop/OCR tests. The browser bundle, desktop frontend, native Tauri build, and
Windows NSIS installer have all been validated for v1.0.0.

## GitHub distribution

The repository includes three workflows:

- `.github/workflows/ci.yml` runs formatting, strict TypeScript checks, tests,
  and the browser build on pushes and pull requests;
- `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages and
  automatically selects the correct root or project-site base path;
- `.github/workflows/build-windows.yml` validates a Windows build on demand and
  publishes the NSIS installer when a `v*` tag is pushed.

Enable **Settings → Pages → Source → GitHub Actions** after the first push. To
publish the desktop V1 release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Documentation

| File                                                     | Purpose                                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                     | Contribution workflow and repository guards         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Package boundaries and platform responsibilities    |
| [`docs/ALGORITHMIC_MODEL.md`](docs/ALGORITHMIC_MODEL.md) | Current decision model and invariants               |
| [`docs/VISION_PROFILE.md`](docs/VISION_PROFILE.md)       | OCR profile schema and calibration                  |
| [`docs/VALIDATION.md`](docs/VALIDATION.md)               | V1 release validation protocol                      |
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md)                   | User-facing release history                         |
| [`docs/archive/`](docs/archive)                          | Historical audits, specifications, and pre-V1 notes |

Song and token image sources are documented in each application's
`public/assets/songs/ATTRIBUTION.md` file.
