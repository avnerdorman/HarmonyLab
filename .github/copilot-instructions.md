# Copilot instructions for HarmonyLab

This repo is a Django app with a RequireJS (AMD) frontend that draws music notation with VexFlow on an HTML Canvas. Use this as a quick map to make focused, correct changes.

## Big picture
- Request flow: Django view → template (`lab/templates/*.html`) → RequireJS `main.js` → app module (`components/app/*`) → music layer (`components/music/*`) → VexFlow draw (Canvas).
- RequireJS config is produced in `harmony/settings/requirejs.py`, wrapped by `RequirejsContext` (see `lab/views.py`), and injected in `lab/templates/__base.html` with `requirejs.config(requirejs.config_json)`.
- Optional build: if `data/requirejs/build.json` exists with `{ "main": "main-<hash>" }`, `app/main` resolves to `static/js/build/<hash>`. Otherwise, modules load one-by-one in debug.

## Where things live (examples)
- Bootstrap: `lab/static/js/src/main.js` (reads `module.config().app_module`, then `require([app_module]).ready`).
- App modules: `lab/static/js/src/components/app/{play,exercise,manage,debug_analysis}.js`.
- Notation core: `components/music/{play_sheet.js,exercise_sheet.js,stave.js,stave_notater.js,stave_note_factory.js}`.
- Vendor libs: `lab/static/js/lib/{require.js,vexflow.js,Tone.js,lodash.js,jquery.js}`.

## Patterns that matter
- Pick the app per view via `requirejs_app` on a `RequirejsTemplateView` (e.g., `PlayView.requirejs_app = "app/components/app/play"`).
- Pass data to an app by calling `RequirejsContext.set_module_params(<moduleId>, params)` in the Django view; the AMD module reads it via `module.config()` (see `components/app/exercise.js`).
- Keep AMD paths stable; change `paths` only in `harmony/settings/requirejs.py`.
- Rendering uses VexFlow Canvas; don’t mix SVG unless you update all sheet components.
- Cross-cutting notation rules live in `stave_note_factory.js` (accidentals, highlight styles) and layout lives in `stave.js` (voices, connectors, widths). Prefer changing these before touching sheets.

## Local dev workflow (macOS/Linux)
- Database: PostgreSQL with a DB named `analyticpiano` (see `harmony/settings/local.py`). Set `DJANGO_SETTINGS_MODULE=harmony.settings.local`.
- Run: `./manage.py makemigrations && ./manage.py migrate && ./manage.py runserver` (ensure Postgres is running). Create a superuser if you need to log in.
- Security for dev: `DisableCSPMiddleware` is enabled in `local.py` to allow RequireJS/Tone.js; never copy this to production.

## Useful views and tooling
- Play: `lab/views.py::PlayView` renders `lab/templates/play.html` and boots `app/components/app/play`.
- Exercises: `PlaylistView`/`ExerciseView` boot `app/components/app/exercise` and pass the exercise JSON via `set_module_params` → `module.config()`.
- Debug page: `ChoraleAnalysisDebugView` uses `app/components/app/debug_analysis`.
- Dev-only corpus endpoint: `dev_corpus_bach_json` serves JSON from `data/corpus/bach/*.json` when `DEBUG=True`.

## Gotchas (project-specific)
- Exercise data enters the JS app through `module.config()` in `components/app/exercise.js` (search for “EXERCISE DATA ENTERS HERE”). Keep the shape consistent with `apps/exercises.models.Exercise.data`.
- Chorale layout uses special stem/voice handling in `stave_note_factory.js` (see `CHORALE_FORMAT` paths) — be careful when changing stem directions or full-context logic.
- Frontend AMD modules live under `app` path (`static/js/src`); don’t move files without updating `harmony/settings/requirejs.py`.

## Safe-change checklist
- If changing notation behavior, start in `stave_note_factory.js` or `stave.js`; only then update `*sheet.js` if mode-specific.
- If adding a new app/module, wire it by setting `requirejs_app` in a Django view and (if needed) pass config via `set_module_params`.
- After changes, load Play (`/play`) and an Exercise page to verify `<canvas id="staff">` draws and overlays render.
