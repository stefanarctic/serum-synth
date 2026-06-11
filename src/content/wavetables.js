// Procedurally generated factory wavetables. Each table is a set of
// 2048-sample frames; all content is computed at load time.

const N = 2048

function frame() { return new Float32Array(N) }

function normalize(f) {
  let max = 0
  for (let i = 0; i < N; i++) { const a = Math.abs(f[i]); if (a > max) max = a }
  if (max > 1e-9) {
    const g = 1 / max
    for (let i = 0; i < N; i++) f[i] *= g
  }
  return f
}

// Build a frame from harmonic amplitudes/phases.
function additive(amps, phases) {
  const f = frame()
  for (let h = 0; h < amps.length; h++) {
    const a = amps[h]
    if (a === 0) continue
    const ph = phases ? phases[h] : 0
    const w = (h + 1) * 2 * Math.PI / N
    for (let i = 0; i < N; i++) f[i] += a * Math.sin(w * i + ph)
  }
  return normalize(f)
}

function sine() {
  const f = frame()
  for (let i = 0; i < N; i++) f[i] = Math.sin(2 * Math.PI * i / N)
  return f
}

function triangle() {
  const amps = new Float32Array(64)
  for (let h = 0; h < 64; h += 2) amps[h] = ((h / 2) % 2 === 0 ? 1 : -1) / ((h + 1) * (h + 1))
  return additive(amps)
}

function saw(nHarm = 512) {
  const amps = new Float32Array(nHarm)
  for (let h = 0; h < nHarm; h++) amps[h] = 1 / (h + 1)
  return additive(amps)
}

function square(nHarm = 512) {
  const amps = new Float32Array(nHarm)
  for (let h = 0; h < nHarm; h += 2) amps[h] = 1 / (h + 1)
  return additive(amps)
}

function pulse(width) {
  const f = frame()
  // band-limited-ish pulse via saw difference
  const s = saw()
  const shift = Math.floor(width * N)
  for (let i = 0; i < N; i++) f[i] = s[i] - s[(i + shift) % N]
  return normalize(f)
}

function lerpFrames(a, b, t) {
  const f = frame()
  for (let i = 0; i < N; i++) f[i] = a[i] + (b[i] - a[i]) * t
  return f
}

// Seeded PRNG for reproducible "random" tables.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- table builders ---------------------------------------------------------

function tBasicShapes() {
  const keys = [sine(), triangle(), saw(), square(), pulse(0.25)]
  const frames = []
  const per = 8
  for (let k = 0; k < keys.length - 1; k++) {
    for (let j = 0; j < per; j++) frames.push(lerpFrames(keys[k], keys[k + 1], j / per))
  }
  frames.push(keys[keys.length - 1])
  return { name: 'Basic Shapes', frames }
}

function tPwm() {
  const frames = []
  for (let j = 0; j < 32; j++) frames.push(pulse(0.5 - 0.47 * (j / 31)))
  return { name: 'PWM', frames }
}

function tHarmonicSweep() {
  const frames = []
  for (let j = 0; j < 48; j++) {
    const nh = 1 + Math.round(Math.pow(j / 47, 1.6) * 63)
    const amps = new Float32Array(nh)
    for (let h = 0; h < nh; h++) amps[h] = 1 / (h + 1)
    frames.push(additive(amps))
  }
  return { name: 'Harmonic Sweep', frames }
}

function tOddity() {
  const frames = []
  for (let j = 0; j < 32; j++) {
    const amps = new Float32Array(48)
    const t = j / 31
    for (let h = 0; h < 48; h++) {
      const odd = h % 2 === 0
      amps[h] = (odd ? 1 : t) / (h + 1)
    }
    frames.push(additive(amps))
  }
  return { name: 'Oddity', frames }
}

function tFmIndex() {
  const frames = []
  for (let j = 0; j < 48; j++) {
    const idx = (j / 47) * 8
    const f = frame()
    for (let i = 0; i < N; i++) {
      const ph = 2 * Math.PI * i / N
      f[i] = Math.sin(ph + idx * Math.sin(ph * 2))
    }
    frames.push(normalize(f))
  }
  return { name: 'FM Index', frames }
}

