// A single synth voice: 2 wavetable oscillators (warp + unison), sub osc,
// noise osc, multi-mode filter, 4 envelopes, 8 LFOs, per-voice mod matrix.

import { PARAMS, PARAM_INDEX, mapParam, MOD_SOURCES } from '../params.js'
import { Envelope, Lfo } from './mod.js'
import { StereoFilter } from './filter.js'

export const CTRL = 64 // control tick size in samples
const MAX_UNI = 16
const NP = PARAMS.length

const PI = { ...PARAM_INDEX }
export function pi(id) { return PI[id] }

// Pre-resolve frequently used param indices for both oscillators.
function oscIdx(o) {
  return {
    on: PI[`osc${o}_on`], oct: PI[`osc${o}_oct`], semi: PI[`osc${o}_semi`],
    fine: PI[`osc${o}_fine`], unison: PI[`osc${o}_unison`], detune: PI[`osc${o}_detune`],
    blend: PI[`osc${o}_blend`], width: PI[`osc${o}_width`], phase: PI[`osc${o}_phase`],
    rand: PI[`osc${o}_rand`], wtpos: PI[`osc${o}_wtpos`], warpmode: PI[`osc${o}_warpmode`],
    warp: PI[`osc${o}_warp`], pan: PI[`osc${o}_pan`], level: PI[`osc${o}_level`],
  }
}
export const OSC_A = oscIdx('a')
export const OSC_B = oscIdx('b')

const ENV_IDX = []
for (let i = 1; i <= 4; i++) {
  ENV_IDX.push({
    att: PI[`env${i}_att`], hold: PI[`env${i}_hold`], dec: PI[`env${i}_dec`],
    sus: PI[`env${i}_sus`], rel: PI[`env${i}_rel`], attcrv: PI[`env${i}_attcrv`],
    deccrv: PI[`env${i}_deccrv`], relcrv: PI[`env${i}_relcrv`],
  })
}
const LFO_IDX = []
for (let i = 1; i <= 8; i++) {
  LFO_IDX.push({
    rate: PI[`lfo${i}_rate`], sync: PI[`lfo${i}_sync`], div: PI[`lfo${i}_div`],
    mode: PI[`lfo${i}_mode`], delay: PI[`lfo${i}_delay`], rise: PI[`lfo${i}_rise`],
    smooth: PI[`lfo${i}_smooth`],
  })
}
export { ENV_IDX, LFO_IDX }

export const NUM_SOURCES = MOD_SOURCES.length
export const SRC = {}
MOD_SOURCES.forEach((s, i) => { SRC[s] = i })

class OscState {
  constructor() {
    this.phases = new Float64Array(MAX_UNI)
    this.incs = new Float64Array(MAX_UNI)
    this.gainsL = new Float32Array(MAX_UNI)
    this.gainsR = new Float32Array(MAX_UNI)
    this.mips = new Int32Array(MAX_UNI)
    this.n = 1
    this.prevWtPos = 0
    this.prevLevel = 0
  }
}

export class Voice {
  constructor(sampleRate) {
    this.sr = sampleRate
    this.active = false
    this.note = 60
    this.glideNote = 60
    this.glideTime = 0
    this.vel = 1
    this.gate = false
    this.age = 0
    this.random = 0
    this.serial = 0
    this.envs = [new Envelope(), new Envelope(), new Envelope(), new Envelope()]
    this.lfos = [new Lfo(), new Lfo(), new Lfo(), new Lfo(), new Lfo(), new Lfo(), new Lfo(), new Lfo()]
    this.filter = new StereoFilter(sampleRate)
    this.oscA = new OscState()
    this.oscB = new OscState()
    this.subPhase = 0
    this.subLp = 0
    this.noisePos = 0
    this.noiseDone = false
    this.modNorm = new Float32Array(NP)
    this.pval = new Float64Array(NP)
    this.srcVals = new Float32Array(NUM_SOURCES)
    this.monoA = new Float32Array(CTRL)
    this.monoB = new Float32Array(CTRL)
    this.fIn = new Float32Array(CTRL * 2)   // filter-routed mix L,R
    this.dIn = new Float32Array(CTRL * 2)   // direct mix L,R
    this.prevAmp = 0
    this.fading = false
    this.fadeGain = 1
  }

