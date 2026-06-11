// FX rack: Hyper/Dimension, Distortion, Flanger, Phaser, Chorus, Delay,
// Compressor (single + multiband), Reverb (FDN-ish parallel combs),
// 2-band EQ and a filter module. All processing is in-place on stereo blocks.

import { SYNC_BEATS } from '../params.js'
import { StereoFilter } from './filter.js'

const TWO_PI = Math.PI * 2

function onePole(fc, sr) { return 1 - Math.exp(-TWO_PI * fc / sr) }
function dbToLin(db) { return Math.pow(10, db / 20) }

// --- small building blocks ------------------------------------------------

class DelayLine {
  constructor(size) {
    this.buf = new Float32Array(size)
    this.size = size
    this.w = 0
  }
  write(x) {
    this.buf[this.w] = x
    this.w = (this.w + 1) % this.size
  }
  // read d samples back (before current write position), linear interp
  read(d) {
    if (d < 1) d = 1
    if (d > this.size - 2) d = this.size - 2
    let rp = this.w - d
    if (rp < 0) rp += this.size
    const i0 = rp | 0
    const fr = rp - i0
    const i1 = (i0 + 1) % this.size
    return this.buf[i0] + (this.buf[i1] - this.buf[i0]) * fr
  }
  readInt(d) {
    let rp = this.w - (d | 0)
    if (rp < 0) rp += this.size
    return this.buf[rp | 0]
  }
}

class Biquad {
  constructor() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0 }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
  setPeak(f, q, gainDb, sr) {
    const A = Math.pow(10, gainDb / 40)
    const w = TWO_PI * f / sr
    const al = Math.sin(w) / (2 * q)
    const cw = Math.cos(w)
    const a0 = 1 + al / A
    this.b0 = (1 + al * A) / a0
    this.b1 = -2 * cw / a0
    this.b2 = (1 - al * A) / a0
    this.a1 = -2 * cw / a0
    this.a2 = (1 - al / A) / a0
  }
  setShelf(f, gainDb, sr, high) {
    const A = Math.pow(10, gainDb / 40)
    const w = TWO_PI * f / sr
    const cw = Math.cos(w)
    const sq = 2 * Math.sqrt(A) * Math.sin(w) / 2 * Math.SQRT2
    let b0, b1, b2, a0, a1, a2
    if (!high) {
      b0 = A * ((A + 1) - (A - 1) * cw + sq)
      b1 = 2 * A * ((A - 1) - (A + 1) * cw)
      b2 = A * ((A + 1) - (A - 1) * cw - sq)
      a0 = (A + 1) + (A - 1) * cw + sq
      a1 = -2 * ((A - 1) + (A + 1) * cw)
      a2 = (A + 1) + (A - 1) * cw - sq
    } else {
      b0 = A * ((A + 1) + (A - 1) * cw + sq)
      b1 = -2 * A * ((A - 1) + (A + 1) * cw)
      b2 = A * ((A + 1) + (A - 1) * cw - sq)
      a0 = (A + 1) - (A - 1) * cw + sq
      a1 = 2 * ((A - 1) - (A + 1) * cw)
      a2 = (A + 1) - (A - 1) * cw - sq
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0
    this.a1 = a1 / a0; this.a2 = a2 / a0
  }
  setButterLP(f, sr) {
    const w = TWO_PI * f / sr
    const al = Math.sin(w) / (2 * Math.SQRT1_2)
    const cw = Math.cos(w)
    const a0 = 1 + al
    this.b0 = (1 - cw) / 2 / a0
    this.b1 = (1 - cw) / a0
    this.b2 = (1 - cw) / 2 / a0
    this.a1 = -2 * cw / a0
    this.a2 = (1 - al) / a0
  }
  setButterHP(f, sr) {
    const w = TWO_PI * f / sr
    const al = Math.sin(w) / (2 * Math.SQRT1_2)
    const cw = Math.cos(w)
    const a0 = 1 + al
    this.b0 = (1 + cw) / 2 / a0
    this.b1 = -(1 + cw) / a0
    this.b2 = (1 + cw) / 2 / a0
    this.a1 = -2 * cw / a0
    this.a2 = (1 - al) / a0
  }
}

// --- Hyper / Dimension ----------------------------------------------------

