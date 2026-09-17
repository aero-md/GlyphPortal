/**
 * Moteur de mesure — port de `SonoEngine.kt` (Haloglyph).
 *
 * Même état, mêmes constantes, même cinématique de crête. La préview n'a donc
 * pas « à peu près » le comportement du toy : elle a le sien, à la source
 * d'échantillons près.
 */

import { BandAnalyzer, Detector, FLOOR_DBFS, Integrator, TAU_FAST, TAU_SLOW, aWeighting, bandDb, msqToDbfs } from "./dsp";
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
  /** Marqueur de crête : tient `PEAK_HOLD` s puis redescend. */
  peak: number;
  /**
   * Crête **instantanée** depuis l'instantané précédent, en dB SPL — le
   * maximum de `lpeaks`. Ni Fast ni Slow : aucune constante de temps, juste
   * le plus fort échantillon pondéré A du dernier trentième de seconde.
   */
  lpeak: number;
  /**
   * Les crêtes par tranche de `PEAK_SLICE_SECONDS`, de la plus ancienne à la
   * plus récente ; seules les `lpeakCount` premières valent quelque chose.
   * C'est ce que lit la forme d'onde — une colonne par tranche, pas par image.
   */
  lpeaks: Float64Array;
  lpeakCount: number;
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

/**
 * Durée d'une tranche de crête, en secondes — donc d'une colonne de forme
 * d'onde. Le disque en porte vingt-cinq : l'onde le traverse donc en quatre
 * dixièmes de seconde.
 */
export const PEAK_SLICE_SECONDS = 0.016;

/** Tranches gardées entre deux instantanés — trente-deux valent quatre dixièmes de seconde. */
export const MAX_SLICES = 32;

/** Constante du moyennage en puissance des bandes, en secondes — cinq à six images. */
export const TAU_BAND = 0.2;

export class MeterEngine {
  private readonly aFilter: Filter;
  private readonly fast: Detector;
  private readonly slow: Detector;
  private readonly integrator = new Integrator();
  private readonly analyzer: BandAnalyzer;

  private readonly bandMsq: Float64Array;
  private readonly bandsDb: Float64Array;

  /** Moyenne glissante de la puissance par bande — voir `TAU_BAND`. */
  private readonly bandAvg: Float64Array;
  private bandAvgSeeded = false;

  private lafmax = MIN_DB;
  private peak = MIN_DB;
  private peakAt = 0;
  private lastT = 0;
  private overloadUntil = -1;
  private zeroRun = 0;

  /** Crêtes par tranche, entre `feed` qui les écrit et `snapshot` qui les vide. */
  private readonly slicePeaks = new Float64Array(MAX_SLICES);
  private sliceCount = 0;
  private sliceAccum = 0;
  private sliceSamples = 0;
  private readonly slicePeriod: number;
  private readonly lpeaksDb = new Float64Array(MAX_SLICES);

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
    this.bandAvg = new Float64Array(bandCount);
    this.slicePeriod = Math.max(1, Math.round(fs * PEAK_SLICE_SECONDS));
  }

  feed(samples: Float32Array, n: number, now: number): void {
    let clipped = false;
    let allZero = true;
    for (let i = 0; i < n; i++) {
      const x = samples[i];
      if (x !== 0) allZero = false;
      if (Math.abs(x) >= CLIP_LEVEL) clipped = true;
      // la surcharge se lit sur l'échantillon brut : une fois filtré, le
      // plafonnement n'est plus détectable
      const a = this.aFilter.process(x);
      const magnitude = Math.abs(a);
      if (magnitude > this.sliceAccum) this.sliceAccum = magnitude;
      if (++this.sliceSamples >= this.slicePeriod) {
        this.pushSlice();
        this.sliceAccum = 0;
        this.sliceSamples = 0;
      }
      this.fast.process(a);
      this.slow.process(a);
      this.integrator.process(a);
      this.analyzer.push(a);
    }
    if (clipped) this.overloadUntil = now + OVERLOAD_LATCH;
    this.zeroRun = allZero ? this.zeroRun + n : 0;
    if (this.status !== "no-mic") this.status = this.zeroRun > this.fs ? "muted" : "ok";
  }

  /** Clôt une tranche. Le tampon plein, c'est la plus ancienne qui saute. */
  private pushSlice(): void {
    if (this.sliceCount === MAX_SLICES) {
      this.slicePeaks.copyWithin(0, 1, MAX_SLICES);
      this.sliceCount--;
    }
    this.slicePeaks[this.sliceCount++] = this.sliceAccum;
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
    this.bandAvg.fill(0);
    this.bandAvgSeeded = false;
    this.sliceCount = 0;
    this.sliceAccum = 0;
    this.sliceSamples = 0;
  }

  snapshot(now: number): Snapshot {
    const dt = this.lastT === 0 ? 0 : Math.min(0.5, Math.max(0, now - this.lastT));
    this.lastT = now;

    const K = this.calibrationK;
    const laf = msqToDbfs(this.fast.meanSquare) + K;
    const las = msqToDbfs(this.slow.meanSquare) + K;
    const laeq = this.integrator.isEmpty ? MIN_DB : msqToDbfs(this.integrator.meanSquare) + K;

    // Crêtes consommées : chacune est une colonne de forme d'onde, et lire vide le tampon.
    const count = this.sliceCount;
    this.lpeaksDb.set(this.slicePeaks.subarray(0, count));
    this.sliceCount = 0;
    let lpeak = FLOOR_DBFS + K;
    for (let j = 0; j < count; j++) {
      const db = msqToDbfs(this.lpeaksDb[j] * this.lpeaksDb[j]) + K;
      this.lpeaksDb[j] = db;
      if (db > lpeak) lpeak = db;
    }

    if (this.status === "ok") {
      if (laf > this.lafmax) this.lafmax = laf;
      if (laf >= this.peak) {
        this.peak = laf;
        this.peakAt = now;
      } else if (now - this.peakAt > PEAK_HOLD) {
        this.peak = Math.max(laf, this.peak - PEAK_FALL * dt);
      }

      this.analyzer.analyze(this.bandMsq);
      // Moyennage en puissance, comme le fait un analyseur : l'estimation d'une
      // bande est bruitée par construction (une bande grave ne tient qu'un ou
      // deux points de FFT), et cinq à six images moyennées ramènent le fond
      // sous la marge de `NoiseFloor.GATE_DB`.
      const a = dt <= 0 || !this.bandAvgSeeded ? 1 : 1 - Math.exp(-dt / TAU_BAND);
      this.bandAvgSeeded = true;
      for (let k = 0; k < this.bandCount; k++) {
        this.bandAvg[k] += (this.bandMsq[k] - this.bandAvg[k]) * a;
        this.bandsDb[k] = bandDb(this.bandAvg[k], K);
      }
    }

    return {
      laf,
      las,
      laeq,
      lafmax: this.lafmax,
      peak: this.peak,
      lpeak,
      lpeaks: this.lpeaksDb,
      lpeakCount: count,
      bands: this.bandsDb,
      overload: now < this.overloadUntil,
      status: this.status,
      elapsed: this.integrator.samples / this.fs,
      t: now,
    };
  }
}

