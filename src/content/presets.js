// Factory presets. Authored using real (human-readable) values and converted
// to the normalized patch format the store expects.

import { getParam, unmapParam, defaultNorm, PARAMS, defaultLfoPoints } from '../engine/params.js'

function base() {
  const params = {}
  for (const d of PARAMS) params[d.id] = defaultNorm(d)
  return params
}

// set real value
function R(params, id, value) {
  const def = getParam(id)
  if (!def) return
  if (def.curve === 'bool') params[id] = value ? 1 : 0
  else if (def.values) params[id] = def.values.length > 1 ? value / (def.values.length - 1) : 0
  else params[id] = unmapParam(def, value)
}

function patch(name, build, extra = {}) {
  const params = base()
  build((id, v) => R(params, id, v))
  return {
    v: 1,
    name,
    params,
    lfoShapes: extra.lfoShapes || Array.from({ length: 8 }, defaultLfoPoints),
    matrix: extra.matrix || [],
    fxOrder: ['hyper', 'dist', 'flanger', 'phaser', 'chorus', 'delay', 'comp', 'reverb', 'eq', 'ffx'],
    wavetableA: extra.wavetableA || 'Basic Shapes',
    wavetableB: extra.wavetableB || 'Basic Shapes',
    noise: extra.noise || 'White',
  }
}

function m(source, target, amount, opts = {}) {
  return { source, target, amount, bipolar: !!opts.bipolar, aux: opts.aux || '', auxAmt: opts.auxAmt != null ? opts.auxAmt : 1 }
}

// index 0..2 = sine,tri,saw within "Basic Shapes" mapping; we just use wtpos.

