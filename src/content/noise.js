// Procedurally generated noise tables (looped). Each is a Float32Array that
// the noise oscillator plays back at a (pitch-shiftable) rate.

const LEN = 32768

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normalize(f) {
  let max = 0
  for (let i = 0; i < f.length; i++) { const a = Math.abs(f[i]); if (a > max) max = a }
  if (max > 1e-9) { const g = 0.9 / max; for (let i = 0; i < f.length; i++) f[i] *= g }
  // de-click loop point
  const fade = 256
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    f[i] = f[i] * t + f[f.length - fade + i] * (1 - t) * 0 // keep start
  }
  return f
}

function white(seed) {
  const rng = mulberry32(seed)
  const f = new Float32Array(LEN)
  for (let i = 0; i < LEN; i++) f[i] = rng() * 2 - 1
  return normalize(f)
}

function pink(seed) {
  const rng = mulberry32(seed)
  const f = new Float32Array(LEN)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < LEN; i++) {
    const w = rng() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.96900 * b2 + w * 0.1538520
    b3 = 0.86650 * b3 + w * 0.3104856
    b4 = 0.55000 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.0168980
    f[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
  return normalize(f)
}

function brown(seed) {
  const rng = mulberry32(seed)
  const f = new Float32Array(LEN)
  let last = 0
  for (let i = 0; i < LEN; i++) {
    last += (rng() * 2 - 1) * 0.02
    if (last > 1) last = 1; if (last < -1) last = -1
    f[i] = last
  }
  return normalize(f)
}

function crackle(seed) {
  const rng = mulberry32(seed)
  const f = new Float32Array(LEN)
  for (let i = 0; i < LEN; i++) {
    f[i] = rng() < 0.02 ? (rng() * 2 - 1) : 0
  }
  // short decays on each impulse
  let env = 0
  for (let i = 0; i < LEN; i++) {
    if (f[i] !== 0) env = f[i]
    else { env *= 0.85; f[i] = env }
  }
  return normalize(f)
}

function digital(seed) {
  const rng = mulberry32(seed)
  const f = new Float32Array(LEN)
  let hold = 0
  let count = 0
  for (let i = 0; i < LEN; i++) {
    if (count <= 0) { hold = Math.round(rng() * 6 - 3) / 3; count = 1 + Math.floor(rng() * 12) }
    count--
    f[i] = hold
  }
  return normalize(f)
}

function vinyl(seed) {
  const p = pink(seed)
  const rng = mulberry32(seed + 7)
  const f = new Float32Array(LEN)
  for (let i = 0; i < LEN; i++) {
    f[i] = p[i] * 0.5 + (rng() < 0.004 ? (rng() * 2 - 1) * 0.9 : 0)
  }
  return normalize(f)
}

let cache = null

export function getNoiseLibrary() {
  if (cache) return cache
  cache = [
    { name: 'White', data: white(1) },
    { name: 'Pink', data: pink(2) },
    { name: 'Brown', data: brown(3) },
    { name: 'Crackle', data: crackle(4) },
    { name: 'Digital', data: digital(5) },
    { name: 'Vinyl', data: vinyl(6) },
  ]
  return cache
}

export function getNoise(name) {
  const lib = getNoiseLibrary()
  return lib.find(n => n.name === name) || lib[0]
}