  noteOn(note, vel, P, glideFrom, retrigger) {
    this.note = note
    this.vel = vel
    this.gate = true
    this.active = true
    this.age = 0
    this.fading = false
    this.fadeGain = 1
    const portaTime = P.bv(PI.porta_time)
    if (glideFrom != null && portaTime > 0.001) {
      if (retrigger || !this.activeBefore) this.glideNote = glideFrom
      this.glideTime = portaTime
    } else {
      this.glideNote = note
      this.glideTime = 0
    }
    this.random = Math.random()
    if (retrigger) {
      this.prevAmp = this.envs[0].value
      for (const e of this.envs) e.trigger()
      for (let i = 0; i < 8; i++) {
        if (P.bv(LFO_IDX[i].mode) !== 2) this.lfos[i].trigger()
      }
      // reset oscillator phases
      this.initPhases(this.oscA, OSC_A, P)
      this.initPhases(this.oscB, OSC_B, P)
      this.subPhase = 0
      this.subLp = 0
      const noiseLen = P.noiseTable ? P.noiseTable.length : 0
      this.noisePos = noiseLen * P.bv(PI.noise_rand) * Math.random()
      this.noiseDone = false
      this.filter.reset()
    }
    this.activeBefore = true
  }

  initPhases(st, O, P) {
    const basePhase = P.bv(O.phase)
    const rand = P.bv(O.rand)
    for (let u = 0; u < MAX_UNI; u++) {
      st.phases[u] = (basePhase + rand * Math.random()) % 1
    }
  }

  noteOff() {
    this.gate = false
    for (const e of this.envs) e.release()
  }

  kill() {
    this.active = false
    this.activeBefore = false
    for (const e of this.envs) e.kill()
  }

  // Begin a quick fade-out so the voice can be stolen without a click.
  beginSteal() {
    this.fading = true
  }

  // value of a param for this voice (with per-voice modulation applied)
  v(idx, P) {
    return P.targeted[idx] ? this.pval[idx] : P.baseValue[idx]
  }

  // --- control tick -------------------------------------------------------

  updateControl(P) {
    const dt = CTRL / this.sr
    this.age += dt

    // glide
    if (this.glideTime > 0.001 && this.glideNote !== this.note) {
      const k = 1 - Math.exp(-dt / (this.glideTime * 0.35))
      this.glideNote += (this.note - this.glideNote) * k
      if (Math.abs(this.glideNote - this.note) < 0.001) this.glideNote = this.note
    } else {
      this.glideNote = this.note
    }

    // envelopes (use base values; env params modulation not supported per-voice)
    for (let i = 0; i < 4; i++) {
      const E = ENV_IDX[i]
      this.envs[i].tick(dt,
        P.bv(E.att), P.bv(E.hold), P.bv(E.dec), P.bv(E.sus), P.bv(E.rel),
        P.bv(E.attcrv), P.bv(E.deccrv), P.bv(E.relcrv))
    }

    // LFOs
    const bpm = P.bv(PI.bpm)
    for (let i = 0; i < 8; i++) {
      const L = LFO_IDX[i]
      const freq = P.lfoFreq(i, bpm)
      this.lfos[i].tick(dt, freq, P.bv(L.mode), P.bv(L.delay), P.bv(L.rise),
        P.bv(L.smooth), P.lfoShapes[i], P.lfoGlobalPhases[i])
    }

    // source values
    const s = this.srcVals
    for (let i = 0; i < 4; i++) s[i] = this.envs[i].value
    for (let i = 0; i < 8; i++) s[4 + i] = this.lfos[i].out
    s[SRC.velocity] = this.vel
    s[SRC.note] = this.glideNote / 127
    s[SRC.modwheel] = P.modwheel
    s[SRC.aftertouch] = P.aftertouch
    s[SRC.random] = this.random
    s[SRC.macro1] = P.baseNorm[PI.macro1]
    s[SRC.macro2] = P.baseNorm[PI.macro2]
    s[SRC.macro3] = P.baseNorm[PI.macro3]
    s[SRC.macro4] = P.baseNorm[PI.macro4]

    // mod matrix accumulation
    const tl = P.targetIdxList
    for (let i = 0; i < tl.length; i++) this.modNorm[tl[i]] = 0
    const mx = P.matrix
    for (let i = 0; i < mx.length; i++) {
      const m = mx[i]
      let sv = s[m.srcIdx]
      if (m.bipolar) sv = sv * 2 - 1
      if (m.auxIdx >= 0) sv *= s[m.auxIdx] * m.auxAmt + (1 - m.auxAmt)
      this.modNorm[m.target] += sv * m.amount
    }
    for (let i = 0; i < tl.length; i++) {
      const idx = tl[i]
      let n = P.baseNorm[idx] + this.modNorm[idx]
      if (n < 0) n = 0; else if (n > 1) n = 1
      this.pval[idx] = mapParam(PARAMS[idx], n)
    }
  }

