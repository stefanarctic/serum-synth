// Modulation primitives: curve shaping, AHDSR envelope, point-based LFO.

// c in -1..1. c > 0 = fast start (concave down), c < 0 = slow start.
export function shapeCurve(t, c) {
  if (c === 0) return t
  return Math.pow(t, Math.pow(2, -3 * c))
}

// Evaluate a drawable shape made of points [{x, y, c}] sorted by x, at phase 0..1.
// y is the output value (1 = top). Curve c belongs to the segment to the right
// of each point.
export function evalShape(points, ph) {
  const n = points.length
  if (n === 0) return 0
  if (ph <= points[0].x) return points[0].y
  if (ph >= points[n - 1].x) return points[n - 1].y
  let i = 0
  while (i < n - 2 && points[i + 1].x <= ph) i++
  const p0 = points[i]
  const p1 = points[i + 1]
  const span = p1.x - p0.x
  if (span <= 1e-9) return p1.y
  let t = (ph - p0.x) / span
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return p0.y + (p1.y - p0.y) * shapeCurve(t, p0.c || 0)
}

// Stages: 0 idle, 1 attack, 2 hold, 3 decay, 4 sustain, 5 release
export class Envelope {
  constructor() {
    this.stage = 0
    this.t = 0
    this.value = 0
    this.startLevel = 0
    this.relStart = 0
  }

  trigger() {
    this.stage = 1
    this.t = 0
    this.startLevel = this.value
  }

  release() {
    if (this.stage !== 0 && this.stage !== 5) {
      this.stage = 5
      this.t = 0
      this.relStart = this.value
    }
  }

  kill() {
    this.stage = 0
    this.value = 0
  }

  get active() { return this.stage !== 0 }
  get releasing() { return this.stage === 5 }

  tick(dt, att, hold, dec, sus, rel, ca, cd, cr) {
    switch (this.stage) {
      case 1:
        if (att <= 0.0006) {
          this.value = 1; this.stage = 2; this.t = 0
        } else {
          this.t += dt / att
          if (this.t >= 1) { this.value = 1; this.stage = 2; this.t = 0 }
          else this.value = this.startLevel + (1 - this.startLevel) * shapeCurve(this.t, ca)
        }
        break
      case 2:
        this.value = 1
        if (hold <= 0) { this.stage = 3; this.t = 0 }
        else {
          this.t += dt / hold
          if (this.t >= 1) { this.stage = 3; this.t = 0 }
        }
        break
      case 3:
        this.t += dt / Math.max(dec, 0.001)
        if (this.t >= 1) { this.value = sus; this.stage = 4 }
        else this.value = sus + (1 - sus) * shapeCurve(1 - this.t, cd)
        break
      case 4:
        this.value = sus
        break
      case 5:
        this.t += dt / Math.max(rel, 0.001)
        if (this.t >= 1) { this.value = 0; this.stage = 0 }
        else this.value = this.relStart * shapeCurve(1 - this.t, cr)
        break
    }
    return this.value
  }
}

export class Lfo {
  constructor() {
    this.phase = 0
    this.age = 0
    this.finished = false
    this.smoothState = 0
    this.out = 0
  }

  trigger() {
    this.phase = 0
    this.age = 0
    this.finished = false
  }

  // mode: 0 trig, 1 env (one-shot), 2 off (free running, uses globalPhase)
  tick(dt, freq, mode, delaySec, riseSec, smooth, points, globalPhase) {
    this.age += dt
    let ph
    if (mode === 2) {
      ph = globalPhase
    } else {
      if (this.age >= delaySec && !this.finished) {
        this.phase += dt * freq
        if (mode === 1) {
          if (this.phase >= 1) { this.phase = 1; this.finished = true }
        } else {
          this.phase -= Math.floor(this.phase)
        }
      }
      ph = this.phase
    }
    let v = evalShape(points, ph)
    if (riseSec > 0.001) {
      const r = (this.age - delaySec) / riseSec
      v *= r < 0 ? 0 : r > 1 ? 1 : r
    }
    if (smooth > 0.001) {
      const a = Math.exp(-dt / (0.001 + smooth * smooth * 0.4))
      this.smoothState = v + (this.smoothState - v) * a
      v = this.smoothState
    } else {
      this.smoothState = v
    }
    this.out = v
    return v
  }
}
