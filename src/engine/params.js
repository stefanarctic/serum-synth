// Shared parameter registry. Imported by both the UI (main thread) and the
// DSP engine (AudioWorklet). All parameter values travel as normalized 0..1
// floats; mapping to real units happens via mapParam().

export const WARP_MODES = [
  'Off', 'Sync', 'Bend +', 'Bend -', 'Bend +/-', 'PWM', 'Asym', 'Flip',
  'Mirror', 'Quantize', 'FM', 'AM', 'RM',
]

export const SUB_SHAPES = ['Sine', 'Round Sq', 'Triangle', 'Saw', 'Square']

export const FILTER_TYPES = [
  'MG Low 6', 'MG Low 12', 'MG Low 18', 'MG Low 24',
  'Low 12', 'Low 24', 'High 12', 'High 24',
  'Band 12', 'Band 24', 'Notch 12', 'Peak 12',
  'Comb +', 'Comb -', 'Flange +', 'Flange -',
  'Ring Mod', 'Samp & Hold',
]

export const FFX_TYPES = FILTER_TYPES

export const DIST_MODES = [
  'Tube', 'Soft Clip', 'Hard Clip', 'Diode', 'Lin Fold', 'Sine Fold',
  'Zero-Square', 'Downsample', 'Asym', 'Fuzz',
]

export const DIST_FILTER = ['Off', 'Pre', 'Post']
export const DLY_MODES = ['Normal', 'Ping-Pong']
export const REV_MODES = ['Hall', 'Plate']
export const EQ_TYPES = ['Shelf', 'Peak']
export const LFO_MODES = ['Trig', 'Env', 'Off']

export const SYNC_DIVS = [
  '8/1', '4/1', '2/1', '1/1', '1/2', '1/2.', '1/2T', '1/4', '1/4.', '1/4T',
  '1/8', '1/8.', '1/8T', '1/16', '1/16.', '1/16T', '1/32', '1/64',
]

// Length of one cycle (or delay) in beats for each sync division.
export const SYNC_BEATS = [
  32, 16, 8, 4, 2, 3, 4 / 3, 1, 1.5, 2 / 3,
  0.5, 0.75, 1 / 3, 0.25, 0.375, 1 / 6, 0.125, 0.0625,
]

export const FX_IDS = [
  'hyper', 'dist', 'flanger', 'phaser', 'chorus', 'delay', 'comp', 'reverb',
  'eq', 'ffx',
]

export const FX_LABELS = {
  hyper: 'Hyper / Dimension', dist: 'Distortion', flanger: 'Flanger',
  phaser: 'Phaser', chorus: 'Chorus', delay: 'Delay', comp: 'Compressor',
  reverb: 'Reverb', eq: 'EQ', ffx: 'Filter',
}

export const MOD_SOURCES = [
  'env1', 'env2', 'env3', 'env4',
  'lfo1', 'lfo2', 'lfo3', 'lfo4', 'lfo5', 'lfo6', 'lfo7', 'lfo8',
  'velocity', 'note', 'modwheel', 'aftertouch', 'random',
  'macro1', 'macro2', 'macro3', 'macro4',
]

export const MOD_SOURCE_LABELS = {
  env1: 'ENV 1', env2: 'ENV 2', env3: 'ENV 3', env4: 'ENV 4',
  lfo1: 'LFO 1', lfo2: 'LFO 2', lfo3: 'LFO 3', lfo4: 'LFO 4',
  lfo5: 'LFO 5', lfo6: 'LFO 6', lfo7: 'LFO 7', lfo8: 'LFO 8',
  velocity: 'VEL', note: 'NOTE', modwheel: 'WHEEL', aftertouch: 'AT',
  random: 'RAND', macro1: 'MACRO 1', macro2: 'MACRO 2', macro3: 'MACRO 3',
  macro4: 'MACRO 4',
}

// ---------------------------------------------------------------------------

const defs = []

// curve: 'lin' | 'exp' | 'pow3' | 'int' | 'bool'
function p(id, name, min, max, def, curve = 'lin', opts = {}) {
  defs.push({ id, name, min, max, def, curve, mod: opts.mod !== false, ...opts })
}

function pEnum(id, name, values, def = 0) {
  defs.push({ id, name, min: 0, max: values.length - 1, def, curve: 'int', values, mod: false })
}

function pBool(id, name, def = false) {
  defs.push({ id, name, min: 0, max: 1, def: def ? 1 : 0, curve: 'bool', mod: false })
}