  // --- render -------------------------------------------------------------

  // Render CTRL samples and add into out buffers at offset.
  render(outL, outR, offset, P) {
    const n = CTRL
    const fIn = this.fIn
    const dIn = this.dIn
    fIn.fill(0)
    dIn.fill(0)

    const bend = P.pitchbend * P.bv(PI.bend_range)
    const baseNote = this.glideNote + bend

    // osc B first (so osc A FM/AM/RM can use this tick's B signal)
    const bOn = P.bv(OSC_B.on) > 0.5
    const aOn = P.bv(OSC_A.on) > 0.5
    this.monoB.fill(0)
    if (bOn) {
      const dst = P.bv(pi('flt_b')) > 0.5 ? fIn : dIn
      this.renderOsc(this.oscB, OSC_B, P.tableB, baseNote, dst, this.monoB, this.monoA, P)
    }
    this.monoA.fill(0)
    if (aOn) {
      const dst = P.bv(pi('flt_a')) > 0.5 ? fIn : dIn
      this.renderOsc(this.oscA, OSC_A, P.tableA, baseNote, dst, this.monoA, this.monoB, P)
    }

    if (P.bv(pi('sub_on')) > 0.5) {
      const dst = P.bv(pi('flt_sub')) > 0.5 ? fIn : dIn
      this.renderSub(baseNote, dst, P)
    }
    if (P.bv(pi('noise_on')) > 0.5 && P.noiseTable) {
      const dst = P.bv(pi('flt_noise')) > 0.5 ? fIn : dIn
      this.renderNoise(baseNote, dst, P)
    }

    // filter
    if (P.bv(pi('flt_on')) > 0.5) {
      const keytrk = this.v(pi('flt_keytrk'), P)
      let cutoff = this.v(pi('flt_cutoff'), P)
      if (keytrk > 0.001) cutoff *= Math.pow(2, (baseNote - 60) * keytrk / 12)
      // fIn is [L(0..n), R(n..2n)]
      this.filter.processSplit(fIn, n,
        P.bv(pi('flt_type')), cutoff,
        this.v(pi('flt_res'), P), this.v(pi('flt_drive'), P),
        this.v(pi('flt_fat'), P), this.v(pi('flt_mix'), P))
    }

    // amp env (env1) with linear ramp across tick + steal fade
    const amp = this.envs[0].value
    const a0 = this.prevAmp
    const da = (amp - a0) / n
    this.prevAmp = amp
    if (this.fading) {
      const fadeStep = 1 / n
      for (let i = 0; i < n; i++) {
        const g = (a0 + da * i) * this.fadeGain
        this.fadeGain -= fadeStep
        if (this.fadeGain < 0) this.fadeGain = 0
        outL[offset + i] += (fIn[i] + dIn[i]) * g
        outR[offset + i] += (fIn[n + i] + dIn[n + i]) * g
      }
      if (this.fadeGain <= 0) this.kill()
    } else {
      for (let i = 0; i < n; i++) {
        const g = a0 + da * i
        outL[offset + i] += (fIn[i] + dIn[i]) * g
        outR[offset + i] += (fIn[n + i] + dIn[n + i]) * g
      }
    }

    if (!this.envs[0].active) this.active = false
  }

