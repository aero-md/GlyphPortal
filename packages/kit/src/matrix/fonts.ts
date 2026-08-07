/** Police pixel — port de `render/Fonts.kt`, mêmes trames au point près. */

export type Font = { height: number; glyphs: Record<string, string[]> };

export function charWidth(f: Font, c: string): number {
  return f.glyphs[c]?.[0].length ?? 0;
}

export function textWidth(f: Font, s: string): number {
  let w = 0;
  for (const c of s) w += c === " " ? 1 : charWidth(f, c) + 1;
  return w === 0 ? 0 : w - 1;
}

/**
 * 3×5 — l'état dégradé du visualiseur, qui s'écrit au milieu des barres.
 *
 * Le jeu de caractères est exactement celui qui sert — chiffres, `MIC`, `---`.
 * Le `M` est le seul à déborder sur cinq colonnes : à trois, ses deux fûts se
 * touchent et il devient un `H`.
 */
export const F3: Font = {
  height: 5,
  glyphs: {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "010", "010"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    C: ["111", "100", "100", "100", "111"],
    I: ["111", "010", "010", "010", "111"],
    M: ["10001", "11011", "10101", "10001", "10001"],
    "-": ["000", "000", "111", "000", "000"],
  },
};

/**
 * 5×7 — le chiffre du VU-mètre, en toutes circonstances.
 *
 * Elle avait sauté quand le cadran était centré plus bas : ses deux lignes de
 * plus lui manquaient. Le cadran occupe maintenant la moitié haute et le pivot
 * est revenu au centre, ce qui laisse la moitié basse au chiffre — assez pour
 * trois caractères sur sept lignes, jusqu'au `108` que le haut de l'échelle
 * peut produire.
 */
export const F5: Font = {
  height: 7,
  glyphs: {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
    "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  },
};