class HyperFx {
  constructor(sr) {
    this.sr = sr
    this.dl = new DelayLine(Math.ceil(sr * 0.06))
    this.dr = new DelayLine(Math.ceil(sr * 0.06))
    this.phases = new Float32Array(7)
    for (let i = 0; i < 7; i++) this.phases[i] = i / 7
    this.dimL = new DelayLine(Math.ceil(sr * 0.05))
    this.dimR = new DelayLine(Math.ceil(sr * 0.05))
  }
  process(L, R, n, V) {
    const sr = this.sr
    const rate = V('hyp_rate')
    const det = V('hyp_detune')
    const uni = V('hyp_unison') | 0
    const hmix = V('hyp_mix')
    const dsize = V('dim_size')
    const dmix = V('dim_mix')
    const inc = rate / sr
    const base = 0.012 * sr
    const depth = det * 0.008 * sr
    const g = 1 / Math.sqrt(uni)
    for (let i = 0; i < n; i++) {
      const xl = L[i]
      const xr = R[i]
      this.dl.write(xl)
      this.dr.write(xr)
      if (hmix > 0.001) {
        let wl = 0
        let wr = 0
        for (let u = 0; u < uni; u++) {
          let ph = this.phases[u] + inc * (1 + u * 0.13)
          ph -= Math.floor(ph)
          this.phases[u] = ph
          const lfo = Math.sin(ph * TWO_PI)
          const d = base + depth * (0.3 + 0.7 * (u / uni)) * (1 + lfo) * 0.5
          if (u & 1) { wl += this.dl.read(d) * g } else { wr += this.dr.read(d) * g }
        }
        L[i] = xl + (wl * 1.4 - xl) * hmix * 0.85
        R[i] = xr + (wr * 1.4 - xr) * hmix * 0.85
      }
      if (dmix > 0.001) {
        const d = (0.004 + dsize * 0.03) * sr
        this.dimL.write(L[i])
        this.dimR.write(R[i])
        const dl = this.dimL.read(d)
        const dr = this.dimR.read(d * 0.87)
        L[i] += (dr * 0.8 - dl * 0.25) * dmix
        R[i] += (dl * 0.8 - dr * 0.25) * dmix
      }
    }
  }
}

// --- Distortion -----------------------------------------------------------

function distShape(mode, x, g) {
  switch (mode) {
    case 0: return Math.tanh(g * x + 0.18 * g * x * x) // tube-ish, even harmonics
    case 1: return Math.tanh(g * x)
    case 2: { const y = g * x; return y > 1 ? 1 : y < -1 ? -1 : y }
    case 3: return x > 0 ? Math.tanh(g * x) : 0.4 * Math.tanh(g * x * 0.6) // diode
    case 4: { // linear fold
      let y = g * x * 0.5 + 0.5
      y -= Math.floor(y)
      return 2 * Math.abs(2 * y - 1) - 1
    }
    case 5: return Math.sin(g * x * Math.PI * 0.5) // sine fold
    case 6: { const a = Math.abs(x * g); return Math.sign(x) * Math.pow(a > 1 ? 1 : a, 0.25) }
    case 8: { const y = Math.tanh(g * (x + 0.25)) - Math.tanh(g * 0.25); return y } // asym
    case 9: return Math.sign(x) * (1 - Math.exp(-Math.abs(3 * g * x))) * 0.85 // fuzz
    default: return x
  }
}

class DistFx {
  constructor(sr) {
    this.sr = sr
    this.filter = new StereoFilter(sr)
    this.holdL = 0; this.holdR = 0; this.holdCount = 0
    this.prevL = 0; this.prevR = 0
  }
  process(L, R, n, V, oversample) {
    const mode = V('dist_mode') | 0
    const drive = V('dist_drive')
    const fpos = V('dist_filter') | 0
    const mix = V('dist_mix')
    const g = 1 + drive * drive * 30
    const makeup = 1 / (1 + drive * 1.2)
    if (fpos === 1) this.filter.process(L, R, 0, n, 4, V('dist_cutoff'), V('dist_res'), 0, 0, 1)
    if (mode === 7) { // downsample
      const period = 1 + Math.floor(drive * 60)
      for (let i = 0; i < n; i++) {
        this.holdCount--
        if (this.holdCount <= 0) { this.holdL = L[i]; this.holdR = R[i]; this.holdCount = period }
        L[i] = L[i] + (this.holdL - L[i]) * mix
        R[i] = R[i] + (this.holdR - R[i]) * mix
      }
    } else {
      for (let i = 0; i < n; i++) {
        let wl, wr
        if (oversample) {
          // crude 2x: shape the midpoint too and average
          wl = (distShape(mode, (L[i] + this.prevL) * 0.5, g) + distShape(mode, L[i], g)) * 0.5
          wr = (distShape(mode, (R[i] + this.prevR) * 0.5, g) + distShape(mode, R[i], g)) * 0.5
          this.prevL = L[i]; this.prevR = R[i]
        } else {
          wl = distShape(mode, L[i], g)
          wr = distShape(mode, R[i], g)
        }
        L[i] = L[i] + (wl * makeup - L[i]) * mix
        R[i] = R[i] + (wr * makeup - R[i]) * mix
      }
    }
    if (fpos === 2) this.filter.process(L, R, 0, n, 4, V('dist_cutoff'), V('dist_res'), 0, 0, 1)
  }
}

