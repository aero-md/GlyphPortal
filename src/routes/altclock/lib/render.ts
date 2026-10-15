/**
 * Port de `AltClockRenderer.kt` (Haloglyph) : l'heure en deux lignes de deux
 * chiffres, les heures au-dessus des minutes. `05 14` s'écrit `05` puis `14`,
 * sans séparateur.
 *
 * ## Le placement est retrouvé, pas écrit
 *
 * Aucune coordonnée ici : chaque police est centrée sur le disque, et la boîte
 * des trames de référence est exactement celle que donne ce centrage. Pour des
 * chiffres de 7×10 (Élégant, Techno large), deux chiffres et un blanc font 15
 * colonnes, deux lignes et un blanc font 21 lignes : coin en (5, 2), bloc en
 * x 5–19, y 2–22. Pour ceux de 5×8 (Techno) : coin en (7, 4), bloc en x 7–17,
 * y 4–20. Les deux sont centrés sur (12, 12).
 *
 * ## Le (4a) Pro n'a pas la place
 *
 * Treize colonnes ne portent pas des chiffres de 7 sur 10. Le port compact
 * écrit les mêmes deux lignes en `F3D`, le chiffre de tout cadran compact du
 * pack, **quel que soit le style** : aucune trame n'existe pour ce port, et on
 * n'invente pas trois polices de 3×5.
 */

import { F3D, Grid, type Device, type Font } from "$lib";
import { ELEGANT, TECHNO, TECHNO_LARGE } from "./fonts";

export type AltClockStyle = "elegant" | "techno_large" | "techno";
export type HourFormat = "h24" | "h12";

/** Dans l'ordre du sélecteur, l'Élégant en premier : c'est le style d'origine. */
export const STYLES: AltClockStyle[] = ["elegant", "techno_large", "techno"];
export const FORMATS: HourFormat[] = ["h24", "h12"];

const FONTS: Record<AltClockStyle, Font> = {
  elegant: ELEGANT,
  techno_large: TECHNO_LARGE,
  techno: TECHNO,
};

/**
 * L'heure telle qu'elle s'écrit dans ce format. En 12 h, minuit et midi
 * s'écrivent `12`, jamais `00` : `0 h` → `12`, `13 h` → `1`.
 */
export function displayHour(hour: number, format: HourFormat): number {
  if (format === "h24") return hour;
  return hour % 12 === 0 ? 12 : hour % 12;
}

/** `5` → `05`. Le zéro de tête reste, y compris en 12 h. */
function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export class AltClockRenderer {
  private readonly grid: Grid;
  private readonly compact: boolean;
  private readonly size: number;

  constructor(device: Device) {
    this.grid = new Grid(device);
    this.compact = device.id === "phone4apro";
    this.size = device.size;
  }

  render(
    hour: number,
    minute: number,
    format: HourFormat = "h24",
    style: AltClockStyle = "elegant",
  ): Float32Array {
    return this.renderLines(two(displayHour(hour, format)), two(minute), style);
  }

  /** Deux lignes de chiffres, sans rien supposer d'une heure. */
  renderLines(top: string, bottom: string, style: AltClockStyle): Float32Array {
    this.grid.clear();
    const font = this.compact ? F3D : FONTS[style];
    const y0 = Math.round((this.size - (2 * font.height + 1)) / 2);
    this.grid.centeredText(font, top, y0, 1);
    this.grid.centeredText(font, bottom, y0 + font.height + 1, 1);
    return this.grid.g;
  }
}
