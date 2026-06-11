import { useEffect, useRef } from 'react'
import { getParam, mapParam } from '../../engine/params.js'
import { useStore } from '../../state/StoreContext.jsx'

function curve(t, c) {
  if (c === 0) return t
  return Math.pow(t, Math.pow(2, -3 * c))
}

// Visualizes an AHDSR envelope (attack/hold/decay/sustain/release) with curves.
export default function EnvEditor({ index, width = 250, height = 110 }) {
  const ref = useRef(null)
  const store = useStore()
  const p = (s) => store.getParam(`env${index}_${s}`)
  const att = mapParam(getParam(`env${index}_att`), p('att'))
  const hold = mapParam(getParam(`env${index}_hold`), p('hold'))
  const dec = mapParam(getParam(`env${index}_dec`), p('dec'))
  const sus = mapParam(getParam(`env${index}_sus`), p('sus'))
  const rel = mapParam(getParam(`env${index}_rel`), p('rel'))
  const ca = mapParam(getParam(`env${index}_attcrv`), p('attcrv'))
  const cd = mapParam(getParam(`env${index}_deccrv`), p('deccrv'))
  const cr = mapParam(getParam(`env${index}_relcrv`), p('relcrv'))

  useEffect(() => {
    const canvas = ref.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const pad = 8
    const w = width - pad * 2
    const h = height - pad * 2
    const susW = 0.18 // fixed visual width for the sustain segment
    const total = att + hold + dec + rel
    const tScale = total > 0 ? (1 - susW) / total : 0
    const wA = att * tScale
    const wH = hold * tScale
    const wD = dec * tScale
    const wR = rel * tScale

    const X = (x) => pad + x * w
    const Y = (v) => pad + (1 - v) * h

    ctx.beginPath()
    ctx.moveTo(X(0), Y(0))
    let x = 0
    const seg = (width01, from, to, c) => {
      const steps = 32
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const v = from + (to - from) * curve(t, c)
        ctx.lineTo(X(x + width01 * t), Y(v))
      }
      x += width01
    }
    seg(wA, 0, 1, ca)
    if (wH > 0) { ctx.lineTo(X(x + wH), Y(1)); x += wH }
    seg(wD, 1, sus, -cd)
    ctx.lineTo(X(x + susW), Y(sus)); x += susW
    seg(wR, sus, 0, -cr)

    ctx.strokeStyle = '#ffb454'
    ctx.lineWidth = 2
    ctx.shadowColor = '#ffb454'
    ctx.shadowBlur = 6
    ctx.stroke()
    ctx.shadowBlur = 0

    // fill
    ctx.lineTo(X(x), Y(0))
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,180,84,0.12)'
    ctx.fill()
  }, [att, hold, dec, sus, rel, ca, cd, cr, width, height])

  return <canvas ref={ref} className="envview" style={{ width, height }} />
}
