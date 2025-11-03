/* global define: false */

define(["lodash", "vexflow"], function (_, Vex) {
  "use strict";

  function durToVF(d) {
    // Return just the base duration type (no dots - those are handled separately)
    return d.type; // 'w','h','q','8','16', etc.
  }

  function itemToTickable(clef, item, octaveShift) {
    if (item.kind === "rest") {
      var dur = durToVF(item.duration) + "r";
      var rest = new Vex.Flow.StaveNote({ clef: clef, keys: ["b/4"], duration: dur, dots: item.duration.dots || 0 });
      // VexFlow 4.x automatically adds dots when specified in constructor
      return rest;
    }
    if (item.kind === "note") {
      var acc = item.pitch.alter === 1 ? "#" : item.pitch.alter === -1 ? "b" : item.pitch.alter === 2 ? "##" : item.pitch.alter === -2 ? "bb" : "";
      var oshift = octaveShift || 0;
      var key = item.pitch.step.toLowerCase() + acc + "/" + (item.pitch.octave + oshift);
      // VexFlow 4.x automatically renders accidentals from the key notation (e.g., "c#/4")
      var note = new Vex.Flow.StaveNote({ clef: clef, keys: [key], duration: durToVF(item.duration), dots: item.duration.dots || 0 });
      return note;
    }
    if (item.kind === "chord") {
      var oshift = octaveShift || 0;
      var keys = item.notes.map(function (n) {
        var acc = n.pitch.alter === 1 ? "#" : n.pitch.alter === -1 ? "b" : n.pitch.alter === 2 ? "##" : n.pitch.alter === -2 ? "bb" : "";
        return n.pitch.step.toLowerCase() + acc + "/" + (n.pitch.octave + oshift);
      });
      // VexFlow 4.x automatically renders accidentals from the key notation
      var chord = new Vex.Flow.StaveNote({ clef: clef, keys: keys, duration: durToVF(item.duration), dots: item.duration.dots || 0 });
      return chord;
    }
    return null;
  }

  function buildVoice(time, tickables) {
    var voice = new Vex.Flow.Voice(time);
    // Allow incomplete voices (for pickup measures / anacrusis)
    voice.setMode(Vex.Flow.Voice.Mode.SOFT);
    voice.addTickables(tickables);
    return voice;
  }

  // Add a key signature with a minor->relative-major fallback for older VexFlow builds
  function addKeySignatureSafe(stave, key) {
    if (!key) return;
    try {
      stave.addKeySignature(key);
    } catch (e) {
      // Some VexFlow versions only accept major names; try relative major for minor keys
      var minorToRelativeMajor = {
        "Am": "C",  "Em": "G",  "Bm": "D",  "F#m": "A",  "C#m": "E",
        "G#m": "B", "D#m": "F#", "A#m": "C#", "Dm": "F",   "Gm": "Bb",
        "Cm": "Eb", "Fm": "Ab", "Bbm": "Db", "Ebm": "Gb", "Abm": "Cb"
      };
      var fallback = minorToRelativeMajor[key];
      if (fallback) {
        try { stave.addKeySignature(fallback); } catch (_) { /* ignore */ }
      }
    }
  }

  function makeStave(ctx, x, y, w, clef, meta, addClef) {
    var stave = new Vex.Flow.Stave(x, y, w);
    stave.setContext(ctx);
    if (addClef) stave.addClef(clef);
    if (meta && meta.key) addKeySignatureSafe(stave, meta.key);
    if (meta && meta.time) stave.addTimeSignature(meta.time);
    return stave;
  }

  function render(score, renderer, opts) {
    var ctx = renderer.getContext();
    
    // Get canvas element - it's stored in ctx.canvas or ctx.element depending on VexFlow version
    var canvas = ctx.canvas || ctx.element;
    
    // Clear canvas first
    if (canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.save();
    try {
      var margin = { left: 20, right: 20, top: 20, bottom: 20 };
      var width = (opts && opts.width) || (canvas && canvas.width) || 800;
      var height = (opts && opts.height) || (canvas && canvas.height) || 300;
      var systemGap = 120; // Increased vertical spacing between staves
      var meta = score.meta || {};

      if (!score.measures || score.measures.length === 0) {
        return;
      }

      // Limit to first N measures for initial view (default 4)
      var maxMeasures = opts && opts.maxMeasures !== undefined ? opts.maxMeasures : 4;
      var numMeasures = Math.min(score.measures.length, maxMeasures);
      var availableWidth = width - margin.left - margin.right;
      var trebleY = margin.top + 30;
      var bassY = trebleY + systemGap;

      // Time from metadata if present; default 4/4
      var time = (function () {
        if (meta && meta.time) {
          var parts = meta.time.split("/");
          var num = parseInt(parts[0], 10) || 4;
          var den = parseInt(parts[1], 10) || 4;
          return { num_beats: num, beat_value: den, resolution: Vex.Flow.RESOLUTION };
        }
        return { num_beats: 4, beat_value: 4, resolution: Vex.Flow.RESOLUTION };
      })();

      // Auto-beam eighth notes and smaller
      function autoBeam(tickables) {
        var beamable = [];
        var beamGroups = [];
        
        tickables.forEach(function(note) {
          // Check if note can be beamed (8th, 16th, etc.) and is not a rest
          var duration = note.duration;
          var canBeam = duration && (duration.indexOf('8') === 0 || duration.indexOf('16') === 0) && duration.indexOf('r') === -1;
          
          if (canBeam) {
            beamable.push(note);
          } else {
            // End of beam group
            if (beamable.length >= 2) {
              beamGroups.push(beamable);
            }
            beamable = [];
          }
        });
        
        // Don't forget trailing beamable notes
        if (beamable.length >= 2) {
          beamGroups.push(beamable);
        }
        
        // Create beams
        return beamGroups.map(function(group) {
          return new Vex.Flow.Beam(group);
        });
      }

      function staffVoices(staffId, staff, clef) {
        // Optional filtering: opts.selectVoices = { treble: [0], bass: [1] }
        var select = (opts && opts.selectVoices && opts.selectVoices[staffId]) || null;
        // Optional octave shift per staff: opts.octaveShift = { treble: 0, bass: -1 }
        var octaveShift = (opts && opts.octaveShift && (opts.octaveShift[staffId] || 0)) || 0;
        return (staff.voices || [])
          .map(function (v, idx) {
            if (select && select.indexOf(idx) === -1) return null; // filter out
            var tickables = v.items.map(function (it) { return itemToTickable(clef, it, octaveShift); }).filter(Boolean);
            if (v.direction === "up") tickables.forEach(function (t) { if (t.setStemDirection) t.setStemDirection(1); });
            if (v.direction === "down") tickables.forEach(function (t) { if (t.setStemDirection) t.setStemDirection(-1); });
            
            // Auto-beam the notes
            var beams = autoBeam(tickables);
            
            var voice = buildVoice(time, tickables);
            voice.beams = beams; // Store beams for later drawing
            return voice;
          })
          .filter(Boolean);
      }

      // Pre-calculate measure widths based on actual duration
      var measureWidths = [];
      
      // Helper to convert duration to ticks
      function durationToTicks(dur) {
        var base = { 'w': 4096, 'h': 2048, 'q': 1024, '8': 512, '16': 256, '32': 128 }[dur.type] || 1024;
        var dots = dur.dots || 0;
        var tickVal = base;
        // Add ticks for dots (each dot adds half of the previous value)
        var dotAdd = base / 2;
        for (var d = 0; d < dots; d++) {
          tickVal += dotAdd;
          dotAdd /= 2;
        }
        return tickVal;
      }
      
      // Count noteheads in a measure (respects optional voice filtering)
      function countNoteheads(meas) {
        var total = 0;
        ['treble', 'bass'].forEach(function(staffName) {
          var staff = meas.staves[staffName];
          if (!staff || !staff.voices) return;
          var select = (opts && opts.selectVoices && opts.selectVoices[staffName]) || null;
          staff.voices.forEach(function(voice, vIdx) {
            if (select && select.indexOf(vIdx) === -1) return;
            voice.items.forEach(function(item) {
              if (item.kind === 'note') total += 1;
              if (item.kind === 'chord' && item.notes && item.notes.length) total += item.notes.length;
            });
          });
        });
        return total;
      }
      
      // Estimate key signature complexity by counting accidentals
      function getKeyAccidentalsCount(key) {
        if (!key) return 0;
        // Normalize key string (capitalize first char, keep trailing m if minor)
        var k = String(key).trim();
        var map = {
          'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
          'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7,
          'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
          'Dm': -1, 'Gm': -2, 'Cm': -3, 'Fm': -4, 'Bbm': -5, 'Ebm': -6, 'Abm': -7
        };
        // Try exact; otherwise attempt uppercase base with optional 'm'
        if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
        return 0;
      }
      
      // Compute dynamic overhead for first measure (clef + key + time). Only applied for pickups.
      function computeFirstMeasureOverhead(meta) {
        var baseClefPx = 28;      // clef glyph
        var leftGapPx = 10;       // breathing room before first note
        var perAccidentalPx = 12; // width per sharp/flat
        var perTimeDigitPx = 8;   // width per time signature digit
        var timeGapPx = 6;        // gap after time signature
        var accCount = Math.abs(getKeyAccidentalsCount(meta && meta.key));
        var timeDigits = 0;
        if (meta && meta.time && meta.time.indexOf('/') !== -1) {
          var parts = meta.time.split('/');
          timeDigits = (parts[0] ? String(parts[0]).length : 0) + (parts[1] ? String(parts[1]).length : 0);
        }
        return leftGapPx + baseClefPx + (accCount * perAccidentalPx) + (timeDigits * perTimeDigitPx) + timeGapPx;
      }
      
      // A full measure in this time signature (e.g., 4 quarter notes in 4/4 = 4096 ticks)
      var fullMeasureTicks = time.num_beats * (4096 / time.beat_value);
      
      // Calculate duration for each measure
      var measureDurations = [];
      for (var i = 0; i < numMeasures; i++) {
        var meas = score.measures[i];
        var maxTicks = 0;
        
        // Calculate actual duration (max across voices)
        ['treble', 'bass'].forEach(function(staffName) {
          var staff = meas.staves[staffName];
          if (staff && staff.voices) {
            staff.voices.forEach(function(voice) {
              var voiceTicks = 0;
              voice.items.forEach(function(item) {
                voiceTicks += durationToTicks(item.duration);
              });
              maxTicks = Math.max(maxTicks, voiceTicks);
            });
          }
        });
        
        measureDurations.push(maxTicks);
      }
      
      // Calculate widths using weights and dynamic overhead for pickup
      var minPartialMeasureWidth = 80; // Minimum width for partial measures (for notes area only)
  var isPickup = measureDurations.length > 0 && (measureDurations[0] < fullMeasureTicks * 0.95);
  // For pickups, dynamicOverhead reserves space for clef/key/time before notes.
  var dynamicOverhead = isPickup ? computeFirstMeasureOverhead(meta) : 0;
  // For full first measures, compensate left padding so its notes area matches other full bars.
  var firstBarCompensation = !isPickup ? computeFirstMeasureOverhead(meta) : 0;

      // Minimum notes width for the pickup based on VexFlow's formatter (pre-calculated)
      var pickupNotesMinWidth = 0;
      if (isPickup) {
        try {
          var voicesT = staffVoices("treble", score.measures[0].staves.treble, "treble");
          var voicesB = staffVoices("bass", score.measures[0].staves.bass, "bass");
          var allPickupVoices = voicesT.concat(voicesB);
          if (allPickupVoices.length) {
            var fmin = new Vex.Flow.Formatter();
            // Join by staff for better alignment before measuring
            if (voicesT.length) fmin.joinVoices(voicesT);
            if (voicesB.length) fmin.joinVoices(voicesB);
            pickupNotesMinWidth = fmin.preCalculateMinTotalWidth(allPickupVoices) || 0;
          }
        } catch (e) {
          pickupNotesMinWidth = 0; // fallback silently
        }
      }

      // Helper: get minimal notes width for an arbitrary measure (used for other partials, e.g., final bar)
      function measureNotesMinWidth(mIndex) {
        try {
          var m = score.measures[mIndex];
          var vT = staffVoices("treble", m.staves.treble, "treble");
          var vB = staffVoices("bass", m.staves.bass, "bass");
          var all = vT.concat(vB);
          if (!all.length) return 0;
          var fm = new Vex.Flow.Formatter();
          if (vT.length) fm.joinVoices(vT);
          if (vB.length) fm.joinVoices(vB);
          return fm.preCalculateMinTotalWidth(all) || 0;
        } catch (e) { return 0; }
      }

      // Build weights: full = 1, partials < 1; pickup scales with duration and note density
      var weights = [];
      for (var wi = 0; wi < numMeasures; wi++) {
        var dur = measureDurations[wi];
        var ratio = Math.max(0, Math.min(1, dur / fullMeasureTicks));
        if (dur >= fullMeasureTicks * 0.95) {
          weights.push(1);
        } else if (wi === 0) {
          // Pickup: we've already reserved a base width (overhead + min notes width). Avoid double-allocation.
          // Give it zero proportional share so it doesn't steal space from full bars.
          weights.push(0);
        } else {
          // Other partials (rare): tie to duration with a floor
          weights.push(Math.max(0.5, ratio));
        }
      }

      // Establish base widths (fixed) and distribute the remainder proportionally via weights
      var baseWidths = new Array(numMeasures).fill(0);
      if (isPickup) {
        // Convert notes min width to whole-measure min using our notes area factor (80%)
        var pickupMinMeasureFromNotes = pickupNotesMinWidth > 0 ? (pickupNotesMinWidth / 0.8) : 0;
        baseWidths[0] = dynamicOverhead + Math.max(minPartialMeasureWidth, pickupMinMeasureFromNotes);
      } else {
        // No pickup: compensate for clef/key/time so first full bar's notesWidth is not penalized
        baseWidths[0] = firstBarCompensation;
      }

      var requiredBase = baseWidths.reduce(function(a,b){return a+b;}, 0);
      var remaining = Math.max(0, availableWidth - requiredBase);
      var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0) || 1;
      var unitWidth = remaining / totalWeight;

      for (var mw = 0; mw < numMeasures; mw++) {
        var extra = unitWidth * weights[mw];
        var widthCandidate = baseWidths[mw] + extra;
        // Enforce a minimum notes-area width for any partial measure to avoid crumpling
        if (measureDurations[mw] < fullMeasureTicks * 0.95) {
          var minFromNotes = 0;
          var notesMin = (mw === 0 ? pickupNotesMinWidth : measureNotesMinWidth(mw));
          if (notesMin > 0) minFromNotes = notesMin / 0.8; // convert to whole-measure width
          widthCandidate = Math.max(baseWidths[mw], Math.max(minPartialMeasureWidth, minFromNotes));
        }
        measureWidths.push(widthCandidate);
      }

      // Render each measure horizontally (limited to numMeasures)
      var currentX = margin.left;
      for (var measIdx = 0; measIdx < numMeasures; measIdx++) {
        var meas = score.measures[measIdx];
        var treble = meas.staves.treble;
        var bass = meas.staves.bass;

        var measureWidth = measureWidths[measIdx];
        var isFirstMeasure = measIdx === 0;

        var trebleStave = makeStave(ctx, currentX, trebleY, measureWidth, "treble", isFirstMeasure ? meta : {}, isFirstMeasure);
        var bassStave = makeStave(ctx, currentX, bassY, measureWidth, "bass", isFirstMeasure ? meta : {}, isFirstMeasure);

        // Draw system connector only on first measure
        if (isFirstMeasure) {
          var connector = new Vex.Flow.StaveConnector(trebleStave, bassStave);
          connector.setType(Vex.Flow.StaveConnector.type.BRACE).setContext(ctx).draw();
          var leftLine = new Vex.Flow.StaveConnector(trebleStave, bassStave);
          leftLine.setType(Vex.Flow.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        }

  var trebleVoices = staffVoices("treble", treble, "treble");
  var bassVoices = staffVoices("bass", bass, "bass");

        // Add barlines at the end of each measure (except the last)
        if (measIdx < numMeasures - 1) {
          trebleStave.setEndBarType(Vex.Flow.Barline.type.SINGLE);
          bassStave.setEndBarType(Vex.Flow.Barline.type.SINGLE);
        } else {
          // Last measure gets a final barline
          trebleStave.setEndBarType(Vex.Flow.Barline.type.END);
          bassStave.setEndBarType(Vex.Flow.Barline.type.END);
        }

        trebleStave.draw();
        bassStave.draw();

        // Use VexFlow 4's improved formatter for better spacing
        var allVoices = trebleVoices.concat(bassVoices);
        if (allVoices.length) {
          var formatter = new Vex.Flow.Formatter();
          
          // Join voices for alignment
          if (trebleVoices.length) formatter.joinVoices(trebleVoices);
          if (bassVoices.length) formatter.joinVoices(bassVoices);

          // Compute actual left padding from the stave (clef/key/time already added)
          var leftPadTreble = trebleStave.getNoteStartX() - trebleStave.getX();
          var leftPadBass = bassStave.getNoteStartX() - bassStave.getX();
          var leftPad = Math.max(leftPadTreble, leftPadBass);
          // Keep a margin before the barline; the final END barline is thicker, so reserve more
          var rightPad = (measIdx === numMeasures - 1) ? 20 : 12;
          var notesWidth = Math.max(0, measureWidth - leftPad - rightPad);
          
          formatter.format(allVoices, notesWidth);
        }

        trebleVoices.forEach(function (v) { 
          v.draw(ctx, trebleStave); 
          // Draw beams after notes
          if (v.beams) {
            v.beams.forEach(function(beam) { beam.setContext(ctx).draw(); });
          }
        });
        bassVoices.forEach(function (v) { 
          v.draw(ctx, bassStave); 
          // Draw beams after notes
          if (v.beams) {
            v.beams.forEach(function(beam) { beam.setContext(ctx).draw(); });
          }
        });
        
        // Move X position for next measure
        currentX += measureWidth;
      }
    } finally {
      ctx.restore();
    }
  }

  return { render: render };
});