function tFmRatios() {
  const ratios = [1, 2, 3, 5, 7]
  const frames = []
  for (let j = 0; j < 40; j++) {
    const t = (j / 39) * (ratios.length - 1)
    const r0 = ratios[Math.floor(t)]
    const r1 = ratios[Math.min(ratios.length - 1, Math.floor(t) + 1)]
    const fr = t - Math.floor(t)
    const f = frame()
    for (let i = 0; i < N; i++) {
      const ph = 2 * Math.PI * i / N
      const a = Math.sin(ph + 3 * Math.sin(ph * r0))
      const b = Math.sin(ph + 3 * Math.sin(ph * r1))
      f[i] = a + (b - a) * fr
    }
    frames.push(normalize(f))
  }
  return { name: 'FM Ratios', frames }
}

const VOWEL_FORMANTS = {
  a: [800, 1150, 2900], e: [400, 1600, 2700], i: [350, 1700, 2700],
  o: [450, 800, 2830], u: [325, 700, 2700],
}

function vowelFrame(formants) {
  const nh = 96
  const amps = new Float32Array(nh)
  const f0 = 110
  for (let h = 0; h < nh; h++) {
    const freq = (h + 1) * f0
    let a = 0
    for (let k = 0; k < formants.length; k++) {
      const bw = 80 + k * 40
      const d = (freq - formants[k]) / bw
      a += Math.exp(-d * d) * (1 - k * 0.25)
    }
    amps[h] = a / (1 + h * 0.02)
  }
  return additive(amps)
}

function tVowels() {
  const seq = ['a', 'e', 'i', 'o', 'u']
  const keys = seq.map(v => vowelFrame(VOWEL_FORMANTS[v]))
  const frames = []
  const per = 10
  for (let k = 0; k < keys.length - 1; k++) {
    for (let j = 0; j < per; j++) frames.push(lerpFrames(keys[k], keys[k + 1], j / per))
  }
  frames.push(keys[keys.length - 1])
  return { name: 'Vowels', frames }
}

function tOrgan() {
  const drawbarSets = [
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0.6, 0, 0.4, 0, 0, 0, 0, 0],
    [1, 0.8, 0.6, 0.6, 0.4, 0.3, 0, 0, 0],
    [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3],
  ]
  const harmonicOf = [1, 2, 3, 4, 6, 8, 10, 12, 16]
  const keys = drawbarSets.map(set => {
    const amps = new Float32Array(16)
    set.forEach((g, i) => { if (harmonicOf[i] <= 16) amps[harmonicOf[i] - 1] += g })
    return additive(amps)
  })
  const frames = []
  const per = 10
  for (let k = 0; k < keys.length - 1; k++) {
    for (let j = 0; j < per; j++) frames.push(lerpFrames(keys[k], keys[k + 1], j / per))
  }
  frames.push(keys[keys.length - 1])
  return { name: 'Drawbars', frames }
}

function tResoSweep() {
  const frames = []
  for (let j = 0; j < 48; j++) {
    const nh = 64
    const amps = new Float32Array(nh)
    const peak = 1 + (j / 47) * 40
    for (let h = 0; h < nh; h++) {
      const d = (h + 1 - peak) / 2.5
      amps[h] = 1 / (h + 1) + 2.2 * Math.exp(-d * d)
    }
    frames.push(additive(amps))
  }
  return { name: 'Reso Sweep', frames }
}

function tSyncSweep() {
  const frames = []
  for (let j = 0; j < 48; j++) {
    const k = 1 + (j / 47) * 7
    const f = frame()
    for (let i = 0; i < N; i++) {
      const p = (i / N) * k
      const pp = p - Math.floor(p)
      // windowed synced saw to avoid hard edge
      f[i] = (2 * pp - 1) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
    }
    frames.push(normalize(f))
  }
  return { name: 'Sync Sweep', frames }
}