export const FACTORY_PRESETS = [
  patch('Init', (s) => {
    s('osca_on', true); s('osca_level', 0.75)
  }),

  patch('Super Saw Lead', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.62); s('osca_unison', 9); s('osca_detune', 0.4)
    s('osca_blend', 0.85); s('osca_width', 1); s('osca_level', 0.8)
    s('oscb_on', true); s('oscb_wtpos', 0.62); s('oscb_unison', 7); s('oscb_detune', 0.32)
    s('oscb_semi', -12); s('oscb_level', 0.5)
    s('sub_on', true); s('sub_level', 0.4); s('sub_oct', -1)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 7000); s('flt_res', 0.2)
    s('env1_att', 0.01); s('env1_dec', 1.5); s('env1_sus', 0.9); s('env1_rel', 0.4)
    s('hyp_on', true); s('hyp_mix', 0.4)
    s('rev_on', true); s('rev_mix', 0.22); s('rev_size', 0.6)
    s('dly_on', true); s('dly_mix', 0.2)
  }, {
    matrix: [m('lfo1', 'flt_cutoff', 0.35), m('modwheel', 'lfo1', 0.0)],
  }),

  patch('Deep House Bass', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.35); s('osca_level', 0.85)
    s('sub_on', true); s('sub_level', 0.7); s('sub_shape', 0)
    s('flt_on', true); s('flt_type', 1); s('flt_cutoff', 600); s('flt_res', 0.25); s('flt_drive', 0.25)
    s('env1_att', 0.003); s('env1_dec', 0.7); s('env1_sus', 0.0); s('env1_rel', 0.15)
    s('env2_att', 0.003); s('env2_dec', 0.35); s('env2_sus', 0)
    s('mono', true); s('porta_time', 0.04)
    s('cmp_on', true); s('cmp_thresh', -20); s('cmp_ratio', 4)
  }, {
    matrix: [m('env2', 'flt_cutoff', 0.45)],
    wavetableA: 'Analog Drift',
  }),

  patch('Reese Bass', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.62); s('osca_unison', 4); s('osca_detune', 0.55); s('osca_level', 0.8)
    s('oscb_on', true); s('oscb_wtpos', 0.62); s('oscb_fine', 0.12); s('oscb_unison', 4); s('oscb_detune', 0.5); s('oscb_level', 0.8)
    s('sub_on', true); s('sub_level', 0.55)
    s('flt_on', true); s('flt_type', 3); s('flt_cutoff', 400); s('flt_res', 0.3); s('flt_drive', 0.4)
    s('env1_att', 0.005); s('env1_sus', 1); s('env1_rel', 0.2)
    s('dist_on', true); s('dist_mode', 0); s('dist_drive', 0.3); s('dist_mix', 0.5)
  }, {
    matrix: [m('lfo1', 'flt_cutoff', 0.25)],
  }),

  patch('Warm Pad', (s) => {
    s('osca_on', true); s('osca_unison', 5); s('osca_detune', 0.2); s('osca_level', 0.6)
    s('oscb_on', true); s('oscb_semi', 7); s('oscb_unison', 3); s('oscb_detune', 0.18); s('oscb_level', 0.45)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 3500); s('flt_res', 0.15)
    s('env1_att', 1.2); s('env1_dec', 2); s('env1_sus', 0.8); s('env1_rel', 2.5)
    s('lfo1_sync', false); s('lfo1_rate', 0.3)
    s('rev_on', true); s('rev_mix', 0.4); s('rev_size', 0.8); s('rev_decay', 0.7)
    s('cho_on', true); s('cho_mix', 0.4)
  }, {
    matrix: [m('lfo1', 'osca_wtpos', 0.3), m('lfo1', 'flt_cutoff', 0.2)],
    wavetableA: 'Vowels', wavetableB: 'Drawbars',
  }),

  patch('Pluck Keys', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.3); s('osca_level', 0.8)
    s('oscb_on', true); s('oscb_semi', 12); s('oscb_level', 0.3)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 6000); s('flt_res', 0.2)
    s('env1_att', 0.002); s('env1_dec', 0.45); s('env1_sus', 0); s('env1_rel', 0.3)
    s('env2_att', 0.002); s('env2_dec', 0.3); s('env2_sus', 0)
    s('dly_on', true); s('dly_mix', 0.25); s('dly_feedback', 0.35)
    s('rev_on', true); s('rev_mix', 0.2)
  }, {
    matrix: [m('env2', 'flt_cutoff', 0.6)],
    wavetableA: 'Bell Tones',
  }),

  patch('8-bit Square', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.75); s('osca_warpmode', 5); s('osca_warp', 0.5); s('osca_level', 0.7)
    s('env1_att', 0.001); s('env1_dec', 0.2); s('env1_sus', 0.7); s('env1_rel', 0.05)
    s('lfo1_sync', false); s('lfo1_rate', 6)
    s('mono', true)
  }, {
    matrix: [m('lfo1', 'osca_warp', 0.4, { bipolar: true })],
  }),

  patch('Growl Bass', (s) => {
    s('osca_on', true); s('osca_wtpos', 0.5); s('osca_unison', 3); s('osca_detune', 0.3); s('osca_level', 0.8)
    s('flt_on', true); s('flt_type', 9); s('flt_cutoff', 800); s('flt_res', 0.6); s('flt_drive', 0.4)
    s('env1_att', 0.005); s('env1_sus', 1); s('env1_rel', 0.2)
    s('lfo1_sync', true); s('lfo1_div', 12)
    s('dist_on', true); s('dist_drive', 0.45); s('dist_mode', 1); s('dist_mix', 0.6)
  }, {
    matrix: [m('lfo1', 'flt_cutoff', 0.6), m('lfo2', 'osca_wtpos', 0.4)],
  }),

  patch('Ambient Drone', (s) => {
    s('osca_on', true); s('osca_unison', 7); s('osca_detune', 0.25); s('osca_level', 0.55)
    s('oscb_on', true); s('oscb_oct', -1); s('oscb_unison', 5); s('oscb_detune', 0.3); s('oscb_level', 0.5)
    s('noise_on', true); s('noise_level', 0.1)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 2200); s('flt_res', 0.2)
    s('env1_att', 3); s('env1_sus', 1); s('env1_rel', 5)
    s('lfo1_sync', false); s('lfo1_rate', 0.12)
    s('rev_on', true); s('rev_mix', 0.5); s('rev_size', 0.95); s('rev_decay', 0.85)
    s('cho_on', true); s('cho_mix', 0.45)
  }, {
    matrix: [m('lfo1', 'osca_wtpos', 0.5), m('lfo2', 'oscb_wtpos', 0.5), m('lfo1', 'flt_cutoff', 0.25)],
    wavetableA: 'Spectral Drift I', wavetableB: 'Spectral Drift II', noise: 'Pink',
  }),

  patch('Hard Sync Stab', (s) => {
    s('osca_on', true); s('osca_warpmode', 1); s('osca_warp', 0.5); s('osca_level', 0.8)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 9000); s('flt_res', 0.15)
    s('env1_att', 0.002); s('env1_dec', 0.4); s('env1_sus', 0.2); s('env1_rel', 0.25)
    s('env2_att', 0.002); s('env2_dec', 0.35); s('env2_sus', 0)
    s('dly_on', true); s('dly_mix', 0.2)
  }, {
    matrix: [m('env2', 'osca_warp', 0.7)],
    wavetableA: 'Sync Sweep',
  }),

  patch('FM Bells', (s) => {
    s('osca_on', true); s('osca_level', 0.75)
    s('oscb_on', true); s('oscb_level', 0.0)
    s('osca_warpmode', 10); s('osca_warp', 0.4)
    s('oscb_semi', 7)
    s('env1_att', 0.002); s('env1_dec', 1.4); s('env1_sus', 0); s('env1_rel', 1.2)
    s('rev_on', true); s('rev_mix', 0.35)
  }, {
    matrix: [m('env2', 'osca_warp', 0.5)],
    wavetableA: 'FM Index', wavetableB: 'FM Ratios',
  }),

  patch('Wobble Lead', (s) => {
    s('osca_on', true); s('osca_unison', 5); s('osca_detune', 0.3); s('osca_level', 0.8)
    s('flt_on', true); s('flt_type', 5); s('flt_cutoff', 1200); s('flt_res', 0.45)
    s('env1_att', 0.01); s('env1_sus', 1); s('env1_rel', 0.3)
    s('lfo1_sync', true); s('lfo1_div', 10)
    s('rev_on', true); s('rev_mix', 0.2)
  }, {
    matrix: [m('lfo1', 'flt_cutoff', 0.7)],
  }),
]