  renderOsc(st, O, table, baseNote, dst, monoOut, otherMono, P) {
    if (!table) return
    const n = CTRL
    const sr = this.sr
    const semis = this.v(O.oct, P) * 12 + this.v(O.semi, P) + this.v(O.fine, P)
    const freq = 440 * Math.pow(2, (baseNote + semis - 69) / 12)
    const baseInc = freq / sr
    if (baseInc <= 0 || baseInc >= 0.5) return

    const uni = Math.round(this.v(O.unison, P))
    const detune = this.v(O.detune, P)
    const blend = this.v(O.blend, P)
    const width = this.v(O.width, P)
    const level = this.v(O.level, P)
    const pan = this.v(O.pan, P)
    const warpMode = P.bv(O.warpmode)
    const warp = this.v(O.warp, P)
    const wtpos = this.v(O.wtpos, P)

    // unison setup
    st.n = uni
    let gSum = 0
    for (let u = 0; u < uni; u++) {
      const off = uni === 1 ? 0 : (u / (uni - 1)) * 2 - 1 // -1..1
      const shaped = Math.sign(off) * Math.pow(Math.abs(off), 1.2)
      st.incs[u] = baseInc * Math.pow(2, shaped * detune / 12)
      const g = Math.abs(off) < 0.01 ? 1 : blend
      const panU = off * width
      // overall osc pan combined with unison spread (equal power)
      let pp = panU + pan
      if (pp < -1) pp = -1; else if (pp > 1) pp = 1
      const ang = (pp + 1) * Math.PI / 4
      st.gainsL[u] = g * Math.cos(ang)
      st.gainsR[u] = g * Math.sin(ang)
      gSum += g * g
      // mip selection
      const mh0 = table.levels[0].mh
      let k = Math.ceil(Math.log2(mh0 * st.incs[u] / 0.5))
      if (k < 0) k = 0
      if (k >= table.levels.length) k = table.levels.length - 1
      st.mips[u] = k
    }
    const norm = level * (1 / Math.sqrt(Math.max(gSum, 1e-9)))
    const monoNorm = 1 / Math.sqrt(Math.max(gSum, 1e-9))

    // frame position, interpolated across the tick
    const frames = table.frames
    const fp0 = st.prevWtPos * (frames - 1)
    const fp1 = wtpos * (frames - 1)
    st.prevWtPos = wtpos
    const dfp = (fp1 - fp0) / n

    for (let u = 0; u < uni; u++) {
      const lvl = table.levels[st.mips[u]]
      const data = lvl.data
      const size = lvl.size
      const inc = st.incs[u]
      let ph = st.phases[u]
      const gl = st.gainsL[u] * norm
      const gr = st.gainsR[u] * norm
      const gm = (st.gainsL[u] + st.gainsR[u]) * monoNorm * 0.7
      let fp = fp0
      for (let i = 0; i < n; i++) {
        let p = ph
        let ampMul = 1
        // --- warp ---
        switch (warpMode) {
          case 0: break
          case 1: { // sync
            p = p * (1 + 15 * warp)
            p -= Math.floor(p)
            break
          }
          case 2: { // bend +
            p = Math.pow(p, Math.pow(2, (warp - 0.5) * 5))
            break
          }
          case 3: { // bend -
            p = 1 - Math.pow(1 - p, Math.pow(2, (warp - 0.5) * 5))
            break
          }
          case 4: { // bend +/-
            const e = Math.pow(2, (warp - 0.5) * 5)
            p = p < 0.5 ? 0.5 * Math.pow(2 * p, e) : 1 - 0.5 * Math.pow(2 - 2 * p, e)
            break
          }
          case 5: { // pwm
            const w2 = 1 - 0.98 * Math.abs(warp - 0.5) * 2
            p = p < w2 ? p / w2 : 0.99999
            break
          }
          case 6: { // asym
            const sp = 0.02 + 0.96 * warp
            p = p < sp ? p * 0.5 / sp : 0.5 + 0.5 * (p - sp) / (1 - sp)
            break
          }
          case 7: { // flip
            if (p > warp) ampMul = -1
            break
          }
          case 8: { // mirror
            const m = 0.02 + 0.96 * warp
            p = p < m ? p / m : (1 - p) / (1 - m)
            break
          }
          case 9: { // quantize
            const steps = Math.round(Math.pow(2, 1 + 5 * (1 - warp))) + 1
            p = Math.floor(p * steps) / steps
            break
          }
          case 10: { // FM (phase mod from other osc)
            p = p + warp * warp * 2 * otherMono[i]
            p -= Math.floor(p)
            break
          }
          default: break
        }
        // --- table read with frame crossfade ---
        const f0 = fp | 0
        const ffrac = fp - f0
        const f1 = f0 + 1 < frames ? f0 + 1 : f0
        const x = p * size
        const x0 = x | 0
        const xf = x - x0
        const x1 = x0 + 1 < size ? x0 + 1 : 0
        const b0 = f0 * size
        const s0 = data[b0 + x0] + (data[b0 + x1] - data[b0 + x0]) * xf
        let smp
        if (ffrac > 0.001) {
          const b1 = f1 * size
          const s1 = data[b1 + x0] + (data[b1 + x1] - data[b1 + x0]) * xf
          smp = s0 + (s1 - s0) * ffrac
        } else {
          smp = s0
        }
        smp *= ampMul
        if (warpMode === 11) { // AM
          const o = (otherMono[i] + 1) * 0.5
          smp = smp + (smp * o - smp) * warp
        } else if (warpMode === 12) { // RM
          smp = smp + (smp * otherMono[i] - smp) * warp
        }
        dst[i] += smp * gl
        dst[n + i] += smp * gr
        monoOut[i] += smp * gm
        ph += inc
        if (ph >= 1) ph -= 1
        fp += dfp
      }
      st.phases[u] = ph
    }
  }

