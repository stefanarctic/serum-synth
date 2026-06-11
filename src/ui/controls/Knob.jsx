import { useEffect, useRef, useState } from 'react'
import { getParam, formatParamValue, defaultNorm } from '../../engine/params.js'
import { useParam, useStore, useStruct, useModDrag } from '../../state/StoreContext.jsx'

const ARC_START = -135
const ARC_END = 135

export default function Knob({ id, label, size = 44, bipolarCenter }) {
  const def = getParam(id)
  const [value, set] = useParam(id)
  const store = useStore()
  useStruct() // re-render on matrix change to update mod ring
  const { ref: dragRef, active } = useModDrag()
  const knobRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  const drag = useRef(null)

  const bip = bipolarCenter ?? (def.min === -1 && def.max === 1 ? true : def.min < 0 && def.max > 0)
  const depth = store.modDepth(id)

  // Clean up any stray listeners if the component unmounts mid-drag.
  useEffect(() => () => {
    if (drag.current?.cleanup) drag.current.cleanup()
  }, [])

  const onPointerDown = (e) => {
    e.preventDefault()
    const onMove = (ev) => {
      if (!drag.current) return
      const dy = drag.current.y - ev.clientY
      const speed = ev.shiftKey ? 0.0015 : 0.006
      let nv = drag.current.start + dy * speed
      nv = nv < 0 ? 0 : nv > 1 ? 1 : nv
      set(nv)
    }
    const onUp = () => {
      if (drag.current?.cleanup) drag.current.cleanup()
      drag.current = null
      setEditing(false)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // Attach synchronously so a fast click never loses its pointerup.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    drag.current = { y: e.clientY, start: value, cleanup }
    setEditing(true)
  }

  const onDoubleClick = () => set(defaultNorm(def))

  const onWheel = (e) => {
    e.preventDefault()
    const step = e.shiftKey ? 0.005 : 0.02
    set(value - Math.sign(e.deltaY) * step)
  }

  // drag-to-modulate: drop a source chip on this knob
  const canDrop = def.mod
  const onDragOver = (e) => { if (canDrop && dragRef.current.source) { e.preventDefault(); setDropHover(true) } }
  const onDragLeave = () => setDropHover(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDropHover(false)
    const src = dragRef.current.source
    if (src && canDrop) {
      // reuse existing route from this source to this target if present
      const existing = store.matrix.find(m => m.source === src && m.target === id)
      if (!existing) store.addMatrixSlot({ source: src, target: id, amount: 0.3, bipolar: bip })
    }
  }

  const angle = ARC_START + value * (ARC_END - ARC_START)
  const r = size / 2
  const cx = r
  const cy = r
  const trackR = r - 4

  const valueArc = describeArc(cx, cy, trackR, ARC_START, angle)
  const fullArc = describeArc(cx, cy, trackR, ARC_START, ARC_END)
  // mod ring (outer) shows modulation range
  const modR = r - 1.5
  let modArc = null
  if (depth !== 0) {
    const modEnd = Math.max(ARC_START, Math.min(ARC_END, angle + depth * (ARC_END - ARC_START)))
    modArc = describeArc(cx, cy, modR, angle, modEnd)
  }

  return (
    <div className={`knob ${dropHover ? 'knob-drop' : ''}`} title={`${def.name}`}>
      <svg
        ref={knobRef}
        width={size}
        height={size}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`knob-svg ${active ? 'knob-droptarget' : ''}`}
      >
        <path d={fullArc} className="knob-track" fill="none" />
        <path d={valueArc} className="knob-value" fill="none" />
        {modArc && <path d={modArc} className="knob-mod" fill="none" />}
        <line
          x1={cx} y1={cy}
          x2={cx + Math.sin(angle * Math.PI / 180) * (trackR - 3)}
          y2={cy - Math.cos(angle * Math.PI / 180) * (trackR - 3)}
          className="knob-pointer"
        />
        <circle cx={cx} cy={cy} r={trackR - 7} className="knob-cap" />
      </svg>
      <div className="knob-label">{label ?? def.name}</div>
      <div className="knob-readout">{formatParamValue(def, value)}</div>
    </div>
  )
}

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  if (Math.abs(endDeg - startDeg) < 0.01) {
    const p = polar(cx, cy, r, startDeg)
    return `M ${p.x} ${p.y}`
  }
  const start = polar(cx, cy, r, endDeg)
  const end = polar(cx, cy, r, startDeg)
  const large = Math.abs(endDeg - startDeg) <= 180 ? 0 : 1
  const sweep = endDeg > startDeg ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`
}