// --- Flanger ---------------------------------------------------------------

class FlangerFx {
  constructor(sr) {
    this.sr = sr
    this.dl = new DelayLine(Math.ceil(sr * 0.02))
    this.dr = new DelayLine(Math.ceil(sr * 0.02))
    this.phase = 0
    this.fbL = 0; this.fbR = 0
  }
  process(L, R, n, V) {
    const sr = this.sr
    const inc = V('flg_rate') / sr
    const depth = V('flg_depth')
    const fb = V('flg_feedback')
    const phOff = V('flg_phase')
    const mix = V('flg_mix')
    for (let i = 0; i < n; i++) {
      let ph = this.phase + inc
      ph -= Math.floor(ph)
      this.phase = ph
      const dlms = 0.0008 + 0.004 * depth * (1 + Math.sin(ph * TWO_PI)) * 0.5
      const drms = 0.0008 + 0.004 * depth * (1 + Math.sin((ph + phOff) * TWO_PI)) * 0.5
      this.dl.write(L[i] + this.fbL * fb)
      this.dr.write(R[i] + this.fbR * fb)
      this.fbL = this.dl.read(dlms * sr)
      this.fbR = this.dr.read(drms * sr)
      L[i] = L[i] + (this.fbL - L[i] * 0) * mix
      R[i] = R[i] + (this.fbR - R[i] * 0) * mix
    }
  }
}

// --- Phaser -----------------------------------------------------------------

class PhaserFx {
  constructor(sr) {
    this.sr = sr
    this.x = new Float64Array(12) // 6 stages x1 per channel
    this.y = new Float64Array(12)
    this.phase = 0
    this.fbL = 0; this.fbR = 0
  }
  process(L, R, n, V) {
    const sr = this.sr
    const inc = V('phs_rate') / sr
    const depth = V('phs_depth')
    const center = V('phs_freq')
    const fb = V('phs_feedback')
    const phOff = V('phs_phase')
    const mix = V('phs_mix')
    for (let i = 0; i < n; i++) {
      let ph = this.phase + inc
      ph -= Math.floor(ph)
      this.phase = ph
      for (let ch = 0; ch < 2; ch++) {
        const buf = ch === 0 ? L : R
        const lfo = Math.sin((ph + (ch === 0 ? 0 : phOff)) * TWO_PI)
        let f = center * Math.pow(2, lfo * depth * 2)
        if (f > sr * 0.45) f = sr * 0.45
        const t = Math.tan(Math.PI * f / sr)
        const a = (1 - t) / (1 + t)
        let x = buf[i] + (ch === 0 ? this.fbL : this.fbR) * fb
        const o = ch * 6
        for (let st = 0; st < 6; st++) {
          const yv = -a * x + this.x[o + st] + a * this.y[o + st]
          this.x[o + st] = x
          this.y[o + st] = yv
          x = yv
        }
        if (ch === 0) this.fbL = x; else this.fbR = x
        buf[i] = buf[i] + (0.5 * (buf[i] + x) - buf[i]) * mix
      }
    }
  }
}

// --- Chorus -----------------------------------------------------------------