  renderSub(baseNote, dst, P) {
    const n = CTRL
    const sr = this.sr
    const oct = this.v(pi('sub_oct'), P)
    const freq = 440 * Math.pow(2, (baseNote + oct * 12 - 69) / 12)
    const inc = freq / sr
    if (inc <= 0 || inc >= 0.5) return
    const shape = P.bv(pi('sub_shape'))
    const level = this.v(pi('sub_level'), P)
    const pan = this.v(pi('sub_pan'), P)
    const ang = (pan + 1) * Math.PI / 4
    const gl = level * Math.cos(ang)
    const gr = level * Math.sin(ang)
    let ph = this.subPhase
    const lpCoeff = Math.min(0.99, 1 - Math.exp(-2 * Math.PI * freq * 6 / sr))
    for (let i = 0; i < n; i++) {
      let s
      switch (shape) {
        case 0: s = Math.sin(ph * 2 * Math.PI); break
        case 1: { // rounded square: polyblep square through a gentle lowpass
          s = ph < 0.5 ? 1 : -1
          s += polyblep(ph, inc) - polyblep((ph + 0.5) % 1, inc)
          this.subLp += lpCoeff * (s - this.subLp)
          s = this.subLp
          break
        }
        case 2: s = 4 * Math.abs(ph - 0.5) - 1; break
        case 3: s = 2 * ph - 1 - polyblep(ph, inc); break
        default: {
          s = ph < 0.5 ? 1 : -1
          s += polyblep(ph, inc) - polyblep((ph + 0.5) % 1, inc)
          break
        }
      }
      dst[i] += s * gl
      dst[n + i] += s * gr
      ph += inc
      if (ph >= 1) ph -= 1
    }
    this.subPhase = ph
  }

  renderNoise(baseNote, dst, P) {
    const n = CTRL
    const tbl = P.noiseTable
    const len = tbl.length
    if (this.noiseDone) return
    const pitch = this.v(pi('noise_pitch'), P)
    let rate = Math.pow(2, pitch * 2)
    if (P.bv(pi('noise_keytrack')) > 0.5) {
      rate *= Math.pow(2, (baseNote - 60) / 12)
    }
    const oneshot = P.bv(pi('noise_oneshot')) > 0.5
    const level = this.v(pi('noise_level'), P)
    const pan = this.v(pi('noise_pan'), P)
    const ang = (pan + 1) * Math.PI / 4
    const gl = level * Math.cos(ang)
    const gr = level * Math.sin(ang)
    let pos = this.noisePos
    for (let i = 0; i < n; i++) {
      const i0 = pos | 0
      const fr = pos - i0
      const i1 = i0 + 1 < len ? i0 + 1 : 0
      const s = tbl[i0] + (tbl[i1] - tbl[i0]) * fr
      dst[i] += s * gl
      dst[n + i] += s * gr
      pos += rate
      if (pos >= len) {
        if (oneshot) { this.noiseDone = true; break }
        pos -= len
      }
    }
    this.noisePos = pos
  }
}

function polyblep(t, dt) {
  if (t < dt) {
    const x = t / dt
    return x + x - x * x - 1
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}