// --- Global / voicing ---
p('master_vol', 'Master Vol', 0, 1, 0.8)
p('bpm', 'BPM', 20, 300, 120, 'lin', { mod: false })
p('poly', 'Polyphony', 1, 32, 8, 'int', { mod: false })
pBool('mono', 'Mono')
pBool('legato', 'Legato')
p('porta_time', 'Porta Time', 0, 10, 0, 'pow3', { mod: false, unit: 's' })
pBool('porta_always', 'Porta Always', true)
p('bend_range', 'Bend Range', 0, 48, 2, 'int', { mod: false })
pBool('oversample', '2x Oversample')

// --- Oscillators A / B ---
for (const o of ['a', 'b']) {
  const O = o.toUpperCase()
  pBool(`osc${o}_on`, `Osc ${O} On`, o === 'a')
  p(`osc${o}_oct`, 'Octave', -4, 4, 0, 'int', { mod: false })
  p(`osc${o}_semi`, 'Semi', -12, 12, 0, 'int', { mod: false })
  p(`osc${o}_fine`, 'Fine', -1, 1, 0, 'lin', { unit: 'st' })
  p(`osc${o}_unison`, 'Unison', 1, 16, 1, 'int', { mod: false })
  p(`osc${o}_detune`, 'Detune', 0, 1, 0.25)
  p(`osc${o}_blend`, 'Blend', 0, 1, 0.75)
  p(`osc${o}_width`, 'Width', 0, 1, 1)
  p(`osc${o}_phase`, 'Phase', 0, 1, 0)
  p(`osc${o}_rand`, 'Rand', 0, 1, 1)
  p(`osc${o}_wtpos`, 'WT Pos', 0, 1, 0)
  pEnum(`osc${o}_warpmode`, 'Warp Mode', WARP_MODES, 0)
  p(`osc${o}_warp`, 'Warp', 0, 1, 0.5)
  p(`osc${o}_pan`, 'Pan', -1, 1, 0)
  p(`osc${o}_level`, 'Level', 0, 1, 0.75)
}

// --- Sub ---
pBool('sub_on', 'Sub On')
pEnum('sub_shape', 'Shape', SUB_SHAPES, 0)
p('sub_oct', 'Octave', -4, 0, -1, 'int', { mod: false })
p('sub_pan', 'Pan', -1, 1, 0)
p('sub_level', 'Level', 0, 1, 0.75)

// --- Noise ---
pBool('noise_on', 'Noise On')
p('noise_pitch', 'Pitch', -1, 1, 0)
pBool('noise_keytrack', 'Key Track')
pBool('noise_oneshot', 'One-Shot')
p('noise_rand', 'Rand Phase', 0, 1, 1, 'lin', { mod: false })
p('noise_pan', 'Pan', -1, 1, 0)
p('noise_level', 'Level', 0, 1, 0.5)

// --- Filter ---
pBool('flt_on', 'Filter On')
pEnum('flt_type', 'Type', FILTER_TYPES, 3)
p('flt_cutoff', 'Cutoff', 20, 20000, 20000, 'exp', { unit: 'Hz' })
p('flt_res', 'Res', 0, 1, 0)
p('flt_drive', 'Drive', 0, 1, 0)
p('flt_fat', 'Fat', 0, 1, 0)
p('flt_mix', 'Mix', 0, 1, 1)
p('flt_keytrk', 'Key Trk', 0, 1, 0)
pBool('flt_a', 'A>Filter', true)
pBool('flt_b', 'B>Filter', true)
pBool('flt_sub', 'Sub>Filter')
pBool('flt_noise', 'Noise>Filter')

// --- Envelopes 1..4 ---
for (let i = 1; i <= 4; i++) {
  p(`env${i}_att`, 'Attack', 0, 20, 0.002, 'pow3', { unit: 's' })
  p(`env${i}_hold`, 'Hold', 0, 20, 0, 'pow3', { unit: 's' })
  p(`env${i}_dec`, 'Decay', 0.001, 20, 1, 'pow3', { unit: 's' })
  p(`env${i}_sus`, 'Sustain', 0, 1, 1)
  p(`env${i}_rel`, 'Release', 0.001, 20, 0.25, 'pow3', { unit: 's' })
  p(`env${i}_attcrv`, 'Att Curve', -1, 1, 0.5, 'lin', { mod: false })
  p(`env${i}_deccrv`, 'Dec Curve', -1, 1, -0.6, 'lin', { mod: false })
  p(`env${i}_relcrv`, 'Rel Curve', -1, 1, -0.6, 'lin', { mod: false })
}

