/** Police pixel — port de `render/Fonts.kt`, mêmes trames au point près. */

export type Font = { height: number; glyphs: Record<string, string[]> };

/**
 * Une police enrichie des glyphes d'un toy.
 *
 * Les deux jeux ci-dessous sont ceux que Sonoglyph et GlyphLapse ont en commun
 * — les dix chiffres au point près, plus quelques capitales. Là où ils
 * divergeaient, ils divergeaient **pour de bonnes raisons** : le tiret de
 * Sonoglyph fait cinq colonnes parce qu'il sert à écrire « --- », celui de
 * GlyphLapse en fait trois parce qu'il sert à écrire « J-123 ». Fusionner les
 * deux aurait changé l'allure de l'un des toys sans que personne ne l'ait
 * demandé.
 *
 * Un toy ajoute donc ce qu'il lui faut, et surcharge ce qu'il dessine
 * autrement. Ce qui est partagé l'est parce qu'il est identique, pas parce
 * qu'on a tranché à sa place.
 */
export function extend(base: Font, glyphs: Record<string, string[]>): Font {
  return { height: base.height, glyphs: { ...base.glyphs, ...glyphs } };
}

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
 * 3×5 — le chiffre du dôme de Sono sur (4a) Pro. Pas une variante de `F3` :
 * dessin fourni au pixel près pour ce cadran précis (deux chiffres, rangées
 * 6 à 10 d'une grille de 13), pas de lettres — l'état sans micro y reste
 * porté par `F3` (« MIC », « --- »). Le `+` de la surcharge (« 99+ ») est
 * centré sur les cinq rangées, contrairement aux chiffres qui les occupent
 * toutes.
 */
export const F3D: Font = {
  height: 5,
  glyphs: {
    "0": ["110", "101", "101", "101", "011"],
    "1": ["001", "011", "101", "001", "001"],
    "2": ["110", "001", "010", "100", "111"],
    "3": ["110", "001", "010", "001", "110"],
    "4": ["101", "101", "011", "001", "001"],
    "5": ["111", "100", "110", "001", "110"],
    "6": ["011", "100", "111", "101", "011"],
    "7": ["111", "001", "001", "010", "010"],
    "8": ["110", "101", "111", "101", "011"],
    "9": ["110", "101", "111", "001", "110"],
    "+": ["000", "010", "111", "010", "000"],
  },
};

/**
 * 3×4 — la lettre au centre de la boussole de Float sur (4a) Pro. Dessin
 * pixel-exact tiré de quatre relevés N/E/S/W (rangées 5 à 8 d'une grille de
 * 13) et confirmé par un cinquième (« SW ») où S et W réapparaissent
 * identiques, juste réécartés pour tenir à deux — `centeredText` fait le
 * reste (largeur 3, un blanc entre lettres) sans qu'il y ait eu besoin de
 * dessiner les combinaisons mineures (NE, SE, SW, NW) à la main.
 */
export const R3: Font = {
  height: 4,
  glyphs: {
    N: ["110", "101", "101", "101"],
    E: ["011", "111", "100", "011"],
    S: ["011", "110", "001", "110"],
    W: ["101", "101", "111", "111"],
  },
};

/**
 * 4×5 arrondie — port de `Fonts.R4` (Haloglyph) : les chiffres de G-Forces et de
 * la boussole de Float sur le (3), plus les points cardinaux en bas de casse
 * (`n e s w`). Pas de virgule : le renderer la pose d'un pixel sous la ligne de
 * base.
 */
export const R4: Font = {
  height: 5,
  glyphs: {
    "0": ["0110", "1001", "1001", "1001", "0110"],
    "1": ["0010", "0110", "0010", "0010", "0111"],
    "2": ["0110", "1001", "0010", "0100", "1111"],
    "3": ["1110", "0001", "0110", "0001", "1110"],
    "4": ["0010", "0110", "1010", "1111", "0010"],
    "5": ["1111", "1000", "1110", "0001", "1110"],
    "6": ["0110", "1000", "1110", "1001", "0110"],
    "7": ["1111", "0001", "0010", "0100", "0100"],
    "8": ["0110", "1001", "0110", "1001", "0110"],
    "9": ["0110", "1001", "0111", "0001", "0110"],
    n: ["0111", "1001", "1001", "1001", "1001"],
    e: ["0110", "1001", "1111", "1000", "0110"],
    s: ["0111", "1000", "0110", "0001", "1110"],
    w: ["10001", "10001", "10101", "10101", "01010"],
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