function tChebyshev() {
  const frames = []
  for (let j = 0; j < 40; j++) {
    const order = 1 + (j / 39) * 9
    const o0 = Math.floor(order)
    const fr = order - o0
    const f = frame()
    for (let i = 0; i < N; i++) {
      const x = Math.sin(2 * Math.PI * i / N)
      const a = Math.cos(o0 * Math.acos(Math.max(-1, Math.min(1, x))))
      const b = Math.cos((o0 + 1) * Math.acos(Math.max(-1, Math.min(1, x))))
      f[i] = a + (b - a) * fr
    }
    frames.push(normalize(f))
  }
  return { name: 'Chebyshev', frames }
}

function tSpectralDrift(seed, name) {
  const rng = mulberry32(seed)
  const nKeys = 6
  const nh = 64
  const keys = []
  for (let k = 0; k < nKeys; k++) {
    const amps = new Float32Array(nh)
    const phases = new Float32Array(nh)
    for (let h = 0; h < nh; h++) {
      amps[h] = Math.pow(rng(), 2.2) / Math.sqrt(h + 1)
      phases[h] = rng() * 2 * Math.PI
    }
    keys.push(additive(amps, phases))
  }
  const frames = []
  const per = 8
  for (let k = 0; k < nKeys - 1; k++) {
    for (let j = 0; j < per; j++) frames.push(lerpFrames(keys[k], keys[k + 1], j / per))
  }
  frames.push(keys[nKeys - 1])
  return { name, frames }
}

function tBell() {
  const partials = [1, 2.0, 2.4, 3.0, 4.5, 5.3, 6.55, 8.2]
  const frames = []
  for (let j = 0; j < 32; j++) {
    const t = j / 31
    const nh = 96
    const amps = new Float32Array(nh)
    for (let k = 0; k < partials.length; k++) {
      // quantize inharmonic partials onto the harmonic grid
      const h = Math.round(partials[k] * (1 + t * 0.6))
      if (h >= 1 && h <= nh) amps[h - 1] += Math.pow(0.75, k)
    }
    frames.push(additive(amps))
  }
  return { name: 'Bell Tones', frames }
}

function tFold() {
  const frames = []
  for (let j = 0; j < 40; j++) {
    const g = 1 + (j / 39) * 6
    const f = frame()
    for (let i = 0; i < N; i++) {
      f[i] = Math.sin(g * Math.sin(2 * Math.PI * i / N) * Math.PI * 0.5)
    }
    frames.push(normalize(f))
  }
  return { name: 'Sine Fold', frames }
}

function tStairs() {
  const frames = []
  for (let j = 0; j < 32; j++) {
    const steps = 2 + j
    const f = frame()
    const s = saw(128)
    for (let i = 0; i < N; i++) {
      f[i] = Math.round(s[i] * steps) / steps
    }
    frames.push(normalize(f))
  }
  return { name: 'Stairs', frames }
}

function tSubtleAnalog() {
  const rng = mulberry32(777)
  const frames = []
  for (let j = 0; j < 24; j++) {
    const nh = 256
    const amps = new Float32Array(nh)
    const phases = new Float32Array(nh)
    for (let h = 0; h < nh; h++) {
      amps[h] = (1 / (h + 1)) * (1 + 0.15 * Math.sin(j * 0.6 + h * 0.5))
      phases[h] = (rng() - 0.5) * 0.25 * (j / 24)
    }
    frames.push(additive(amps, phases))
  }
  return { name: 'Analog Drift', frames }
}

// --- library -----------------------------------------------------------------

let cache = null

export function getWavetableLibrary() {
  if (cache) return cache
  cache = [
    tBasicShapes(),
    tSubtleAnalog(),
    tPwm(),
    tHarmonicSweep(),
    tOddity(),
    tFmIndex(),
    tFmRatios(),
    tVowels(),
    tOrgan(),
    tResoSweep(),
    tSyncSweep(),
    tChebyshev(),
    tBell(),
    tFold(),
    tStairs(),
    tSpectralDrift(101, 'Spectral Drift I'),
    tSpectralDrift(202, 'Spectral Drift II'),
  ]
  return cache
}

export function getWavetable(name) {
  const lib = getWavetableLibrary()
  return lib.find(t => t.name === name) || lib[0]
}
