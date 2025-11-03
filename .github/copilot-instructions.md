# Copilot instructions for HarmonyLab

This repository is a Django app with a RequireJS-based frontend that renders music notation via VexFlow on an HTML Canvas. Use this guide to make high-quality changes quickly and safely.

## Architecture quick map
- Backend: Django (class-based views), templates in `lab/templates`, settings under `harmony/settings/*`.
- Frontend loader: RequireJS (AMD). Bootstrap in `lab/static/js/src/main.js` reads `config.app_module` and loads the selected app.
- Frontend apps: `lab/static/js/src/components/app/*` (e.g., `play.js`, `exercise.js`). Each composes subcomponents (piano, MIDI, menus, music sheet).
- Notation rendering: VexFlow (Canvas backend). Core pipeline:
  Django view → template with `<canvas id="staff">` → RequireJS `main.js` → app component → Music component → Sheet (`play_sheet.js` / `exercise_sheet.js`) → `stave.js` + `stave_notater.js` + `stave_note_factory.js` → VexFlow draw.
- RequireJS config: built in `harmony/settings/requirejs.py`, injected via `RequirejsContext` in `lab/views.py`, consumed in `lab/templates/__base.html`.

## Key files to know
- Django → RequireJS wiring: `lab/views.py` (`RequirejsTemplateView`, `PlayView`) and `lab/templates/__base.html`.
- App bootstrap: `lab/static/js/src/main.js`.
- Play app: `lab/static/js/src/components/app/play.js`.
- Notation core:
  - `.../music/play_sheet.js` and `.../music/exercise_sheet.js`
  - `.../music/stave.js` (staves, voices, connectors, formatting)
  - `.../music/stave_notater.js` (analytical overlays)
  - `.../music/stave_note_factory.js` (StaveNote creation, accidentals, styles)
- VexFlow vendor: `lab/static/js/lib/vexflow.js`.

## Conventions & patterns
- AMD modules (RequireJS): keep module paths stable; update `paths` only via `harmony/settings/requirejs.py` when necessary.
- Rendering uses `Vex.Flow.Renderer.Backends.CANVAS`; prefer consistent Canvas metrics; don’t mix SVG unless you update all sheet components.
- `stave_note_factory.js` centralizes accidentals, key styles, and highlight logic; modify here for notation-wide behavior changes.
- `stave.js` controls measure layout and Formatter usage; adjust widths here, not in sheets, unless view-specific.
- Django views select the active app via `requirejs_app` (e.g., `"app/components/app/play"`).

## Typical change flows
- Add a new music feature: extend or compose in `app/*`, add logic in `music/*` components, create utilities in `music/utils` if needed, and wire via RequireJS.
- Adjust notation layout: prefer changes in `stave.js` and `stave_note_factory.js`; only touch sheets for mode-specific UI.
- Update base template/assets: change `lab/templates/__base.html`; ensure RequireJS config still injects `requirejs.config_json`.

## Testing & verification
- Prefer adding small UI tests (if applicable) and targeted Django tests in `tests/`.
- For front-end rendering, verify Play view (`lab/templates/play.html`) renders `<canvas id="staff">` and shows expected staves/voices.
- Keep changes to vendored VexFlow minimal; document any custom patches (e.g., stem height adjustments) in commit messages.

## Gotchas
- Accidentals and highlight styles are applied via modifiers; unison/part-specific rendering is handled specially in `stave_note_factory.js`.
- Key signature/alterations state is threaded through sheet → stave → note factory; keep this immutable across measures unless you update cancellations.
- RequireJS optimizer/bundle may be configured; ensure new modules are addressable both debug and optimized modes.

## Safe-commit checklist
- Touched files only where the responsibility belongs (sheet vs. stave vs. note factory).
- Verified RequireJS paths and app module load.
- Confirmed Canvas render still works and analytics overlays paint correctly.
- Added/updated tests or quick manual steps in PR description.
