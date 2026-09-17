/**
 * Port de `NoiseFloor.kt` — l'écart au fond de la scène, plutôt qu'un niveau
 * absolu.
 *
 * Une pièce vide n'est pas silencieuse : trente à cinquante décibels de fond en
 * permanence, qui occupaient un tiers du disque sur une échelle absolue. Le
 * plancher suit ce fond par canal — descente rapide vers un creux, montée lente
 * bornée par le niveau courant — et `position()` rapporte ce qui **sort de
 * l'ordinaire**, pas ce qui est fort.
 */
export class NoiseFloor {
  static readonly SILENT_DB = 0;
  static readonly TAU_FALL = 0.4;
  static readonly RISE_DB_PER_S = 0.6;
  static readonly GATE_DB = 9;
  static readonly SPAN_DB = 28;

  private readonly floor: Float64Array;

  constructor(
    channels: number,
    private readonly silenceDb = NoiseFloor.SILENT_DB,
  ) {
    this.floor = new Float64Array(channels).fill(NaN);
  }

  clear(): void {
    this.floor.fill(NaN);
  }

  floorOf(k: number): number {
    return this.floor[k];
  }

  /** Avance le plancher du canal `k` vers `db`, `dt` secondes après le dernier appel. */
  update(k: number, db: number, dt: number): void {
    if (!this.isMeasurement(db)) return;
    const current = this.floor[k];
    if (Number.isNaN(current) || db < current) {
      this.floor[k] = Number.isNaN(current) ? db : current + (db - current) * (1 - Math.exp(-dt / NoiseFloor.TAU_FALL));
    } else {
      this.floor[k] = Math.min(db, current + NoiseFloor.RISE_DB_PER_S * dt);
    }
  }

  /** Position 0..1 de `db` sur l'échelle du canal `k` : zéro au plancher + la marge. */
  position(k: number, db: number): number {
    const base = this.floor[k];
    if (Number.isNaN(base) || !this.isMeasurement(db)) return 0;
    return Math.min(1, Math.max(0, (db - base - NoiseFloor.GATE_DB) / NoiseFloor.SPAN_DB));
  }

  isMeasurement(db: number): boolean {
    return Number.isFinite(db) && db > this.silenceDb;
  }
}
