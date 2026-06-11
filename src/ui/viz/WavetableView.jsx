import { useEffect, useRef } from 'react'
import { getWavetable } from '../../content/wavetables.js'
import { useParam } from '../../state/StoreContext.jsx'

// 3D-perspective stack of wavetable frames with the active frame highlighted,
// plus a 2D readout of the current interpolated frame.
export default function WavetableView({ tableName, posId, width = 230, height = 120 }) {
  const ref = useRef(null)
  const [pos] = useParam(posId)

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const table = getWavetable(tableName)
    const frames = table.frames
    const nf = frames.length
    const activeF = pos * (nf - 1)

    // draw a subset of frames as a perspective stack
    const maxDraw = 28
    const stepF = Math.max(1, Math.floor(nf / maxDraw))
    const drawn = []
    for (let f = 0; f < nf; f += stepF) drawn.push(f)
    if (drawn[drawn.length - 1] !== nf - 1) drawn.push(nf - 1)

    const padX = 18
    const padY = 12
    const w = width - padX * 2
    const h = height - padY * 2
    const depth = 0.55
    const skew = 0.5

    const project = (xi, fi) => {
      const tdepth = fi / Math.max(1, nf - 1)
      const px = padX + (xi * (1 - skew * tdepth) + skew * tdepth) * w
      const py = padY + (1 - tdepth) * h * depth
      return [px, py]
    }

    const samplesPerLine = 128
    for (let di = drawn.length - 1; di >= 0; di--) {
      const f = drawn[di]
      const data = frames[f]
      const closeness = 1 - Math.abs(f - activeF) / Math.max(1, nf - 1)
      const isActive = Math.abs(f - activeF) <= stepF
      ctx.beginPath()
      for (let s = 0; s <= samplesPerLine; s++) {
        const xi = s / samplesPerLine
        const idx = Math.min(data.length - 1, Math.floor(xi * (data.length - 1)))
        const v = data[idx]
        const [px, py] = project(xi, f)
        const yy = py + h * 0.42 - v * h * 0.34
        if (s === 0) ctx.moveTo(px, yy)
        else ctx.lineTo(px, yy)
      }
      if (isActive) {
        ctx.strokeStyle = '#36e0c8'
        ctx.lineWidth = 2
        ctx.shadowColor = '#36e0c8'
        ctx.shadowBlur = 8
      } else {
        const a = 0.18 + closeness * 0.35
        ctx.strokeStyle = `rgba(120,150,180,${a})`
        ctx.lineWidth = 1
        ctx.shadowBlur = 0
      }
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }, [tableName, pos, width, height])

  return <canvas ref={ref} className="wtview" style={{ width, height }} />
}
