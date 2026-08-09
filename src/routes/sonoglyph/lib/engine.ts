/**
 * Moteur de mesure — port de `engine/MeterEngine.kt`.
 *
 * Même état, mêmes constantes, même cinématique de crête. La préview n'a donc
 * pas « à peu près » le comportement du toy : elle a le sien, à la source
 * d'échantillons près.
 */

import { BandAnalyzer, Detector, Integrator, TAU_FAST, TAU_SLOW, aWeighting, bandDb, msqToDbfs } from "./dsp";
import type { Filter } from "./dsp";

/**
 * `Lp = dBFS + K`. Valeur **non mesurée** : ordre de grandeur d'un MEMS de
 * téléphone, dont la pleine échelle tombe vers 120 dB SPL. Le curseur de la
 * préview permet de la bouger pour voir ce que la calibration change ; sur
 * l'appareil c'est une constante, tant que la caractérisation n'est pas faite.
 */
export const DEFAULT_K = 120;
export const MIN_DB = 30;
export const MAX_DB = 110;

export const position = (db: number): number =>
  Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));

export type Status = "ok" | "no-mic" | "muted";

export type Snapshot = {
  laf: number;
  las: number;
  laeq: number;
  lafmax: number;
  peak: number;
  bands: Float64Array;
  overload: boolean;
  status: Status;
  elapsed: number;
  t: number;
};

export const CLIP_LEVEL = 0.999;
export const OVERLOAD_LATCH = 1.5;
export const PEAK_HOLD = 1.2;
export const PEAK_FALL = 22;

export class MeterEngine {
  private readonly aFilter: Filter;
  private readonly fast: Detector;
  private readonly slow: Detector;
  private readonly integrator = new Integrator();
  private readonly analyzer: BandAnalyzer;

  private readonly bandMsq: Float64Array;
  private readonly bandsDb: Float64Array;

  private lafmax = MIN_DB;
  private peak = MIN_DB;
  private peakAt = 0;
  private lastT = 0;
  private overloadUntil = -1;
  private zeroRun = 0;

  status: Status = "no-mic";

  constructor(
    readonly fs = 48000,
    public calibrationK = DEFAULT_K,
    readonly bandCount = 25,
  ) {
    this.aFilter = aWeighting(fs);
    this.fast = new Detector(fs, TAU_FAST);
    this.slow = new Detector(fs, TAU_SLOW);
    this.analyzer = new BandAnalyzer(fs, bandCount);
    this.bandMsq = new Float64Array(bandCount);
    this.bandsDb = new Float64Array(bandCount).fill(MIN_DB);
  }

  feed(samples: Float32Array, n: number, now: number): void {
    let clipped = false;
    let allZero = true;
    for (let i = 0; i < n; i++) {
      const x = samples[i];
      if (x !== 0) allZero = false;
      if (Math.abs(x) >= CLIP_LEVEL) clipped = true;
      const a = this.aFilter.process(x);
      this.fast.process(a);
      this.slow.process(a);
      this.integrator.process(a);
      this.analyzer.push(a);
    }
    if (clipped) this.overloadUntil = now + OVERLOAD_LATCH;
    this.zeroRun = allZero ? this.zeroRun + n : 0;
    if (this.status !== "no-mic") this.status = this.zeroRun > this.fs ? "muted" : "ok";
  }

  reset(): void {
    this.integrator.reset();
    this.lafmax = MIN_DB;
    this.peak = MIN_DB;
  }

  clear(): void {
    this.aFilter.reset();
    this.fast.reset();
    this.slow.reset();
    this.analyzer.reset();
    this.reset();
    this.zeroRun = 0;
  }

  snapshot(now: number): Snapshot {
    const dt = this.lastT === 0 ? 0 : Math.min(0.5, Math.max(0, now - this.lastT));
    this.lastT = now;

    const K = this.calibrationK;
    const laf = msqToDbfs(this.fast.meanSquare) + K;
    const las = msqToDbfs(this.slow.meanSquare) + K;
    const laeq = this.integrator.isEmpty ? MIN_DB : msqToDbfs(this.integrator.meanSquare) + K;

    if (this.status === "ok") {
      if (laf > this.lafmax) this.lafmax = laf;
      if (laf >= this.peak) {
        this.peak = laf;
        this.peakAt = now;
      } else if (now - this.peakAt > PEAK_HOLD) {
        this.peak = Math.max(laf, this.peak - PEAK_FALL * dt);
      }

      this.analyzer.analyze(this.bandMsq);
      for (let k = 0; k < this.bandCount; k++) {
        this.bandsDb[k] = bandDb(this.bandMsq[k], K);
      }
    }

    return {
      laf,
      las,
      laeq,
      lafmax: this.lafmax,
      peak: this.peak,
      bands: this.bandsDb,
      overload: now < this.overloadUntil,
      status: this.status,
      elapsed: this.integrator.samples / this.fs,
      t: now,
    };
  }
}