class ChorusFx {
  constructor(sr) {
    this.sr = sr
    this.dl = new DelayLine(Math.ceil(sr * 0.06))
    this.dr = new DelayLine(Math.ceil(sr * 0.06))
    this.phase = 0
    this.lpL = 0; this.lpR = 0
  }
  process(L, R, n, V) {
    const sr = this.sr
    const inc = V('cho_rate') / sr
    const depth = V('cho_depth')
    const baseMs = V('cho_delay')
    const fb = V('cho_feedback')
    const lpc = onePole(V('cho_lpf'), sr)
    const mix = V('cho_mix')
    const base = baseMs * 0.001 * sr
    const dep = depth * 0.004 * sr
    for (let i = 0; i < n; i++) {
      let ph = this.phase + inc
      ph -= Math.floor(ph)
      this.phase = ph
      const s1 = Math.sin(ph * TWO_PI)
      const c1 = Math.cos(ph * TWO_PI)
      const wl = this.dl.read(base + dep * (1 + s1) * 0.5) + this.dl.read(base * 1.7 + dep * (1 + c1) * 0.5)
      const wr = this.dr.read(base + dep * (1 - s1) * 0.5) + this.dr.read(base * 1.7 + dep * (1 - c1) * 0.5)
      this.lpL += lpc * (wl * 0.5 - this.lpL)
      this.lpR += lpc * (wr * 0.5 - this.lpR)
      this.dl.write(L[i] + this.lpL * fb)
      this.dr.write(R[i] + this.lpR * fb)
      L[i] = L[i] + (this.lpL - L[i] * 0.0) * mix
      R[i] = R[i] + (this.lpR - R[i] * 0.0) * mix
    }
  }
}

// --- Delay ------------------------------------------------------------------

class DelayFx {
  constructor(sr) {
    this.sr = sr
    this.dl = new DelayLine(Math.ceil(sr * 4))
    this.dr = new DelayLine(Math.ceil(sr * 4))
    this.time = sr * 0.3
    this.hpL = 0; this.hpR = 0
    this.lpL = 0; this.lpR = 0
  }
  process(L, R, n, V) {
    const sr = this.sr
    let target
    if (V('dly_sync') > 0.5) {
      const beats = SYNC_BEATS[V('dly_div') | 0]
      target = beats * (60 / V('bpm')) * sr
    } else {
      target = V('dly_time') * 0.001 * sr
    }
    if (target > sr * 3.9) target = sr * 3.9
    const mode = V('dly_mode') | 0
    const fb = V('dly_feedback')
    const hpc = onePole(V('dly_hp'), sr)
    const lpc = onePole(V('dly_lp'), sr)
    const mix = V('dly_mix')
    const slew = 1 - Math.exp(-1 / (0.05 * sr))
    for (let i = 0; i < n; i++) {
      this.time += (target - this.time) * slew
      const tl = mode === 1 ? this.time : this.time
      const rl = this.dl.read(tl)
      const rr = this.dr.read(this.time)
      // feedback filtering (lowcut + highcut)
      this.hpL += hpc * (rl - this.hpL)
      this.hpR += hpc * (rr - this.hpR)
      let fl = rl - this.hpL
      let fr = rr - this.hpR
      this.lpL += lpc * (fl - this.lpL)
      this.lpR += lpc * (fr - this.lpR)
      fl = this.lpL
      fr = this.lpR
      if (mode === 1) {
        const mono = (L[i] + R[i]) * 0.5
        this.dl.write(mono + fr * fb)
        this.dr.write(fl * fb)
      } else {
        this.dl.write(L[i] + fl * fb)
        this.dr.write(R[i] + fr * fb)
      }
      L[i] = L[i] + (rl - L[i] * 0) * mix
      R[i] = R[i] + (rr - R[i] * 0) * mix
    }
  }
}

// --- Compressor -------------------------------------------------------------

