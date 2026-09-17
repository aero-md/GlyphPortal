/**
 * Port de `PlumbEngine.kt` / `PlumbScale.kt` / `Heading.kt` / `PlumbMode.kt`
 * (Haloglyph, toy « Float », anciennement Plumb).
 *
 * Même écart que côté G-Forces : pas d'accéléromètre de navigateur fiable, donc
 * pas de bruit de capteur à filtrer pour de vrai. Le pavé de préview donne
 * directement une **gravité** unitaire (`onGravity`), et le moteur reprend
 * ensuite tel quel — filtre adaptatif compris, il n'a aucune raison de changer
 * puisqu'il ne connaît déjà que des vecteurs de gravité, jamais un capteur brut.
 *
 * `moving` n'existe pas ici : Kotlin l'obtient en comparant l'accélération brute
 * à la gravité lissée, ce qui suppose un vrai capteur. La préview ne verrouille
 * donc que sur l'inclinaison — un pavé qu'on drague ne « bouge » pas au sens du
 * toy, il **est** la pose.
 */

export type PlumbReading = {
  tiltDegrees: number;
  dirX: number;
  dirY: number;
  hasTilt: boolean;
  vertical: boolean;
  alongX: boolean;
  level: boolean;
  heading: number;
  hasHeading: boolean;
};

export type PlumbMode = "niveau" | "boussole";

export function nextPlumbMode(m: PlumbMode): PlumbMode {
  return m === "niveau" ? "boussole" : "niveau";
}

export type PlumbRange = { degrees: number; label: string };

export const RANGES: Record<"fine" | "normale" | "large", PlumbRange> = {
  fine: { degrees: 5, label: "5°" },
  normale: { degrees: 15, label: "15°" },
  large: { degrees: 45, label: "45°" },
};

export const DEFAULT_RANGE = RANGES.normale;

/** Port de `Heading.kt`. */
export const Heading = {
  normalize(degrees: number): number {
    const a = degrees % 360;
    return a < 0 ? a + 360 : a;
  },
  delta(from: number, to: number): number {
    let d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  },
};

/** Port de `PlumbScale.kt`. */
export const PlumbScale = {
  KNEE: 0.2,
  TARGET_FRACTION: 0.32,
  LOCK_FRACTION: 0.04,

  radiusOf(tiltDegrees: number, fullScale: number, maxRadius: number): number {
    if (tiltDegrees <= 0) return 0;
    const r = (maxRadius * Math.log(1 + tiltDegrees / this.KNEE)) / Math.log(1 + fullScale / this.KNEE);
    return Math.min(maxRadius, Math.max(0, r));
  },

  tiltAt(radius: number, fullScale: number, maxRadius: number): number {
    if (radius <= 0 || maxRadius <= 0) return 0;
    return this.KNEE * (Math.exp((radius / maxRadius) * Math.log(1 + fullScale / this.KNEE)) - 1);
  },

  tolerance(range: PlumbRange): number {
    return this.tiltAt(this.LOCK_FRACTION, range.degrees, 1);
  },
};

const ALPHA_CALM = 0.06;
const ALPHA_QUICK = 0.35;
const ADAPT_DEGREES = 3;
const MIN_GRAVITY = 0.5;
const LEVEL_RELEASE = 1.6;
const ENTER_VERTICAL = 70;
const LEAVE_VERTICAL = 65;
const QUARTER_SWITCH = 60;
const HEADING_DEADBAND = 1;

const degreesOf = (sine: number): number => (Math.asin(Math.min(1, Math.max(-1, sine))) * 180) / Math.PI;

export class PlumbEngine {
  range: PlumbRange = DEFAULT_RANGE;

  private gx = 0;
  private gy = 0;
  private gz = 0;
  private settled = false;

  private tilt = 0;
  private dirX = 0;
  private dirY = 0;
  private wasLevel = false;
  private vertical = false;
  private quarter = 0;
  private alongX = true;

  private heading = 0;
  private hasHeading = false;

  private justLeveled = false;

  onGravity(x: number, y: number, z: number): void {
    if (!this.settled) {
      this.gx = x;
      this.gy = y;
      this.gz = z;
      this.settled = true;
    } else {
      const blend = Math.min(1, this.tilt / ADAPT_DEGREES);
      const alpha = ALPHA_CALM + (ALPHA_QUICK - ALPHA_CALM) * blend;
      this.gx += (x - this.gx) * alpha;
      this.gy += (y - this.gy) * alpha;
      this.gz += (z - this.gz) * alpha;
    }
    this.recompute();
  }

  onHeading(degrees: number | null): void {
    if (degrees === null) {
      this.hasHeading = false;
      return;
    }
    if (!this.hasHeading || Math.abs(Heading.delta(this.heading, degrees)) >= HEADING_DEADBAND) {
      this.heading = Heading.normalize(degrees);
    }
    this.hasHeading = true;
  }

  /** La bulle vient-elle d'entrer dans la couronne ? Vrai une fois par entrée. */
  consumeLevel(): boolean {
    const v = this.justLeveled;
    this.justLeveled = false;
    return v;
  }

  reset(): void {
    this.settled = false;
    this.wasLevel = false;
    this.vertical = false;
    this.quarter = 0;
    this.alongX = true;
    this.tilt = this.dirX = this.dirY = 0;
    this.hasHeading = false;
    this.justLeveled = false;
  }

  snapshot(): PlumbReading {
    return {
      tiltDegrees: this.tilt,
      dirX: this.dirX,
      dirY: this.dirY,
      hasTilt: this.settled,
      vertical: this.vertical,
      alongX: this.alongX,
      level: this.wasLevel,
      heading: this.heading,
      hasHeading: this.hasHeading,
    };
  }

  private recompute(): void {
    const n = Math.sqrt(this.gx * this.gx + this.gy * this.gy + this.gz * this.gz);
    if (n < MIN_GRAVITY) return;
    const ux = this.gx / n;
    const uy = this.gy / n;

    const fromFlat = degreesOf(Math.hypot(ux, uy));
    this.vertical = this.vertical ? fromFlat > LEAVE_VERTICAL : fromFlat > ENTER_VERTICAL;

    if (this.vertical) this.plumbAxis(ux, uy);
    else this.flatPlane(ux, uy);

    const tolerance = PlumbScale.tolerance(this.range);
    const limit = this.wasLevel ? tolerance * LEVEL_RELEASE : tolerance;
    const level = this.tilt <= limit;
    if (level && !this.wasLevel) this.justLeveled = true;
    this.wasLevel = level;
  }

  private flatPlane(ux: number, uy: number): void {
    const mag = Math.min(1, Math.hypot(ux, uy));
    this.tilt = degreesOf(mag);
    this.alongX = true;
    if (mag > 1e-4) {
      this.dirX = ux / mag;
      this.dirY = uy / mag;
    }
  }

  private plumbAxis(ux: number, uy: number): void {
    const inPlane = (Math.atan2(ux, uy) * 180) / Math.PI;
    if (Math.abs(Heading.delta(this.quarter * 90, inPlane)) > QUARTER_SWITCH) {
      this.quarter = Math.round(inPlane / 90);
    }
    this.alongX = this.quarter % 2 === 0;
    const across = this.alongX ? ux : uy;
    this.tilt = degreesOf(Math.abs(across));
    const way = across >= 0 ? 1 : -1;
    this.dirX = this.alongX ? way : 0;
    this.dirY = this.alongX ? 0 : way;
  }
}
