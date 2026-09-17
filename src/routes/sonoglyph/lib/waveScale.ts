/**
 * Port de `WaveScale.kt` — l'échelle de la forme d'onde : amplitude linéaire,
 * rapportée au plus fort du moment.
 *
 * Ce n'est pas une échelle en décibels : une amplitude est linéaire, donc un
 * bruit trente décibels sous la parole occupe un trente-deuxième de la
 * hauteur, pas trois dixièmes. C'est ce qui rend l'onde plate dans le silence,
 * comme sur un enregistreur — et non gris comme un spectre.
 *
 * Rapportée à un plafond qui suit le plus fort récent : attaque immédiate,
 * chute lente. Deux garde-fous : le plafond ne descend jamais sous
 * `MIN_RANGE_DB` au-dessus du fond de scène, et rien ne s'affiche sous le
 * seuil de bruit du canal (`NoiseFloor.GATE_DB`).
 */
import { NoiseFloor } from "./noiseFloor";

export class WaveScale {
  /** Exposant de mise en forme — creuse ce qui suit le plafond, voir NoiseFloor.kt côté Kotlin. */
  static readonly SHAPE = 1.6;
  static readonly FALL_DB_PER_S = 10;
  static readonly MIN_RANGE_DB = 30;

  private readonly floor = new NoiseFloor(1);
  private ceiling = NaN;

  clear(): void {
    this.floor.clear();
    this.ceiling = NaN;
  }

  floorDb(): number {
    return this.floor.floorOf(0);
  }

  ceilingDb(): number {
    return this.ceiling;
  }

  /** Ouvre une image : le plafond redescend de `FALL_DB_PER_S × dt`. À appeler avant `update`. */
  decay(dt: number): void {
    if (!Number.isNaN(this.ceiling)) this.ceiling -= WaveScale.FALL_DB_PER_S * dt;
  }

  update(db: number, dt: number): void {
    this.floor.update(0, db, dt);
    if (!this.floor.isMeasurement(db)) return;
    if (Number.isNaN(this.ceiling) || db > this.ceiling) this.ceiling = db;
  }

  /** Hauteur 0..1 à donner à `db` dans la colonne courante. */
  amplitude(db: number): number {
    const base = this.floor.floorOf(0);
    if (Number.isNaN(base) || !this.floor.isMeasurement(db)) return 0;
    if (db <= base + NoiseFloor.GATE_DB) return 0;

    const top = Math.max(Number.isNaN(this.ceiling) ? base : this.ceiling, base + WaveScale.MIN_RANGE_DB);
    if (db >= top) return 1;
    return Math.pow(10 ** ((db - top) / 20), WaveScale.SHAPE);
  }
}
