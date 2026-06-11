// Multi-mode stereo filter. Types (see FILTER_TYPES in params.js):
//  0-3   MG ladder 6/12/18/24 dB (one-pole cascade with tanh drive + feedback)
//  4-11  Clean ZDF state-variable: Low12/24, High12/24, Band12/24, Notch, Peak
//  12-13 Comb +/- (feedforward)
//  14-15 Flange +/- (feedback)
//  16    Ring Mod
//  17    Sample & Hold

const COMB_BUF = 4096

export class StereoFilter {
  constructor(sampleRate) {
    this.sr = sampleRate
    // SVF stages: 2 cascadable stages x 2 channels x 2 integrator states
    this.svf = new Float64Array(8)
    // Ladder: 4 poles x 2 channels + last output per channel
    this.lad = new Float64Array(10)
    this.combL = new Float32Array(COMB_BUF)
    this.combR = new Float32Array(COMB_BUF)
    this.combW = 0
    this.shCountL = 0
    this.shCountR = 0
    this.shL = 0
    this.shR = 0
    this.rmPhase = 0
    this.fatL = 0
    this.fatR = 0
    this.lastType = -1
  }

  reset() {
    this.svf.fill(0)
    this.lad.fill(0)
    this.combL.fill(0)
    this.combR.fill(0)
    this.combW = 0
    this.shL = this.shR = 0
    this.shCountL = this.shCountR = 0
    this.fatL = this.fatR = 0
  }

  // Process a packed stereo buffer [L(0..n), R(n..2n)] in-place.
  processSplit(buf, n, type, cutoff, res, drive, fat, mix) {
    if (!this._vl || this._vl.buffer !== buf.buffer || this._vl.length !== n) {
      this._vl = new Float32Array(buf.buffer, buf.byteOffset, n)
      this._vr = new Float32Array(buf.buffer, buf.byteOffset + n * 4, n)
    }
    this.process(this._vl, this._vr, 0, n, type, cutoff, res, drive, fat, mix)
  }

  // Process [from, to) in-place on stereo buffers.
  process(L, R, from, to, type, cutoff, res, drive, fat, mix) {
    if (type !== this.lastType) {
      this.reset()
      this.lastType = type
    }
    const sr = this.sr
    const fc = cutoff < 10 ? 10 : cutoff > sr * 0.49 ? sr * 0.49 : cutoff
    if (type <= 3) this.ladder(L, R, from, to, type, fc, res, drive, fat, mix)
    else if (type <= 11) this.stateVariable(L, R, from, to, type, fc, res, drive, fat, mix)
    else if (type <= 15) this.comb(L, R, from, to, type, fc, res, drive, mix)
    else if (type === 16) this.ringMod(L, R, from, to, fc, res, drive, mix)
    else this.sampleHold(L, R, from, to, fc, res, drive, mix)
  }

  ladder(L, R, from, to, type, fc, res, drive, fat, mix) {
    const sr = this.sr
    const g = 1 - Math.exp(-2 * Math.PI * fc / sr)
    const k = res * 4.1
    const dr = 1 + drive * 3
    const comp = 1 + 0.5 * k * fat // bass compensation
    const s = this.lad
    const tap = type + 1 // poles 1..4
    const makeup = 1 / Math.max(0.4, Math.tanh(dr) / dr * 1)
    for (let i = from; i < to; i++) {
      // left
      let u = Math.tanh((L[i] * comp - k * s[8]) * dr)
      s[0] += g * (u - s[0])
      s[1] += g * (s[0] - s[1])
      s[2] += g * (s[1] - s[2])
      s[3] += g * (s[2] - s[3])
      s[8] = s[3]
      const wl = (tap === 1 ? s[0] : tap === 2 ? s[1] : tap === 3 ? s[2] : s[3]) * makeup
      L[i] = L[i] + (wl - L[i]) * mix
      // right
      u = Math.tanh((R[i] * comp - k * s[9]) * dr)
      s[4] += g * (u - s[4])
      s[5] += g * (s[4] - s[5])
      s[6] += g * (s[5] - s[6])
      s[7] += g * (s[6] - s[7])
      s[9] = s[7]
      const wr = (tap === 1 ? s[4] : tap === 2 ? s[5] : tap === 3 ? s[6] : s[7]) * makeup
      R[i] = R[i] + (wr - R[i]) * mix
    }
  }

