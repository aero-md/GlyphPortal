/**
 * Port de `GForceRenderer.kt` (Haloglyph) — la bille et les graduations, ou les
 * quatre pics en croix.
 *
 * La matrice de la préview est toujours regardée **au dos** — même convention
 * que les autres toys du portail — donc l'abscisse est niée en permanence
 * (`mirror = -1`), ce qui échange les deux pics latéraux comme sur l'appareil.
 */

import { F3D, Grid, R4, charWidth, extend, textWidth, type Device } from "$lib";
import { FULL_SCALE, TICKS, formatG, type GForceReading } from "./engine";

const BALL = ["01110", "11111", "11111", "11111", "01110"];
const BALL_HALF = 2;

const TICK_HALF = 2;
const AIM = 0.24;
const VALUE = 0.9;

const LEFT_X = 1;
const RIGHT_X = 15;
const AXIS_X = 8;
const TOP_Y = 2;
const MID_Y = 10;
const BOTTOM_Y = 17;

/**
 * Port compact (4a) Pro — voir `ball()` et `graduations()`. Même bille croix
 * que le niveau de Float, mêmes graduations en losange creux que sa couronne
 * (114/255, pas `AIM`) : deux crans au lieu de deux échelles à cinq cellules,
 * calés à la main sur les relevés du 2026-09-20 (d = 3 et 5).
 */
const COMPACT_BALL = ["010", "111", "010"];
const COMPACT_BALL_HALF = 1;
const COMPACT_TICK_DISTS = [3, 5];
const COMPACT_TICK_HALF = 1;
const COMPACT_TICK = 114 / 255;

/**
 * Le point décimal du cadran des pics sur (4a) Pro : une seule cellule, à la
 * ligne de base du chiffre — voir `PEAK_FONT`. `F3D` n'a que des chiffres et
 * un `+` (voir sonoglyph) ; c'est le seul ajout que ce cadran lui fait, en
 * local et sans toucher à l'export partagé (même logique que `extend()` pour
 * MIC / --- côté Sonoglyph).
 */
const PEAK_FONT = extend(F3D, { ".": ["0", "0", "0", "0", "1"] });
/** Exporté pour `scripts/gforce-preview.ts` : un cycle complet dure `PEAK_PER * 4`. */
export const PEAK_PER = 2.0;
const PEAK_SLIDE = 0.3;

/**
 * Les quatre flèches du cadran des pics — losange creux, comme le repère nord
 * de la boussole de Float : pointe simple, ailes qui laissent un trou au
 * centre, hampe pleine. Dessin tiré des quatre relevés « pics » (2026-09-20),
 * puis la cellule de hampe la plus proche des ailes retirée : accolée à
 * elles, elle lisait comme une croix plutôt que comme une flèche.
 */
const ARROW_FRONT = ["010", "101", "000", "010", "010"];
const ARROW_REAR = ["010", "010", "000", "101", "010"];
const ARROW_RIGHT = ["00010", "11001", "00010"];
const ARROW_LEFT = ["01000", "10011", "01000"];

export class GForceRenderer {
  private readonly grid: Grid;
  private readonly cx: number;
  private readonly cy: number;
  private readonly usableRadius: number;
  /** Port compact (4a) Pro — voir `ball()`, `graduations()` et `renderPeaks()`. */
  private readonly compact: boolean;

  constructor(private readonly device: Device) {
    this.grid = new Grid(device);
    this.cx = device.cx;
    this.cy = device.cy;
    this.usableRadius = device.maxDist;
    this.compact = device.id === "phone4apro";
  }

  renderLive(reading: GForceReading): Float32Array {
    this.grid.clear();
    this.graduations();
    if (reading.hasFix) {
      let dx = (-1 * reading.towardRight) / FULL_SCALE;
      let dy = reading.towardFront / FULL_SCALE;
      const reach = Math.hypot(dx, dy);
      if (reach > 1) {
        dx /= reach;
        dy /= reach;
      }
      this.ball(
        Math.round(this.cx + dx * this.usableRadius),
        Math.round(this.cy - dy * this.usableRadius),
      );
    }
    return this.grid.g;
  }

