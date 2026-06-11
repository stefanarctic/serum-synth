// Central patch store. Holds normalized parameter values plus structured
// state (LFO shapes, mod matrix, FX order, selected wavetables/noise),
// pushes changes to the engine, and notifies React subscribers.

import { PARAMS, PARAM_INDEX, defaultNorm, defaultLfoPoints } from '../engine/params.js'
import { buildMips } from '../engine/mipmaps.js'
import { getWavetable, getWavetableLibrary } from '../content/wavetables.js'
import { getNoise } from '../content/noise.js'

export function defaultParams() {
  const o = {}
  for (const d of PARAMS) o[d.id] = defaultNorm(d)
  return o
}

export function emptyMatrixSlot() {
  return { id: cryptoId(), source: '', target: '', amount: 0.5, bipolar: false, aux: '', auxAmt: 1 }
}

let _idc = 0
function cryptoId() { return `m${Date.now().toString(36)}${(_idc++).toString(36)}` }

export class PatchStore {
  constructor(engine) {
    this.engine = engine
    this.params = defaultParams()
    this.lfoShapes = []
    for (let i = 0; i < 8; i++) this.lfoShapes.push(defaultLfoPoints())
    this.matrix = []
    this.fxOrder = ['hyper', 'dist', 'flanger', 'phaser', 'chorus', 'delay', 'comp', 'reverb', 'eq', 'ffx']
    this.wavetableA = 'Basic Shapes'
    this.wavetableB = 'Basic Shapes'
    this.noise = 'White'
    this.presetName = 'Init'

    this.paramListeners = new Map() // id -> Set
    this.structListeners = new Set() // for lfo/matrix/fx/wavetable changes
    this.version = 0
  }

  // --- engine push ---
  pushAll() {
    const entries = Object.entries(this.params)
    this.engine.setParams(entries)
    for (let i = 0; i < 8; i++) this.engine.sendLfoShape(i, this.lfoShapes[i])
    this.engine.sendMatrix(this.matrix)
    this.engine.sendFxOrder(this.fxOrder)
    this.pushWavetable('a')
    this.pushWavetable('b')
    this.pushNoise()
  }

  pushWavetable(slot) {
    const name = slot === 'a' ? this.wavetableA : this.wavetableB
    const table = getWavetable(name)
    const mips = buildMips(table)
    this.engine.sendWavetable(slot, mips)
  }

  pushNoise() {
    this.engine.sendNoiseTable(getNoise(this.noise).data)
  }

  // --- subscriptions ---
  subscribeParam(id, cb) {
    let set = this.paramListeners.get(id)
    if (!set) { set = new Set(); this.paramListeners.set(id, set) }
    set.add(cb)
    return () => set.delete(cb)
  }

  subscribeStruct(cb) {
    this.structListeners.add(cb)
    return () => this.structListeners.delete(cb)
  }

  notifyParam(id) {
    const set = this.paramListeners.get(id)
    if (set) for (const cb of set) cb()
  }

  notifyStruct() {
    this.version++
    for (const cb of this.structListeners) cb()
  }

  // --- param API ---
  getParam(id) { return this.params[id] }

  setParam(id, v, silent) {
    v = v < 0 ? 0 : v > 1 ? 1 : v
    this.params[id] = v
    this.engine.setParam(id, v)
    if (!silent) this.notifyParam(id)
  }

  // --- wavetable/noise ---
  setWavetable(slot, name) {
    if (slot === 'a') this.wavetableA = name
    else this.wavetableB = name
    this.pushWavetable(slot)
    this.notifyStruct()
  }

  setNoise(name) {
    this.noise = name
    this.pushNoise()
    this.notifyStruct()
  }

  // --- lfo shapes ---
  setLfoShape(index, points) {
    this.lfoShapes[index] = points
    this.engine.sendLfoShape(index, points)
    this.notifyStruct()
  }

  // --- matrix ---
  addMatrixSlot(partial) {
    const slot = { ...emptyMatrixSlot(), ...partial }
    this.matrix.push(slot)
    this.engine.sendMatrix(this.matrix)
    this.notifyStruct()
    return slot
  }

  updateMatrixSlot(id, patch) {
    const s = this.matrix.find(m => m.id === id)
    if (!s) return
    Object.assign(s, patch)
    this.engine.sendMatrix(this.matrix)
    this.notifyStruct()
  }

  removeMatrixSlot(id) {
    this.matrix = this.matrix.filter(m => m.id !== id)
    this.engine.sendMatrix(this.matrix)
    this.notifyStruct()
  }

  // depth shown on knob mod-ring: sum of |amount| for routes targeting id
  modDepth(targetId) {
    let d = 0
    for (const m of this.matrix) if (m.target === targetId && m.source) d += m.amount
    return d
  }

  // --- fx order ---
  setFxOrder(order) {
    this.fxOrder = order
    this.engine.sendFxOrder(order)
    this.notifyStruct()
  }

  // --- presets ---
  setPresetName(name) { this.presetName = name }

  serialize() {
    return {
      v: 1,
      name: this.presetName,
      params: { ...this.params },
      lfoShapes: this.lfoShapes.map(s => s.map(p => ({ ...p }))),
      matrix: this.matrix.map(m => ({ ...m })),
      fxOrder: [...this.fxOrder],
      wavetableA: this.wavetableA,
      wavetableB: this.wavetableB,
      noise: this.noise,
    }
  }

  load(data) {
    const base = defaultParams()
    this.params = { ...base, ...(data.params || {}) }
    // drop any unknown params
    for (const k of Object.keys(this.params)) if (!(k in PARAM_INDEX)) delete this.params[k]
    this.lfoShapes = (data.lfoShapes && data.lfoShapes.length === 8)
      ? data.lfoShapes.map(s => s.map(p => ({ ...p })))
      : Array.from({ length: 8 }, defaultLfoPoints)
    this.matrix = (data.matrix || []).map(m => ({ ...emptyMatrixSlot(), ...m, id: cryptoId() }))
    this.fxOrder = data.fxOrder && data.fxOrder.length === this.fxOrder.length ? [...data.fxOrder] : this.fxOrder
    const libNames = getWavetableLibrary().map(t => t.name)
    this.wavetableA = libNames.includes(data.wavetableA) ? data.wavetableA : 'Basic Shapes'
    this.wavetableB = libNames.includes(data.wavetableB) ? data.wavetableB : 'Basic Shapes'
    this.noise = data.noise || 'White'
    this.presetName = data.name || 'Untitled'
    this.pushAll()
    // notify everything
    for (const id of Object.keys(this.params)) this.notifyParam(id)
    this.notifyStruct()
  }
}
