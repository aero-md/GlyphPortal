/**
 * Port TypeScript de `app/src/main/java/dev/aero/sonoglyph/dsp/`.
 *
 * Ce n'est pas une approximation « pour la démo » : les constantes, la
 * factorisation de la pondération A et la transformée bilinéaire sont les mêmes
 * lignes, dans le même ordre. Une préview qui simplifierait la chaîne ne
 * montrerait pas ce que fait le toy, elle montrerait ce qu'on croit qu'il fait.
 *
 * `verify.ts` compare les deux implémentations aux mêmes gabarits.
 */

/* -------------------------------------------------------------------------- */
/* Sections du second ordre                                                    */
/* -------------------------------------------------------------------------- */

export class Biquad {
  private z1 = 0;
  private z2 = 0;

  constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number,
  ) {}

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** |H(e^{jω})| à `f` Hz — normalisation du gain et tests de conformité. */
  magnitude(f: number, fs: number): number {
    const w = (2 * Math.PI * f) / fs;
    const c1 = Math.cos(w);
    const s1 = Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = Math.sin(2 * w);
    const nRe = this.b0 + this.b1 * c1 + this.b2 * c2;
    const nIm = -(this.b1 * s1 + this.b2 * s2);
    const dRe = 1 + this.a1 * c1 + this.a2 * c2;
    const dIm = -(this.a1 * s1 + this.a2 * s2);
    return Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm);
  }

  scaled(k: number): Biquad {
    return new Biquad(this.b0 * k, this.b1 * k, this.b2 * k, this.a1, this.a2);
  }

  /**
   * Transformée bilinéaire d'une section analogique. `n` et `d` sont les
   * coefficients en s décroissant : `[s², s¹, s⁰]`. Pas de pré-warping — voir
   * le commentaire côté Kotlin.
   */
  static bilinear(n: number[], d: number[], fs: number): Biquad {
    const c = 2 * fs;
    const cc = c * c;
    const [n2, n1, n0] = n;
    const [d2, d1, d0] = d;
    const b = [n2 * cc + n1 * c + n0, -2 * n2 * cc + 2 * n0, n2 * cc - n1 * c + n0];
    const a = [d2 * cc + d1 * c + d0, -2 * d2 * cc + 2 * d0, d2 * cc - d1 * c + d0];
    return new Biquad(b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]);
  }
}

export class Filter {
  constructor(private sections: Biquad[]) {}

  reset(): void {
    for (const s of this.sections) s.reset();
  }

  process(x: number): number {
    let y = x;
    for (const s of this.sections) y = s.process(y);
    return y;
  }

  responseDb(f: number, fs: number): number {
    let m = 1;
    for (const s of this.sections) m *= s.magnitude(f, fs);
    return 20 * Math.log10(m);
  }
}

/* -------------------------------------------------------------------------- */
/* Pondérations IEC 61672-1                                                    */
/* -------------------------------------------------------------------------- */

export const F1 = 20.598997;
export const F2 = 107.65265;
export const F3 = 737.86223;
export const F4 = 12194.217;
export const F_REF = 1000;
export const F_HP = 10;

const w = (f: number) => 2 * Math.PI * f;

export function highPass(fs: number): Biquad {
  const wh = w(F_HP);
  return Biquad.bilinear([1, 0, 0], [1, Math.SQRT2 * wh, wh * wh], fs);
}

export function aWeighting(fs: number, withHighPass = true): Filter {
  const w1 = w(F1);
  const w2 = w(F2);
  const w3 = w(F3);
  const w4 = w(F4);
  const sections = [
    Biquad.bilinear([1, 0, 0], [1, 2 * w1, w1 * w1], fs),
    Biquad.bilinear([1, 0, 0], [1, w2 + w3, w2 * w3], fs),
    Biquad.bilinear([0, 0, 1], [1, 2 * w4, w4 * w4], fs),
  ];
  let g = 1;
  for (const s of sections) g *= s.magnitude(F_REF, fs);
  sections[0] = sections[0].scaled(1 / g);
  return new Filter(withHighPass ? [highPass(fs), ...sections] : sections);
}

/* -------------------------------------------------------------------------- */
/* Détecteurs                                                                  */
/* -------------------------------------------------------------------------- */

export const TAU_FAST = 0.125;
export const TAU_SLOW = 1.0;

export class Detector {
  private readonly alpha: number;
  private msq = 0;

  constructor(fs: number, tau: number) {
    this.alpha = 1 - Math.exp(-1 / (fs * tau));
  }

  reset(): void {
    this.msq = 0;
  }

  process(x: number): number {
    this.msq += this.alpha * (x * x - this.msq);
    return this.msq;
  }

  get meanSquare(): number {
    return this.msq;
  }
}

export class Integrator {
  private sum = 0;
  private n = 0;

