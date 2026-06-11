/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { useStore, useStruct } from '../../state/StoreContext.jsx'

function shapeCurve(t, c) {
  if (c === 0) return t
  return Math.pow(t, Math.pow(2, -3 * c))
}

function evalShape(points, ph) {
  const n = points.length
  if (ph <= points[0].x) return points[0].y
  if (ph >= points[n - 1].x) return points[n - 1].y
  let i = 0
  while (i < n - 2 && points[i + 1].x <= ph) i++
  const p0 = points[i]; const p1 = points[i + 1]
  const span = p1.x - p0.x
  if (span <= 1e-9) return p1.y
  const t = (ph - p0.x) / span
  return p0.y + (p1.y - p0.y) * shapeCurve(t, p0.c || 0)
}

// Interactive point-based LFO shape editor.
// Click empty space to add a point, drag to move, double-click to delete,
// drag a segment vertically (alt) to bend the curve.
export default function LfoEditor({ index, width = 300, height = 150 }) {
  const ref = useRef(null)
  const store = useStore()
  useStruct()
  const [drag, setDrag] = useState(null)
  const points = store.lfoShapes[index]

  const pad = 10
  const w = width - pad * 2
  const h = height - pad * 2
  const toCanvas = (p) => [pad + p.x * w, pad + (1 - p.y) * h]
  const fromCanvas = (cx, cy) => ({
    x: Math.max(0, Math.min(1, (cx - pad) / w)),
    y: Math.max(0, Math.min(1, 1 - (cy - pad) / h)),
  })

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      const gx = pad + (i / 8) * w
      ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, pad + h); ctx.stroke()
    }
    for (let i = 1; i < 4; i++) {
      const gy = pad + (i / 4) * h
      ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(pad + w, gy); ctx.stroke()
    }

    // curve
    ctx.beginPath()
    for (let s = 0; s <= 200; s++) {
      const ph = s / 200
      const v = evalShape(points, ph)
      const cx = pad + ph * w
      const cy = pad + (1 - v) * h
      if (s === 0) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx, cy)
    }
    ctx.strokeStyle = '#5aa0ff'
    ctx.lineWidth = 2
    ctx.shadowColor = '#5aa0ff'
    ctx.shadowBlur = 6
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.lineTo(pad + w, pad + h)
    ctx.lineTo(pad, pad + h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(90,160,255,0.10)'
    ctx.fill()

    // points
    for (const p of points) {
      const [cx, cy] = toCanvas(p)
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#dfe9ff'
      ctx.fill()
      ctx.strokeStyle = '#5aa0ff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [points, width, height, store.version])

  const hitPoint = (cx, cy) => {
    for (let i = 0; i < points.length; i++) {
      const [px, py] = toCanvas(points[i])
      if (Math.hypot(px - cx, py - cy) < 8) return i
    }
    return -1
  }

  const onPointerDown = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const hit = hitPoint(cx, cy)
    if (e.altKey) {
      // bend the segment under the cursor
      const ph = (cx - pad) / w
      let i = 0
      while (i < points.length - 2 && points[i + 1].x <= ph) i++
      setDrag({ type: 'bend', i, startY: cy, startC: points[i].c || 0 })
      return
    }
    if (hit >= 0) {
      setDrag({ type: 'move', i: hit })
    } else {
      // insert a new point at this x
      const np = fromCanvas(cx, cy)
      const list = [...points, { x: np.x, y: np.y, c: 0 }].sort((a, b) => a.x - b.x)
      store.setLfoShape(index, list)
      const ni = list.findIndex(p => p.x === np.x && p.y === np.y)
      setDrag({ type: 'move', i: ni })
    }
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const rect = ref.current.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const list = points.map(p => ({ ...p }))
      if (drag.type === 'move') {
        const np = fromCanvas(cx, cy)
        const isEnd = drag.i === 0 || drag.i === list.length - 1
        if (isEnd) {
          // endpoints keep x, but mirror y so the loop stays continuous
          list[drag.i].y = np.y
          if (drag.i === 0) list[list.length - 1].y = np.y
          else list[0].y = np.y
        } else {
          const lo = list[drag.i - 1].x + 0.001
          const hi = list[drag.i + 1].x - 0.001
          list[drag.i].x = Math.max(lo, Math.min(hi, np.x))
          list[drag.i].y = np.y
        }
        store.setLfoShape(index, list)
      } else if (drag.type === 'bend') {
        const dy = (drag.startY - cy) / h
        let c = drag.startC + dy * 2
        c = Math.max(-1, Math.min(1, c))
        list[drag.i].c = c
        store.setLfoShape(index, list)
      }
    }
    const onUp = () => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, points, index, store])

  const onDoubleClick = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const hit = hitPoint(cx, cy)
    if (hit > 0 && hit < points.length - 1) {
      store.setLfoShape(index, points.filter((_, i) => i !== hit))
    }
  }

  return (
    <canvas
      ref={ref}
      className="lfoview"
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  )
}

// Preset shape generators for quick selection.
export const LFO_PRESETS = {
  Triangle: () => [{ x: 0, y: 1, c: 0 }, { x: 0.5, y: 0, c: 0 }, { x: 1, y: 1, c: 0 }],
  Sine: () => {
    const pts = []
    for (let i = 0; i <= 8; i++) pts.push({ x: i / 8, y: 0.5 + 0.5 * Math.cos(i / 8 * Math.PI * 2), c: 0 })
    return pts
  },
  Saw: () => [{ x: 0, y: 1, c: 0 }, { x: 1, y: 0, c: 0 }],
  Ramp: () => [{ x: 0, y: 0, c: 0 }, { x: 1, y: 1, c: 0 }],
  Square: () => [{ x: 0, y: 1, c: 0 }, { x: 0.4999, y: 1, c: 0 }, { x: 0.5, y: 0, c: 0 }, { x: 0.9999, y: 0, c: 0 }, { x: 1, y: 1, c: 0 }],
}
