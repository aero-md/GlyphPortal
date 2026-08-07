/**
 * Les polices du toy : celles de `@glyph/kit` plus les capitales que GlyphLapse
 * écrit — les unités calendaires (A, M, J, H, MIN) et le wordmark.
 *
 * Deux glyphes sont **surchargés**, et c'est délibéré :
 *
 * - `M` en 5×7 porte sa diagonale sur une ligne de plus. À côté d'un chiffre,
 *   c'est ce qui l'empêche de se lire comme un `H` empâté.
 * - `-` en 5×7 ne fait que trois colonnes. Il sert ici dans « J-123 », où un
 *   tiret pleine chasse séparerait le J du nombre au lieu de les lier.
 *
 * Voir `extend` dans le kit : ce qui est partagé l'est parce qu'il est
 * identique au point près, pas parce qu'on a tranché entre deux dessins.
 */

import { F3 as F3_BASE, F5 as F5_BASE, extend } from "@glyph/kit";

/** 3×5 — la granularité complète, jusqu'à trois lignes dans le disque. */
export const F3 = extend(F3_BASE, {
  A: ["010", "101", "111", "101", "101"],
  J: ["001", "001", "001", "101", "111"],
  H: ["101", "101", "111", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  N: ["1001", "1101", "1011", "1001", "1001"],
  "+": ["000", "010", "111", "010", "000"],
  "'": ["1", "1", "0", "0", "0"],
  G: ["011", "100", "101", "101", "011"],
  L: ["100", "100", "100", "100", "111"],
  Y: ["101", "101", "010", "010", "010"],
  P: ["111", "101", "111", "100", "100"],
  E: ["111", "100", "110", "100", "111"],
});

/** 5×7 — une ou deux unités, quand il y a la place de les écrire en grand. */
export const F5 = extend(F5_BASE, {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  "'": ["1", "1", "1", "0", "0", "0", "0"],
});