  reset(): void {
    this.sum = 0;
    this.n = 0;
  }

  process(x: number): void {
    this.sum += x * x;
    this.n++;
  }

  get meanSquare(): number {
    return this.n === 0 ? 0 : this.sum / this.n;
  }

  get samples(): number {
    return this.n;
  }

  get isEmpty(): boolean {
    return this.n === 0;
  }
}

export const FLOOR_DBFS = -200;

/** Carré moyen → dBFS. 0 dBFS = RMS unité, donc un sinus pleine échelle = −3,01. */
export const msqToDbfs = (msq: number): number =>
  msq <= 1e-20 ? FLOOR_DBFS : 10 * Math.log10(msq);

/* -------------------------------------------------------------------------- */
/* FFT radix-2                                                                 */
/* -------------------------------------------------------------------------- */

export class Fft {
  private readonly cosT: Float64Array;
  private readonly sinT: Float64Array;
  private readonly rev: Int32Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(readonly n: number) {
    if (n <= 0 || (n & (n - 1)) !== 0) throw new Error(`taille FFT non puissance de deux : ${n}`);
    this.cosT = new Float64Array(n / 2);
    this.sinT = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cosT[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sinT[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    this.rev = new Int32Array(n);
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j |= bit;
      this.rev[i] = j;
    }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
  }

  /** Spectre de puissance, `n/2` bins, normalisé par n². */
  powerSpectrum(x: Float64Array, out: Float64Array): void {
    const { n, re, im, rev, cosT, sinT } = this;
    for (let i = 0; i < n; i++) {
      re[rev[i]] = x[i];
      im[rev[i]] = 0;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const step = n / len;
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const t = k * step;
          const wr = cosT[t];
          const wi = sinT[t];
          const a = i + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
    const norm = 1 / (n * n);
    for (let k = 0; k < out.length; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) * norm;
  }

  static hann(n: number): Float64Array {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    return w;
  }
}

/* -------------------------------------------------------------------------- */
/* Banc de bandes                                                              */
/* -------------------------------------------------------------------------- */

/** Repli bilatéral (×2) et gain cohérent de Hann (3/8) — voir BandAnalyzer.kt. */
export const POWER_SCALE = 2 / 0.375;

export class BandAnalyzer {
  private readonly fft: Fft;
  private readonly window: Float64Array;
  private readonly ring: Float64Array;
  private readonly block: Float64Array;
  private readonly spectrum: Float64Array;
  private readonly binLo: Int32Array;
  private readonly binHi: Int32Array;
  private head = 0;
  private filled = 0;

  constructor(
    private readonly fs: number,
    readonly bands = 25,
    fLow = 40,
    fHigh = 16000,
    private readonly fftSize = 4096,
  ) {
    this.fft = new Fft(fftSize);
    this.window = Fft.hann(fftSize);
    this.ring = new Float64Array(fftSize);
    this.block = new Float64Array(fftSize);
    this.spectrum = new Float64Array(fftSize / 2);
    this.binLo = new Int32Array(bands);
    this.binHi = new Int32Array(bands);

    const ratio = (fHigh / fLow) ** (1 / bands);
    const nyquistBin = fftSize / 2 - 1;
    const clamp = (v: number) => Math.min(nyquistBin, Math.max(1, v));
    for (let k = 0; k < bands; k++) {
      const f0 = fLow * ratio ** k;
      const f1 = fLow * ratio ** (k + 1);
      let lo = clamp(Math.round((f0 * fftSize) / fs));
      const hi = clamp(Math.round((f1 * fftSize) / fs));
      if (lo > hi) lo = hi;
      this.binLo[k] = lo;
      this.binHi[k] = hi;
    }
  }

  reset(): void {
    this.ring.fill(0);
    this.head = 0;
    this.filled = 0;
  }

  push(x: number): void {
    this.ring[this.head] = x;
    this.head = (this.head + 1) % this.fftSize;
    if (this.filled < this.fftSize) this.filled++;
  }

  get isReady(): boolean {
    return this.filled >= this.fftSize;
  }

  analyze(out: Float64Array): void {
    const { fftSize, ring, window, block, spectrum, head } = this;
    if (!this.isReady) {
      out.fill(0);
      return;
    }
    for (let i = 0; i < fftSize; i++) block[i] = ring[(head + i) % fftSize] * window[i];
    this.fft.powerSpectrum(block, spectrum);
    for (let k = 0; k < this.bands; k++) {
      let s = 0;
      for (let b = this.binLo[k]; b <= this.binHi[k]; b++) s += spectrum[b];
      out[k] = s * POWER_SCALE;
    }
  }
}

export const bandDb = (msq: number, calibrationK: number): number =>
  msq <= 1e-20 ? FLOOR_DBFS : 10 * Math.log10(msq) + calibrationK;
