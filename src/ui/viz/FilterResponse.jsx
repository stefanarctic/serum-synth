import { useEffect, useRef } from 'react'
import { getParam, mapParam } from '../../engine/params.js'
import { useStore, useStruct } from '../../state/StoreContext.jsx'

// Approximate magnitude response curve for the voice filter.
export default function FilterResponse({ prefix = 'flt', width = 250, height = 90 }) {
  const ref = useRef(null)
  const store = useStore()
  useStruct()
  const typeN = store.getParam(`${prefix}_type`)
  const cutoffN = store.getParam(`${prefix}_cutoff`)
  const resN = store.getParam(`${prefix}_res`)
  const type = Math.round(mapParam(getParam(`${prefix}_type`), typeN))
  const cutoff = mapParam(getParam(`${prefix}_cutoff`), cutoffN)
  const res = mapParam(getParam(`${prefix}_res`), resN)

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const pad = 6
    const w = width - pad * 2
    const h = height - pad * 2
    const fmin = 20
    const fmax = 20000
    const fc = Math.max(fmin, Math.min(fmax, cutoff))

    // kind: 0 low, 1 high, 2 band, 3 notch, 4 peak
    let kind
    if (type <= 3) kind = 0
    else if (type <= 5) kind = 0
    else if (type <= 7) kind = 1
    else if (type <= 9) kind = 2
    else if (type === 10) kind = 3
    else if (type === 11) kind = 4
    else kind = 2 // combs etc: rough bandpass-ish placeholder

    const order = (type === 1 || type === 5 || type === 7 || type === 9 || type === 3) ? 4 : 2
    const Q = 0.5 + res * 8

    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    for (let i = 1; i < 5; i++) {
      const gx = pad + (i / 5) * w
      ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, pad + h); ctx.stroke()
    }

    ctx.beginPath()
    for (let px = 0; px <= w; px++) {
      const f = fmin * Math.pow(fmax / fmin, px / w)
      const r = f / fc
      let mag
      switch (kind) {
        case 0: mag = 1 / Math.sqrt(1 + Math.pow(r, 2 * order)) + res * peak(r, Q); break
        case 1: mag = 1 / Math.sqrt(1 + Math.pow(1 / r, 2 * order)) + res * peak(r, Q); break
        case 2: mag = peak(r, Q); break
        case 3: mag = Math.abs(1 - peak(r, Q) * 1.0); break
        case 4: mag = 0.5 + peak(r, Q) * (0.5 + res); break
        default: mag = peak(r, Q)
      }
      const db = 20 * Math.log10(mag + 1e-4)
      const y = pad + h * (1 - (db + 36) / 48)
      const yy = Math.max(pad, Math.min(pad + h, y))
      if (px === 0) ctx.moveTo(pad + px, yy)
      else ctx.lineTo(pad + px, yy)
    }
    ctx.strokeStyle = '#36e0c8'
    ctx.lineWidth = 2
    ctx.shadowColor = '#36e0c8'
    ctx.shadowBlur = 5
    ctx.stroke()
    ctx.shadowBlur = 0
  }, [type, cutoff, res, width, height, store.version])

  return <canvas ref={ref} className="fltview" style={{ width, height }} />
}

function peak(r, Q) {
  // resonant peak near r=1
  const x = (r - 1 / r) * Q
  return 1 / Math.sqrt(1 + x * x) * (1 + Q * 0.12)
}
