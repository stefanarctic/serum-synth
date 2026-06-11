// Build band-limited mipmap levels for a wavetable on the main thread.
// Each level halves both the harmonic content and the table size.

const FRAME_SIZE = 2048

// In-place iterative radix-2 complex FFT. sign = -1 forward, +1 inverse.
function fft(re, im, sign) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = sign * 2 * Math.PI / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cwr = 1
      let cwi = 0
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr
        im[i + k + len / 2] = ui - vi
        const nwr = cwr * wr - cwi * wi
        cwi = cwr * wi + cwi * wr
        cwr = nwr
      }
    }
  }
}

// table: { name, frames: [Float32Array(2048), ...] }
// Returns { frames, levels: [{ size, mh, buf: ArrayBuffer }], transfer: [...] }
export function buildMips(table) {
  const frames = table.frames.length
  const numLevels = 10 // sizes 2048 .. 4
  const levels = []
  for (let k = 0; k < numLevels; k++) {
    const size = FRAME_SIZE >> k
    levels.push({
      size,
      mh: Math.max(1, (size >> 1) - 1), // max harmonic kept at this level
      data: new Float32Array(frames * size),
    })
  }

  const re = new Float64Array(FRAME_SIZE)
  const im = new Float64Array(FRAME_SIZE)

  for (let f = 0; f < frames; f++) {
    const src = table.frames[f]
    re.set(src)
    im.fill(0)
    fft(re, im, -1)
    // remove DC
    re[0] = 0
    im[0] = 0

    for (let k = 0; k < numLevels; k++) {
      const size = levels[k].size
      const half = size >> 1
      const sre = new Float64Array(size)
      const sim = new Float64Array(size)
      // copy harmonics 1..half-1 (and conjugate side), drop the rest
      for (let h = 1; h < half; h++) {
        sre[h] = re[h]
        sim[h] = im[h]
        sre[size - h] = re[FRAME_SIZE - h]
        sim[size - h] = im[FRAME_SIZE - h]
      }
      fft(sre, sim, 1)
      const out = levels[k].data
      const base = f * size
      const norm = 1 / FRAME_SIZE
      for (let i = 0; i < size; i++) out[base + i] = sre[i] * norm
    }
  }

  const payload = levels.map(l => ({ size: l.size, mh: l.mh, buf: l.data.buffer }))
  return { frames, levels: payload, transfer: payload.map(l => l.buf) }
}