  // ZDF SVF (topology-preserving transform). 12 dB or cascaded 24 dB.
  stateVariable(L, R, from, to, type, fc, res, drive, fat, mix) {
    const sr = this.sr
    const twoStage = type === 5 || type === 7 || type === 9
    // 4 Low12, 5 Low24, 6 High12, 7 High24, 8 Band12, 9 Band24, 10 Notch, 11 Peak
    const kind = type <= 5 ? 0 : type <= 7 ? 1 : type <= 9 ? 2 : type === 10 ? 3 : 4
    const g = Math.tan(Math.PI * fc / sr)
    const k = 2 - 1.96 * (twoStage ? res * 0.8 : res)
    const a1 = 1 / (1 + g * (g + k))
    const a2 = g * a1
    const a3 = g * a2
    const dg = 1 + drive * 8
    const useDrive = drive > 0.001
    const fatCoeff = 1 - Math.exp(-2 * Math.PI * 150 / sr)
    const s = this.svf
    for (let ch = 0; ch < 2; ch++) {
      const buf = ch === 0 ? L : R
      const o = ch * 4
      for (let i = from; i < to; i++) {
        let x = buf[i]
        if (useDrive) x = Math.tanh(x * dg) / Math.tanh(dg) * dg * 0.25 + x * 0.5
        let y = x
        for (let st = 0; st < (twoStage ? 2 : 1); st++) {
          const b = o + st * 2
          const v3 = y - s[b + 1]
          const v1 = a1 * s[b] + a2 * v3
          const v2 = s[b + 1] + a2 * s[b] + a3 * v3
          s[b] = 2 * v1 - s[b]
          s[b + 1] = 2 * v2 - s[b + 1]
          const hp = y - k * v1 - v2
          y = kind === 0 ? v2 : kind === 1 ? hp : kind === 2 ? k * v1 : kind === 3 ? v2 + hp : v2 - hp
        }
        if (fat > 0.001) {
          if (ch === 0) { this.fatL += fatCoeff * (x - this.fatL); y += this.fatL * fat * 0.8 }
          else { this.fatR += fatCoeff * (x - this.fatR); y += this.fatR * fat * 0.8 }
        }
        buf[i] = buf[i] + (y - buf[i]) * mix
      }
    }
  }

  comb(L, R, from, to, type, fc, res, drive, mix) {
    const sr = this.sr
    const sign = (type === 12 || type === 14) ? 1 : -1
    const isFlange = type >= 14
    let d = sr / fc
    if (d < 2) d = 2
    if (d > COMB_BUF - 4) d = COMB_BUF - 4
    const g = isFlange ? res * 0.95 : 0.3 + 0.7 * res
    const dg = 1 + drive * 6
    const useDrive = drive > 0.001
    const bl = this.combL
    const br = this.combR
    let w = this.combW
    for (let i = from; i < to; i++) {
      let xl = L[i]
      let xr = R[i]
      if (useDrive) { xl = Math.tanh(xl * dg) / dg * 2; xr = Math.tanh(xr * dg) / dg * 2 }
      let rp = w - d
      if (rp < 0) rp += COMB_BUF
      const i0 = rp | 0
      const fr = rp - i0
      const i1 = (i0 + 1) % COMB_BUF
      const dl = bl[i0] + (bl[i1] - bl[i0]) * fr
      const drr = br[i0] + (br[i1] - br[i0]) * fr
      let yl, yr
      if (isFlange) {
        yl = xl + sign * g * dl
        yr = xr + sign * g * drr
        bl[w] = yl
        br[w] = yr
        yl *= 0.6
        yr *= 0.6
      } else {
        bl[w] = xl
        br[w] = xr
        yl = (xl + sign * g * dl) / (1 + g)
        yr = (xr + sign * g * drr) / (1 + g)
      }
      w = (w + 1) % COMB_BUF
      L[i] = L[i] + (yl - L[i]) * mix
      R[i] = R[i] + (yr - R[i]) * mix
    }
    this.combW = w
  }

  ringMod(L, R, from, to, fc, res, drive, mix) {
    const inc = fc / this.sr
    const shape = 1 + res * 9
    const norm = 1 / Math.tanh(shape)
    const dg = 1 + drive * 6
    const useDrive = drive > 0.001
    let ph = this.rmPhase
    for (let i = from; i < to; i++) {
      const car = Math.tanh(Math.sin(ph * 2 * Math.PI) * shape) * norm
      ph += inc
      if (ph >= 1) ph -= 1
      let xl = L[i]
      let xr = R[i]
      if (useDrive) { xl = Math.tanh(xl * dg) / dg * 2; xr = Math.tanh(xr * dg) / dg * 2 }
      L[i] = L[i] + (xl * car - L[i]) * mix
      R[i] = R[i] + (xr * car - R[i]) * mix
    }
    this.rmPhase = ph
  }

  sampleHold(L, R, from, to, fc, res, drive, mix) {
    const basePeriod = this.sr / fc
    const dg = 1 + drive * 6
    const useDrive = drive > 0.001
    for (let i = from; i < to; i++) {
      let xl = L[i]
      let xr = R[i]
      if (useDrive) { xl = Math.tanh(xl * dg) / dg * 2; xr = Math.tanh(xr * dg) / dg * 2 }
      this.shCountL -= 1
      if (this.shCountL <= 0) {
        this.shL = xl
        this.shCountL = basePeriod * (1 + res * (Math.random() - 0.5) * 1.5)
      }
      this.shCountR -= 1
      if (this.shCountR <= 0) {
        this.shR = xr
        this.shCountR = basePeriod * (1 + res * (Math.random() - 0.5) * 1.5)
      }
      L[i] = L[i] + (this.shL - L[i]) * mix
      R[i] = R[i] + (this.shR - R[i]) * mix
    }
  }
}