// --- LFOs 1..8 ---
for (let i = 1; i <= 8; i++) {
  p(`lfo${i}_rate`, 'Rate', 0.01, 40, 2, 'exp', { unit: 'Hz' })
  pBool(`lfo${i}_sync`, 'BPM Sync', true)
  pEnum(`lfo${i}_div`, 'Division', SYNC_DIVS, 7)
  pEnum(`lfo${i}_mode`, 'Mode', LFO_MODES, 0)
  p(`lfo${i}_delay`, 'Delay', 0, 10, 0, 'pow3', { unit: 's', mod: false })
  p(`lfo${i}_rise`, 'Rise', 0, 10, 0, 'pow3', { unit: 's', mod: false })
  p(`lfo${i}_smooth`, 'Smooth', 0, 1, 0, 'lin', { mod: false })
}

// --- Macros ---
for (let i = 1; i <= 4; i++) p(`macro${i}`, `Macro ${i}`, 0, 1, 0, 'lin', { mod: false })

// --- FX: Hyper / Dimension ---
pBool('hyp_on', 'Hyper On')
p('hyp_rate', 'Rate', 0.01, 10, 0.8, 'exp', { unit: 'Hz' })
p('hyp_detune', 'Detune', 0, 1, 0.25)
p('hyp_unison', 'Unison', 2, 7, 4, 'int', { mod: false })
p('hyp_mix', 'Hyper Mix', 0, 1, 0.5)
p('dim_size', 'Dim Size', 0, 1, 0.35)
p('dim_mix', 'Dim Mix', 0, 1, 0)

// --- FX: Distortion ---
pBool('dist_on', 'Dist On')
pEnum('dist_mode', 'Mode', DIST_MODES, 0)
p('dist_drive', 'Drive', 0, 1, 0.35)
pEnum('dist_filter', 'Filter Pos', DIST_FILTER, 0)
p('dist_cutoff', 'Cutoff', 20, 20000, 800, 'exp', { unit: 'Hz' })
p('dist_res', 'Res', 0, 1, 0.3)
p('dist_mix', 'Mix', 0, 1, 1)

// --- FX: Flanger ---
pBool('flg_on', 'Flanger On')
p('flg_rate', 'Rate', 0.01, 20, 0.25, 'exp', { unit: 'Hz' })
p('flg_depth', 'Depth', 0, 1, 0.5)
p('flg_feedback', 'Feedback', 0, 0.95, 0.5)
p('flg_phase', 'Phase', 0, 1, 0.25)
p('flg_mix', 'Mix', 0, 1, 0.5)

// --- FX: Phaser ---
pBool('phs_on', 'Phaser On')
p('phs_rate', 'Rate', 0.01, 20, 0.2, 'exp', { unit: 'Hz' })
p('phs_depth', 'Depth', 0, 1, 0.6)
p('phs_freq', 'Freq', 50, 18000, 800, 'exp', { unit: 'Hz' })
p('phs_feedback', 'Feedback', 0, 0.95, 0.4)
p('phs_phase', 'Phase', 0, 1, 0.25)
p('phs_mix', 'Mix', 0, 1, 0.5)

// --- FX: Chorus ---
pBool('cho_on', 'Chorus On')
p('cho_rate', 'Rate', 0.01, 20, 0.35, 'exp', { unit: 'Hz' })
p('cho_depth', 'Depth', 0, 1, 0.25)
p('cho_delay', 'Delay', 1, 20, 6, 'lin', { unit: 'ms' })
p('cho_feedback', 'Feedback', 0, 0.95, 0.2)
p('cho_lpf', 'LPF', 200, 20000, 12000, 'exp', { unit: 'Hz' })
p('cho_mix', 'Mix', 0, 1, 0.5)

// --- FX: Delay ---
pBool('dly_on', 'Delay On')
pBool('dly_sync', 'Sync', true)
pEnum('dly_div', 'Division', SYNC_DIVS, 10)
p('dly_time', 'Time', 1, 2000, 350, 'exp', { unit: 'ms' })
pEnum('dly_mode', 'Mode', DLY_MODES, 1)
p('dly_feedback', 'Feedback', 0, 0.95, 0.4)
p('dly_hp', 'Low Cut', 20, 2000, 120, 'exp', { unit: 'Hz' })
p('dly_lp', 'High Cut', 200, 20000, 8000, 'exp', { unit: 'Hz' })
p('dly_mix', 'Mix', 0, 1, 0.3)

