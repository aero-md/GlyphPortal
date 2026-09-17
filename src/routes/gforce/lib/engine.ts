/**
 * Port de `GForceEngine.kt` / `GForceScale.kt` / `GForceMode.kt` (Haloglyph).
 *
 * Le moteur Kotlin part de la gravité fusionnée et de l'accélération propre du
 * téléphone pour en déduire `towardFront`/`towardRight`, projetées sur le plan
 * horizontal — tout ce travail d'orientation n'a pas de sens ici : il n'y a pas
 * d'accéléromètre à corriger dans un navigateur. La préview donne donc
 * directement la poussée ressentie, au doigt sur le pavé, et ne reprend du
 * moteur d'origine que ce qui reste après la projection : le passe-bas à 4 Hz
 * (`ALPHA`) et le suivi des quatre pics.
 */

export type GForceReading = {
  towardFront: number;
  towardRight: number;
  hasFix: boolean;
  front: number;
  rear: number;
  left: number;
  right: number;
};

/** Coefficient du passe-bas pour un pas de ~20 ms (SENSOR_DELAY_GAME) — voir GForceEngine.kt. */
const ALPHA_PER_20MS = 0.35;

export class GForceEngine {
  private ax = 0;
  private ay = 0;
  private hasFix = false;

  private peakFront = 0;
  private peakRear = 0;
  private peakLeft = 0;
  private peakRight = 0;

  /** Cible posée par le pavé — ce que « subirait » le conducteur si on y était. */
  private targetFront = 0;
  private targetRight = 0;

  setTarget(front: number, right: number): void {
    this.targetFront = front;
    this.targetRight = right;
    this.hasFix = true;
  }

  /** Le pavé est relâché : plus aucune force n'est appliquée. */
  release(): void {
    this.targetFront = 0;
    this.targetRight = 0;
  }

  /** Un pas de simulation, `dt` en secondes — le passe-bas est indépendant de la cadence. */
  step(dt: number): void {
    if (!this.hasFix) return;
    // alpha équivalent au passe-bas Kotlin (0,35 tous les 20 ms), étendu à un pas
    // de temps continu : ALPHA_PER_20MS ^ (dt / 0,02) resterait le même filtre à
    // n'importe quelle cadence d'images.
    const alpha = 1 - (1 - ALPHA_PER_20MS) ** (dt / 0.02);
    this.ax += (this.targetFront - this.ax) * alpha;
    this.ay += (this.targetRight - this.ay) * alpha;

    this.peakFront = Math.max(this.peakFront, this.ax);
    this.peakRear = Math.max(this.peakRear, -this.ax);
    this.peakRight = Math.max(this.peakRight, this.ay);
    this.peakLeft = Math.max(this.peakLeft, -this.ay);
  }

  clearPeaks(): void {
    this.peakFront = this.peakRear = this.peakLeft = this.peakRight = 0;
  }

  reset(): void {
    this.ax = this.ay = 0;
    this.hasFix = false;
    this.targetFront = this.targetRight = 0;
    this.clearPeaks();
  }

  snapshot(): GForceReading {
    return {
      towardFront: this.ax,
      towardRight: this.ay,
      hasFix: this.hasFix,
      front: this.peakFront,
      rear: this.peakRear,
      left: this.peakLeft,
      right: this.peakRight,
    };
  }
}

/** Port de `GForceMode.kt`. */
export type GForceMode = "vif" | "pics";

export function nextGForceMode(m: GForceMode): GForceMode {
  return m === "vif" ? "pics" : "vif";
}

/** Port de `GForceScale.kt` — le g qui colle la bille au cerne, et ses deux graduations. */
export const FULL_SCALE = 1.5;
export const TICK = FULL_SCALE / 3;
export const TICKS = 2;

/** Deux chiffres, dixièmes compris, écrêtés à 9,9 g. */
export function formatG(g: number): string {
  const tenths = Math.min(99, Math.max(0, Math.round(g * 10)));
  return `${Math.floor(tenths / 10)}${tenths % 10}`;
}
