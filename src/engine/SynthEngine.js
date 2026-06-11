// Main-thread wrapper around the AudioWorklet. Queues messages until the
// AudioContext is created (which requires a user gesture).

import workletUrl from 'virtual:audio-worklet'

export class SynthEngine {
  constructor() {
    this.ctx = null
    this.node = null
    this.queue = []
    this.onMeters = null
    this.running = false
  }

  async start() {
    if (this.running) return
    this.running = true
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    await this.ctx.audioWorklet.addModule(workletUrl)
    this.node = new AudioWorkletNode(this.ctx, 'serum-synth', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    this.node.connect(this.ctx.destination)
    this.node.port.onmessage = (e) => {
      if (e.data.type === 'meters' && this.onMeters) this.onMeters(e.data)
    }
    for (const [msg, transfer] of this.queue) this.node.port.postMessage(msg, transfer || [])
    this.queue.length = 0
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setMeterHandler(cb) { this.onMeters = cb }

  post(msg, transfer) {
    if (this.node) this.node.port.postMessage(msg, transfer || [])
    else this.queue.push([msg, transfer])
  }

  setParam(id, v) { this.post({ type: 'param', id, v }) }
  setParams(entries) { this.post({ type: 'params', entries }) }
  noteOn(note, vel) { this.post({ type: 'note_on', note, vel }) }
  noteOff(note) { this.post({ type: 'note_off', note }) }
  allNotesOff() { this.post({ type: 'all_off' }) }
  panic() { this.post({ type: 'panic' }) }
  pitchBend(v) { this.post({ type: 'pitch_bend', v }) }
  modWheel(v) { this.post({ type: 'mod_wheel', v }) }
  aftertouch(v) { this.post({ type: 'aftertouch', v }) }

  sendWavetable(slot, mips) {
    this.post({ type: 'wavetable', slot, frames: mips.frames, levels: mips.levels }, mips.transfer)
  }

  sendNoiseTable(data) {
    const copy = new Float32Array(data)
    this.post({ type: 'noise_table', buf: copy.buffer }, [copy.buffer])
  }

  sendLfoShape(index, points) { this.post({ type: 'lfo_shape', index, points }) }
  sendMatrix(slots) { this.post({ type: 'matrix', slots }) }
  sendFxOrder(order) { this.post({ type: 'fx_order', order }) }
}

// --- Web MIDI -------------------------------------------------------------

export async function initMidi(handlers) {
  if (!navigator.requestMIDIAccess) return null
  try {
    const access = await navigator.requestMIDIAccess()
    const attach = (input) => {
      input.onmidimessage = (e) => {
        const [status, d1, d2] = e.data
        const cmd = status & 0xf0
        if (cmd === 0x90 && d2 > 0) handlers.noteOn(d1, d2 / 127)
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) handlers.noteOff(d1)
        else if (cmd === 0xe0) handlers.pitchBend(((d2 << 7) | d1) / 8192 - 1)
        else if (cmd === 0xb0 && d1 === 1) handlers.modWheel(d2 / 127)
        else if (cmd === 0xd0) handlers.aftertouch(d1 / 127)
      }
    }
    for (const input of access.inputs.values()) attach(input)
    access.onstatechange = (e) => {
      if (e.port.type === 'input' && e.port.state === 'connected') attach(e.port)
    }
    return access
  } catch {
    return null
  }
}