class CompFx {
  constructor(sr) {
    this.sr = sr
    this.env = 0
    this.bandEnv = new Float64Array(3)
    // crossover filters (per channel): low LP, mid HP+LP, high HP
    this.xover = []
    for (let i = 0; i < 8; i++) this.xover.push(new Biquad())
    this.xoverSet = false
    this.bands = [new Float32Array(128), new Float32Array(128), new Float32Array(128)]
    this.bandsR = [new Float32Array(128), new Float32Array(128), new Float32Array(128)]
  }
  gainDb(levelDb, thresh, ratio, multiband) {
    let g = 0
    if (levelDb > thresh) g = (thresh - levelDb) * (1 - 1 / ratio)
    else if (multiband) {
      g = (thresh - levelDb) * 0.35 * (1 - 1 / ratio)
      if (g > 14) g = 14
    }
    return g
  }
  process(L, R, n, V) {
    const sr = this.sr
    const thresh = V('cmp_thresh')
    const ratio = V('cmp_ratio')
    const attC = 1 - Math.exp(-1 / (V('cmp_att') * 0.001 * sr))
    const relC = 1 - Math.exp(-1 / (V('cmp_rel') * 0.001 * sr))
    const makeup = dbToLin(V('cmp_gain'))
    const mb = V('cmp_multiband') > 0.5
    const mix = V('cmp_mix')
    if (!mb) {
      for (let i = 0; i < n; i++) {
        const a = Math.max(Math.abs(L[i]), Math.abs(R[i]))
        const c = a > this.env ? attC : relC
        this.env += (a - this.env) * c
        const lvlDb = 20 * Math.log10(this.env + 1e-7)
        const g = dbToLin(this.gainDb(lvlDb, thresh, ratio, false)) * makeup
        L[i] = L[i] + (L[i] * g - L[i]) * mix
        R[i] = R[i] + (R[i] * g - R[i]) * mix
      }
      return
    }
    // multiband (OTT-style): split at 240 Hz and 2400 Hz
    if (!this.xoverSet) {
      this.xover[0].setButterLP(240, sr); this.xover[1].setButterLP(240, sr)   // low L,R
      this.xover[2].setButterHP(240, sr); this.xover[3].setButterHP(240, sr)   // mid-high L,R
      this.xover[4].setButterLP(2400, sr); this.xover[5].setButterLP(2400, sr) // mid L,R
      this.xover[6].setButterHP(2400, sr); this.xover[7].setButterHP(2400, sr) // high L,R
      this.xoverSet = true
    }
    const b = this.bands
    const br = this.bandsR
    for (let i = 0; i < n; i++) {
      b[0][i] = this.xover[0].run(L[i])
      br[0][i] = this.xover[1].run(R[i])
      const mhL = this.xover[2].run(L[i])
      const mhR = this.xover[3].run(R[i])
      b[1][i] = this.xover[4].run(mhL)
      br[1][i] = this.xover[5].run(mhR)
      b[2][i] = this.xover[6].run(mhL)
      br[2][i] = this.xover[7].run(mhR)
    }
    for (let i = 0; i < n; i++) {
      let outL = 0
      let outR = 0
      for (let k = 0; k < 3; k++) {
        const a = Math.max(Math.abs(b[k][i]), Math.abs(br[k][i]))
        const c = a > this.bandEnv[k] ? attC : relC
        this.bandEnv[k] += (a - this.bandEnv[k]) * c
        const lvlDb = 20 * Math.log10(this.bandEnv[k] + 1e-7)
        const g = dbToLin(this.gainDb(lvlDb, thresh, ratio, true))
        outL += b[k][i] * g
        outR += br[k][i] * g
      }
      L[i] = L[i] + (outL * makeup - L[i]) * mix
      R[i] = R[i] + (outR * makeup - R[i]) * mix
    }
  }
}

// --- Reverb -----------------------------------------------------------------

const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const AP_TUNING = [225, 556, 441, 341]

class ReverbFx {
  constructor(sr) {
    this.sr = sr
    const scale = sr / 44100
    this.combsL = []
    this.combsR = []
    this.combLpL = new Float64Array(8)
    this.combLpR = new Float64Array(8)
    for (let i = 0; i < 8; i++) {
      this.combsL.push(new DelayLine(Math.ceil(COMB_TUNING[i] * 1.4 * scale) + 8))
      this.combsR.push(new DelayLine(Math.ceil((COMB_TUNING[i] + 23) * 1.4 * scale) + 8))
    }
    this.apL = AP_TUNING.map(t => new DelayLine(Math.ceil(t * 1.4 * scale) + 8))
    this.apR = AP_TUNING.map(t => new DelayLine(Math.ceil((t + 19) * 1.4 * scale) + 8))
    this.pre = new DelayLine(Math.ceil(sr * 0.25))
    this.preR = new DelayLine(Math.ceil(sr * 0.25))
  }
  allpass(dl, x, d) {
    const bo = dl.read(d)
    const y = -x + bo
    dl.write(x + bo * 0.5)
    return y
  }
  process(L, R, n, V) {
    const sr = this.sr
    const scale = sr / 44100
    const plate = (V('rev_mode') | 0) === 1
    const size = V('rev_size')
    const preD = Math.max(1, V('rev_predelay') * 0.001 * sr)
    const decay = V('rev_decay')
    const damp = V('rev_damp') * (plate ? 0.45 : 0.8) + 0.05
    const width = V('rev_width')
    const mix = V('rev_mix')
    const lenScale = (plate ? 0.45 : 0.7) + (plate ? 0.45 : 0.7) * size
    const fbg = 0.7 + 0.28 * decay
    for (let i = 0; i < n; i++) {
      this.pre.write((L[i] + R[i]) * 0.5)
      const x = this.pre.read(preD) * 0.4
      let wl = 0
      let wr = 0
      for (let k = 0; k < 8; k++) {
        const dlen = COMB_TUNING[k] * lenScale * scale
        const drlen = (COMB_TUNING[k] + 23) * lenScale * scale
        const ol = this.combsL[k].read(dlen)
        this.combLpL[k] += damp * (ol - this.combLpL[k])
        this.combsL[k].write(x + this.combLpL[k] * fbg)
        wl += ol
        const or_ = this.combsR[k].read(drlen)
        this.combLpR[k] += damp * (or_ - this.combLpR[k])
        this.combsR[k].write(x + this.combLpR[k] * fbg)
        wr += or_
      }
      wl *= 0.125
      wr *= 0.125
      const nap = plate ? 4 : 3
      for (let k = 0; k < nap; k++) {
        wl = this.allpass(this.apL[k], wl, AP_TUNING[k] * lenScale * scale)
        wr = this.allpass(this.apR[k], wr, (AP_TUNING[k] + 19) * lenScale * scale)
      }
      // width via mid/side
      const mid = (wl + wr) * 0.5
      const side = (wl - wr) * 0.5 * width
      wl = mid + side
      wr = mid - side
      L[i] = L[i] + (wl - L[i] * 0) * mix
      R[i] = R[i] + (wr - R[i] * 0) * mix
    }
  }
}

