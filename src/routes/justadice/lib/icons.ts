/**
 * Les quatre icônes de repos du (4a) Pro — un solide, son nombre de faces.
 *
 * Remplacent la face raytracée à l'aplomb : sur treize colonnes, avant le
 * premier jet il n'y a pas de résultat à lire, et essayer d'y poser la face du
 * dessus d'un dodécaèdre ne dirait qu'« un polygone », pas « un d12 ». Ces
 * quatre trames sont dessinées à la main, au format TXT du Glyph Museum — 137
 * valeurs 0-255, une par LED du disque de 13 × 13, dans l'ordre de lecture —
 * et recopiées telles quelles plutôt que reconstruites.
 */

import type { DieId } from "./solids";

/** Un `p` de dessin Glyph Museum par dé, en CSV plat — voir `glyph-design`. */
const RAW: Record<DieId, string> = {
  d6: "0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,0,0,0,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,255,0,255,0,0,0,0,0,0,0,0,255,255,0,0,0,0,0,0,0,0",
  d10: "0,0,255,0,0,0,0,0,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,255,255,255,255,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,0,0,255,255,0,0,0,0,0,0,0,255,255,0,255,0,255,0,0,0,0,0,255,0,255,0,255,0,255,0,0,0,0,0,0,255,0,255,0,255,0,0,0,0,0,255,0,255,255,0,0,0,0,0,0,0",
  d12: "0,255,255,255,0,0,0,255,255,255,255,255,0,0,0,0,255,255,255,255,255,255,255,0,0,0,0,255,255,255,255,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,0,255,255,0,0,0,0,0,0,0,0,255,255,0,0,0,255,0,0,0,0,0,255,0,255,0,0,255,0,0,0,0,0,0,0,255,0,255,0,0,0,0,0,0,0,255,0,255,255,255,0,0,0,0,0,0",
  d20: "0,0,0,0,0,0,0,0,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,0,0,0,255,255,0,0,0,0,0,0,0,0,255,0,255,0,255,0,0,0,0,0,0,255,0,0,255,0,255,0,0,0,0,255,0,0,0,255,0,255,0,0,0,255,255,255,0,255,255,0,0,0,0,0,0,0",
};

/**
 * Grille 13 × 13, rayon 6,5 — même algorithme que `buildGeometry` : les 137
 * valeurs du `p` sont celles du disque, row-major, et rien d'autre ne s'y
 * ramène.
 */
function expand(csv: string): Float32Array {
  const p = csv.split(",").map(Number);
  const size = 13;
  const cx = (size - 1) / 2;
  const cy = cx;
  const radius = size / 2;
  const out = new Float32Array(size * size);
  let k = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - cx, y - cy) < radius) out[y * size + x] = p[k++] > 0 ? 1 : 0;
    }
  }
  if (k !== p.length) throw new Error(`icône dé : ${p.length} valeurs, ${k} attendues`);
  return out;
}

/** Une trame par dé, prête pour `frameOf` sur la grille du (4a) Pro. */
export const DIE_ICON: Record<DieId, Float32Array> = {
  d6: expand(RAW.d6),
  d10: expand(RAW.d10),
  d12: expand(RAW.d12),
  d20: expand(RAW.d20),
};
