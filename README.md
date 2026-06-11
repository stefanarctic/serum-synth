# Wavecraft — a wavetable synthesizer for the browser

Wavecraft is a high-fidelity, Serum-style wavetable synthesizer that runs entirely
in the browser. All DSP runs in a single `AudioWorkletProcessor`; the UI is React 19.
Everything (wavetables, noise, presets) is generated procedurally — no third-party
assets or code.

## Features

### Sound sources
- **Two wavetable oscillators (A / B)** — 2048-sample frames, FFT-built band-limited
  mipmaps for alias-free playback, smooth frame interpolation, per-oscillator
  octave/semi/fine, level, pan, and phase/random.
- **Warp modes** — Sync, Bend +/-/±, PWM, Asym, Flip, Mirror, Quantize, plus
  FM / AM / RM between oscillators.
- **Unison** — up to 16 voices per oscillator with detune, blend, stereo width and
  phase randomization (equal-power panning).
- **Sub oscillator** — sine / rounded-square / triangle / saw / square with octave select.
- **Noise oscillator** — white / pink / brown / crackle / digital / vinyl, with pitch,
  key-tracking and one-shot modes.

### Filter
One multi-mode stereo filter with per-source routing (A / B / Sub / Noise):
Moog-style ladder (6/12/18/24 dB), clean ZDF state-variable LP/HP/BP/Notch/Peak,
comb and flanger filters, ring mod and sample & hold — with cutoff, resonance,
drive, "fat", key-tracking and mix.

### Modulation
- **4 AHDSR envelopes** with adjustable attack/decay/release curves (ENV 1 → amp).
- **8 LFOs** with a drawable point-based shape editor (click to add, drag to move,
  double-click to delete, alt-drag to bend), BPM-sync or free Hz, trig/env modes,
  delay / rise / smooth.
- **Mod matrix** — any source (envelopes, LFOs, velocity, note, mod/pitch wheel,
  aftertouch, random, 4 macros) to any parameter, with amount, uni/bi-polar and aux
  scaling. Drag a source chip directly onto any knob to create a route; knobs show a
  modulation ring.

### Effects (reorderable rack)
Hyper / Dimension, Distortion (10 modes, pre/post filter), Flanger, Phaser, Chorus,
Delay (BPM-sync, ping-pong), Compressor (single + multiband OTT-style), Reverb
(hall / plate), 2-band EQ and a filter module. Drag module headers to reorder the chain.

### Global
32-voice polyphony, mono/legato, portamento, pitch-bend range, optional 2x
oversampling (distortion), and 4 assignable macros.

### Performance
- On-screen piano, computer-keyboard input (Z/X and Q/W rows), pitch & mod wheels.
- Web MIDI input (notes, velocity, pitch bend, mod wheel, channel aftertouch).
- Preset browser with factory presets, user presets (localStorage) and JSON import/export.

## Running

```bash
npm install
npm run dev
```

Open the printed URL and click **Power On** (browsers require a user gesture before
audio can start). Use `npm run build` for a production build.

## Architecture

- `src/engine/params.js` — shared parameter registry (ids, ranges, curves, formatting).
- `src/engine/worklet/` — the DSP engine that runs in the AudioWorklet
  (`processor.js`, `voice.js`, `filter.js`, `fx.js`, `mod.js`).
- `src/engine/mipmaps.js` — FFT + band-limited mipmap builder (main thread).
- `src/engine/SynthEngine.js` — main-thread wrapper + Web MIDI.
- `src/content/` — procedurally generated wavetables, noise tables and factory presets.
- `src/state/` — patch store and React bindings.
- `src/ui/` — React UI (controls, visualizers, panels, keyboard, header).

The UI sends normalized (0..1) parameter values to the worklet over its message
port; the worklet streams meter/voice data back at frame rate.
