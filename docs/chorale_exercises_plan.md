# Chorale Exercises Plan

This document captures a practical plan to turn the imported Bach chorales into interactive Exercises that students perform on a MIDI keyboard with real‑time correctness feedback and stored grades, while keeping Play mode for exploration and demos.

## Goals
- Reuse existing Play flow for preview and analysis selection.
- Generate Exercises from whole pieces or excerpts with minimal friction.
- Provide immediate note‑level feedback (gray → black when correct), and persist grades.
- Scaffold a lightweight curriculum that we can grow incrementally.

## Exercise Templates (auto‑generatable per chorale/excerpt)
Each template defines what’s displayed, what students must perform, and how grading works. All reuse the same runtime: timeline → expected notes → MIDI matcher → coloring + grade.

1) Play the outer voices (Soprano + Bass)
- Display: Soprano and Bass notation. Optional: faint inner voices.
- Task: Perform S & B in time.
- Grading: pitch exact (or octave‑flex toggled), onset window (e.g., ±120 ms), release tolerance (≥40% of notated duration). Per‑measure aggregation.

2) Play the soprano (melody)
- Display: Soprano line; metronome / bar cursor.
- Task: Perform melody.
- Grading: per‑note accuracy; bonus for mistake‑free phrases.

3) Play the bass with figures
- Display: Bass staff + figured‑bass (or Roman numerals).
- Task: v1: perform bass only; v2 (advanced): add chord members at onsets.
- Grading: v1 = bass only; v2 = require ≥k correct chord tones at each onset.

4) Fill inner voices
- Display: Outer voices + figures; inner voices are placeholders.
- Task: Perform missing inner notes at each onset.
- Grading: chord‑membership matching; enharmonic‑robust; no parallel checks in v1.

5) Cadence micro‑drills
- Display: 1–2 measures around a cadence.
- Task: Perform those bars.
- Grading: compact rubric per cadence; optional “first‑pass” bonus.

## Data shape (Exercise.data)
Add the following fields (non‑breaking; defaults preserve current behavior):

- mode: "play-outer" | "play-soprano" | "play-bass-figures" | "fill-inner" | "cadence-drill"
- targetVoices: ["soprano","bass"] or staff/voice indices (e.g., { treble:[0], bass:[1] })
- display: { showFigures: bool, showRomans: bool, transpose: int, tempo: int, waitMode: bool }
- grading: { onsetWindowMs: int, releaseTolerancePct: number, octaveFlexible: bool, chordMemberMin: int }
- excerpt: { startMeasure: int, endMeasure: int }
- score: existing CIR JSON
- events: optional precomputed onset/hold timeline (derive if missing)

## Runtime feedback (VF adapter + MIDI)
- Rendering: notes draw gray initially; a correctness map keyed by (measure, staff, voice, noteIdx) toggles style to black when satisfied; brief red flash on wrong.
- Transport: either fixed tempo or waitMode that advances only when current onset is satisfied.
- Matching (per onset):
  1. Collect expected pitches for target voices at time t.
  2. Accept student note if within onsetWindowMs and matches pitch (or pitch class if octaveFlexible).
  3. Mark satisfied; require all expected notes for stacked chords.
  4. Hold check: consider satisfied if held ≥ releaseTolerancePct of notated duration.

## Importer & generation
- Management command: ingest `data/corpus/bach/*.json` into `Exercise` rows.
  - Title = BWV + incipit; tags = { composer:Bach, corpus:Chorale, key, meter, pickup }.
  - Generate 2–3 templates per chorale with short excerpts (e.g., measures 1–4, 5–8).
  - Preserve existing workflow: you can still create from Play and "Save as Exercise"; this command is an optional batch path.

## Curriculum skeleton
- Unit 1: Melody & Cadences — play‑soprano, cadence micro‑drills.
- Unit 2: Bass & Figures — play‑bass‑figures simple → with 7ths/suspensions.
- Unit 3: Outer Voices Together — play‑outer slow → normal tempo.
- Unit 4: Inner Voices — fill‑inner 2–4 measure excerpts.
- Unit 5: Modulation (later) — pivot/secondary dominants.

## Integration with current save‑from‑Play flow
- In Play, after choosing analysis/figures, "Save as Exercise" populates Exercise.data with:
  - mode based on current view (e.g., soprano‑only / outer voices).
  - targetVoices from UI selection (e.g., &voices=sb).
  - display flags for figures/romans; tempo; transpose.
  - excerpt bounds if you set a measure range.
- The existing Dashboard listing picks up the new Exercise; you can still attach simple rhythms as today (polyphony optional later).

## Acceptance criteria
- Students get per‑note immediate feedback and a stored grade for each generated Exercise.
- First iteration supports at least modes: play‑soprano, play‑outer, cadence‑drill.
- Existing Play → Save path still works and produces Exercises that render in the Dashboard.

## Next steps
1. Implement correctness coloring hook in VexFlow adapter.
2. Add simple MIDI matcher with onset/hold windows.
3. Seed 6–10 Exercises from the five chorales and attach them to three starter Units.
4. Add optional batch importer command for bulk generation.