// --- EQ ----------------------------------------------------------------------

class EqFx {
  constructor(sr) {
    this.sr = sr
    this.b = [new Biquad(), new Biquad(), new Biquad(), new Biquad()]
    this.lastKey = ''
  }
  process(L, R, n, V) {
    const f1 = V('eq_f1'); const q1 = V('eq_q1'); const g1 = V('eq_g1'); const t1 = V('eq_t1') | 0
    const f2 = V('eq_f2'); const q2 = V('eq_q2'); const g2 = V('eq_g2'); const t2 = V('eq_t2') | 0
    const key = `${f1}|${q1}|${g1}|${t1}|${f2}|${q2}|${g2}|${t2}`
    if (key !== this.lastKey) {
      this.lastKey = key
      if (t1 === 0) { this.b[0].setShelf(f1, g1, this.sr, false); this.b[1].setShelf(f1, g1, this.sr, false) }
      else { this.b[0].setPeak(f1, q1, g1, this.sr); this.b[1].setPeak(f1, q1, g1, this.sr) }
      if (t2 === 0) { this.b[2].setShelf(f2, g2, this.sr, true); this.b[3].setShelf(f2, g2, this.sr, true) }
      else { this.b[2].setPeak(f2, q2, g2, this.sr); this.b[3].setPeak(f2, q2, g2, this.sr) }
    }
    for (let i = 0; i < n; i++) {
      L[i] = this.b[2].run(this.b[0].run(L[i]))
      R[i] = this.b[3].run(this.b[1].run(R[i]))
    }
  }
}

// --- FX Filter -----------------------------------------------------------------

class FfxFx {
  constructor(sr) {
    this.filter = new StereoFilter(sr)
  }
  process(L, R, n, V) {
    this.filter.process(L, R, 0, n, V('ffx_type') | 0, V('ffx_cutoff'), V('ffx_res'), V('ffx_drive'), 0, V('ffx_mix'))
  }
}

// --- Chain ----------------------------------------------------------------------

export class FxChain {
  constructor(sr) {
    this.units = {
      hyper: new HyperFx(sr),
      dist: new DistFx(sr),
      flanger: new FlangerFx(sr),
      phaser: new PhaserFx(sr),
      chorus: new ChorusFx(sr),
      delay: new DelayFx(sr),
      comp: new CompFx(sr),
      reverb: new ReverbFx(sr),
      eq: new EqFx(sr),
      ffx: new FfxFx(sr),
    }
  }
  process(L, R, n, order, V, oversample) {
    for (let i = 0; i < order.length; i++) {
      const id = order[i]
      if (V(`${FX_PREFIX[id]}_on`) < 0.5) continue
      if (id === 'dist') this.units.dist.process(L, R, n, V, oversample)
      else this.units[id].process(L, R, n, V)
    }
  }
}

export const FX_PREFIX = {
  hyper: 'hyp', dist: 'dist', flanger: 'flg', phaser: 'phs', chorus: 'cho',
  delay: 'dly', comp: 'cmp', reverb: 'rev', eq: 'eq', ffx: 'ffx',
}
