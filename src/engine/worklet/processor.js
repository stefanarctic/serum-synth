// Main AudioWorklet processor: voice management, parameter state,
// global mod context for FX, and the FX chain.

/* global sampleRate, AudioWorkletProcessor, registerProcessor */

import {
  PARAMS, PARAM_INDEX, mapParam, defaultNorm, MOD_SOURCES, SYNC_BEATS,
  FX_IDS, defaultLfoPoints,
} from '../params.js'
import { Voice, CTRL, LFO_IDX, SRC, NUM_SOURCES } from './voice.js'
import { FxChain } from './fx.js'

const NP = PARAMS.length
const MAX_VOICES = 32
const PI = PARAM_INDEX

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.baseNorm = new Float32Array(NP)
    this.baseValue = new Float64Array(NP)
    for (let i = 0; i < NP; i++) {
      this.baseNorm[i] = defaultNorm(PARAMS[i])
      this.baseValue[i] = mapParam(PARAMS[i], this.baseNorm[i])
    }
    this.targeted = new Uint8Array(NP)
    this.targetIdxList = []
    this.matrix = []

    this.voices = []
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate))
    this.voiceSerial = 0
    this.heldNotes = [] // for mono/legato note stacking
    this.lastVoice = null
    this.lastNote = 60

    this.lfoShapes = []
    this.lfoGlobalPhases = new Float64Array(8)
    for (let i = 0; i < 8; i++) this.lfoShapes.push(defaultLfoPoints())

    this.tableA = null
    this.tableB = null
    this.noiseTable = null

    this.fx = new FxChain(sampleRate)
    this.fxOrder = [...FX_IDS]
    this.fxModNorm = new Float32Array(NP)
    this.fxSrcVals = new Float32Array(NUM_SOURCES)
    this.fxV = (id) => {
      const idx = PI[id]
      if (this.targeted[idx]) {
        let n = this.baseNorm[idx] + this.fxModNorm[idx]
        if (n < 0) n = 0; else if (n > 1) n = 1
        return mapParam(PARAMS[idx], n)
      }
      return this.baseValue[idx]
    }

    this.pitchbend = 0
    this.modwheel = 0
    this.aftertouch = 0

    this.masterGain = this.baseValue[PI.master_vol]
    this.meterCounter = 0
    this.peakL = 0
    this.peakR = 0

    this.port.onmessage = (e) => this.handleMessage(e.data)
  }

  bv(idx) { return this.baseValue[idx] }

  lfoFreq(i, bpm) {
    const L = LFO_IDX[i]
    if (this.baseValue[L.sync] > 0.5) {
      const beats = SYNC_BEATS[this.baseValue[L.div] | 0]
      return 1 / (beats * 60 / bpm)
    }
    return this.baseValue[L.rate]
  }

  handleMessage(m) {
    switch (m.type) {
      case 'param': {
        const idx = PI[m.id]
        if (idx == null) return
        this.baseNorm[idx] = m.v
        this.baseValue[idx] = mapParam(PARAMS[idx], m.v)
        break
      }
      case 'params': {
        for (const [id, v] of m.entries) {
          const idx = PI[id]
          if (idx == null) continue
          this.baseNorm[idx] = v
          this.baseValue[idx] = mapParam(PARAMS[idx], v)
        }
        break
      }
      case 'note_on': this.noteOn(m.note, m.vel); break
      case 'note_off': this.noteOff(m.note); break
      case 'all_off':
        for (const v of this.voices) if (v.active) v.noteOff()
        this.heldNotes.length = 0
        break
      case 'panic':
        for (const v of this.voices) v.kill()
        this.heldNotes.length = 0
        break
      case 'pitch_bend': this.pitchbend = m.v; break
      case 'mod_wheel': this.modwheel = m.v; break
      case 'aftertouch': this.aftertouch = m.v; break
      case 'wavetable': {
        const table = {
          frames: m.frames,
          levels: m.levels.map(l => ({ size: l.size, mh: l.mh, data: new Float32Array(l.buf) })),
        }
        if (m.slot === 'a') this.tableA = table
        else this.tableB = table
        break
      }
      case 'noise_table':
        this.noiseTable = new Float32Array(m.buf)
        break
      case 'lfo_shape':
        this.lfoShapes[m.index] = m.points
        break
      case 'matrix': {
        this.matrix = m.slots
          .filter(s => s.source && s.target != null && PI[s.target] != null && PARAMS[PI[s.target]].mod)
          .map(s => ({
            srcIdx: MOD_SOURCES.indexOf(s.source),
            target: PI[s.target],
            amount: s.amount,
            bipolar: !!s.bipolar,
            auxIdx: s.aux ? MOD_SOURCES.indexOf(s.aux) : -1,
            auxAmt: s.auxAmt != null ? s.auxAmt : 1,
          }))
          .filter(s => s.srcIdx >= 0)
        this.targeted.fill(0)
        this.targetIdxList = []
        for (const s of this.matrix) {
          if (!this.targeted[s.target]) {
            this.targeted[s.target] = 1
            this.targetIdxList.push(s.target)
          }
        }
        break
      }
      case 'fx_order':
        this.fxOrder = m.order
        break
    }
  }

  noteOn(note, vel) {
    const mono = this.bv(PI.mono) > 0.5
    const legato = this.bv(PI.legato) > 0.5
    const portaAlways = this.bv(PI.porta_always) > 0.5
    if (mono) {
      const v = this.voices[0]
      const wasHeld = this.heldNotes.length > 0
      this.heldNotes.push(note)
      const retrig = !(legato && wasHeld && v.active)
      const glideFrom = v.active ? v.glideNote : (portaAlways ? this.lastNote : null)
      if (!retrig) {
        // legato: just change pitch, keep envelopes running
        v.note = note
        v.glideTime = this.bv(PI.porta_time)
        if (v.glideTime <= 0.001) v.glideNote = note
      } else {
        v.noteOn(note, vel, this, glideFrom, true)
        v.serial = ++this.voiceSerial
      }
      this.lastVoice = v
      this.lastNote = note
      return
    }
    const poly = this.bv(PI.poly) | 0
    // find a free voice
    let v = null
    let count = 0
    for (const c of this.voices) if (c.active) count++
    for (const c of this.voices) {
      if (!c.active && !c.fading) { v = c; break }
    }
    if (v == null || count >= poly) {
      // steal: prefer oldest releasing voice, else oldest
      let best = null
      for (const c of this.voices) {
        if (!c.active) continue
        if (best == null) { best = c; continue }
        const cRel = c.envs[0].releasing
        const bRel = best.envs[0].releasing
        if (cRel !== bRel) { if (cRel) best = c; continue }
        if (c.serial < best.serial) best = c
      }
      v = best || this.voices[0]
      v.kill()
    }
    const glideFrom = (this.bv(PI.porta_time) > 0.001 && (portaAlways || count > 0)) ? this.lastNote : null
    v.noteOn(note, vel, this, glideFrom, true)
    v.serial = ++this.voiceSerial
    this.lastVoice = v
    this.lastNote = note
  }

  noteOff(note) {
    const mono = this.bv(PI.mono) > 0.5
    if (mono) {
      const idx = this.heldNotes.lastIndexOf(note)
      if (idx >= 0) this.heldNotes.splice(idx, 1)
      const v = this.voices[0]
      if (this.heldNotes.length > 0) {
        // return to previous held note
        const prev = this.heldNotes[this.heldNotes.length - 1]
        v.note = prev
        v.glideTime = this.bv(PI.porta_time)
        if (v.glideTime <= 0.001) v.glideNote = prev
      } else if (v.active && v.note === note) {
        v.noteOff()
      }
      return
    }
    for (const v of this.voices) {
      if (v.active && v.gate && v.note === note) v.noteOff()
    }
  }

  updateFxModContext() {
    if (this.matrix.length === 0) return
    const s = this.fxSrcVals
    const lv = this.lastVoice
    if (lv && lv.active) {
      s.set(lv.srcVals)
    } else {
      for (let i = 0; i < 12; i++) s[i] = 0
      s[SRC.velocity] = 0
      s[SRC.note] = this.lastNote / 127
      s[SRC.random] = 0
    }
    s[SRC.modwheel] = this.modwheel
    s[SRC.aftertouch] = this.aftertouch
    s[SRC.macro1] = this.baseNorm[PI.macro1]
    s[SRC.macro2] = this.baseNorm[PI.macro2]
    s[SRC.macro3] = this.baseNorm[PI.macro3]
    s[SRC.macro4] = this.baseNorm[PI.macro4]
    const tl = this.targetIdxList
    for (let i = 0; i < tl.length; i++) this.fxModNorm[tl[i]] = 0
    for (let i = 0; i < this.matrix.length; i++) {
      const m = this.matrix[i]
      let sv = s[m.srcIdx]
      if (m.bipolar) sv = sv * 2 - 1
      if (m.auxIdx >= 0) sv *= s[m.auxIdx] * m.auxAmt + (1 - m.auxAmt)
      this.fxModNorm[m.target] += sv * m.amount
    }
  }

  process(inputs, outputs) {
    const out = outputs[0]
    const L = out[0]
    const R = out[1] || out[0]
    const blockLen = L.length
    L.fill(0)
    R.fill(0)

    const bpm = this.bv(PI.bpm)
    const dt = CTRL / sampleRate

    for (let off = 0; off + CTRL <= blockLen; off += CTRL) {
      // advance free-running LFO phases
      for (let i = 0; i < 8; i++) {
        let ph = this.lfoGlobalPhases[i] + dt * this.lfoFreq(i, bpm)
        ph -= Math.floor(ph)
        this.lfoGlobalPhases[i] = ph
      }
      for (const v of this.voices) {
        if (!v.active) continue
        v.updateControl(this)
        v.render(L, R, off, this)
      }
    }

    // FX chain (global)
    this.updateFxModContext()
    this.fx.process(L, R, blockLen, this.fxOrder, this.fxV, this.bv(PI.oversample) > 0.5)

    // master volume (smoothed) + safety clamp
    const targetGain = this.baseValue[PI.master_vol]
    let g = this.masterGain
    const gk = 1 - Math.exp(-blockLen / (0.02 * sampleRate))
    g += (targetGain - g) * gk
    this.masterGain = g
    const gg = g * g // perceptual-ish taper
    let pl = this.peakL
    let pr = this.peakR
    for (let i = 0; i < blockLen; i++) {
      let l = L[i] * gg
      let r = R[i] * gg
      if (l > 1.4) l = 1.4; else if (l < -1.4) l = -1.4
      if (r > 1.4) r = 1.4; else if (r < -1.4) r = -1.4
      L[i] = l
      R[i] = r
      const al = l < 0 ? -l : l
      const ar = r < 0 ? -r : r
      if (al > pl) pl = al
      if (ar > pr) pr = ar
    }
    this.peakL = pl
    this.peakR = pr

    // meters ~ every 4 blocks
    if (++this.meterCounter >= 4) {
      this.meterCounter = 0
      let vc = 0
      for (const v of this.voices) if (v.active) vc++
      this.port.postMessage({ type: 'meters', l: this.peakL, r: this.peakR, voices: vc })
      this.peakL = 0
      this.peakR = 0
    }
    return true
  }
}

registerProcessor('serum-synth', SynthProcessor)
