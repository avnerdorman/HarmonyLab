# Grading and Follow‑Along Pipeline

This note documents the original (legacy) grading flow and how the new chorale/CIR path integrates with it.

## Legacy pipeline (single‑chord problems)
- Capture: MIDI events update the `ExerciseChordBank` (inputChords).
- Grading trigger: `ExerciseContext` listens to `inputChords.change` and calls `grade()`.
- Grader: `ExerciseGrader.grade(definition, inputChords)` compares each chord against `definition.getProblems()` and returns:
  - `result`: `correct | partial | incorrect`
  - `activeIndex`: next expected chord index (advances when matched)
  - `problems[]`: per‑chord match info
- State machine in `ExerciseContext.grade()`:
  - Updates `this.state`: `READY → WAITING → CORRECT | FINISHED | INCORRECT`
  - Starts timer on first input; calls `endTimer()` when complete; compiles and `submitExerciseReport()` once
  - Broadcasts `EVENTS.BROADCAST.NEXT_CHORD` when `activeIndex` advances
  - Auto navigation:
    - If flawless: `triggerNextExercise()` (gated by `general.autoAdvance`)
    - If mistakes: `triggerRepeatExercise()` or `triggerNextExercise()` depending on `general.ignoreMistakesOnAutoAdvance`

## Chorale/CIR pipeline (polyphonic follow‑along)
- Timeline: `ScoreTimeline.buildTimeline(score, { maxMeasures })` flattens the CIR score into onset windows, with monotonically increasing `onset` ticks.
- Renderer: `VexflowAdapter.render(score, { playedNoteIds, ... })` draws the first N measures and highlights noteheads whose timeline `id` is in `playedNoteIds`.
- Follow‑along and grading (implemented in `components/music/exercise_sheet.js`):
  - NOTE ON:
    - Start timer on first note if not running
    - Within current onset window (at pointer), match MIDI to unplayed notes; mark `playedNoteIds`
    - If all timeline events are played within the visible range, set `ExerciseContext.state` to `CORRECT` (no mistakes) or `FINISHED` (mistakes); call `endTimer()` and `submitExerciseReport()` once; then auto‑advance or repeat via `triggerNextExercise()` / `triggerRepeatExercise()` (gated by config)
  - NOTE OFF:
    - When all notes for the current onset are played and released, advance the timeline pointer to the first event of the next onset
    - Broadcast `EVENTS.BROADCAST.NEXT_CHORD` to notify listeners of progression

## Config flags used
- `general.autoAdvance` / `general.autoAdvanceDelay`
- `general.autoRepeat` / `general.autoRepeatDelay`
- `general.ignoreMistakesOnAutoAdvance`

## Integration guarantees
- Same ExerciseContext state transitions (`READY/WAITING/FINISHED/CORRECT`)
- Same next‑chord broadcast on progression
- Same auto‑advance and auto‑repeat triggers and gating
- Timer is recorded (duration always; tempo metrics appear when supported)

## Next steps (optional)
- Add per‑window timepoints to support tempo metrics similar to legacy grading.
- Visual cursor for the active onset window, synchronized with the pointer.
- Expand maxMeasures windowing to a moving viewport with smooth scroll.
