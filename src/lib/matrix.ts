/**
 * Géométrie de la Glyph Matrix du Nothing Phone (3).
 *
 * Grille de 25 x 25 = 625 cellules en row-major (l'IntArray attendu par le
 * Glyph Matrix SDK), masquée par un disque centré sur (12, 12) de rayon 12,5 —
 * soit 489 LEDs réellement pilotables. Les cellules hors disque existent dans
 * le tableau mais restent à 0 : le SDK les ignore.
 *
 * Valeurs reprises de SPECS.md des repos GlyphLapse / GlyphSlot.
 */

export const SIZE = 25;
export const CELLS = SIZE * SIZE; // 625
export const CX = 12;
export const CY = 12;
export const RADIUS = 12.5;

/** Distance de chaque cellule au centre, indexée en row-major. */
export const dist = new Float32Array(CELLS);

/** Indices row-major des cellules à l'intérieur du disque. */
export const inside: number[] = [];

/** Masque booléen par cellule — plus rapide qu'un `inside.includes()` en boucle. */
export const isInside = new Uint8Array(CELLS);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    const d = Math.hypot(x - CX, y - CY);
    dist[i] = d;
    if (d < RADIUS) {
      inside.push(i);
      isInside[i] = 1;
    }
  }
}

/** 489 sur un Phone (3). Calculé, jamais écrit en dur. */
export const LED_COUNT = inside.length;
