import { useEffect, useRef, useState } from 'react'

// QWERTY -> semitone offset (two rows, ~2 octaves)
const KEYMAP = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7,
  KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14,
  Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24,
}

const WHITE = [0, 2, 4, 5, 7, 9, 11]

export default function Keyboard({ engine, octave, setOctave }) {
  // downKeys is the dedupe source of truth (mutated only in handlers);
  // active is the render state (pure updates, StrictMode-safe).
  const downKeys = useRef(new Set())
  const [active, setActive] = useState(() => new Set())
  const mouseDown = useRef(false)

  const noteOn = (note, vel = 0.85) => {
    if (downKeys.current.has(note)) return
    downKeys.current.add(note)
    engine.noteOn(note, vel)
    setActive(prev => { const n = new Set(prev); n.add(note); return n })
  }
  const noteOff = (note) => {
    if (!downKeys.current.has(note)) return
    downKeys.current.delete(note)
    engine.noteOff(note)
    setActive(prev => { const n = new Set(prev); n.delete(note); return n })
  }

  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) return
      if (e.code === 'ArrowLeft') { setOctave(o => Math.max(-1, o - 1)); return }
      if (e.code === 'ArrowRight') { setOctave(o => Math.min(7, o + 1)); return }
      const off = KEYMAP[e.code]
      if (off == null) return
      e.preventDefault()
      noteOn(12 * (octave + 1) + off)
    }
    const up = (e) => {
      const off = KEYMAP[e.code]
      if (off == null) return
      noteOff(12 * (octave + 1) + off)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [octave])

  useEffect(() => {
    const up = () => { mouseDown.current = false }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const baseNote = 12 * (octave + 1)
  const numOctaves = 4
  const whiteKeys = []
  for (let o = 0; o < numOctaves; o++) {
    for (const w of WHITE) whiteKeys.push(baseNote + o * 12 + w)
  }

  return (
    <div className="keyboard-area">
      <Wheels engine={engine} />
      <div className="kb-octave">
        <button className="mini-btn" onClick={() => setOctave(o => Math.max(-1, o - 1))}>-</button>
        <span>Oct {octave}</span>
        <button className="mini-btn" onClick={() => setOctave(o => Math.min(7, o + 1))}>+</button>
      </div>
      <div className="keyboard" onPointerDownCapture={(e) => { e.preventDefault(); mouseDown.current = true }}>
        {whiteKeys.map((note) => (
          <WhiteKey
            key={note}
            note={note}
            active={active}
            noteOn={noteOn}
            noteOff={noteOff}
            mouseDown={mouseDown}
          />
        ))}
      </div>
    </div>
  )
}

function WhiteKey({ note, active, noteOn, noteOff, mouseDown }) {
  return (
    <div
      className={`wkey ${active.has(note) ? 'active' : ''}`}
      onPointerDown={(e) => { e.preventDefault(); noteOn(note) }}
      onPointerEnter={() => { if (mouseDown.current) noteOn(note) }}
      onPointerUp={() => noteOff(note)}
      onPointerLeave={() => noteOff(note)}
    >
      <span className="bkey-holder">
        <BlackKey whiteNote={note} active={active} noteOn={noteOn} noteOff={noteOff} mouseDown={mouseDown} />
      </span>
    </div>
  )
}

function BlackKey({ whiteNote, active, noteOn, noteOff, mouseDown }) {
  const pc = whiteNote % 12
  // black key sits to the right of C, D, F, G, A
  const map = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 }
  if (!(pc in map)) return null
  const note = whiteNote + (map[pc] - pc)
  return (
    <div
      className={`bkey ${active.has(note) ? 'active' : ''}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); noteOn(note) }}
      onPointerEnter={() => { if (mouseDown.current) noteOn(note) }}
      onPointerUp={() => noteOff(note)}
      onPointerLeave={() => noteOff(note)}
    />
  )
}

function Wheels({ engine }) {
  return (
    <div className="wheels">
      <Wheel label="Pitch" spring onChange={(v) => engine.pitchBend(v)} bipolar />
      <Wheel label="Mod" onChange={(v) => engine.modWheel((v + 1) / 2)} />
    </div>
  )
}

function Wheel({ label, onChange, spring, bipolar }) {
  const [val, setVal] = useState(bipolar ? 0 : -1)
  const ref = useRef(null)
  const drag = useRef(false)

  const setFromY = (clientY) => {
    const rect = ref.current.getBoundingClientRect()
    let v = 1 - 2 * (clientY - rect.top) / rect.height
    v = Math.max(-1, Math.min(1, v))
    setVal(v)
    onChange(v)
  }
  useEffect(() => {
    const move = (e) => { if (drag.current) setFromY(e.clientY) }
    const up = () => {
      if (!drag.current) return
      drag.current = false
      if (spring) { setVal(0); onChange(0) }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [spring])

  const top = bipolar ? (0.5 - val / 2) * 100 : (1 - (val + 1) / 2) * 100
  return (
    <div className="wheel-wrap">
      <div className="wheel" ref={ref} onPointerDown={(e) => { drag.current = true; setFromY(e.clientY) }}>
        <div className="wheel-knob" style={{ top: `calc(${top}% - 8px)` }} />
      </div>
      <span className="wheel-label">{label}</span>
    </div>
  )
}