// --- FX: Compressor ---
pBool('cmp_on', 'Comp On')
p('cmp_thresh', 'Threshold', -60, 0, -18, 'lin', { unit: 'dB' })
p('cmp_ratio', 'Ratio', 1, 20, 4)
p('cmp_att', 'Attack', 0.1, 100, 5, 'exp', { unit: 'ms' })
p('cmp_rel', 'Release', 10, 1000, 120, 'exp', { unit: 'ms' })
p('cmp_gain', 'Gain', 0, 24, 0, 'lin', { unit: 'dB' })
pBool('cmp_multiband', 'Multiband')
p('cmp_mix', 'Mix', 0, 1, 1)

// --- FX: Reverb ---
pBool('rev_on', 'Reverb On')
pEnum('rev_mode', 'Mode', REV_MODES, 0)
p('rev_size', 'Size', 0, 1, 0.5)
p('rev_predelay', 'Pre-Delay', 0, 200, 10, 'lin', { unit: 'ms' })
p('rev_decay', 'Decay', 0, 1, 0.5)
p('rev_damp', 'Damp', 0, 1, 0.5)
p('rev_width', 'Width', 0, 1, 1)
p('rev_mix', 'Mix', 0, 1, 0.25)

// --- FX: EQ ---
pBool('eq_on', 'EQ On')
p('eq_f1', 'Freq 1', 20, 20000, 120, 'exp', { unit: 'Hz' })
p('eq_q1', 'Q 1', 0.3, 10, 0.7, 'exp')
p('eq_g1', 'Gain 1', -18, 18, 0, 'lin', { unit: 'dB' })
pEnum('eq_t1', 'Type 1', EQ_TYPES, 0)
p('eq_f2', 'Freq 2', 20, 20000, 3000, 'exp', { unit: 'Hz' })
p('eq_q2', 'Q 2', 0.3, 10, 0.7, 'exp')
p('eq_g2', 'Gain 2', -18, 18, 0, 'lin', { unit: 'dB' })
pEnum('eq_t2', 'Type 2', EQ_TYPES, 0)

// --- FX: Filter ---
pBool('ffx_on', 'FX Filter On')
pEnum('ffx_type', 'Type', FFX_TYPES, 3)
p('ffx_cutoff', 'Cutoff', 20, 20000, 800, 'exp', { unit: 'Hz' })
p('ffx_res', 'Res', 0, 1, 0.3)
p('ffx_drive', 'Drive', 0, 1, 0)
p('ffx_mix', 'Mix', 0, 1, 1)

// ---------------------------------------------------------------------------

export const PARAMS = defs
export const NUM_PARAMS = defs.length

export const PARAM_INDEX = {}
defs.forEach((d, i) => { PARAM_INDEX[d.id] = i })

export function getParam(id) { return defs[PARAM_INDEX[id]] }

export function mapParam(def, norm) {
  const n = norm < 0 ? 0 : norm > 1 ? 1 : norm
  switch (def.curve) {
    case 'exp': return def.min * Math.pow(def.max / def.min, n)
    case 'pow3': return def.min + (def.max - def.min) * n * n * n
    case 'int': return Math.round(def.min + (def.max - def.min) * n)
    case 'bool': return n >= 0.5 ? 1 : 0
    default: return def.min + (def.max - def.min) * n
  }
}

export function unmapParam(def, value) {
  let n
  switch (def.curve) {
    case 'exp': n = Math.log(value / def.min) / Math.log(def.max / def.min); break
    case 'pow3': n = Math.cbrt((value - def.min) / (def.max - def.min)); break
    default: n = (value - def.min) / (def.max - def.min)
  }
  return n < 0 ? 0 : n > 1 ? 1 : n
}

export function defaultNorm(def) {
  if (def.curve === 'bool') return def.def ? 1 : 0
  return unmapParam(def, def.def)
}

export function formatParamValue(def, norm) {
  const v = mapParam(def, norm)
  if (def.values) return def.values[v]
  if (def.curve === 'bool') return v ? 'On' : 'Off'
  if (def.curve === 'int') return String(v)
  if (def.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(v < 10 ? 2 : 1) + ' Hz'
  if (def.unit === 's') return v < 1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(2) + ' s'
  if (def.unit === 'ms') return v.toFixed(v < 10 ? 1 : 0) + ' ms'
  if (def.unit === 'dB') return v.toFixed(1) + ' dB'
  if (def.unit === 'st') return (v * 100).toFixed(0) + ' ct'
  if (def.min === -1 && def.max === 1) return (v >= 0 ? '+' : '') + (v * 100).toFixed(0)
  return (v * 100).toFixed(0) + '%'
}

// Default LFO shape: a triangle.
export function defaultLfoPoints() {
  return [
    { x: 0, y: 1, c: 0 },
    { x: 0.5, y: 0, c: 0 },
    { x: 1, y: 1, c: 0 },
  ]
}
