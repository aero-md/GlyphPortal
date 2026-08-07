/**
 * L'état de la matrice à un instant donné — le contrat entre un toy et le rendu.
 *
 * C'est le seul type que la préview connaisse d'un toy. Peu importe d'où vient
 * la trame : une image convertie (glyphcast), une décomposition calendaire
 * (glyphlapse), un spectre audio (sonoglyph), une cinématique de rouleaux
 * (glyphslot). Tant qu'un toy produit une `Frame`, il est affichable.
 *
 * `device` est porté par la trame et non passé à part : un rendu, un export ou
 * un compteur ne peut alors pas se tromper de géométrie, même en pleine bascule
 * d'appareil.
 */

import type { Device } from "./devices";

export type Frame = {
  /** L'appareil qui a produit la trame — donc sa grille et son masque. */
  device: Device;
  /** Luminosité 0..1 par cellule, row-major, `device.cells` entrées. */
  values: Float32Array;
  /** Nombre de LEDs allumées (> 0) parmi les `device.ledCount` du disque. */
  lit: number;
  /** Luminosité moyenne sur le disque, 0..1. */
  mean: number;
};

export function emptyFrame(d: Device): Frame {
  return { device: d, values: new Float32Array(d.cells), lit: 0, mean: 0 };
}

/**
 * Compte les LEDs allumées et la luminosité moyenne d'un tableau de valeurs
 * déjà masqué, puis emballe le tout.
 *
 * Un toy qui écrit ses valeurs à la main n'a pas à retenir que `mean` se
 * moyenne sur les LEDs **allumées** et non sur les cellules du disque : deux
 * toys qui comptent chacun à leur façon afficheraient deux statistiques
 * incomparables sous le même libellé.
 */
export function frameOf(device: Device, values: Float32Array): Frame {
  let lit = 0;
  let sum = 0;
  for (const i of device.inside) {
    const v = values[i];
    if (v > 0) {
      lit++;
      sum += v;
    }
  }
  return { device, values, lit, mean: sum / (lit || 1) };
}

/** Conversion en consignes 0-255, le format attendu par le Glyph Matrix SDK. */
export function toBytes(f: Frame): Uint8Array {
  const out = new Uint8Array(f.device.cells);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(f.values[i] * 255);
  return out;
}
