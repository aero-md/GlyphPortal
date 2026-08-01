/**
 * Rendu de la matrice sur un canvas.
 *
 * Une cellule occupe un nombre **entier** de pixels de canvas. Un canvas de
 * taille fixe redimensionné par le navigateur avec un ratio fractionnaire
 * produit une trame irrégulière : une colonne sur n gagne un pixel de gap.
 * La grille est donc calculée depuis le devicePixelRatio, comme dans la préview
 * de GlyphLapse.
 */

import { SIZE, inside } from "./matrix";
import type { Frame } from "./pipeline";

export type Grid = {
  cell: number;
  led: number;
  pad: number;
  /** Côté du canvas en pixels de backing. */
  size: number;
  /** Côté correspondant en pixels CSS — ratio backing/CSS exactement 1. */
  cssSize: number;
};

/**
 * Grille pour un affichage écran, calibrée sur `cellCss` px CSS par LED.
 * 6 px CSS × 25 = 150 px, soit le diamètre réel de la matrice quand le
 * téléphone est rendu à 576 px de large (26,04 % du cadre photo).
 */
export function screenGrid(cellCss = 6, dpr = window.devicePixelRatio || 1): Grid {
  const cell = Math.max(3, Math.round(cellCss * dpr));
  const led = Math.max(2, Math.round((cell * 2) / 3));
  const size = SIZE * cell;
  return { cell, led, pad: (cell - led) / 2, size, cssSize: size / dpr };
}

/** Grille pour un export PNG : `cell` px par LED, ratio LED/gap identique. */
export function exportGrid(cell: number): Grid {
  const led = Math.max(2, Math.round((cell * 2) / 3));
  const size = SIZE * cell;
  return { cell, led, pad: (cell - led) / 2, size, cssSize: size };
}

export type PaintOpts = {
  /** Peint le fond du disque (nécessaire pour un PNG autonome). */
  background?: string | null;
  /** Halo autour des LEDs allumées. Coûteux : coupé pour les gros exports. */
  glow?: boolean;
};

const ON = "242,242,239"; // blanc légèrement chaud des LEDs du Phone (3)
const OFF = "#1b1b20";

export function paint(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  g: Grid,
  opts: PaintOpts = {},
): void {
  const { background = null, glow = true } = opts;

  ctx.clearRect(0, 0, g.size, g.size);
  if (background) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.size / 2, g.size / 2, g.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = background;
    ctx.fill();
    ctx.restore();
  }

  for (const i of inside) {
    const x = i % SIZE;
    const y = (i - x) / SIZE;
    const b = frame.values[i];
    if (b <= 0.02) {
      ctx.fillStyle = OFF;
      ctx.shadowBlur = 0;
    } else {
      // 0,25 de plancher : une LED à 1 % reste visible comme allumée, sinon la
      // moitié basse de la plage disparaît à l'écran
      ctx.fillStyle = `rgba(${ON},${0.25 + 0.75 * b})`;
      if (glow) {
        ctx.shadowColor = `rgba(${ON},${0.8 * b})`;
        ctx.shadowBlur = g.cell * 0.55 * b;
      }
    }
    ctx.fillRect(x * g.cell + g.pad, y * g.cell + g.pad, g.led, g.led);
    ctx.shadowBlur = 0;
  }
}