  /**
   * `t`, le temps d'animation écoulé, ne sert qu'au défilement compact — voir
   * `renderPeaksCompact()`. Le (3) affiche ses quatre pics d'un coup, dans
   * les quatre coins ; treize colonnes n'en ont la place que pour un à la
   * fois.
   */
  renderPeaks(reading: GForceReading, t = 0): Float32Array {
    this.grid.clear();
    if (this.compact) {
      this.renderPeaksCompact(reading, t);
      return this.grid.g;
    }
    // Le miroir échange les deux latéraux, comme la bille en mode vif.
    const onLeft = reading.right;
    const onRight = reading.left;
    this.value(reading.front, AXIS_X, TOP_Y);
    this.value(reading.rear, AXIS_X, BOTTOM_Y);
    this.value(onLeft, LEFT_X, MID_Y);
    this.value(onRight, RIGHT_X, MID_Y);
    return this.grid.g;
  }

  /**
   * Une valeur à la fois, qui défile vers le haut — même geste que le cycle
   * d'unités de GlyphLapse (`LapseRenderer.cycle()`) : le vertical dit « c'est
   * la suite de la même chose », ici les quatre pics d'un même relevé. Avant,
   * droite, arrière, gauche — l'ordre des quatre relevés du 2026-09-20, pas
   * choisi autrement.
   */
  private renderPeaksCompact(reading: GForceReading, t: number): void {
    const items = [
      { value: reading.front, arrow: ARROW_FRONT },
      { value: reading.right, arrow: ARROW_RIGHT },
      { value: reading.rear, arrow: ARROW_REAR },
      { value: reading.left, arrow: ARROW_LEFT },
    ];
    const n = items.length;
    const tt = t % (PEAK_PER * n);
    const idx = Math.floor(tt / PEAK_PER);
    const ph = tt - idx * PEAK_PER;
    const sl = Math.min(1, ph / PEAK_SLIDE);
    const e = 1 - Math.pow(1 - sl, 3);
    const cur = items[idx];
    const prev = items[(idx + n - 1) % n];

    const page = (item: (typeof items)[number], dy: number) => {
      const g = formatG(item.value);
      const text = `${g[0]}.${g[1]}`;
      const x0 = Math.round((this.device.size - textWidth(PEAK_FONT, text)) / 2);
      this.grid.drawText(PEAK_FONT, text, x0, this.cy - 4 + dy, 1);
      this.arrow(item.arrow, this.cx, this.cy + 4 + dy, 1);
    };

    if (sl < 1) page(prev, Math.round(-e * this.device.size));
    page(cur, Math.round((1 - e) * this.device.size));
  }

  /** Une flèche creuse — pointe, ailes, hampe — centrée sur `(cx, cy)`. */
  private arrow(shape: string[], cx: number, cy: number, b: number): void {
    const h = shape.length;
    const w = shape[0].length;
    const x0 = cx - Math.floor(w / 2);
    const y0 = cy - Math.floor(h / 2);
    for (let r = 0; r < h; r++)
      for (let k = 0; k < w; k++) if (shape[r][k] === "1") this.grid.set(x0 + k, y0 + r, b);
  }

  private graduations(): void {
    if (this.compact) {
      for (const d of COMPACT_TICK_DISTS) {
        for (let t = -COMPACT_TICK_HALF; t <= COMPACT_TICK_HALF; t++) {
          this.grid.set(this.cx + t, this.cy - d, COMPACT_TICK);
          this.grid.set(this.cx + t, this.cy + d, COMPACT_TICK);
          this.grid.set(this.cx - d, this.cy + t, COMPACT_TICK);
          this.grid.set(this.cx + d, this.cy + t, COMPACT_TICK);
        }
      }
      return;
    }
    for (let k = 1; k <= TICKS; k++) {
      const d = Math.round((this.usableRadius * k) / (TICKS + 1));
      for (let t = -TICK_HALF; t <= TICK_HALF; t++) {
        this.grid.set(this.cx + t, this.cy - d, AIM);
        this.grid.set(this.cx + t, this.cy + d, AIM);
        this.grid.set(this.cx - d, this.cy + t, AIM);
        this.grid.set(this.cx + d, this.cy + t, AIM);
      }
    }
  }

  private value(g: number, x0: number, y0: number): void {
    this.grid.drawText(R4, formatG(g), x0, y0, VALUE);
    this.grid.set(x0 + charWidth(R4, "0"), y0 + R4.height, VALUE);
  }

  private ball(bx: number, by: number): void {
    const shape = this.compact ? COMPACT_BALL : BALL;
    const half = this.compact ? COMPACT_BALL_HALF : BALL_HALF;
    for (let row = 0; row < shape.length; row++) {
      const line = shape[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1") this.grid.set(bx + col - half, by + row - half, 1);
      }
    }
  }
}
